// convex/adaptiveDispatcher.ts — Dispatcher (spec-only reconstruction).
//
// Overview dashboard law, verbatim:
//   "convex/adaptiveDispatcher.ts (dispatcherTick wrapper +
//    dispatcherTickInner) — ANY crash inside a tick is persisted
//    (recordDispatcherError) and the chain self-reschedules — one malformed
//    response can never kill the pipeline; heartbeat at tick start; no-keys
//    retries instead of throwing; bounded 20s deadline, claim budget 2/tick"
//
// Language chain law: remainingLangs passes through EVERY link.

import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { TRANSLATION_CONFIG } from "./translationConfig";

const DEADLINE_BUFFER_MS = 2_000; // exit before the action timeout

export const dispatcherTick = action({
  args: {
    projectId: v.id("projects"),
    langCode: v.optional(v.string()),
    remainingLangs: v.optional(v.array(v.string())),
    marketContext: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const startedAt = Date.now();
    try {
      await ctx.runMutation(internal.adaptiveDispatcher.heartbeatDispatcher, {
        projectId: args.projectId,
      });
      return await ctx.runAction(api.adaptiveDispatcher.dispatcherTickInner, {
        projectId: args.projectId,
        langCode: args.langCode,
        remainingLangs: args.remainingLangs,
        marketContext: args.marketContext,
        startedAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // ANY crash inside a tick is persisted and the chain self-reschedules.
      await ctx.runMutation(internal.adaptiveDispatcher.recordDispatcherError, {
        projectId: args.projectId,
        error: message,
      }).catch(() => {});
      await ctx.scheduler.runAfter(
        Math.floor(TRANSLATION_CONFIG.dispatcherIntervalMs / 2),
        api.adaptiveDispatcher.dispatcherTick,
        {
          projectId: args.projectId,
          langCode: args.langCode,
          remainingLangs: args.remainingLangs,
          marketContext: args.marketContext,
        },
      );
      return { ok: false as const, error: message };
    }
  },
});

export const dispatcherTickInner = action({
  args: {
    projectId: v.id("projects"),
    langCode: v.optional(v.string()),
    remainingLangs: v.optional(v.array(v.string())),
    marketContext: v.optional(v.string()),
    startedAt: v.number(),
  },
  handler: async (ctx, args): Promise<any> => {
    // Governor pause → reschedule for resume time, never silently dead.
    const project = await ctx.runQuery(api.queries.getProjectRaw, { projectId: args.projectId });
    if (!project) return { ok: false as const, reason: "project_not_found" };
    if (project.status === "cancelled") return { ok: true as const, stopped: true as const };
    if (project.governorState === "daily_paused" && project.governorResumeAt) {
      await ctx.scheduler.runAfter(
        Math.max(60_000, project.governorResumeAt - Date.now()),
        api.adaptiveDispatcher.dispatcherTick,
        {
          projectId: args.projectId,
          langCode: args.langCode,
          remainingLangs: args.remainingLangs,
          marketContext: args.marketContext,
        },
      );
      return { ok: true as const, paused: true as const, resumeAt: project.governorResumeAt };
    }

    // Claim budget: 2 per tick. Drive the ACTIVE language (first lang with
    // unfinished jobs), then promote to the next language in the chain.
    const langs = [args.langCode, ...(args.remainingLangs ?? [])].filter(
      (l): l is string => !!l,
    );
    const activeLangs = langs.length > 0 ? langs : [""];
    const claims: number[] = [];

    for (const lang of activeLangs) {
      if (claims.length >= TRANSLATION_CONFIG.maxJobsClaimedPerDispatch) break;
      if (Date.now() - args.startedAt > TRANSLATION_CONFIG.actionSafetyDeadlineMs - DEADLINE_BUFFER_MS) break;

      // Pair-merge first (adjacent chunks, safe token cap), then singles.
      const pair = await ctx.runMutation(internal.adaptiveJobs.claimJobPair, {
        projectId: args.projectId,
        langCode: lang,
        workerId: `tick-${args.startedAt}`,
      });
      if (pair.claimedPair) {
        claims.push(pair.chunkIndexA, pair.chunkIndexB);
        // One Gemini request per claim — run the PAIR through the same
        // per-claim executor on the first job; the executor writes both
        // halves when the requestGroupId marks a merged pair. To keep the
        // request budget at ONE per pair, we execute the primary job now.
        await ctx.runAction(api.adaptiveJobs.processClaimedJob, {
          jobId: pair.jobIdA,
          claimToken: pair.claimTokenA,
          marketContext: args.marketContext,
        });
        continue;
      }
      const single = await ctx.runMutation(internal.adaptiveJobs.claimJob, {
        projectId: args.projectId,
        langCode: lang,
        workerId: `tick-${args.startedAt}`,
      });
      if (single.claimed) {
        claims.push(single.chunkIndex);
        await ctx.runAction(api.adaptiveJobs.processClaimedJob, {
          jobId: single.jobId,
          claimToken: single.claimToken,
          marketContext: args.marketContext,
        });
      }
    }

    // Promote retryable jobs so the next tick sees them as pending.
    await ctx.runMutation(internal.adaptiveJobs.promoteRetryableJobs, {
      projectId: args.projectId,
    });

    // ZIP finalize gate — fires buildZip exactly once when everything is done.
    await ctx.runMutation(internal.adaptiveJobs.zipFinalizeIfDone, {
      projectId: args.projectId,
    });

    // Language-chain promotion: when the current language has no unfinished
    // jobs, advance remainingLangs through EVERY link (the chain never dies).
    let nextLang = args.langCode;
    let rest = args.remainingLangs ?? [];
    if (nextLang) {
      const status = await ctx.runQuery(api.queries.getProjectRateSummary, {
        projectId: args.projectId,
      });
      const langDone =
        status &&
        status.jobsTotal > 0 &&
        status.jobsPending + status.jobsClaimed + status.jobsWaiting === 0;
      if (langDone && rest.length > 0) {
        nextLang = rest[0];
        rest = rest.slice(1);
      }
    }

    // Bounded self-rescheduling — always re-arm unless the project stopped.
    const elapsed = Date.now() - args.startedAt;
    if (elapsed < TRANSLATION_CONFIG.actionSafetyDeadlineMs - DEADLINE_BUFFER_MS) {
      await ctx.scheduler.runAfter(
        TRANSLATION_CONFIG.dispatcherIntervalMs,
        api.adaptiveDispatcher.dispatcherTick,
        {
          projectId: args.projectId,
          langCode: nextLang ?? undefined,
          remainingLangs: rest.length > 0 ? rest : undefined,
          marketContext: args.marketContext,
        },
      );
      return { ok: true as const, claims: claims.length, rescheduled: true as const, nextLang };
    }
    return { ok: true as const, claims: claims.length, rescheduled: false as const, nextLang };
  },
});

/** Heartbeat at tick start (project-level liveness telemetry). */
export const heartbeatDispatcher = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, { lastDispatcherAt: Date.now() });
  },
});

/** Persist ANY tick crash (never silent) — the watchdog/telemetry reads this. */
export const recordDispatcherError = internalMutation({
  args: { projectId: v.id("projects"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      lastDispatcherError: args.error.slice(0, 1000),
      lastDispatcherAt: Date.now(),
    });
  },
});
