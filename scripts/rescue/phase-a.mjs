// PHASE A — READ-ONLY FORENSICS.
// Probes candidate query paths on the OLD deployment. Arg-validator errors are
// recorded verbatim (they reveal required args) and each probed path is retried
// with plausible args derived from those errors.
// Nothing is mutated in this phase. Usage: node scripts/rescue/phase-a.mjs

import {
  callConvex,
  ensureLogHeader,
  loadState,
  logEvent,
  plausibleArgsFromError,
  saveState,
} from "./lib.mjs";

const CANDIDATES = [
  { path: "queries:getLatestProject", args: {} },
  { path: "queries:getAllProjects", args: {} },
  { path: "queries:getProjectRaw", args: {}, probeArgs: { projectId: "probe" } },
  { path: "queries:getTranslationsRaw", args: {}, probeArgs: { projectId: "probe" } },
  { path: "queries:getTranslationProgress", args: {}, probeArgs: { projectId: "probe" } },
  {
    path: "queries:getLivePreviewText",
    args: {},
    probeArgs: { projectId: "probe", langCode: "ur" },
  },
  { path: "queries:getHistory", args: {}, probeArgs: { sessionId: "probe" } },
  { path: "resumeServerProject:getServerJobStatus", args: {} },
];

function isArgError(text) {
  return /argument|validator|required|missing|expected/i.test(text ?? "");
}

async function probeCandidate({ phase, candidate }) {
  const { path: fnPath, args } = candidate;
  const first = await callConvex(fnPath, args, { phase });
  if (first.ok) {
    return { fnPath, working: true, value: first.value, attempts: [args] };
  }

  // Arg-validator errors are valuable: they reveal required args verbatim.
  const derived = isArgError(first.errorText)
    ? plausibleArgsFromError(first.errorText)
    : {};
  const canned = candidate.probeArgs ?? {};

  const attempts = [{ args }];
  if (Object.keys(derived).length > 0) {
    attempts.push({ args: derived, note: "args derived from validator error" });
  }
  if (
    Object.keys(canned).length > 0 &&
    JSON.stringify(canned) !== JSON.stringify(derived)
  ) {
    attempts.push({ args: canned, note: "canned plausible args" });
  }

  let last = first;
  for (const attempt of attempts.slice(1)) {
    logEvent({
      phase,
      label: `${fnPath} · retry (${attempt.note})`,
      value: attempt.args,
    });
    last = await callConvex(fnPath, attempt.args, { phase });
    if (last.ok) {
      return {
        fnPath,
        working: true,
        value: last.value,
        attempts: attempts.map((a) => a.args),
      };
    }
  }
  return {
    fnPath,
    working: false,
    errorText: last.errorText,
    attempts: attempts.map((a) => a.args),
  };
}

async function main() {
  ensureLogHeader("A");
  const state = loadState();
  if (state.phaseA?.completed) {
    logEvent({
      phase: "A",
      label: "skipped (already completed)",
      value: state.phaseA.workingPaths ?? {},
    });
    console.log("Phase A already completed — see rescue/forensic-log.md");
    return;
  }

  saveState({ phaseA: { started: new Date().toISOString() } });
  const results = [];
  for (const candidate of CANDIDATES) {
    console.log(`Probing ${candidate.path} …`);
    const result = await probeCandidate({
      phase: "A",
      candidate,
    });
    results.push(result);
  }

  const workingPaths = {};
  for (const r of results) {
    workingPaths[r.fnPath] = r.working
      ? { status: "ok", value: r.value }
      : { status: "error", errorText: r.errorText };
  }
  saveState({
    phaseA: {
      completed: true,
      finished: new Date().toISOString(),
      workingPaths,
    },
  });

  const okCount = results.filter((r) => r.working).length;
  console.log(
    `\nPhase A done: ${okCount}/${results.length} candidate paths responded OK. See rescue/forensic-log.md`,
  );
  for (const r of results) {
    console.log(`  ${r.working ? "✔" : "✘"} ${r.fnPath}`);
  }
}

main().catch((err) => {
  logEvent({ phase: "A", label: "fatal", error: `${err?.stack ?? err}` });
  console.error("Phase A fatal:", err);
  process.exitCode = 1;
});
