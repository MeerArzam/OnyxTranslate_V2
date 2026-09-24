// convex/adaptivePdf.ts
// ADAPTATION NOTE: this file is V8 (mutations + actions must coexist here).
// renderTranslatedPdf's true-bidi require() path works only in node actions,
// so the BATCHED render path falls back to word-order RTL (identical to the
// documented ur behavior); the whole-book path (generatePdf, "use node")
// keeps true bidi shaping for ar/ks. — Idempotent PDF batching (spec-only reconstruction).
//
// Overview dashboard law, verbatim:
//   "convex/adaptivePdf.ts:62 (plan), :136 (shrink), :252 (slice), :294
//    (render) — 50→25→10 idempotent page batches; computeBatchParagraphSlice
//    exactly mirrors renderPdfCore distribution walk; per-batch source-page
//    slicing; assembleLanguagePdf merges batch PDFs into the language PDF"
//
// T5 evidence law: retry-then-shrink; a failed 10-page batch fails ONLY that
// batch with its exact page range; restarts skip completed batches; stuck
// batches recovered by the watchdog (recoverStuckBatches → split 25/25,
// zero pages lost).

import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { TRANSLATION_CONFIG } from "./translationConfig";

// ──────────────────────────────────────────────────────────
// Plan (:62): one pdfBatches row per page range, idempotent per key.
// ──────────────────────────────────────────────────────────

export const planBatches = internalMutation({
  args: {
    projectId: v.id("projects"),
    langCode: v.string(),
    translationId: v.optional(v.id("translations")),
    totalSourcePages: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pdfBatches")
      .withIndex("by_project_lang", (q) =>
        q.eq("projectId", args.projectId).eq("langCode", args.langCode),
      )
      .collect();
    if (existing.length > 0) {
      return { planned: 0, existing: existing.length };
    }
    let pageStart = 1;
    let batchIndex = 0;
    let size = TRANSLATION_CONFIG.pdfInitialBatchPages; // 50
    while (pageStart <= args.totalSourcePages) {
      const pageEnd = Math.min(pageStart + size - 1, args.totalSourcePages);
      await ctx.db.insert("pdfBatches", {
        projectId: args.projectId,
        langCode: args.langCode,
        translationId: args.translationId,
        batchIndex,
        pageStart,
        pageEnd,
        batchSize: size,
        status: "pending",
        attempts: 0,
        idempotencyKey: `${args.projectId}:${args.langCode}:batch:${pageStart}-${pageEnd}`,
        createdAt: Date.now(),
      });
      batchIndex++;
      pageStart = pageEnd + 1;
    }
    return { planned: batchIndex, existing: 0 };
  },
});

// ──────────────────────────────────────────────────────────
// Shrink (:136): failed batch → two halves until the 10-page floor.
// ──────────────────────────────────────────────────────────

export const shrinkBatch = internalMutation({
  args: { batchId: v.id("pdfBatches"), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) return { shrunk: false as const };
    const span = batch.pageEnd - batch.pageStart + 1;
    if (span <= TRANSLATION_CONFIG.pdfMinimumBatchPages) {
      // A failed 10-page batch fails ONLY that batch.
      await ctx.db.patch(args.batchId, {
        status: "failed",
        attempts: batch.attempts + 1,
        error: (args.error ?? "render_failed").slice(0, 500),
        heartbeatAt: Date.now(),
      });
      return { shrunk: false as const, failed: true as const, pageStart: batch.pageStart, pageEnd: batch.pageEnd };
    }
    const half = Math.floor(span / 2);
    const mid = batch.pageStart + half - 1;
    for (const [start, end] of [
      [batch.pageStart, mid],
      [mid + 1, batch.pageEnd],
    ] as const) {
      await ctx.db.insert("pdfBatches", {
        projectId: batch.projectId,
        langCode: batch.langCode,
        translationId: batch.translationId,
        batchIndex: batch.batchIndex * 1000 + (start === batch.pageStart ? 1 : 2),
        pageStart: start,
        pageEnd: end,
        batchSize: end - start + 1,
        status: "pending",
        attempts: 0,
        idempotencyKey: `${batch.projectId}:${batch.langCode}:batch:${start}-${end}`,
        createdAt: Date.now(),
      });
    }
    await ctx.db.delete(args.batchId);
    return { shrunk: true as const, halves: 2 };
  },
});

