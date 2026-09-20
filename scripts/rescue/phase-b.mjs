// PHASE B — FULL DATA BACKUP (runs after Phase A).
// Dumps ALL projects, then for each project ALL translations and ALL chunks
// (paginating if the backend exposes cursors), plus job status, and writes:
//   rescue/onyx-backup-<UTC-timestamp>.json
//   rescue/backup-summary.md
// Strictly read-only. Usage: node scripts/rescue/phase-b.mjs

import fs from "node:fs";
import path from "node:path";
import {
  OLD_DEPLOYMENT_URL,
  RESCUE_DIR,
  callConvex,
  ensureLogHeader,
  loadState,
  logEvent,
  timestampSlug,
} from "./lib.mjs";

// Extra read-only chunk/image-history candidates probed here (queries only).
const CHUNK_QUERY_CANDIDATES = [
  "queries:getChunksRaw",
  "queries:getChunks",
  "queries:getProjectChunks",
  "queries:getTranslationChunks",
  "queries:getChunksForProject",
];
const IMAGE_QUERY_CANDIDATES = [
  "queries:getImageTranslations",
  "queries:getAllImageTranslations",
  "queries:getImageTranslationHistory",
];

function extractDocs(value) {
  // Defensive: responses may be an array of docs, a page object, or wrapped.
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    for (const key of ["projects", "page", "docs", "items", "results", "data"]) {
      if (Array.isArray(value[key])) return value[key];
    }
    if ("continueCursor" in value || "isDone" in value) {
      for (const key of ["page", "docs", "items", "results", "data"]) {
        if (Array.isArray(value[key])) return value[key];
      }
      return [];
    }
    // A single document?
    if ("_id" in value || "projectId" in value || "id" in value) return [value];
  }
  return [];
}

function docId(doc) {
  if (!doc || typeof doc !== "object") return undefined;
  return doc._id ?? doc.id ?? doc.projectId ?? doc.projectID ?? undefined;
}

function extractCursor(value) {
  if (value && typeof value === "object") {
    if (value.continueCursor && value.isDone === false) return value.continueCursor;
    if (value.cursor && value.isDone === false) return value.cursor;
  }
  return null;
}

async function dumpAll(phase, fnPath, baseArgs = {}, maxPages = 50) {
  const all = [];
  let cursor = null;
  let pages = 0;
  let firstError = null;
  for (;;) {
    const args = { ...baseArgs };
    if (cursor) args.cursor = cursor;
    const res = await callConvex(fnPath, args, { phase });
    pages++;
    if (!res.ok) {
      firstError ??= res.errorText;
      break;
    }
    all.push(...extractDocs(res.value));
    cursor = extractCursor(res.value);
    if (!cursor || pages >= maxPages) break;
    logEvent({ phase, label: `${fnPath} · paginate`, value: { cursor } });
  }
  return { docs: all, pages, firstError };
}

function firstOk(state, ...paths) {
  for (const p of paths) {
    const entry = state.phaseA?.workingPaths?.[p];
    if (entry?.status === "ok") return p;
  }
  return null;
}

function summarizeTranslationForJob(doc) {
  if (!doc || typeof doc !== "object") return null;
  const interesting = [
    "langCode",
    "language",
    "status",
    "completedChunks",
    "totalChunks",
    "mergedText",
    "governor",
    "governorState",
    "governorStatus",
    "watchdog",
    "resumeToken",
    "pages",
    "pageCount",
  ];
  const picked = {};
  for (const k of interesting) {
    if (k in doc) picked[k] = k === "mergedText" && typeof doc[k] === "string" && doc[k].length > 600
      ? `${doc[k].slice(0, 600)}… [${doc[k].length} chars total]`
      : doc[k];
  }
  return Object.keys(picked).length ? picked : null;
}

// Read-only HTTP probe of the old live site (no function calls, no mutation).
async function probeLiveSite() {
  const url = "https://oyxtranslate.freebuff.app";
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.text();
    const result = {
      url,
      httpStatus: res.status,
      redirectedTo: res.headers.get("location") ?? null,
      ms: Date.now() - started,
      title: /<title[^>]*>([^<]*)<\/title>/i.exec(body)?.[1]?.trim() ?? null,
      bodyChars: body.length,
      verdict: res.ok && body.length > 500 ? "serving" : `unverified (status ${res.status})`,
    };
    logEvent({ phase: "B", label: `live-site probe ${url}`, status: res.status, ms: result.ms, value: result });
    return result;
  } catch (err) {
    const result = {
      url,
      httpStatus: 0,
      error: `${err?.name ?? "Error"}: ${err?.message ?? String(err)}`,
      verdict: "unreachable",
    };
    logEvent({ phase: "B", label: `live-site probe ${url}`, error: result.error });
    return result;
  }
}

