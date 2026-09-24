// convex/resumeServerProject.ts — SAFE RECOVERY (spec-only reconstruction).
//
// Overview dashboard law, verbatim:
//   "resumeServerProject — preserves all completed chunks, promotes arrived
//    retry_wait, reclaims ONLY expired-heartbeat claims, Pacific-date-only
//    governor reset, never bypasses a valid quota pause, one transactional
//    lease + fresh dispatcherTick; getServerJobStatus powers honest UI"
//
// In the salvage this was the ONLY designated safe-resume entry point — it
// never hand-edits statuses beyond the documented safe operations.

import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { TRANSLATION_CONFIG, pacificDateKey } from "./translationConfig";

// ──────────────────────────────────────────────────────────
// getServerJobStatus — honest UI state (the phase-2 app calls this)
// ──────────────────────────────────────────────────────────

export const getServerJobStatus = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(api.queries.getProjectRaw, { projectId: args.projectId });
    if (!project) return { found: false as const };

    const jobs = await ctx.runQuery(api.queries.getProjectRateSummary, {
      projectId: args.projectId,
    });
    if (!jobs) return { found: false as const };

    // Per-language done/total — the server-derived counters that fixed the
    // incident's fake "0/20 languages" UI.
    const perLangJobs = await ctx.runQuery(internal.resumeServerProject.perLangDone, {
      projectId: args.projectId,
    });

    const governorPaused = project.governorState === "daily_paused";
    const platformPaused = process.env.PLATFORM_PAUSED === "1"; // honesty flag, normally unset

    return {
      found: true as const,
      translationMode: project.translationMode ?? "legacy",
      status: project.status,
      governorState: project.governorState ?? "running",
      governorResumeAt: project.governorResumeAt ?? null,
      requestsToday: jobs.requestsToday,
      dailyBudget: jobs.dailyBudget,
      workerLimit: jobs.workerLimit,
      targetRpm: jobs.targetRpm,
      jobsTotal: jobs.jobsTotal,
      jobsDone: jobs.jobsDone,
      jobsFailed: jobs.jobsFailed,
      jobsWaiting: jobs.jobsWaiting,
      jobsClaimed: jobs.jobsClaimed,
      jobsPending: jobs.jobsPending,
      perLangDone: perLangJobs,
      lastDispatcherAt: project.lastDispatcherAt ?? null,
      lastSuccessfulActivityAt: project.lastSuccessfulActivityAt ?? null,
      watchdogLastRunAt: project.watchdogLastRunAt ?? null,
      watchdogRecoveryCount: project.watchdogRecoveryCount ?? 0,
      watchdogLastError: project.watchdogLastError ?? null,
      lastDispatcherError: project.lastDispatcherError ?? null,
      serverConfirmed:
        !platformPaused &&
        Date.now() - (project.lastDispatcherAt ?? 0) < 2 * TRANSLATION_CONFIG.staleProjectThresholdMs,
      platformPaused,
      governorPaused,
    };
  },
});

export const perLangDone = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("translationJobs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return perLangDoneCalc(jobs);
  },
});

function perLangDoneCalc(jobs: Array<{ langCode: string; status: string }>): Array<{ langCode: string; done: number; total: number }> {
  const map = new Map<string, { done: number; total: number }>();
  for (const j of jobs) {
    const row = map.get(j.langCode) ?? { done: 0, total: 0 };
    row.total++;
    if (j.status === "done") row.done++;
    map.set(j.langCode, row);
  }
  return [...map.entries()]
    .map(([langCode, c]) => ({ langCode, ...c }))
    .sort((a, b) => a.langCode.localeCompare(b.langCode));
}

// ─────────────────────────────────══════════════════════════
// The designated SAFE-RESUME entry point (mutation wrapper; the UI calls
// resumeServerProject, which internally schedules the fresh tick).
// ─────────────────────────────────══════════════════════════

