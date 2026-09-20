// PHASE D — REPORT.
// Builds rescue/report.html (working paths, backup stats, 14/92 job state
// before/after, recommended next step), mirrors it into public/docs/ if present,
// and writes public/rescue/latest.json for the dashboard to load.
// Usage: node scripts/rescue/phase-d.mjs

import fs from "node:fs";
import path from "node:path";
import {
  OLD_DEPLOYMENT_URL,
  RESCUE_DIR,
  ensureLogHeader,
  ensureRescueDir,
  loadState,
  logEvent,
} from "./lib.mjs";

const ROOT = path.resolve(RESCUE_DIR, "..");
const PUBLIC_DOCS = path.join(ROOT, "public", "docs");
const PUBLIC_RESCUE = path.join(ROOT, "public", "rescue");

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function findBackupFile() {
  ensureRescueDir();
  const files = fs
    .readdirSync(RESCUE_DIR)
    .filter((f) => f.startsWith("onyx-backup-") && f.endsWith(".json"))
    .sort();
  return files.length ? files[files.length - 1] : null;
}

function readBackupMeta(backupFile) {
  if (!backupFile) return null;
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(RESCUE_DIR, backupFile), "utf8"),
    );
    const counts = {
      projects: raw.projects?.length ?? 0,
      translations: raw.projects?.reduce((n, p) => n + (p.translations?.length ?? 0), 0) ?? 0,
      chunks: raw.projects?.reduce((n, p) => n + (p.chunks?.length ?? 0), 0) ?? 0,
      imageTranslations: raw.imageTranslations?.length ?? 0,
    };
    return { file: backupFile, capturedAt: raw.meta?.capturedAtUTC ?? null, counts, raw };
  } catch {
    return null;
  }
}

function statusBadge(status) {
  const ok = status === "ok";
  return `<span class="badge ${ok ? "ok" : "err"}">${ok ? "✔ OK" : "✘ error"}</span>`;
}

