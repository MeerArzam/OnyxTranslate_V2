import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { TRANSLATION_CONFIG, pacificDateKey } from "./translationConfig";

/** The salvaged deployment law is a three-minute cron, not the requested 60 seconds. */
export const watchdogTick = internalAction({
  args: {},
  handler: async (ctx): Promise<any> => {
    const projects = await ctx.runQuery(internal.adaptiveWatchdog.allProjectsRaw, {});
    let recovered = 0;
    let failed = 0;
    for (const project of projects) {
      try {
        const result = await ctx.runAction(internal.adaptiveWatchdog.recoverProject, { projectId: project._id });
        if (result.recovered) recovered++;
      } catch (error) {
        failed++;
        await ctx.runMutation(internal.adaptiveWatchdog.persistWatchdogError, {
          projectId: project._id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { scanned: projects.length, recovered, failed };
  },
});

export const allProjectsRaw = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = [];
    for await (const project of ctx.db.query("projects")) rows.push(project);
    return rows.map((p) => ({ _id: p._id, status: p.status, translationMode: p.translationMode }));
  },
});

export const recoverProject = internalAction({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args): Promise<any> => {
    const project = await ctx.runQuery(api.queries.getProjectRaw, { projectId: args.projectId });
    if (!project || project.status === "cancelled") return { recovered: false as const, reason: "cancelled" as const };

    // Reclaim first. This is independent from the dispatcher lease and is safe
    // after a deployment pause; it never touches a live lease.
    const reclaimed = await ctx.runMutation(internal.adaptiveJobs.reclaimExpiredClaims, {
      projectId: args.projectId,
    });
    await ctx.runMutation(internal.adaptiveJobs.promoteRetryableJobs, { projectId: args.projectId });

    const hasWork = await ctx.runQuery(internal.adaptiveJobs.hasDispatchableWork, {
      projectId: args.projectId,
    });
    const dispatcherLive = (project.dispatcherLeaseUntil ?? 0) > Date.now();
    let revived = false;

    if (project.status === "translating" && hasWork && !dispatcherLive) {
      // Watchdog is a dispatcher restarter, not merely a status-flipper.
      await ctx.scheduler.runAfter(0, api.adaptiveDispatcher.dispatcherTick, {
        projectId: args.projectId,
      });
      revived = true;
    }

    // A translating project with no pending/live rows is stalled. The safe
    // resume mutation derives missing jobs from chunks/translations.
    if (project.status === "translating" && !hasWork) {
      const allJobs = await ctx.runQuery(internal.resumeServerProject.projectJobsSnapshot, {
        projectId: args.projectId,
      });
      if (allJobs.length === 0) {
        await ctx.runMutation(internal.adaptiveWatchdog.markStalled, {
          projectId: args.projectId,
        });
        await ctx.runAction(api.resumeServerProject.resumeServerProject, {
          projectId: args.projectId,
        });
        revived = true;
      }
    }

    // The old governor is Pacific-date based. Reset only after the date changes;
    // a same-day 1,200-request pause is never bypassed.
    if (project.governorState === "daily_paused" && project.governorResumeAt && Date.now() >= project.governorResumeAt) {
      const rate = await ctx.runQuery(internal.resumeServerProject.globalRateSnapshot, {});
      if (rate && rate.requestDayPacific !== pacificDateKey()) {
        await ctx.runMutation(internal.resumeServerProject.resumeAfterGovernorReset, { projectId: args.projectId });
        revived = true;
      }
    }

    if (revived || reclaimed.reclaimed > 0) {
      await ctx.runMutation(internal.adaptiveWatchdog.persistWatchdogRecovery, { projectId: args.projectId });
    }
    return { recovered: revived, reclaimed: reclaimed.reclaimed };
  },
});

export const markStalled = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.status === "cancelled") return;
    await ctx.db.patch(args.projectId, { status: "stalled" });
  },
});

export const persistWatchdogRecovery = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.status === "cancelled") return;
    await ctx.db.patch(args.projectId, {
      watchdogLastRunAt: Date.now(),
      watchdogRecoveredAt: Date.now(),
      watchdogRecoveryCount: (project.watchdogRecoveryCount ?? 0) + 1,
      watchdogLastError: undefined,
    });
  },
});

export const persistWatchdogError = internalMutation({
  args: { projectId: v.id("projects"), error: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.status === "cancelled") return;
    await ctx.db.patch(args.projectId, {
      watchdogLastRunAt: Date.now(),
      watchdogLastError: args.error.slice(0, 1000),
    });
  },
});

// Kept as a named config reference for the old watchdog law and for probes.
export const WATCHDOG_INTERVAL_MS = TRANSLATION_CONFIG.watchdogIntervalMs;