async function main() {
  ensureLogHeader("B");
  const state = loadState();
  const working = state.phaseA?.workingPaths ?? {};

  // Recheck before backup: is the deployment still paused since Phase A?
  const recheck = await callConvex("queries:getLatestProject", {}, { phase: "B" });
  const deploymentPaused = !recheck.ok && /deployment is paused/i.test(recheck.errorText ?? "");

  const getAll = firstOk(state, "queries:getAllProjects");
  const getLatest = firstOk(state, "queries:getLatestProject");
  const getTranslations = firstOk(state, "queries:getTranslationsRaw");
  const getProgress = firstOk(state, "queries:getTranslationProgress");
  const getJobStatus = firstOk(state, "resumeServerProject:getServerJobStatus");

  const backup = {
    meta: {
      capturedAtUTC: new Date().toISOString(),
      sourceDeployment: OLD_DEPLOYMENT_URL,
      method: "Convex raw HTTP API POST /api/query (read-only)",
      phaseAWorkingPaths: Object.fromEntries(
        Object.entries(working).map(([k, v]) => [k, v.status]),
      ),
    },
    projects: [],
    imageTranslations: [],
    jobState: null,
  };

  // ---- Projects ----
  let projects = [];
  if (getAll) {
    const dump = await dumpAll("B", getAll, {});
    projects = dump.docs;
    logEvent({ phase: "B", label: `projects via ${getAll}`, value: { count: projects.length, pages: dump.pages } });
  } else if (getLatest) {
    const dump = await dumpAll("B", getLatest, {});
    projects = dump.docs;
    logEvent({ phase: "B", label: `projects via ${getLatest} (fallback)`, value: { count: projects.length } });
  } else {
    logEvent({ phase: "B", label: "no working projects query", error: "Phase A found no working getAllProjects/getLatestProject" });
  }

  // ---- Per-project translations + chunks + progress ----
  let chunkQueryPath = null;
  for (const project of projects) {
    const projectId = docId(project);
    const entry = { project, projectId };
    if (getTranslations && projectId) {
      const dump = await dumpAll("B", getTranslations, { projectId });
      entry.translations = dump.docs;
      entry.translationsError = dump.firstError ?? null;
    }
    if (getProgress && projectId) {
      const res = await callConvex(getProgress, { projectId }, { phase: "B" });
      entry.progress = res.ok ? res.value : null;
      entry.progressError = res.ok ? null : res.errorText;
    }
    if (projectId && !chunkQueryPath) {
      for (const candidate of CHUNK_QUERY_CANDIDATES) {
        const res = await callConvex(candidate, { projectId }, { phase: "B" });
        if (res.ok) {
          chunkQueryPath = candidate;
          entry.chunks = extractDocs(res.value);
          break;
        }
      }
    } else if (projectId && chunkQueryPath) {
      const dump = await dumpAll("B", chunkQueryPath, { projectId });
      entry.chunks = dump.docs;
      entry.chunksError = dump.firstError ?? null;
    }
    if (!projectId || (!getTranslations && !chunkQueryPath && !getProgress)) {
      entry.warning = "no working query for this project's data";
    }
    backup.projects.push(entry);
  }

  // ---- Image translations ----
  for (const candidate of IMAGE_QUERY_CANDIDATES) {
    const res = await callConvex(candidate, {}, { phase: "B" });
    if (res.ok) {
      backup.imageTranslations = extractDocs(res.value);
      backup.meta.imageTranslationsPath = candidate;
      break;
    }
  }

  // ---- Frozen job state (expected to fail while deployment is paused) ----
  if (getJobStatus) {
    const res = await callConvex(getJobStatus, {}, { phase: "B" });
    backup.jobState = res.ok ? res.value : { error: res.errorText };
  }

  // ---- Live-site probe (read-only HTTP GET) ----
  backup.meta.liveSite = await probeLiveSite();

  // ---- Write backup JSON ----
  const stamp = timestampSlug();
  const jsonPath = path.join(RESCUE_DIR, `onyx-backup-${stamp}.json`);
  fs.mkdirSync(RESCUE_DIR, { recursive: true });

  // ---- Counts + the 14/92 job ----
  const counts = {
    projects: backup.projects.length,
    translations: backup.projects.reduce((n, p) => n + (p.translations?.length ?? 0), 0),
    chunks: backup.projects.reduce((n, p) => n + (p.chunks?.length ?? 0), 0),
    imageTranslations: backup.imageTranslations.length,
  };
  const dataCaptured = counts.projects > 0 || counts.translations > 0 || counts.chunks > 0;
  backup.meta.dataCaptured = dataCaptured;
  backup.meta.status = dataCaptured ? "COMPLETE" : "BLOCKED_DEPLOYMENT_PAUSED";
  if (deploymentPaused) backup.meta.blocker = recheck.errorText;
  fs.writeFileSync(jsonPath, JSON.stringify(backup, null, 2));

  const frozenCandidates = [];
  for (const p of backup.projects) {
    for (const t of p.translations ?? []) {
      const s = summarizeTranslationForJob(t);
      const text = JSON.stringify(t) ?? "";
      if (
        s &&
        (text.includes('"14"') || text.includes(":14") || text.includes('"ur"')) &&
        (s.completedChunks !== undefined || s.totalChunks !== undefined || s.governor !== undefined)
      ) {
        frozenCandidates.push({ projectId: p.projectId, summary: s });
      }
    }
  }

  const summary = [
    `# OnyxTranslate Rescue — Backup Summary`,
    ``,
    `- Captured (UTC): ${backup.meta.capturedAtUTC}`,
    `- Source: \`${OLD_DEPLOYMENT_URL}\` (old backend, read-only raw HTTP API)`,
    `- Backup file: \`${path.basename(jsonPath)}\``,
    `- Status: **${backup.meta.status}** · data captured: **${dataCaptured ? "yes" : "NO"}**`,
    ``,
  ];
  if (deploymentPaused) {
    summary.push(
      `## ⚠️ Blocker — deployment paused`,
      ``,
      `No data could be read. Every query on the old deployment returns the platform error below.\n` +
        `The backup JSON on disk is an honest empty dump (0 rows) — it preserves NO progress.`,
      ``,
      "```text",
      recheck.errorText.trim(),
      "```",
      ``,
      `Next step: have Freebuff/Convex dashboard admin resume the \`successful-iguana-419\` deployment, then re-run \`npm run rescue\`.`,
      ``,
    );
  }
  summary.push(
    `## Row counts per table`,
    ``,
    `| Table | Rows |`,
    `| --- | --- |`,
    `| projects | ${counts.projects} |`,
    `| translations | ${counts.translations} |`,
    `| chunks | ${counts.chunks} |`,
    `| imageTranslations | ${counts.imageTranslations} |`,
    ``,
    `## Frozen 672-page job (Urdu 14/92) — exact state`,
    ``,
  );
  if (backup.jobState) {
    summary.push(`### resumeServerProject:getServerJobStatus {}`, "", "```json", JSON.stringify(backup.jobState, null, 2), "```", "");
  }
  if (frozenCandidates.length > 0) {
    for (const c of frozenCandidates.slice(0, 5)) {
      summary.push(`### projectId \`${c.projectId}\``, "", "```json", JSON.stringify(c.summary, null, 2), "```", "");
    }
  } else {
    summary.push(`_No translation doc with completedChunks/totalChunks/governor fields matched the 14/92 fingerprint; see full backup JSON for raw docs._`, "");
  }

  const summaryPath = path.join(RESCUE_DIR, "backup-summary.md");
  fs.writeFileSync(summaryPath, summary.join("\n"));

  saveBackupPointer({ jsonPath, counts, dataCaptured, blocker: deploymentPaused ? recheck.errorText : null });
  console.log(`Phase B done. dataCaptured=${dataCaptured}`);
  console.log(`  Backup: ${jsonPath}`);
  console.log(`  Summary: ${summaryPath}`);
  console.log(`  Counts: ${JSON.stringify(counts)}`);
}

function saveBackupPointer({ jsonPath, counts, dataCaptured, blocker }) {
  // Record backup location in state so Phase C/D can reference it.
  const state = loadState();
  state.phaseB = {
    completed: dataCaptured,
    dataCaptured,
    blocker: blocker ?? null,
    jsonPath,
    counts,
    finished: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(RESCUE_DIR, ".state.json"),
    JSON.stringify(state, null, 2),
  );
}

main().catch((err) => {
  logEvent({ phase: "B", label: "fatal", error: `${err?.stack ?? err}` });
  console.error("Phase B fatal:", err);
  process.exitCode = 1;
});