async function main() {
  ensureLogHeader("D");
  const state = loadState();
  const phaseA = state.phaseA ?? {};
  const phaseB = state.phaseB ?? {};
  const phaseC = state.phaseC ?? {};

  const backupFile = phaseB.jsonPath
    ? path.basename(phaseB.jsonPath)
    : findBackupFile();
  const backup = readBackupMeta(backupFile);

  const workingPaths = Object.entries(phaseA.workingPaths ?? {});
  const backupCounts = backup?.counts ??
    phaseB.counts ?? { projects: 0, translations: 0, chunks: 0, imageTranslations: 0 };

  // 14/92 job state before/after from Phase C polls.
  const polls = phaseC.polls ?? [];
  const completedBefore = polls.length
    ? (() => {
        const s = polls[0];
        const v = s.getServerJobStatus ?? s.getTranslationProgress ?? {};
        return v?.completedChunks ?? v?.progress?.completedChunks ?? null;
      })()
    : null;
  const completedAfter = polls.length
    ? (() => {
        const s = polls[polls.length - 1];
        const v = s.getServerJobStatus ?? s.getTranslationProgress ?? {};
        return v?.completedChunks ?? v?.progress?.completedChunks ?? null;
      })()
    : null;

  const resumeInvoked = phaseC.resumeInvocation?.invoked === true;
  const nextStep = resumeInvoked
    ? completedAfter != null && completedBefore != null && completedAfter > completedBefore
      ? "Resume function advanced completedChunks — monitor until the Urdu job finishes, then export the merged text and migrate the backup into this project’s fresh Convex deployment."
      : "Resume was invoked but completedChunks did not advance. Keep the backup as the source of truth; investigate watchdog behavior once old code arrives via GitHub/support."
    : "No safe-resume entry point was found on the old deployment. Recommended next step: once the old OnyxTranslate source arrives via GitHub/support recovery, spin up a fresh Convex deployment in THIS project, import rescue/onyx-backup-*.json, and resume the Urdu job from chunk 15 under controlled code.";

  const rowsA = workingPaths.length
    ? workingPaths
        .map(
          ([p, v]) =>
            `<tr><td class="mono">${esc(p)}</td><td>${statusBadge(v.status)}</td><td class="mono small">${esc(
              (v.errorText ?? JSON.stringify(v.value) ?? "").slice(0, 220),
            )}</td></tr>`,
        )
        .join("\n")
    : `<tr><td colspan="3">No Phase A results on record.</td></tr>`;

  const pollRows = polls.length
    ? polls
        .map(
          (p, i) =>
            `<tr><td>#${i + 1}</td><td class="mono small">${esc(p.atUTC)}</td><td class="mono">${esc(
              JSON.stringify(p.getServerJobStatus ?? {}).slice(0, 160),
            )}</td></tr>`,
        )
        .join("\n")
    : `<tr><td colspan="3">No polls recorded (resume not invoked or Phase C stopped).</td></tr>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OnyxTranslate Rescue Mission — Report</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #f7f7f8; color: #17171c; line-height: 1.55; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 48px 24px 80px; }
  h1 { font-size: 30px; letter-spacing: -0.02em; margin: 0 0 4px; }
  h2 { font-size: 19px; letter-spacing: -0.01em; margin: 40px 0 12px; }
  .kicker { text-transform: uppercase; letter-spacing: 0.14em; font-size: 11px; font-weight: 700; color: #5b5bd6; }
  .sub { color: #5f5f6b; margin: 0; }
  .card { background: #ffffff; border: 1px solid #e7e7ec; border-radius: 14px; padding: 20px 22px; margin: 14px 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
  .stat { background: #ffffff; border: 1px solid #e7e7ec; border-radius: 14px; padding: 16px 18px; }
  .stat .n { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
  .stat .l { font-size: 12px; color: #5f5f6b; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #5f5f6b; padding: 8px 10px; border-bottom: 1px solid #e7e7ec; }
  td { padding: 10px; border-bottom: 1px solid #f0f0f4; vertical-align: top; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; word-break: break-all; }
  .small { color: #5f5f6b; }
  .badge { display: inline-block; font-size: 12px; font-weight: 600; border-radius: 999px; padding: 2px 10px; }
  .badge.ok { background: #e7f5ec; color: #157347; }
  .badge.err { background: #fdecec; color: #b3261e; }
  pre { background: #17171c; color: #e8e8ee; border-radius: 10px; padding: 14px 16px; overflow: auto; font-size: 12.5px; }
  .note { border-left: 3px solid #5b5bd6; padding: 10px 14px; background: #f4f4fb; border-radius: 0 10px 10px 0; font-size: 14px; }
  footer { margin-top: 48px; font-size: 12px; color: #8a8a94; }
</style>
</head>
<body>
<div class="wrap">
  <p class="kicker">OnyxTranslate Rescue Mission</p>
  <h1>Rescue Report</h1>
  <p class="sub">Old deployment <span class="mono">${esc(OLD_DEPLOYMENT_URL)}</span> · read-only forensics + backup + safe-resume attempt</p>

  <h2>1 · Working function paths (Phase A)</h2>
  <div class="card">
    <table>
      <thead><tr><th>Function path</th><th>Status</th><th>Evidence (verbatim, first 220 chars)</th></tr></thead>
      <tbody>${rowsA}</tbody>
    </table>
  </div>

  <h2>2 · Backup stats (Phase B)</h2>
  <div class="grid">
    <div class="stat"><div class="n">${backupCounts.projects}</div><div class="l">projects</div></div>
    <div class="stat"><div class="n">${backupCounts.translations}</div><div class="l">translations</div></div>
    <div class="stat"><div class="n">${backupCounts.chunks}</div><div class="l">chunks</div></div>
    <div class="stat"><div class="n">${backupCounts.imageTranslations}</div><div class="l">image translations</div></div>
  </div>
  <div class="card"><span class="small">Backup file:</span> <span class="mono">rescue/${esc(backupFile ?? "— none —")}</span>${backup?.capturedAt ? ` <span class="small">· captured ${esc(backup.capturedAt)}</span>` : ""}</div>

  <h2>3 · Frozen 672-page job — Urdu 14/92 (Phases B–C)</h2>
  <div class="card">
    <table>
      <thead><tr><th>Poll</th><th>UTC</th><th>getServerJobStatus (verbatim)</th></tr></thead>
      <tbody>${pollRows}</tbody>
    </table>
    <p class="small">completedChunks before: <b>${esc(completedBefore ?? "n/a")}</b> · after: <b>${esc(completedAfter ?? "n/a")}</b>${resumeInvoked ? "" : " · resume not invoked"}</p>
  </div>

  <h2>4 · Safe-resume outcome (Phase C)</h2>
  <div class="card">
    ${
      resumeInvoked
        ? `<div class="note">Designated safe-resume function <span class="mono">${esc(phaseC.resumeInvocation.fnPath)}</span> was invoked. Raw value:</div><pre>${esc(JSON.stringify(phaseC.resumeInvocation.result, null, 2))}</pre>`
        : `<div class="note">No designated safe-resume mutation accepted an invocation. Per mission rules the script STOPPED — no status-changing or destructive call was made. Probed candidates: <span class="mono">${esc((phaseC.documentation?.probedResumeCandidates ?? []).join(", "))}</span></div>`
    }
  </div>

  <h2>5 · Recommended next step</h2>
  <div class="card"><p style="margin:0">${esc(nextStep)}</p></div>

  <footer>Generated ${esc(new Date().toISOString())} · raw evidence: rescue/forensic-log.md · data: rescue/${esc(backupFile ?? "—")} · summary: rescue/backup-summary.md</footer>
</div>
</body>
</html>`;

  fs.writeFileSync(path.join(RESCUE_DIR, "report.html"), html);
  logEvent({ phase: "D", label: "report.html written", value: { bytes: html.length } });

  // Mirror into public/docs/ overview if present (create if missing).
  fs.mkdirSync(PUBLIC_DOCS, { recursive: true });
  fs.writeFileSync(path.join(PUBLIC_DOCS, "rescue-report.html"), html);

  // Machine-readable snapshot for the dashboard.
  fs.mkdirSync(PUBLIC_RESCUE, { recursive: true });
  const latest = {
    generatedAt: new Date().toISOString(),
    sourceDeployment: OLD_DEPLOYMENT_URL,
    phases: {
      A: { completed: !!phaseA.completed, workingPaths: Object.fromEntries(Object.entries(phaseA.workingPaths ?? {}).map(([k, v]) => [k, v.status])) },
      B: { completed: !!phaseB.completed, backupFile: backupFile ?? null, counts: backupCounts, capturedAt: backup?.capturedAt ?? null },
      C: { completed: !!phaseC.finished, resumeInvoked, polls: polls.length, completedBefore, completedAfter, stopped: phaseC.stopped === true },
    },
    nextStep,
  };
  fs.writeFileSync(
    path.join(PUBLIC_RESCUE, "latest.json"),
    JSON.stringify(latest, null, 2),
  );

  console.log("Phase D done:");
  console.log("  rescue/report.html");
  console.log("  public/docs/rescue-report.html");
  console.log("  public/rescue/latest.json");
}

main().catch((err) => {
  logEvent({ phase: "D", label: "fatal", error: `${err?.stack ?? err}` });
  console.error("Phase D fatal:", err);
  process.exitCode = 1;
});
