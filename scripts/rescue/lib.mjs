// OnyxTranslate Rescue Mission — shared library.
// READ-ONLY access to the OLD deployment via Convex raw HTTP API (no SDK, no auth needed).
// Hard guardrail: this module refuses to call any mutation path unless it is the
// explicitly designated safe-resume function, and refuses forbidden destructive
// paths forever.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OLD_DEPLOYMENT_URL =
  process.env.OLD_CONVEX_URL ?? "https://successful-iguana-419.convex.cloud";

export const RESCUE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "rescue",
);
export const LOG_PATH = path.join(RESCUE_DIR, "forensic-log.md");
export const STATE_PATH = path.join(RESCUE_DIR, ".state.json");

// FORBIDDEN forever (destructive / status-changing). Matching is checked against
// the function path (file:function) case-insensitively.
const FORBIDDEN_PATTERNS = [
  "deleteproject",
  "deletechunksforlang",
  "deletehistory",
  "delete",
  "remove",
  "clear",
  "reset",
  "wipe",
  "purge",
  "truncate",
  "drop",
  "cancel",
  "pause",
  "stop",
  "abort",
  "kill",
  "restart",
  "retry",
  "redo",
  "updateproject",
  "setproject",
  "setstatus",
  "mark",
  "import",
  "insert",
  "patch",
];

// The ONLY mutation we are ever allowed to invoke (Phase C designated safe-resume).
export const DESIGNATED_RESUME_PREFIX = "resumeServerProject:";
const DESIGNATED_RESUME_NAME_OK = /resume|recover|watchdog|requeue|kick|continue/i;

export function ensureRescueDir() {
  fs.mkdirSync(RESCUE_DIR, { recursive: true });
}

export function utcNow() {
  return new Date().toISOString();
}

export function ensureLogHeader(phase) {
  ensureRescueDir();
  if (!fs.existsSync(LOG_PATH)) {
    fs.writeFileSync(
      LOG_PATH,
      `# OnyxTranslate Rescue — Forensic Log\n\n` +
        `Target deployment: \`${OLD_DEPLOYMENT_URL}\` (old backend, READ-ONLY)\n` +
        `Old live site: https://oyxtranslate.freebuff.app\n` +
        `Method: Convex raw HTTP API — \`POST /api/query\` (and \`POST /api/mutation\` ONLY for the designated safe-resume function in Phase C)\n` +
        `Hard rules: no deleteProject / deleteChunksForLang / deleteHistory / status-changing mutations.\n\n` +
        `---\n\n`,
    );
  }
  fs.appendFileSync(
    LOG_PATH,
    `\n## PHASE ${phase} — started ${utcNow()}\n\n`,
  );
}

function clip(text, max = 4000) {
  if (text == null) return "undefined";
  const s = String(text);
  return s.length > max
    ? `${s.slice(0, max)}\n… [log truncated; ${s.length - max} more chars]`
    : s;
}

export function logEvent({ phase, label, request, status, ms, value, error }) {
  ensureRescueDir();
  const stamp = utcNow();
  const lines = [];
  lines.push(`### [${stamp}] ${phase} · ${label}`);
  if (request !== undefined) {
    lines.push(
      `- Request: \`${request.method ?? "POST"} ${request.url}\`` +
        `\n- Request body (verbatim): \`${clip(request.bodyJson, 1200)}\``,
    );
  }
  if (status !== undefined) {
    lines.push(`- HTTP status: **${status}**${ms != null ? ` (${ms} ms)` : ""}`);
  }
  if (error !== undefined) {
    lines.push(`- Verbatim error:\n\n\`\`\`text\n${clip(error)}\n\`\`\``);
  }
  if (value !== undefined) {
    lines.push(
      `- Verbatim response (value):\n\n\`\`\`json\n${clip(JSON.stringify(value, null, 2))}\n\`\`\``,
    );
  }
  lines.push("");
  fs.appendFileSync(LOG_PATH, `${lines.join("\n")}\n`);
}

export function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function saveState(patch) {
  ensureRescueDir();
  const next = { ...loadState(), ...patch, updatedAt: utcNow() };
  fs.writeFileSync(STATE_PATH, JSON.stringify(next, null, 2));
  return next;
}

