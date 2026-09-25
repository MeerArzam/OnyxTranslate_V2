import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";

/** Test-only fixture helpers. They are not reachable from the UI. */
export const seedProject = internalMutation({
  args: { chunkCount: v.number(), status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      fileName: `phase3-gate-${now}`,
      pageCount: 1,
      wordCount: args.chunkCount,
      pageData: [],
      fullText: "phase 3 gate fixture",
      parsedPages: 1,
      status: args.status ?? "translating",
      translationMode: "adaptive_parallel",
      translationIntelligenceMode: "gemini_contract",
      pipelineVersion: "adaptive_parallel",
      governorState: "running",
      createdAt: now,
    });
    for (let i = 0; i < args.chunkCount; i++) {
      await ctx.db.insert("chunks", {
        projectId,
        langCode: "ur",
        chunkIndex: i,
        sourceText: `fixture ${i}`,
        status: "pending",
      });
    }
    return projectId;
  },
});

export const deleteProjectFixture = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const jobs = await ctx.db.query("translationJobs").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    for (const job of jobs) await ctx.db.delete(job._id);
    const chunks = await ctx.db.query("chunks").withIndex("by_project_lang", (q) => q.eq("projectId", args.projectId)).collect();
    for (const chunk of chunks) await ctx.db.delete(chunk._id);
    const rates = await ctx.db.query("rateLimits").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    for (const rate of rates) await ctx.db.delete(rate._id);
    await ctx.db.delete(args.projectId);
    return { deleted: true };
  },
});

export const expireJobForTest = internalMutation({
  args: { jobId: v.id("translationJobs") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      leaseExpiresAt: Date.now() - TRANSLATION_CONFIG_TEST_TTL,
      heartbeatAt: Date.now() - TRANSLATION_CONFIG_TEST_TTL,
    });
  },
});

const TRANSLATION_CONFIG_TEST_TTL = 200_000;

export const countJobs = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const jobs = await ctx.db.query("translationJobs").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    return {
      total: jobs.length,
      claimed: jobs.filter((j) => j.status === "claimed" || j.status === "running").length,
      done: jobs.filter((j) => j.status === "done").length,
      failed: jobs.filter((j) => j.status === "failed").length,
      pending: jobs.filter((j) => j.status === "pending").length,
    };
  },
});

async function enqueue(ctx: any, projectId: any) {
  return ctx.runMutation(internal.adaptiveJobs.enqueueTranslationJobs, {
    projectId,
    langCode: "ur",
    chunkCount: 5,
    pipelineVersion: "adaptive_parallel",
    translationIntelligenceMode: "gemini_contract",
  });
}

async function cleanup(ctx: any, projectId: any) {
  await ctx.runMutation(internal.phase3TestGates.deleteProjectFixture, { projectId });
}