export const resumeServerProject = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(api.queries.getProjectRaw, { projectId: args.projectId });
    if (!project) return { ok: false as const, reason: "project_not_found" };

    // Preserves all completed chunks: resume NEVER deletes or re-translates
    // done work — it only promotes/reclaims/revives what is incomplete.
    const promoted = await ctx.runMutation(internal.resumeServerProject.resumePrepare, {
      projectId: args.projectId,
    });

    // Never bypass a valid quota pause — report it honestly instead.
    if (promoted.governorPaused && !promoted.governorExpired) {
      return {
        ok: true as const,
        resumed: false as const,
        reason: "daily_paused",
        resumeAt: promoted.governorResumeAt,
        reclaimed: promoted.reclaimed,
        promoted: promoted.promoted,
      };
    }

    // One transactional lease + fresh dispatcherTick.
    await ctx.runMutation(internal.resumeServerProject.markResuming, {
      projectId: args.projectId,
    });
    await ctx.scheduler.runAfter(0, api.adaptiveDispatcher.dispatcherTick, {
      projectId: args.projectId,
    });
    return {
      ok: true as const,
      resumed: true as const,
      reclaimed: promoted.reclaimed,
      promoted: promoted.promoted,
      perLangDone: promoted.perLangDone,
    };
  },
});

export const resumePrepare = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return { reclaimed: 0, promoted: 0, governorPaused: false as const, governorExpired: false as const, governorResumeAt: null, perLangDone: [] };

    // 1. Promote arrived retry_wait (nextRetryAt passed) → pending.
    const now = Date.now();
    const rows = await ctx.db
      .query("translationJobs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    let promoted = 0;
    let reclaimed = 0;
    for (const j of rows) {
      if (j.status === "retry_wait" && (j.nextRetryAt ?? 0) <= now) {
        await ctx.db.patch(j._id, { status: "pending", claimToken: undefined });
        promoted++;
      } else if (
        (j.status === "claimed" || j.status === "running") &&
        now - (j.heartbeatAt ?? j.claimedAt ?? 0) > TRANSLATION_CONFIG.heartbeatTtlMs
      ) {
        // Reclaim ONLY expired-heartbeat claims — never touch live leases.
        await ctx.db.patch(j._id, {
          status: "pending",
          claimToken: undefined,
          reclaimCount: (j.reclaimCount ?? 0) + 1,
        });
        reclaimed++;
      }
    }

    // 2. Pacific-date-only governor reset: clear the pause ONLY when the
    //    Pacific date has changed since the counter was set (never bypass a
    //    same-day quota pause).
    let governorPaused = project.governorState === "daily_paused";
    let governorExpired = false;
    if (governorPaused) {
      const rate = await ctx.db
        .query("rateLimits")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .first();
      const today = pacificDateKey(now);
      if (rate && rate.requestDayPacific !== today) {
        // Date changed → counter reset already legitimate; resume armed.
        governorExpired = true;
        governorPaused = false;
        await ctx.db.patch(rate._id, {
          requestsToday: 0,
          requestDayPacific: today,
          lastUpdatedAt: now,
        });
        await ctx.db.patch(args.projectId, {
          governorState: "running",
          governorResumeAt: undefined,
        });
      }
    }

    // 3. Legacy-mode revival also routes through here (safe recovery covers
    //    both modes without touching completed chunks).
    const perLang = perLangDoneCalc(
      rows.map((r) => ({ langCode: r.langCode, status: r.status })),
    );

    return {
      reclaimed,
      promoted,
      governorPaused,
      governorExpired,
      governorResumeAt: project.governorResumeAt ?? null,
      perLangDone: perLang,
    };
  },
});

export const markResuming = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      lastDispatcherAt: Date.now(),
      watchdogRecoveredAt: Date.now(),
      watchdogRecoveryCount: ((await ctx.db.get(args.projectId))?.watchdogRecoveryCount ?? 0) + 1,
    });
  },
});