function guardPath(fnPath, { mutation = false } = {}) {
  const p = String(fnPath).toLowerCase();
  if (FORBIDDEN_PATTERNS.some((bad) => p.includes(bad))) {
    throw new Error(
      `REFUSED by rescue guardrail (forbidden/destructive path): ${fnPath}`,
    );
  }
  if (mutation) {
    if (
      !p.startsWith(DESIGNATED_RESUME_PREFIX.toLowerCase()) ||
      !DESIGNATED_RESUME_NAME_OK.test(p)
    ) {
      throw new Error(
        `REFUSED by rescue guardrail: mutations are allowed ONLY for the designated safe-resume function in the resumeServerProject file (got: ${fnPath})`,
      );
    }
  }
}

// Core raw-HTTP call. Queries: POST /api/query. Designated resume mutations: POST /api/mutation.
export async function callConvex(fnPath, args = {}, opts = {}) {
  const { phase = "PREP", mutation = false, timeoutMs = 25000 } = opts;
  guardPath(fnPath, { mutation });
  const url = `${OLD_DEPLOYMENT_URL}/api/${mutation ? "mutation" : "query"}`;
  const bodyJson = JSON.stringify({ path: fnPath, args, format: "json" });

  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bodyJson,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const ms = Date.now() - started;
      const text = await res.text();

      if (!res.ok) {
        logEvent({
          phase,
          label: `POST /api/${mutation ? "mutation" : "query"} · ${fnPath}`,
          request: { url, bodyJson },
          status: `${res.status} ${res.statusText}`,
          ms,
          error: text,
        });
        // 4xx are deterministic — do not retry.
        if (res.status < 500 || attempt === 2) {
          return {
            ok: false,
            status: res.status,
            errorText: text,
            kind: "http-error",
          };
        }
      } else {
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          logEvent({
            phase,
            label: `POST /api/${mutation ? "mutation" : "query"} · ${fnPath}`,
            request: { url, bodyJson },
            status: `${res.status} ${res.statusText}`,
            ms,
            error: `Non-JSON 200 response: ${text}`,
          });
          return { ok: false, status: 200, errorText: text, kind: "bad-json" };
        }
        if (json?.status === "error") {
          // Arg-validator errors land here with verbatim messages — they are gold.
          logEvent({
            phase,
            label: `POST /api/${mutation ? "mutation" : "query"} · ${fnPath}`,
            request: { url, bodyJson },
            status: "200 (status=error)",
            ms,
            error: json.errorMessage ?? JSON.stringify(json),
          });
          return {
            ok: false,
            status: 200,
            errorText: json.errorMessage ?? JSON.stringify(json),
            kind: "function-error",
          };
        }
        const value = json?.value !== undefined ? json.value : json;
        logEvent({
          phase,
          label: `POST /api/${mutation ? "mutation" : "query"} · ${fnPath}`,
          request: { url, bodyJson },
          status: `${res.status} ${res.statusText}`,
          ms,
          value,
        });
        return { ok: true, status: 200, value, kind: "ok" };
      }
    } catch (err) {
      lastErr = err;
      logEvent({
        phase,
        label: `POST /api/${mutation ? "mutation" : "query"} · ${fnPath} (attempt ${attempt})`,
        request: { url, bodyJson },
        status: undefined,
        ms: Date.now() - started,
        error: `${err?.name ?? "Error"}: ${err?.message ?? String(err)}`,
      });
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return {
    ok: false,
    status: 0,
    errorText: `${lastErr?.name ?? "Error"}: ${lastErr?.message ?? String(lastErr)}`,
    kind: "network",
  };
}

// Extract plausible argument names from a Convex arg-validator error message.
export function plausibleArgsFromError(errorText) {
  const found = new Set();
  const backtick = /\`([A-Za-z][A-Za-z0-9_]*)\`/g;
  const quotes = /"([A-Za-z][A-Za-z0-9_]*)"/g;
  for (const re of [backtick, quotes]) {
    let m;
    while ((m = re.exec(errorText))) found.add(m[1]);
  }
  const known = [
    "projectId",
    "projectID",
    "id",
    "langCode",
    "language",
    "sessionId",
    "sessionID",
    "jobId",
    "chunkId",
    "cursor",
    "page",
    "limit",
    "pageSize",
    "offset",
    "numItems",
  ];
  const NUMERIC = /limit|page|size|offset|count/i;
  const args = {};
  for (const k of known) {
    for (const f of found) {
      if (f.toLowerCase() === k.toLowerCase() && !(k in args)) {
        args[k] = NUMERIC.test(k) ? 10 : "probe";
      }
    }
  }
  // Fallback: any identifier that looks like an id field.
  for (const f of found) {
    if (/id$/i.test(f) && !(f in args)) args[f] = "probe";
  }
  return args;
}

export function pad(n) {
  return String(n).padStart(2, "0");
}

export function timestampSlug(d = new Date()) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}