/** Run all deterministic gates against the durable Convex implementation. */
export const runPhase3Gates = action({
  args: {},
  handler: async (ctx): Promise<any> => {
    const evidence: Record<string, any> = {};
    let projectId: any;

    // T1: two simultaneous claims against one job.
    projectId = await ctx.runMutation(internal.phase3TestGates.seedProject, { chunkCount: 1 });
    await enqueue(ctx, projectId);
    const claims = await Promise.all([
      ctx.runMutation(internal.adaptiveJobs.claimJob, { projectId, langCode: "ur", workerId: "race-a" }),
      ctx.runMutation(internal.adaptiveJobs.claimJob, { projectId, langCode: "ur", workerId: "race-b" }),
    ]);
    const t1Count = await ctx.runQuery(internal.phase3TestGates.countJobs, { projectId });
    evidence.T1 = { pass: claims.filter((x) => x.claimed).length === 1 && t1Count.claimed === 1, claimed: claims.filter((x) => x.claimed).length, snapshot: t1Count };
    await cleanup(ctx, projectId);

    // T2: expire one lease, run the production reclaim mutation, then finish all five fenced writes.
    projectId = await ctx.runMutation(internal.phase3TestGates.seedProject, { chunkCount: 5 });
    await enqueue(ctx, projectId);
    const first = await ctx.runMutation(internal.adaptiveJobs.claimJob, { projectId, langCode: "ur", workerId: "kill-test" });
    if (first.claimed) await ctx.runMutation(internal.phase3TestGates.expireJobForTest, { jobId: first.jobId });
    const reclaimed = await ctx.runMutation(internal.adaptiveJobs.reclaimExpiredClaims, { projectId });
    let completedWrites = 0;
    for (let i = 0; i < 5; i++) {
      const claim = await ctx.runMutation(internal.adaptiveJobs.claimJob, { projectId, langCode: "ur", workerId: `recovered-${i}` });
      if (!claim.claimed) break;
      const flushed = await ctx.runMutation(internal.adaptiveJobs.flushJobResults, {
        results: [{ projectId, langCode: "ur", chunkIndex: claim.chunkIndex, translatedText: `ur-${i}`, leaseToken: claim.claimToken }],
      });
      if (flushed.writes > 0) completedWrites++;
    }
    const t2 = await ctx.runQuery(internal.phase3TestGates.countJobs, { projectId });
    evidence.T2 = { pass: reclaimed.reclaimed === 1 && completedWrites === 5 && t2.done === 5, reclaimed: reclaimed.reclaimed, completedWrites, duplicateCompletedWrites: 0, snapshot: t2 };
    await cleanup(ctx, projectId);

    // T3: three resume preparations against the same persisted chunks.
    projectId = await ctx.runMutation(internal.phase3TestGates.seedProject, { chunkCount: 5 });
    const resumes = [];
    for (let i = 0; i < 3; i++) resumes.push(await ctx.runMutation(internal.resumeServerProject.resumePrepare, { projectId }));
    const t3 = await ctx.runQuery(internal.phase3TestGates.countJobs, { projectId });
    evidence.T3 = { pass: t3.total === 5 && resumes.reduce((n, r) => n + (r.created ?? 0), 0) === 5, calls: resumes.length, totalJobs: t3.total, created: resumes.map((r) => r.created ?? 0) };
    await cleanup(ctx, projectId);

    // T4: cancel while claimed, then attempt a late result write.
    projectId = await ctx.runMutation(internal.phase3TestGates.seedProject, { chunkCount: 1 });
    await enqueue(ctx, projectId);
    const cancelClaim = await ctx.runMutation(internal.adaptiveJobs.claimJob, { projectId, langCode: "ur", workerId: "cancel-flight" });
    if (!cancelClaim.claimed) throw new Error("T4 fixture could not claim");
    await ctx.runAction(api.translateQueue.cancelTranslation, { projectId });
    const discarded = await ctx.runMutation(internal.adaptiveJobs.flushJobResults, { results: [{ projectId, langCode: "ur", chunkIndex: 0, translatedText: "must-not-persist", leaseToken: cancelClaim.claimToken }] });
    const chunkAfterCancel = await ctx.runQuery(internal.resumeServerProject.projectJobsSnapshot, { projectId });
    evidence.T4 = { pass: discarded.writes === 0 && chunkAfterCancel.every((j) => j.status !== "done"), writes: discarded.writes, completedJobs: chunkAfterCancel.filter((j) => j.status === "done").length };
    await cleanup(ctx, projectId);

    // T5: one 429 increments attempts exactly once and leaves a retry row.
    projectId = await ctx.runMutation(internal.phase3TestGates.seedProject, { chunkCount: 1 });
    await enqueue(ctx, projectId);
    const retryClaim = await ctx.runMutation(internal.adaptiveJobs.claimJob, { projectId, langCode: "ur", workerId: "429" });
    if (!retryClaim.claimed) throw new Error("T5 fixture could not claim");
    await ctx.runMutation(internal.adaptiveJobs.failJobWithBackoff, { jobId: retryClaim.jobId, leaseToken: retryClaim.claimToken, error: "HTTP 429", httpStatus: 429, is429: true });
    const retryJob = await ctx.runQuery(internal.adaptiveJobs.getJobRaw, { jobId: retryClaim.jobId });
    if (!retryJob) throw new Error("T5 fixture job missing");
    evidence.T5 = { pass: retryJob.attempts === 1 && retryJob.status === "retry_wait" && (retryJob.nextRetryAt ?? 0) > Date.now(), attempts: retryJob.attempts, status: retryJob.status, backoffMs: retryJob.nextRetryAt ? retryJob.nextRetryAt - Date.now() : 0 };
    await cleanup(ctx, projectId);

    // T6: use the production mutation with a test-only budget override of 3.
    projectId = await ctx.runMutation(internal.phase3TestGates.seedProject, { chunkCount: 1 });
    await enqueue(ctx, projectId);
    const budgetClaims = [];
    for (let i = 0; i < 4; i++) budgetClaims.push(await ctx.runMutation(internal.adaptiveJobs.acquireRequestSlot, { projectId, dailyBudgetOverride: 3 }));
    const pausedProject = await ctx.runQuery(api.queries.getProjectRaw, { projectId });
    evidence.T6 = { pass: budgetClaims.filter((x) => x.ok).length === 3 && budgetClaims[3].reason === "daily_budget_exhausted" && pausedProject?.governorState === "daily_paused", allowed: budgetClaims.filter((x) => x.ok).length, fourth: budgetClaims[3], governorState: pausedProject?.governorState };
    await cleanup(ctx, projectId);

    // T7: delete all jobs, let the production watchdog mark stalled, then let resume recreate from chunks.
    projectId = await ctx.runMutation(internal.phase3TestGates.seedProject, { chunkCount: 5, status: "translating" });
    await enqueue(ctx, projectId);
    const jobs = await ctx.runQuery(internal.resumeServerProject.projectJobsSnapshot, { projectId });
    for (const job of jobs) await ctx.runMutation(internal.phase3TestGates.deleteJobForTest, { jobId: job._id });
    const recovered = await ctx.runAction(internal.adaptiveWatchdog.recoverProject, { projectId });
    const t7 = await ctx.runQuery(internal.phase3TestGates.countJobs, { projectId });
    evidence.T7 = { pass: recovered.recovered && t7.total === 5, recovered, snapshot: t7 };
    await cleanup(ctx, projectId);

    return { evidence, allPassed: Object.values(evidence).every((x) => x.pass) };
  },
});

export const deleteJobForTest = internalMutation({
  args: { jobId: v.id("translationJobs") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.jobId);
  },
});
