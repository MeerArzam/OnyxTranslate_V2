// convex/adaptiveWatchdog.ts — PRIMARY driver, every 3 minutes (crons.ts).
//
// Reliability-pass law (history P0–P7 + overview), verbatim:
//   "Cron every 3 min is the PRIMARY safety driver for BOTH modes: legacy
//    projects revived via translateLanguage (the 14/92 incident gap — old
//    watchdog skipped legacy rows), adaptive via dispatcher re-kick on
//    expired lease or >10min no-activity; per-project try/catch (one broken
//    project never stops others); watchdogLastRunAt/RecoveredAt/
//    RecoveryCount/LastError persisted"
//
// Platform honesty: the cron is SKIPPED while the deployment is paused
// (documented Convex behavior) — revival on wake is exactly why every job is
// a durable row.

import { v } from "convex/values";
import { internalMutation, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { TRANSLATION_CONFIG } from "./translationConfig";

/** Cron entry — iterates ALL projects, isolating failures per project. */
export const watchdogTick = internalAction({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.runQuery(internal.adaptiveWatchdog.allProjectsRaw, {});
    let recovered = 0;
    let failed = 0;
    for (const project of projects) {
      try {
        const r = await ctx.runAction(internal.adaptiveWatchdog.recoverProject, {
          projectId: project._id,
        });
        if (r.recovered) recovered++;
      } catch (e) {
        // One broken project never stops others — persist the error.
        failed++;
        await ctx.runMutation(internal.adaptiveWatchdog.persistWatchdogError, {
          projectId: project._id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return { scanned: projects.length, recovered, failed };
  },
});

export const allProjectsRaw = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Reads run inside a mutation here only as a defensive collect; the
    // watchdog needs the full project list each tick.
    const rows = [];
    for await (const p of ctx.db.query("projects")) rows.push(p);
    return rows.map((p) => ({ _id: p._id, status: p.status, translationMode: p.translationMode }));
  },
});

/** Per-project recovery — the watchdog's core logic for ONE project. */
export const recoverProject = internalAction({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(api.queries.getProjectRaw, { projectId: args.projectId });
    if (!project) return { recovered: false as const };

    // 1. Universal: promote retryable + reclaim expired claims (both modes).
    await ctx.runMutation(internal.adaptiveJobs.promoteRetryableJobs, { projectId: args.projectId });
    const reclaimed = await ctx.runMutation(internal.adaptiveJobs.reclaimExpiredClaims, {
      projectId: args.projectId,
    });

    // 2. Recover stuck PDF batches (adaptive batching law).
    const batchRecovery = await ctx.runMutation(internal.adaptivePdf.recoverStuckBatches, {
      projectId: args.projectId,
    });

    let revived = false;

    // 3. ADAPTIVE projects: re-kick a missing/stale dispatcher lease.
    if (project.translationMode === "adaptive_parallel" && project.status === "translating") {
      const last = project.lastDispatcherAt ?? 0;
      const stale =
        Date.now() - last > TRANSLATION_CONFIG.staleProjectThresholdMs ||
        Date.now() - (project.lastSuccessfulActivityAt ?? last) >
          TRANSLATION_CONFIG.staleProjectThresholdMs;
      if (stale) {
        await ctx.scheduler.runAfter(0, api.adaptiveDispatcher.dispatcherTick, {
          projectId: args.projectId,
        });
        revived = true;
      }
      // Governor auto-resume arm (midnight Pacific passed → clear pause).
      if (
        project.governorState === "daily_paused" &&
        project.governorResumeAt &&
        Date.now() >= project.governorResumeAt
      ) {
        await ctx.runMutation(api.mutations.updateProject, {
          projectId: args.projectId,
          governorState: "running",
          governorResumeAt: undefined,
        });
        await ctx.scheduler.runAfter(0, api.adaptiveDispatcher.dispatcherTick, {
          projectId: args.projectId,
        });
        revived = true;
      }
    }

    // 4. LEGACY projects (the 14/92 incident gap — old watchdog skipped
    //    legacy rows): revive stalled in_progress languages via the legacy
    //    chain entry point.
    if (project.translationMode !== "adaptive_parallel" && project.status === "translating") {
      const stalled = await ctx.runQuery(api.queries.getStalledLanguages, {
        projectId: args.projectId,
        sessionId: project.sessionId ?? "",
      });
      if (stalled.length > 0) {
        const translationRow = await ctx.runQuery(api.queries.getTranslationsRaw, {
          projectId: args.projectId,
        });
        const target = translationRow.find((t) => t.langCode === stalled[0]);
        await ctx.scheduler.runAfter(0, api.translateContent.translateLanguage, {
          projectId: args.projectId,
          langCode: stalled[0],
          nextLangCode: undefined,
          remainingLangs: stalled.slice(1),
        });
        if (target) {
          await ctx.runMutation(api.mutations.updateTranslation, {
            translationId: target._id,
            status: "in_progress",
          });
        }
        revived = true;
      }
    }

    if (revived || reclaimed.reclaimed > 0 || batchRecovery.recovered > 0) {
      await ctx.runMutation(internal.adaptiveWatchdog.persistWatchdogRecovery, {
        projectId: args.projectId,
      });
    }
    return { recovered: revived, reclaimed: reclaimed.reclaimed, batches: batchRecovery.recovered };
  },
});

export const persistWatchdogRecovery = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      watchdogLastRunAt: Date.now(),
      watchdogRecoveredAt: Date.now(),
      watchdogRecoveryCount: ((await ctx.db.get(args.projectId))?.watchdogRecoveryCount ?? 0) + 1,
      watchdogLastError: undefined,
    });
  },
});

export const persistWatchdogError = internalMutation({
  args: { projectId: v.id("projects"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      watchdogLastRunAt: Date.now(),
      watchdogLastError: args.error.slice(0, 1000),
    });
  },
});