// ──────────────────────────────────────────────────────────
// Slice (:252): computeBatchParagraphSlice — EXACTLY mirrors the
// renderPdfCore C1 distribution walk (per-page word share → paragraph
// assignment), so batch N renders the same paragraphs the whole-book render
// would assign to those pages.
// ──────────────────────────────────────────────────────────

export interface ParagraphSlice {
  paragraphs: string[];
  startParagraphIndex: number;
  endParagraphIndex: number; // exclusive
}

export function computeBatchParagraphSlice(
  pageData: Array<{ num: number; text?: string; textItems?: Array<{ str: string }> }>,
  totalSourcePages: number,
  pageStart: number,
  pageEnd: number,
  mergedText: string,
): ParagraphSlice {
  const translatedParagraphs = mergedText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const totalWords = mergedText.split(/\s+/).filter(Boolean).length;

  // Word share per SOURCE page — identical walk to renderPdfCore.
  const srcWordsPerPage: number[] = [];
  for (let i = 0; i < totalSourcePages; i++) {
    const page = pageData.find((p) => p.num === i + 1);
    const text = page?.text ?? (page?.textItems || []).map((it) => it.str).join(" ");
    srcWordsPerPage.push(Math.max(text.split(/\s+/).filter(Boolean).length, 1));
  }
  const totalSrcWords = Math.max(srcWordsPerPage.reduce((a, b) => a + b, 0), 1);

  // Walk the paragraph cursor to the batch's first page.
  let paraIdx = 0;
  for (let i = 0; i < pageStart - 1 && i < totalSourcePages; i++) {
    const share = (srcWordsPerPage[i] ?? 1) / totalSrcWords;
    const targetWords = Math.floor(share * totalWords);
    let pageParaWords = 0;
    while (
      paraIdx < translatedParagraphs.length &&
      (pageParaWords + translatedParagraphs[paraIdx].split(/\s+/).filter(Boolean).length <= targetWords ||
        i === totalSourcePages - 1)
    ) {
      pageParaWords += translatedParagraphs[paraIdx].split(/\s+/).filter(Boolean).length;
      paraIdx++;
      if (i < totalSourcePages - 1 && pageParaWords >= targetWords) break;
    }
  }

  // Consume the batch's own pages.
  const startParagraphIndex = paraIdx;
  let endParaWords = 0;
  for (let i = pageStart - 1; i <= pageEnd - 1 && i < totalSourcePages; i++) {
    const share = (srcWordsPerPage[i] ?? 1) / totalSrcWords;
    const targetWords = Math.floor(share * totalWords);
    let pageParaWords = 0;
    while (
      paraIdx < translatedParagraphs.length &&
      (pageParaWords + translatedParagraphs[paraIdx].split(/\s+/).filter(Boolean).length <= targetWords ||
        i === totalSourcePages - 1)
    ) {
      pageParaWords += translatedParagraphs[paraIdx].split(/\s+/).filter(Boolean).length;
      paraIdx++;
      if (i < totalSourcePages - 1 && pageParaWords >= targetWords) break;
    }
    endParaWords += pageParaWords;
  }
  void endParaWords;
  return {
    paragraphs: translatedParagraphs.slice(startParagraphIndex, paraIdx),
    startParagraphIndex,
    endParagraphIndex: paraIdx,
  };
}

// ──────────────────────────────────────────────────────────
// Render (:294): drive ALL pending batches for a language; assemble on done.
// ──────────────────────────────────────────────────────────

