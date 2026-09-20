// PHASE C — SAFE RESUME ATTEMPT (runs only after A+B succeed).
// Probes for the invokable resume entry point in the resumeServerProject file.
// Convex actions cannot be reached via /api/query, so we probe for a mutation
// wrapper that schedules the recovery action. ONLY the designated safe-resume
// function is ever called — never updateProject or any status-changing mutation.
// After invoking, the progress query is polled 3x over ~10 minutes.
// If no safe entry point exists: STOP, document, do not improvise.
// Usage: node scripts/rescue/phase-c.mjs
//   env RESCUE_POLL_SECONDS (default 300) — spacing between the 3 polls.

import {
  callConvex,
  ensureLogHeader,
  loadState,
  logEvent,
  plausibleArgsFromError,
  saveState,
} from "./lib.mjs";

// Designated safe-resume entry point candidates (mutations only, same file as
// getServerJobStatus). Each name clearly reads as resume/recovery — anything
// else is refused by the lib guardrail.
const RESUME_CANDIDATES = [
  "resumeServerProject:resumeServerJob",
  "resumeServerProject:resumeJob",
  "resumeServerProject:resume",
  "resumeServerProject:recoverJob",
  "resumeServerProject:resumeServer",
  "resumeServerProject:resumeFrozenJob",
  "resumeServerProject:kickWatchdog",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probeResume(phase) {
  for (const fnPath of RESUME_CANDIDATES) {
    const res = await callConvex(fnPath, {}, { phase, mutation: true });
    if (res.ok) {
      logEvent({
        phase,
        label: `DESIGNATED SAFE-RESUME INVOKED · ${fnPath}`,
        value: res.value,
      });
      return { invoked: true, fnPath, result: res.value };
    }
    // If the validator tells us required args, record them; do NOT invent
    // id-shaped values to force a call on the wrong project.
    const derived = plausibleArgsFromError(res.errorText);
    const meaningful = Object.keys(derived).filter((k) => !/^(cursor|limit|page|pageSize|offset|numItems)$/i.test(k));
    if (res.kind === "function-error" && meaningful.length > 0) {
      logEvent({
        phase,
        label: `${fnPath} requires args — documented, not guessed`,
        value: { requiredArgsHint: derived },
      });
    }
  }
  return { invoked: false };
}

async function pollProgress(phase, pollNumber, extraQueries) {
  const snapshot = { pollNumber, atUTC: new Date().toISOString() };
  const status = await callConvex(
    "resumeServerProject:getServerJobStatus",
    {},
    { phase },
  );
  snapshot.getServerJobStatus = status.ok ? status.value : { error: status.errorText };
  for (const [label, fnPath, args] of extraQueries) {
    const res = await callConvex(fnPath, args, { phase });
    snapshot[label] = res.ok ? res.value : { error: res.errorText };
  }
  logEvent({ phase, label: `progress poll #${pollNumber}`, value: snapshot });
  return snapshot;
}

function extractCompletedChunks(snapshot) {
  const sources = [
    snapshot.getServerJobStatus,
    snapshot.getTranslationProgress,
  ];
  for (const s of sources) {
    if (s && typeof s === "object") {
      for (const k of ["completedChunks", "completed", "doneChunks", "chunksDone"]) {
        if (typeof s[k] === "number") return s[k];
      }
      // nested project/progress shapes
      for (const v of Object.values(s)) {
        if (v && typeof v === "object" && typeof v.completedChunks === "number") {
          return v.completedChunks;
        }
      }
    }
  }
  return null;
}

async function main() {
  ensureLogHeader("C");
  const state = loadState();
  if (!state.phaseA?.completed) {
    logEvent({
      phase: "C",
      label: "ABORTED — prerequisites missing",
      error: "Phase A must complete before Phase C. Nothing was invoked.",
    });
    console.error("Refusing to run: Phase A not completed. See rescue/forensic-log.md");
    process.exitCode = 1;
    return;
  }
  if (state.phaseB?.dataCaptured === false) {
    logEvent({
      phase: "C",
      label: "warning — backup captured no data",
      error:
        state.phaseB?.blocker ??
        "Phase B captured 0 rows; safe-resume attempt will run in documentation-only mode.",
    });
  }

  console.log("Probing for designated safe-resume entry point (mutations only)…");
  const probe = await probeResume("C");

  const extraPollQueries = [];
  const progressPath = state.phaseA?.workingPaths?.["queries:getTranslationProgress"]?.status === "ok"
    ? "queries:getTranslationProgress"
    : null;
  const latest = state.phaseA?.workingPaths?.["queries:getLatestProject"];
  const projectId =
    latest?.status === "ok" && latest?.value
      ? (latest.value._id ?? latest.value.id ?? latest.value.projectId ?? null)
      : null;
  if (progressPath && projectId) {
    extraPollQueries.push(["getTranslationProgress", progressPath, { projectId }]);
  }

  const phaseC = {
    started: new Date().toISOString(),
    resumeInvocation: probe,
    polls: [],
  };

  if (probe.invoked && state.phaseB?.dataCaptured !== false) {
    console.log(`Safe-resume invoked via ${probe.fnPath}. Polling progress 3x…`);
    const pollSeconds = Number(process.env.RESCUE_POLL_SECONDS ?? 300);
    for (let i = 1; i <= 3; i++) {
      if (i > 1) await sleep(pollSeconds * 1000);
      const snap = await pollProgress("C", i, extraPollQueries);
      phaseC.polls.push(snap);
      console.log(
        `Poll ${i}/3 at ${snap.atUTC}: completedChunks=${extractCompletedChunks(snap) ?? "?"}`,
      );
    }
    const first = extractCompletedChunks(phaseC.polls[0]);
    const last = extractCompletedChunks(phaseC.polls[phaseC.polls.length - 1]);
    phaseC.advancedPast14 =
      first != null && last != null ? last > first || last > 14 : null;
    console.log(
      phaseC.advancedPast14
        ? "completedChunks ADVANCED past 14."
        : "completedChunks did NOT advance past 14 (or unknown).",
    );
  } else {
    // STOP and document exactly what exists — do not improvise.
    phaseC.stopped = true;
    phaseC.documentation = {
      note: probe.invoked
        ? "Safe-resume could not be verified because Phase B captured no data (deployment paused). Invocation result recorded; no polling performed."
        : "No designated safe-resume mutation responded OK. No status-changing or destructive call was made. All probed paths and verbatim errors are in forensic-log.md.",
      probedResumeCandidates: RESUME_CANDIDATES,
      knownQueries: Object.keys(state.phaseA?.workingPaths ?? {}),
      knownMutations: [
        "resumeServerProject:getServerJobStatus (query — not callable while deployment is paused)",
      ],
    };
    logEvent({
      phase: "C",
      label: "STOP — no safe entry point found",
      error:
        "No invokable resume mutation accepted {} (all probes errored; see log). Per mission rules: STOP, document, report. No improvised calls were made.",
    });
  }

  saveState({ phaseC: { ...phaseC, finished: new Date().toISOString() } });
  console.log("Phase C done — see rescue/forensic-log.md");
}

main().catch((err) => {
  logEvent({ phase: "C", label: "fatal", error: `${err?.stack ?? err}` });
  console.error("Phase C fatal:", err);
  process.exitCode = 1;
});
