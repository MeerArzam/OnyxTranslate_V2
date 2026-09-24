// convex/jobProcessing.ts — Autonomous upload pipeline (reconstructed).
//
// Salvage import analysis showed upload.ts, http.ts, identity.ts and the
// hourly sweep all reference this module; its source was not in the docs
// set, so it is reconstructed from the fully documented behavior (history
// Phase 13, verbatim):
//
//   "Idempotent processing: jobProcessing.processUploadedPdf walks
//    uploaded → processing → parsed → ready → translating with a monotonic
//    stageSeq gate (superseded retries no-op) and heartbeats; reuses the
//    production parser (x-gap merge + paragraph clustering) and the
//    UNCHANGED translation chain (translateContent → generatePdf →
//    zipAssembly)."
//
// Stage progression is monotonic (never backward). Every stage transition is
// gated by stageSeq so an outdated scheduled run cannot regress a job.

import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";

const ALL_LANGS = [
  "ur", "ar", "fr", "ja", "es", "hi", "tr", "zh", "ru", "ko",
  "de", "ks", "ro", "sw", "it", "la", "id", "ne", "bn", "pt",
];

const ACTIVE_CLAIM_WINDOW_MS = 5 * 60 * 1000; // a live run owns the job for 5 min

/**
 * Monotonic stage gate: uploaded → processing (claims the run).
 * Superseded/duplicate scheduled runs no-op here — this is what makes
 * retries safe.
 */
export const claimProcessing = internalMutation({
  args: { uploadJobId: v.id("uploadJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.uploadJobId);
    if (!job) return { ok: false as const, reason: "not_found" };
    if (job.status === "cancelled") return { ok: false as const, reason: "cancelled" };
    if (job.status === "error") return { ok: false as const, reason: "errored" };
    if (
      (job.status === "processing" || job.status === "parsed" || job.status === "ready" || job.status === "translating" || job.status === "complete") &&
      job.projectId
    ) {
      return { ok: false as const, reason: "already_processed" };
    }
    if (
      job.status === "processing" &&
      job.heartbeatAt &&
      Date.now() - job.heartbeatAt < ACTIVE_CLAIM_WINDOW_MS
    ) {
      return { ok: false as const, reason: "already_running" };
    }
    const stageSeq = (job.stageSeq ?? 0) + 1;
    await ctx.db.patch(args.uploadJobId, {
      status: "processing",
      processStage: "processing",
      stageSeq,
      heartbeatAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { ok: true as const, stageSeq };
  },
});

export const processUploadedPdf = action({
  args: { uploadJobId: v.id("uploadJobs") },
  handler: async (ctx, args) => {
    const claim = await ctx.runMutation(internal.jobProcessing.claimProcessing, {
      uploadJobId: args.uploadJobId,
    });
    if (!claim.ok) return { ok: false as const, reason: claim.reason };

    const fail = async (message: string) => {
      await ctx.runMutation(api.identity.failUploadJob, {
        uploadJobId: args.uploadJobId,
        error: message,
        expectedSeq: claim.stageSeq - 1,
      });
      return { ok: false as const, reason: message };
    };

    try {
      const job = await ctx.runQuery(api.queries.getUploadJobRaw, {
        uploadJobId: args.uploadJobId,
      });
      if (!job) return await fail("Upload job vanished");
      if (!job.storageId) return await fail("Upload job has no stored file");

      // ── Stage: parsed — the production parser (x-gap merge + clustering) ──
      await ctx.runMutation(api.identity.heartbeatUploadJob, { uploadJobId: args.uploadJobId });
      await ctx.runMutation(internal.identity.updateUploadJobStage, {
        uploadJobId: args.uploadJobId,
        stage: "parsed",
        expectedSeq: claim.stageSeq - 1,
      });
      const parsed = await ctx.runAction(api.parsePdf.parseUploadedPdf, {
        pdfStorageId: job.storageId,
      });

      // ── Stage: ready — project row + durable identity ──
      // FIX (1MiB limit): oversized values are offloaded here (the action
      // holds the bytes); the row gets stubs + Storage refs.
      const { isOversized } = await import("./sourceData");
      const pageDataStorageId = isOversized(parsed.pageData)
        ? await ctx.storage.store(
            new Blob([JSON.stringify(parsed.pageData)], { type: "application/json" }),
          )
        : undefined;
      const fullTextStorageId = isOversized(parsed.fullText)
        ? await ctx.storage.store(
            new Blob([JSON.stringify(parsed.fullText)], { type: "application/json" }),
          )
        : undefined;

      const projectId = await ctx.runMutation(api.mutations.createProject, {
        sessionId: job.tabSessionId ?? job.clientId,
        fileName: job.fileName,
        pageCount: parsed.pageCount,
        wordCount: parsed.wordCount,
        pdfStorageId: job.storageId,
        pageData: pageDataStorageId ? [] : parsed.pageData,
        fullText: fullTextStorageId ? "" : parsed.fullText,
        parsedPages: parsed.pageCount,
        status: "ready",
        pageDataStorageId: pageDataStorageId as string | undefined,
        fullTextStorageId: fullTextStorageId as string | undefined,
      });
      await ctx.runMutation(api.identity.attachProjectToUploadJob, {
        uploadJobId: args.uploadJobId,
        projectId,
      });
      await ctx.runMutation(api.jobMutations.setProjectIdentity, {
        projectId,
        clientId: job.clientId,
        tabSessionId: job.tabSessionId,
        sessionId: job.tabSessionId ?? job.clientId,
      });
      await ctx.runMutation(api.jobMutations.setProjectStatus, {
        projectId,
        status: "ready",
        uploadJobId: args.uploadJobId,
      });

      // ── Stage: translating — the UNCHANGED production chain ──
      const langCodes = job.langCodes && job.langCodes.length > 0 ? job.langCodes : ALL_LANGS;
      await ctx.runMutation(api.jobMutations.setProjectStatus, {
        projectId,
        status: "translating",
        uploadJobId: args.uploadJobId,
      });
      await ctx.scheduler.runAfter(0, api.translateContent.translateLanguage, {
        projectId,
        langCode: langCodes[0],
        nextLangCode: langCodes.length > 1 ? langCodes[1] : undefined,
        remainingLangs: langCodes.length > 2 ? langCodes.slice(2) : undefined,
      });

      await ctx.runMutation(internal.identity.updateUploadJobStage, {
        uploadJobId: args.uploadJobId,
        stage: "translating",
        expectedSeq: claim.stageSeq - 1,
      });
      return { ok: true as const, projectId };
    } catch (err) {
      return await fail(err instanceof Error ? err.message : String(err));
    }
  },
});