export const processAllBatches = action({
  args: { projectId: v.id("projects"), langCode: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(api.queries.getProjectRaw, { projectId: args.projectId });
    if (!project) throw new Error("Project not found");
    const translation = (await ctx.runQuery(api.queries.getTranslationsRaw, {
      projectId: args.projectId,
    })).find((t) => t.langCode === args.langCode);
    if (!translation || !translation.mergedText) {
      return { rendered: 0, failed: 0, done: 0, pending: 0, skipped: true as const };
    }

    // Resolve pageData (1MiB offload-aware) + source page count.
    let pageDataRaw: unknown = project.pageData;
    if (Array.isArray(pageDataRaw) && pageDataRaw.length === 0 && project.pageDataStorageId) {
      const blob = await ctx.storage.get(project.pageDataStorageId);
      if (blob) pageDataRaw = JSON.parse(await blob.text());
    }
    const pageData = (pageDataRaw || []) as Array<{
      num: number;
      text?: string;
      textItems?: Array<{ str: string }>;
      blocks?: unknown;
    }>;
    const srcBlob = project.pdfStorageId ? await ctx.storage.get(project.pdfStorageId) : null;
    if (!srcBlob) return { rendered: 0, failed: 0, done: 0, pending: 0, skipped: true as const };
    const srcBytes = new Uint8Array(await srcBlob.arrayBuffer());

    // pdf-lib loaded once for page counts + merging.
    const pdfLibMod = (await import("pdf-lib")) as unknown as Record<string, unknown>;
    const pdfLib = (pdfLibMod.PDFDocument ? pdfLibMod : (pdfLibMod.default as Record<string, unknown>)) as typeof import("pdf-lib");
    const srcDoc = await pdfLib.PDFDocument.load(srcBytes, { ignoreEncryption: true });
    const totalSourcePages = srcDoc.getPageCount();

    // Plan idempotently (restarts keep completed batches).
    await ctx.runMutation(internal.adaptivePdf.planBatches, {
      projectId: args.projectId,
      langCode: args.langCode,
      translationId: translation._id,
      totalSourcePages,
    });

    let rendered = 0;
    let failed = 0;
    const batchBlobs: Array<{ start: number; bytes: Uint8Array }> = [];

    for (let pass = 0; pass < 3; pass++) {
      const pending = await ctx.runQuery(internal.adaptivePdf.pendingBatches, {
        projectId: args.projectId,
        langCode: args.langCode,
      });
      if (pending.length === 0) break;
      for (const batch of pending) {
        const slice = computeBatchParagraphSlice(
          pageData,
          totalSourcePages,
          batch.pageStart,
          batch.pageEnd,
          translation.mergedText ?? "",
        );
        await ctx.runMutation(internal.adaptivePdf.markBatchRunning, { batchId: batch._id });
        try {
          const batchPageData = pageData.filter(
            (p) => p.num >= batch.pageStart && p.num <= batch.pageEnd,
          );
          const { renderTranslatedPdf } = await import("./renderPdfCore");
          const fontCache = new Map<string, ArrayBuffer>();
          const result = await renderTranslatedPdf({
            // Slice the SOURCE PDF to the batch's page range by rendering a
            // one-pass doc of just those pages (copyPages) — the renderer
            // copies every page, so feed it a pre-sliced source.
            srcBytes: await sliceSourcePages(pdfLib, srcBytes, batch.pageStart, batch.pageEnd),
            pageData: batchPageData,
            mergedText: slice.paragraphs.join("\n\n"),
            langCode: args.langCode,
            getFontBytes: async (url) => {
              const cached = fontCache.get(url);
              if (cached) return cached;
              const resp = await fetch(url);
              if (!resp.ok) throw new Error(`Font download failed (HTTP ${resp.status}): ${url}`);
              const bytes = await resp.arrayBuffer();
              fontCache.set(url, bytes);
              return bytes;
            },
          });
          const storageId = await ctx.storage.store(
            new Blob([new Uint8Array(result.bytes).buffer as ArrayBuffer], { type: "application/pdf" }),
          );
          await ctx.runMutation(internal.adaptivePdf.markBatchDone, {
            batchId: batch._id,
            storageId,
          });
          batchBlobs.push({ start: batch.pageStart, bytes: result.bytes });
          rendered++;
        } catch (err) {
          // Retry-then-shrink: requeue once, then split toward the 10-page floor.
          const outcome = await ctx.runMutation(internal.adaptivePdf.shrinkBatch, {
            batchId: batch._id,
            error: err instanceof Error ? err.message : String(err),
          });
          if (!outcome.shrunk) failed++;
        }
      }
    }

    const remaining = await ctx.runQuery(internal.adaptivePdf.batchStatus, {
      projectId: args.projectId,
      langCode: args.langCode,
    });
    if (remaining.pending + remaining.running === 0 && remaining.done > 0) {
      // Assembly runs inside the internal mutation (needs db access for the
      // done batches + storage for the merge).
      const assembled = await ctx.runMutation(internal.adaptivePdf.assembleLanguagePdfMutation, {
        projectId: args.projectId,
        langCode: args.langCode,
      });
      await ctx.runMutation(api.mutations.updateTranslation, {
        translationId: translation._id,
        status: "complete",
        pdfGenerating: false,
        pdfProgress:
          remaining.failed > 0
            ? `batched: ${remaining.done} done, ${remaining.failed} batch(es) failed`
            : undefined,
        completedAt: Date.now(),
        ...(assembled.url ? { pdfUrl: assembled.url } : {}),
      });
    }
    const status = await ctx.runQuery(internal.adaptivePdf.batchStatus, {
      projectId: args.projectId,
      langCode: args.langCode,
    });
    return { rendered, failed, done: status.done, pending: status.pending };
  },
});

