import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { TRANSLATION_CONFIG } from "./translationConfig";

const DEADLINE_BUFFER_MS = 2_000;

/**
 * Dispatcher is intentionally a short tick. It never performs a Gemini call
 * and never runs an unbounded loop: it claims, schedules, and re-arms.
 */
export const dispatcherTick = action({
  args: {
    projectId: v.id("projects"),
    langCode: v.optional(v.string()),
    remainingLangs: v.optional(v.array(v.string())),
    marketContext: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const lease = await ctx.runMutation(internal.adaptiveDispatcher.acquireDispatcherLease, {
      projectId: args.projectId,
    });
    if (!lease.acquired) return { ok: true as const, skipped: true as const, reason: "dispatcher_in_flight" };

    try {
      await ctx.runMutation(internal.adaptiveDispatcher.heartbeatDispatcher, {
        projectId: args.projectId,
      });
      return await ctx.runAction(api.adaptiveDispatcher.dispatcherTickInner, {
        projectId: args.projectId,
        langCode: args.langCode,
        remainingLangs: args.remainingLangs,
        marketContext: args.marketContext,
        startedAt: Date.now(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.adaptiveDispatcher.recordDispatcherError, {
        projectId: args.projectId,
        error: message,
      }).catch(() => undefined);
      await ctx.runMutation(internal.adaptiveDispatcher.armDispatcher, {
        projectId: args.projectId,
        delayMs: TRANSLATION_CONFIG.dispatcherIntervalMs,
      });
      await ctx.scheduler.runAfter(
        TRANSLATION_CONFIG.dispatcherIntervalMs,
        api.adaptiveDispatcher.dispatcherTick,
        { projectId: args.projectId, langCode: args.langCode, remainingLangs: args.remainingLangs, marketContext: args.marketContext },
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
    const project = await ctx.runQuery(api.queries.getProjectRaw, { projectId: args.projectId });
    if (!project || project.status === "cancelled") {
      await ctx.runMutation(internal.adaptiveDispatcher.releaseDispatcherLease, { projectId: args.projectId });
      return { ok: true as const, stopped: true as const, reason: "cancelled" };
    }

    if (project.governorState === "daily_paused" && project.governorResumeAt) {
      await ctx.scheduler.runAfter(
        Math.max(TRANSLATION_CONFIG.dispatcherIntervalMs, project.governorResumeAt - Date.now()),
        api.adaptiveDispatcher.dispatcherTick,
        { projectId: args.projectId, langCode: args.langCode, remainingLangs: args.remainingLangs, marketContext: args.marketContext },
      );
      return { ok: true as const, paused: true as const, resumeAt: project.governorResumeAt };
    }

    const discovered = await ctx.runQuery(internal.adaptiveJobs.listIncompleteLanguages, {
      projectId: args.projectId,
    });
    const requested = [args.langCode, ...(args.remainingLangs ?? [])].filter((x): x is string => !!x);
    const languages = [...new Set([...requested, ...discovered])];
    const claims: Array<{ jobId: any; claimToken: string; chunkIndex: number; langCode: string }> = [];

    // At most two workers exist. claimJob itself only returns the first
    // unfinished chunk, so a second iteration cannot advance one language.
    for (const langCode of languages) {
      if (claims.length >= TRANSLATION_CONFIG.maxJobsClaimedPerDispatch) break;
      if (Date.now() - args.startedAt > TRANSLATION_CONFIG.actionSafetyDeadlineMs - DEADLINE_BUFFER_MS) break;
      const claim = await ctx.runMutation(internal.adaptiveJobs.claimJob, {
        projectId: args.projectId,
        langCode,
        workerId: `dispatcher-${args.startedAt}-${claims.length}`,
      });
      if (claim.claimed) {
        claims.push({ jobId: claim.jobId, claimToken: claim.claimToken, chunkIndex: claim.chunkIndex, langCode });
        await ctx.scheduler.runAfter(0, api.adaptiveJobs.processClaimedJob, {
          jobId: claim.jobId,
          claimToken: claim.claimToken,
          marketContext: args.marketContext,
        });
      }
    }

    await ctx.runMutation(internal.adaptiveJobs.promoteRetryableJobs, { projectId: args.projectId });
    await ctx.runMutation(internal.adaptiveJobs.zipFinalizeIfDone, { projectId: args.projectId });

    const hasWork = await ctx.runQuery(internal.adaptiveJobs.hasDispatchableWork, { projectId: args.projectId });
    if (hasWork) {
      await ctx.runMutation(internal.adaptiveDispatcher.armDispatcher, {
        projectId: args.projectId,
        delayMs: TRANSLATION_CONFIG.dispatcherIntervalMs,
      });
      await ctx.scheduler.runAfter(
        TRANSLATION_CONFIG.dispatcherIntervalMs,
        api.adaptiveDispatcher.dispatcherTick,
        { projectId: args.projectId, langCode: args.langCode, remainingLangs: args.remainingLangs, marketContext: args.marketContext },
      );
      return { ok: true as const, claims: claims.length, rescheduled: true as const };
    }

    await ctx.runMutation(internal.adaptiveDispatcher.releaseDispatcherLease, { projectId: args.projectId });
    return { ok: true as const, claims: claims.length, rescheduled: false as const };
  },
});

export const acquireDispatcherLease = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const project = await ctx.db.get(args.projectId);
    if (!project || project.status === "cancelled") return { acquired: false as const };
    if ((project.dispatcherLeaseUntil ?? 0) > now) return { acquired: false as const };
    await ctx.db.patch(args.projectId, {
      dispatcherLeaseUntil: now + TRANSLATION_CONFIG.dispatcherLeaseMs,
      lastDispatcherAt: now,
    });
    return { acquired: true as const };
  },
});

export const armDispatcher = internalMutation({
  args: { projectId: v.id("projects"), delayMs: v.number() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.status === "cancelled") return;
    await ctx.db.patch(args.projectId, {
      dispatcherLeaseUntil: Date.now() + Math.max(TRANSLATION_CONFIG.dispatcherLeaseMs, args.delayMs + TRANSLATION_CONFIG.dispatcherLeaseMs),
    });
  },
});

export const releaseDispatcherLease = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, { dispatcherLeaseUntil: undefined });
  },
});

export const heartbeatDispatcher = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.status === "cancelled") return;
    await ctx.db.patch(args.projectId, { lastDispatcherAt: Date.now() });
  },
});

export const recordDispatcherError = internalMutation({
  args: { projectId: v.id("projects"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      lastDispatcherError: args.error.slice(0, 1000),
      lastDispatcherAt: Date.now(),
    });
  },
});