/** Copy a page range of the source PDF into its own bytes. */
async function sliceSourcePages(
  pdfLib: typeof import("pdf-lib"),
  srcBytes: Uint8Array,
  pageStart: number,
  pageEnd: number,
): Promise<Uint8Array> {
  const src = await pdfLib.PDFDocument.load(srcBytes, { ignoreEncryption: true });
  const out = await pdfLib.PDFDocument.create();
  const indices: number[] = [];
  for (let i = pageStart - 1; i <= pageEnd - 1 && i < src.getPageCount(); i++) indices.push(i);
  const copied = await out.copyPages(src, indices);
  for (const p of copied) out.addPage(p);
  return await out.save();
}

export const assembleLanguagePdfMutation = internalMutation({
  args: { projectId: v.id("projects"), langCode: v.string() },
  handler: async (ctx, args) => {
    const batches = await ctx.db
      .query("pdfBatches")
      .withIndex("by_project_lang", (q) =>
        q.eq("projectId", args.projectId).eq("langCode", args.langCode),
      )
      .collect();
    const done = batches
      .filter((b) => b.status === "done" && b.storageId)
      .sort((a, b) => a.pageStart - b.pageStart);
    if (done.length === 0) return { url: undefined };
    const pdfLibMod = (await import("pdf-lib")) as unknown as Record<string, unknown>;
    const pdfLib = (pdfLibMod.PDFDocument ? pdfLibMod : (pdfLibMod.default as Record<string, unknown>)) as typeof import("pdf-lib");
    const out = await pdfLib.PDFDocument.create();
    for (const b of done) {
      const blob = await ctx.storage.get(b.storageId!);
      if (!blob) continue;
      const doc = await pdfLib.PDFDocument.load(new Uint8Array(await blob.arrayBuffer()), {
        ignoreEncryption: true,
      });
      const pages = await out.copyPages(doc, doc.getPageIndices());
      for (const p of pages) out.addPage(p);
    }
    const bytes = await out.save();
    const storageId = await ctx.storage.store(
      new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: "application/pdf" }),
    );
    const url = await ctx.storage.getUrl(storageId);
    return { url: url ?? undefined, storageId };
  },
});

// ──────────────────────────────────────────────────────────
// Batch status helpers (queries + state transitions)
// ──────────────────────────────────────────────────────────

export const pendingBatches = internalQuery({
  args: { projectId: v.id("projects"), langCode: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("pdfBatches")
      .withIndex("by_project_lang", (q) =>
        q.eq("projectId", args.projectId).eq("langCode", args.langCode),
      )
      .collect();
    return rows
      .filter((b) => b.status === "pending")
      .sort((a, b) => a.pageStart - b.pageStart);
  },
});

export const batchStatus = internalQuery({
  args: { projectId: v.id("projects"), langCode: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("pdfBatches")
      .withIndex("by_project_lang", (q) =>
        q.eq("projectId", args.projectId).eq("langCode", args.langCode),
      )
      .collect();
    return {
      total: rows.length,
      pending: rows.filter((b) => b.status === "pending").length,
      running: rows.filter((b) => b.status === "running").length,
      done: rows.filter((b) => b.status === "done").length,
      failed: rows.filter((b) => b.status === "failed").length,
    };
  },
});

export const markBatchRunning = internalMutation({
  args: { batchId: v.id("pdfBatches") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.batchId, { status: "running", heartbeatAt: Date.now() });
  },
});

export const markBatchDone = internalMutation({
  args: { batchId: v.id("pdfBatches"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.batchId, {
      status: "done",
      storageId: args.storageId,
      heartbeatAt: Date.now(),
    });
  },
});

/** Watchdog entry: stuck running batches (heartbeat > 10 min) → retry/shrink. */
export const recoverStuckBatches = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("pdfBatches")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();
    let recovered = 0;
    for (const b of rows.filter((r) => r.projectId === args.projectId)) {
      if (Date.now() - (b.heartbeatAt ?? 0) > TRANSLATION_CONFIG.staleProjectThresholdMs) {
        const outcome = await ctx.runMutation(internal.adaptivePdf.shrinkBatch, {
          batchId: b._id,
          error: "watchdog: stuck running batch",
        });
        if (outcome.shrunk || outcome.failed) recovered++;
      }
    }
    return { recovered };
  },
});
