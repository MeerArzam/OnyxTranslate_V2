// convex/adaptiveJobs.ts — ADAPTIVE PARALLEL PIPELINE (spec-only
// reconstruction from the overview-dashboard Constants table + Phase 15
// history + salvage file:line evidence adaptiveJobs.ts:305 claimJobPair,
// :422 acquireRequestSlot, :968 flushJobResults, :1002 zipFinalizeIfDone).
//
// Job model law (history Phase 15, verbatim):
//  - translationJobs rows keyed projectId:langCode:chunkIndex (idempotent —
//    duplicate starts create zero new jobs)
//  - statuses pending→claimed→done/retry_wait/failed
//  - transactional claimToken claims (late workers with stale tokens lose)
//  - stale claims reclaimed after heartbeat TTL (watchdog)
//  - results written back into the EXISTING chunks/translations tables
//  - rateLimits holds ONE rolling-60s window per project (all five keys = one
//    quota pool), slots counted ONLY when a request is actually sent
//  - daily governor: at 1200 requests → daily_paused, all jobs preserved,
//    auto-resume after midnight Pacific, counter resets on date change

import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { TRANSLATION_CONFIG, computeBackoffMs, estimateSafePairTokens, pacificDateKey, msUntilNextPacificMidnight, ENGLISH_ECHO_GATE } from "./translationConfig";
import { buildTranslationPrompt } from "./buildTranslationPrompt";
import { applyCulturalFilters as applyCulturalFiltersLib } from "../lib/translator/cultural";
import { formatDragonTelepathy, isRTL } from "../lib/translator/formatters";
import { runQA } from "../lib/translator/qa";
import { filterGeneratedArtifacts, normalizePunctuationForLanguage } from "./languageRules";
import { evaluateContract, parseContractResponse, assembleContractTranslations, STRICT_RETRY_SUFFIX } from "./translationContract";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

function geminiKeys(): string[] {
  return [
    process.env.Gemini_API_Key_1,
    process.env.Gemini_API_Key_2,
    process.env.Gemini_API_Key_3,
    process.env.Gemini_API_Key_4,
    process.env.Gemini_API_Key_5,
  ].filter((k): k is string => !!k);
}

// ════════════════════════════════════════════════════════════
// Enqueue — idempotent per projectId:langCode:chunkIndex
// ════════════════════════════════════════════════════════════

export const enqueueTranslationJobs = internalMutation({
  args: {
    projectId: v.id("projects"),
    langCode: v.string(),
    chunkCount: v.number(),
    pipelineVersion: v.string(),
    translationIntelligenceMode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("translationJobs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const langJobs = existing.filter((j) => j.langCode === args.langCode);
    let created = 0;
    for (let i = 0; i < args.chunkCount; i++) {
      const idempotencyKey = `${args.projectId}:${args.langCode}:${i}`;
      if (langJobs.some((j) => j.idempotencyKey === idempotencyKey)) continue;
      await ctx.db.insert("translationJobs", {
        projectId: args.projectId,
        langCode: args.langCode,
        chunkIndex: i,
        chunkCount: args.chunkCount,
        sourceText: "", // filled from chunks table at claim time (single source of truth)
        status: "pending",
        attempts: 0,
        idempotencyKey,
        pipelineVersion: args.pipelineVersion,
        promptVersion: undefined,
        translationIntelligenceMode: args.translationIntelligenceMode,
      });
      created++;
    }
    // Project totals (adaptive counters — additive fields)
    const all = await ctx.db
      .query("translationJobs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    await ctx.db.patch(args.projectId, {
      totalTranslationJobs: all.length,
      completedTranslationJobs: all.filter((j) => j.status === "done").length,
      pipelineVersion: args.pipelineVersion,
    });
    return { created, total: all.length };
  },
});

// ════════════════════════════════════════════════════════════
// Rate limiter — rolling-60s window, ONE pool per project (:422)
// ════════════════════════════════════════════════════════════

export const acquireRequestSlot = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const now = Date.now();
    let row = await ctx.db
      .query("rateLimits")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
    if (!row) {
      const id = await ctx.db.insert("rateLimits", {
        projectId: args.projectId,
        windowStartMs: now,
        requestTimestamps: [],
        requestsToday: 0,
        requestDayPacific: pacificDateKey(now),
        consecutive429Count: 0,
        workerLimit: TRANSLATION_CONFIG.workerCount,
        lastUpdatedAt: now,
      });
      row = await ctx.db.get(id);
      if (!row) return { ok: false as const, reason: "rate_row_create_failed" };
    }

    // Daily governor first (Pacific-date keyed).
    const today = pacificDateKey(now);
    if (row.requestDayPacific !== today) {
      // Pacific date change resets the counter (probeGovernorLadder law).
      await ctx.db.patch(row._id, {
        requestDayPacific: today,
        requestsToday: 0,
        lastUpdatedAt: now,
      });
      row = { ...row, requestDayPacific: today, requestsToday: 0 };
    }
    if (row.requestsToday >= TRANSLATION_CONFIG.dailyRequestBudget) {
      const resumeAt = Date.now() + msUntilNextPacificMidnight(now);
      await ctx.db.patch(args.projectId, {
        governorState: "daily_paused",
        governorResumeAt: resumeAt,
      });
      return { ok: false as const, reason: "daily_budget_exhausted", resumeAt };
    }

    // Rolling-60s window.
    const window = row.requestTimestamps.filter((t) => now - t < 60_000);
    if (window.length >= TRANSLATION_CONFIG.absoluteRpmCeiling) {
      return { ok: false as const, reason: "rpm_ceiling", retryInMs: 60_000 - (now - window[0]) };
    }

    // Slot counted ONLY when a request is actually sent (caller confirms).
    const updated = [...window, now];
    await ctx.db.patch(row._id, {
      requestTimestamps: updated,
      requestsToday: row.requestsToday + 1,
      lastUpdatedAt: now,
    });
    await ctx.db.patch(args.projectId, {
      requestsToday: row.requestsToday + 1,
      requestDayPacific: today,
      lastRequestAt: now,
    });
    return { ok: true as const, requestsToday: row.requestsToday + 1 };
  },
});

/** Refund a reserved slot when the request was never sent (claim crash). */
export const releaseRequestSlot = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("rateLimits")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
    if (!row) return;
    const now = Date.now();
    const window = row.requestTimestamps.filter((t) => now - t < 60_000);
    if (window.length > 0) window.pop();
    await ctx.db.patch(row._id, {
      requestTimestamps: window,
      requestsToday: Math.max(0, row.requestsToday - 1),
      lastUpdatedAt: now,
    });
  },
});

// ════════════════════════════════════════════════════════════
// Claims — transactional claimToken leases (:305 pair variant)
// ════════════════════════════════════════════════════════════

function newClaimToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Claim ONE pending job with a transactional lease. */
export const claimJob = internalMutation({
  args: {
    projectId: v.id("projects"),
    langCode: v.string(),
    workerId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const job = await ctx.db
      .query("translationJobs")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "pending"),
      )
      .filter((q) => q.eq(q.field("langCode"), args.langCode))
      .first();
    if (!job) return { claimed: false as const };

    const claimToken = newClaimToken();
    await ctx.db.patch(job._id, {
      status: "claimed",
      claimedAt: now,
      heartbeatAt: now,
      claimToken,
      startedAt: now,
    });
    // Materialize the source text from the chunks table (single source).
    const chunk = await ctx.db
      .query("chunks")
      .withIndex("by_project_lang", (q) =>
        q
          .eq("projectId", args.projectId)
          .eq("langCode", args.langCode)
          .eq("chunkIndex", job.chunkIndex),
      )
      .first();
    if (chunk) await ctx.db.patch(job._id, { sourceText: chunk.sourceText });
    return {
      claimed: true as const,
      jobId: job._id,
      chunkIndex: job.chunkIndex,
      sourceText: chunk?.sourceText ?? "",
      claimToken,
    };
  },
});

/**
 * Claim an ADJACENT PAIR under the safe token cap (:305). Both rows share one
 * Gemini call via requestGroupId. Malformed pairs are handled post-response
 * (splitValidated / rawModelOutput / markPairSplit circuit breaker).
 */
export const claimJobPair = internalMutation({
  args: {
    projectId: v.id("projects"),
    langCode: v.string(),
    workerId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!TRANSLATION_CONFIG.pairMergeEnabled) {
      return { claimedPair: false as const, fallbackToSingle: false as const };
    }
    const now = Date.now();
    const rate = await ctx.db
      .query("rateLimits")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
    const disabledLangs = new Set(rate?.pairMergeDisabledLangs ?? []);

    const jobs = await ctx.db
      .query("translationJobs")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "pending"),
      )
      .filter((q) => q.eq(q.field("langCode"), args.langCode))
      .collect();
    jobs.sort((a, b) => a.chunkIndex - b.chunkIndex);

    for (let i = 0; i + 1 < jobs.length; i++) {
      const a = jobs[i];
      const b = jobs[i + 1];
      if (b.chunkIndex !== a.chunkIndex + 1) continue;
      if (disabledLangs.has(args.langCode)) break;
      const chunkA = await ctx.db
        .query("chunks")
        .withIndex("by_project_lang", (q) =>
          q.eq("projectId", args.projectId).eq("langCode", args.langCode).eq("chunkIndex", a.chunkIndex),
        )
        .first();
      const chunkB = await ctx.db
        .query("chunks")
        .withIndex("by_project_lang", (q) =>
          q.eq("projectId", args.projectId).eq("langCode", args.langCode).eq("chunkIndex", b.chunkIndex),
        )
        .first();
      if (!chunkA || !chunkB) continue;
      const est = estimateSafePairTokens(chunkA.sourceText.length, chunkB.sourceText.length);
      if (est > TRANSLATION_CONFIG.pairMergeMaxEstimatedInputTokens) continue; // oversized → single

      const groupId = newClaimToken();
      const tokenA = newClaimToken();
      await ctx.db.patch(a._id, {
        status: "claimed", claimedAt: now, heartbeatAt: now, claimToken: tokenA,
        requestGroupId: groupId, mergedWithChunkIndex: b.chunkIndex,
      });
      await ctx.db.patch(b._id, {
        status: "claimed", claimedAt: now, heartbeatAt: now, claimToken: newClaimToken(),
        requestGroupId: groupId, mergedWithChunkIndex: a.chunkIndex,
      });
      await ctx.db.patch(a._id, { sourceText: chunkA.sourceText });
      await ctx.db.patch(b._id, { sourceText: chunkB.sourceText });
      return {
        claimedPair: true as const,
        jobIdA: a._id,
        jobIdB: b._id,
        chunkIndexA: a.chunkIndex,
        chunkIndexB: b.chunkIndex,
        sourceTextA: chunkA.sourceText,
        sourceTextB: chunkB.sourceText,
        claimTokenA: tokenA,
        requestGroupId: groupId,
      };
    }
    return { claimedPair: false as const, fallbackToSingle: true as const };
  },
});

export const heartbeatJob = internalMutation({
  args: { jobId: v.id("translationJobs") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, { heartbeatAt: Date.now() });
  },
});

// ════════════════════════════════════════════════════════════
// Result write-back — into the EXISTING chunks/translations tables (:968)
// ════════════════════════════════════════════════════════════

export const flushJobResults = internalMutation({
  args: {
    results: v.array(
      v.object({
        projectId: v.id("projects"),
        langCode: v.string(),
        chunkIndex: v.number(),
        translatedText: v.string(),
        model: v.optional(v.string()),
        usage: v.optional(v.any()),
        needsReview: v.optional(v.boolean()),
        reviewReason: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // Flush budget cap (maxDatabaseWritesPerAction enforced by caller batching).
    let writes = 0;
    const done: Array<{ projectId: Id<"projects">; langCode: string }> = [];
    for (const r of args.results) {
      if (writes >= TRANSLATION_CONFIG.maxDatabaseWritesPerAction) break;
      const chunk = await ctx.db
        .query("chunks")
        .withIndex("by_project_lang", (q) =>
          q.eq("projectId", r.projectId).eq("langCode", r.langCode).eq("chunkIndex", r.chunkIndex),
        )
        .first();
      if (chunk) {
        await ctx.db.patch(chunk._id, {
          translatedText: r.translatedText,
          status: "done",
          model: r.model,
          usage: r.usage,
          translationIntelligenceMode: r.needsReview ? "gemini_contract" : undefined,
        });
      } else {
        await ctx.db.insert("chunks", {
          projectId: r.projectId,
          langCode: r.langCode,
          chunkIndex: r.chunkIndex,
          sourceText: "",
          translatedText: r.translatedText,
          status: "done",
          model: r.model,
          usage: r.usage,
        });
      }
      writes++;

      const job = await ctx.db
        .query("translationJobs")
        .withIndex("by_project_lang_chunk", (q) =>
          q.eq("projectId", r.projectId).eq("langCode", r.langCode).eq("chunkIndex", r.chunkIndex),
        )
        .first();
      if (job && job.status !== "done") {
        await ctx.db.patch(job._id, {
          status: "done",
          resultText: r.translatedText,
          completedAt: Date.now(),
          needsReview: r.needsReview ?? false,
          reviewReason: r.reviewReason,
        });
        done.push({ projectId: r.projectId, langCode: r.langCode });
        writes++;
      }
    }

    // Roll up per-language completion into translations rows.
    const touched = new Set(done.map((d) => `${d.projectId}:${d.langCode}`));
    for (const key of touched) {
      const [projectId, langCode] = key.split(":") as [string, string];
      const all = await ctx.db
        .query("translationJobs")
        .withIndex("by_project", (q) => q.eq("projectId", projectId as Id<"projects">))
        .filter((q) => q.eq(q.field("langCode"), langCode))
        .collect();
      const doneCount = all.filter((j) => j.status === "done").length;
      const total = all.length;
      const translation = await ctx.db
        .query("translations")
        .withIndex("by_project_lang", (q) =>
          q.eq("projectId", projectId as Id<"projects">).eq("langCode", langCode),
        )
        .first();
      if (!translation) continue;
      if (doneCount >= total && total > 0) {
        const chunks = await ctx.db
          .query("chunks")
          .withIndex("by_project_lang", (q) =>
            q.eq("projectId", projectId as Id<"projects">).eq("langCode", langCode),
          )
          .collect();
        chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
        // Contract-mode assembly = PURE concatenation (code NEVER rewrites prose).
        const mergedText = assembleContractTranslations(chunks.map((c) => c.translatedText));
        await ctx.db.patch(translation._id, {
          // needs_review is terminal for scheduling: it must not leave the
          // language or ZIP gate permanently in_progress.
          status: all.some((j) => j.needsReview) ? "needs_review" : "complete",
          completedChunks: doneCount,
          mergedText,
          completedAt: doneCount >= total ? Date.now() : undefined,
          lastChunkAt: Date.now(),
        });
      } else {
        await ctx.db.patch(translation._id, {
          status: "in_progress",
          completedChunks: doneCount,
          lastChunkAt: Date.now(),
        });
      }
      await ctx.db.patch(projectId as Id<"projects">, {
        completedTranslationJobs: all.filter((j) => j.status === "done").length,
      });
      writes++;
    }
    return { writes, flushed: args.results.length };
  },
});

// ════════════════════════════════════════════════════════════
// Failure ladder — retry_wait + backoff, worker reduction on 429
// ════════════════════════════════════════════════════════════

export const failJobWithBackoff = internalMutation({
  args: {
    jobId: v.id("translationJobs"),
    error: v.string(),
    httpStatus: v.optional(v.number()),
    is429: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return { ok: false as const };
    const attempts = job.attempts + 1;
    const now = Date.now();

    if (args.is429) {
      // Worker reduction ladder: 3×429 → −1 worker, floor 1.
      const rate = await ctx.db
        .query("rateLimits")
        .withIndex("by_project", (q) => q.eq("projectId", job.projectId))
        .first();
      if (rate) {
        const count = rate.consecutive429Count + 1;
        const workerLimit = count >= 3 ? Math.max(1, rate.workerLimit - 1) : rate.workerLimit;
        await ctx.db.patch(rate._id, {
          consecutive429Count: count,
          workerLimit,
          lastUpdatedAt: now,
        });
        await ctx.db.patch(job.projectId, { consecutive429Count: count });
      }
    } else {
      const rate = await ctx.db
        .query("rateLimits")
        .withIndex("by_project", (q) => q.eq("projectId", job.projectId))
        .first();
      if (rate && rate.consecutive429Count > 0) {
        await ctx.db.patch(rate._id, { consecutive429Count: 0, lastUpdatedAt: now });
      }
    }

    if (attempts >= TRANSLATION_CONFIG.maxAttempts) {
      await ctx.db.patch(job._id, {
        status: "failed",
        attempts,
        lastError: args.error,
        lastHttpStatus: args.httpStatus,
      });
      return { ok: true as const, terminal: true as const };
    }
    const delay = computeBackoffMs(attempts);
    await ctx.db.patch(job._id, {
      status: "retry_wait",
      attempts,
      lastError: args.error,
      lastHttpStatus: args.httpStatus,
      nextRetryAt: now + delay,
      claimToken: undefined,
    });
    await ctx.db.patch(job.projectId, { governorState: "waiting_retry" });
    return { ok: true as const, retryInMs: delay };
  },
});

/** Promote retry_wait jobs whose nextRetryAt has passed → pending. */
export const promoteRetryableJobs = internalMutation({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const rows = args.projectId
      ? await ctx.db
          .query("translationJobs")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
          .filter((q) => q.eq(q.field("status"), "retry_wait"))
          .collect()
      : await ctx.db
          .query("translationJobs")
          .filter((q) => q.eq(q.field("status"), "retry_wait"))
          .collect();
    let promoted = 0;
    for (const j of rows) {
      if ((j.nextRetryAt ?? 0) <= now) {
        await ctx.db.patch(j._id, { status: "pending", claimToken: undefined });
        promoted++;
      }
    }
    return { promoted };
  },
});

/** Reclaim claims whose heartbeat expired past the TTL (watchdog law). */
export const reclaimExpiredClaims = internalMutation({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const rows = args.projectId
      ? await ctx.db
          .query("translationJobs")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
          .collect()
      : await ctx.db.query("translationJobs").collect();
    let reclaimed = 0;
    for (const j of rows) {
      if (j.status !== "claimed" && j.status !== "running") continue;
      const stale = now - (j.heartbeatAt ?? j.claimedAt ?? 0) > TRANSLATION_CONFIG.heartbeatTtlMs;
      if (stale) {
        await ctx.db.patch(j._id, {
          status: "pending",
          claimToken: undefined,
          reclaimCount: (j.reclaimCount ?? 0) + 1,
        });
        reclaimed++;
      }
    }
    return { reclaimed };
  },
});

/** Pair-merge circuit breaker: requeue both chunks as singles (T3 law). */
export const markPairSplit = internalMutation({
  args: {
    requestGroupId: v.string(),
    rawModelOutput: v.string(),
    langCode: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("translationJobs")
      .filter((q) => q.eq(q.field("requestGroupId"), args.requestGroupId))
      .collect();
    for (const j of rows) {
      await ctx.db.patch(j._id, {
        status: "pending",
        requestGroupId: undefined,
        mergedWithChunkIndex: undefined,
        splitValidated: false,
        rawModelOutput: args.rawModelOutput.slice(0, 4000),
        pairFailureCount: (j.pairFailureCount ?? 0) + 1,
      });
    }
    const one = rows[0];
    if (one) {
      const rate = await ctx.db
        .query("rateLimits")
        .withIndex("by_project", (q) => q.eq("projectId", one.projectId))
        .first();
      if (rate) {
        const failures = (rate.pairMergeDisabledLangs ?? []).includes(args.langCode)
          ? (rate.pairMergeDisabledLangs ?? [])
          : [...(rate.pairMergeDisabledLangs ?? []), args.langCode];
        // Circuit-break pairing per language after 2 failures.
        const broken = rows.filter((r) => (r.pairFailureCount ?? 0) >= 2).length >= 1;
        await ctx.db.patch(rate._id, {
          pairMergeDisabledLangs: broken ? failures : rate.pairMergeDisabledLangs,
          lastUpdatedAt: Date.now(),
        });
      }
    }
    return { split: rows.length };
  },
});

// ════════════════════════════════════════════════════════════
// Gemini execution for a claimed job (ONE request per claim)
// ════════════════════════════════════════════════════════════

async function callGeminiAdaptive(
  keys: string[],
  systemPrompt: string,
  userMessage: string,
): Promise<{ ok: true; text: string; model: string; usage: unknown } | { ok: false; status?: number; error: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  for (const key of keys) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userMessage }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 16384,
              ...(attempt < 1 ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            },
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
            modelVersion?: string;
            usageMetadata?: Record<string, number>;
          };
          const raw = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text || "").join("");
          if (!raw.trim()) return { ok: false, error: "empty_response" };
          return {
            ok: true,
            text: raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim(),
            model: data.modelVersion || GEMINI_MODEL,
            usage: data.usageMetadata ?? {},
          };
        }
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, (attempt + 1) * 5000));
          continue;
        }
        return { ok: false, status: res.status, error: `HTTP ${res.status}` };
      } catch (e) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 5000));
        if (attempt === 1) return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
  }
  return { ok: false, error: "all_keys_exhausted" };
}

/** Post-process a raw completion exactly like the legacy pipeline (P-layers). */
function postProcessAdaptive(raw: string, langCode: string, marketContext: string): string {
  let out = raw;
  const filtered = filterGeneratedArtifacts(out);
  out = filtered.text;
  out = normalizePunctuationForLanguage(out, langCode);
  out = applyCulturalFiltersLib(out, langCode, marketContext);
  out = out.replace(/\*([^*]+)\*/g, (_m, thought: string) => formatDragonTelepathy(thought, langCode));
  if (isRTL(langCode) && !out.startsWith("\u200F")) out = `\u200F${out}`;
  return out.trim();
}

/** English-echo gate: reject wrong-language output (T3 fix threshold). */
function looksLikeEnglishEcho(text: string, langCode: string): boolean {
  const NON_LATIN = new Set(["ur", "ar", "ks", "hi", "ne", "bn", "ja", "zh", "ko", "ru"]);
  if (!NON_LATIN.has(langCode)) return false;
  if (text.length < ENGLISH_ECHO_GATE.minLength) return false;
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  const total = [...text].length;
  return letters / Math.max(total, 1) > ENGLISH_ECHO_GATE.latinRatioThreshold;
}

/**
 * Execute ONE claimed job: rate-limit slot → Gemini → contract validation →
 * flush. Runs as the per-claim action scheduled by the dispatcher.
 */
export const processClaimedJob = action({
  args: {
    jobId: v.id("translationJobs"),
    claimToken: v.string(),
    marketContext: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const job = await ctx.runQuery(internal.adaptiveJobs.getJobRaw, { jobId: args.jobId });
    if (!job) return { ok: false as const, reason: "job_not_found" };
    if (job.claimToken !== args.claimToken) return { ok: false as const, reason: "stale_claim" };
    if (job.status !== "claimed" && job.status !== "running") {
      return { ok: false as const, reason: `wrong_status:${job.status}` };
    }

    const project = await ctx.runQuery(api.queries.getProjectRaw, { projectId: job.projectId });
    if (!project || project.status === "cancelled") {
      await ctx.runMutation(internal.adaptiveJobs.releaseRequestSlot, { projectId: job.projectId });
      return { ok: false as const, reason: "cancelled" };
    }
    const keys = geminiKeys();
    if (keys.length === 0) {
      // no-keys RETRIES instead of throwing (dispatcher hardening law).
      await ctx.runMutation(internal.adaptiveJobs.failJobWithBackoff, {
        jobId: args.jobId,
        error: "No Gemini API keys configured",
      });
      return { ok: false as const, reason: "no_keys" };
    }

    const mode = project.translationIntelligenceMode ?? "gemini_contract";
    const isContract = mode === "gemini_contract";
    const prompt = buildTranslationPrompt({
      sourceLanguage: "en",
      targetLanguage: job.langCode,
      langCode: job.langCode,
      marketContext: (args.marketContext as "standard" | "high-censorship" | "romance-focused") || "standard",
      contract: isContract ? "gemini-contract-v1" : "plain",
      sourceText: "",
    });

    await ctx.runMutation(internal.adaptiveJobs.heartbeatJob, { jobId: args.jobId });

    // Rate limiter BEFORE the request (slot counted when actually sent).
    const slot = await ctx.runMutation(internal.adaptiveJobs.acquireRequestSlot, {
      projectId: job.projectId,
    });
    if (!slot.ok) {
      await ctx.runMutation(internal.adaptiveJobs.failJobWithBackoff, {
        jobId: args.jobId,
        error: `rate_limited:${slot.reason}`,
        is429: slot.reason === "daily_budget_exhausted",
      });
      return { ok: false as const, reason: slot.reason };
    }

    const res = await callGeminiAdaptive(keys, prompt.system, job.sourceText);

    if (!res.ok) {
      await ctx.runMutation(internal.adaptiveJobs.failJobWithBackoff, {
        jobId: args.jobId,
        error: res.error,
        httpStatus: res.status,
        is429: res.status === 429,
      });
      return { ok: false as const, reason: res.error };
    }

    // Contract validation (Thin Motherboard Phase 2).
    let translationText: string;
    let needsReview = false;
    let reviewReason: string | undefined;
    if (isContract) {
      const verdict = parseContractResponse(res.text);
      if (!verdict.ok) {
        // Retry ONCE, stricter — the only allowed retry.
        const retry = await callGeminiAdaptive(keys, prompt.system, `${job.sourceText}\n\n${STRICT_RETRY_SUFFIX}`);
        if (!retry.ok) {
          await ctx.runMutation(internal.adaptiveJobs.failJobWithBackoff, {
            jobId: args.jobId, error: retry.error, httpStatus: retry.status, is429: retry.status === 429,
          });
          return { ok: false as const, reason: retry.error };
        }
        const verdict2 = parseContractResponse(retry.text);
        const outcome = evaluateContract(verdict2, 1);
        if (outcome.action === "needs_review" && !outcome.translation) {
          await ctx.runMutation(internal.adaptiveJobs.failJobWithBackoff, {
            jobId: args.jobId, error: outcome.reviewReason,
          });
          return { ok: false as const, reason: outcome.reviewReason };
        }
        translationText = (outcome as { translation: string }).translation;
        needsReview = true;
        reviewReason = (outcome as { reviewReason?: string }).reviewReason;
      } else {
        const outcome = evaluateContract(verdict, 0);
        if (outcome.action === "done") translationText = outcome.translation;
        else {
          translationText = (outcome as { translation: string }).translation ?? "";
          needsReview = true;
          reviewReason = (outcome as { reviewReason?: string }).reviewReason;
        }
      }
    } else {
      translationText = postProcessAdaptive(res.text, job.langCode, args.marketContext || "standard");
      if (looksLikeEnglishEcho(translationText, job.langCode)) {
        await ctx.runMutation(internal.adaptiveJobs.failJobWithBackoff, {
          jobId: args.jobId, error: "english_echo_gate",
        });
        return { ok: false as const, reason: "english_echo_gate" };
      }
      // Legacy-path QA: warn only — never silently done on hard fails.
      try {
        const qa = runQA(job.sourceText, translationText, job.langCode, []);
        if (qa.overall === "fail") {
          await ctx.runMutation(internal.adaptiveJobs.failJobWithBackoff, {
            jobId: args.jobId, error: `qa_fail:${qa.score}`,
          });
          return { ok: false as const, reason: "qa_fail" };
        }
      } catch { /* QA engine never blocks the pipeline */ }
    }

    // Contract mode also post-processes light layers EXCEPT prose rewriting:
    // artifact filter + punctuation normalization + telepathy + RTL marker are
    // evidence-logged formatting, not prose rewriting (P4 layer law).
    const finalText = isContract
      ? postProcessAdaptive(translationText, job.langCode, args.marketContext || "standard")
      : translationText;

    await ctx.runMutation(internal.adaptiveJobs.flushJobResults, {
      results: [
        {
          projectId: job.projectId,
          langCode: job.langCode,
          chunkIndex: job.chunkIndex,
          translatedText: finalText,
          model: res.model,
          usage: res.usage,
          needsReview,
          reviewReason,
        },
      ],
    });
    return { ok: true as const, chunkIndex: job.chunkIndex, needsReview };
  },
});

// ════════════════════════════════════════════════════════════
// Start — idempotent begin (frontend calls startAdaptiveTranslation)
// ════════════════════════════════════════════════════════════

export const startAdaptiveTranslation = action({
  args: {
    projectId: v.id("projects"),
    langCodes: v.array(v.string()),
    marketContext: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(api.queries.getProjectRaw, { projectId: args.projectId });
    if (!project) throw new Error("Project not found");
    if (project.status === "translating") {
      return { started: false as const, reason: "already_translating" };
    }

    // Resolve fullText (1MiB offload-aware) and chunk SINGLE-SOURCE from chunks
    // if they exist; otherwise chunk from fullText once and persist.
    let fullText = project.fullText;
    if (!fullText && project.fullTextStorageId) {
      const blob = await ctx.storage.get(project.fullTextStorageId);
      if (blob) fullText = (JSON.parse(await blob.text()) as string) ?? "";
    }
    const { chunkText } = await import("./translateQueue");
    const sourceChunks = chunkText(fullText, 2500);
    if (sourceChunks.length === 0) throw new Error("No text to translate");

    for (const lang of args.langCodes) {
      const existing = await ctx.runQuery(api.queries.getChunksForLang, {
        projectId: args.projectId,
        langCode: lang,
      });
      if (existing.length === 0) {
        for (let i = 0; i < sourceChunks.length; i++) {
          await ctx.runMutation(api.mutations.upsertChunk, {
            projectId: args.projectId, langCode: lang, chunkIndex: i, sourceText: sourceChunks[i],
          });
        }
      }
      await ctx.runMutation(api.mutations.upsertTranslation, {
        projectId: args.projectId, langCode: lang,
        totalChunks: existing.length > 0 ? existing.length : sourceChunks.length,
        status: "in_progress", completedChunks: 0, mergedText: "",
      });
      await ctx.runMutation(internal.adaptiveJobs.enqueueTranslationJobs, {
        projectId: args.projectId,
        langCode: lang,
        chunkCount: existing.length > 0 ? existing.length : sourceChunks.length,
        pipelineVersion: "adaptive_parallel",
        translationIntelligenceMode: project.translationIntelligenceMode ?? "gemini_contract",
      });
    }

    await ctx.runMutation(api.mutations.updateProject, {
      projectId: args.projectId,
      status: "translating",
      translationMode: "adaptive_parallel",
      governorState: "running",
      activeWorkerCount: TRANSLATION_CONFIG.workerCount,
    });

    // Fresh dispatcher lease.
    await ctx.scheduler.runAfter(0, api.adaptiveDispatcher.dispatcherTick, {
      projectId: args.projectId,
      marketContext: args.marketContext,
    });
    return { started: true as const, languages: args.langCodes.length, totalChunks: sourceChunks.length };
  },
});

// ════════════════════════════════════════════════════════════
// ZIP finalize gate (:1002) — adaptive path owns end-of-project finalization
// ════════════════════════════════════════════════════════════

export const zipFinalizeIfDone = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return { fired: false as const };
    const jobs = await ctx.db
      .query("translationJobs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const unfinished = jobs.filter(
      (j) => j.status === "pending" || j.status === "claimed" || j.status === "running" || j.status === "retry_wait",
    );
    if (unfinished.length > 0) return { fired: false as const, unfinished: unfinished.length };

    // All languages terminal — fire buildZip EXACTLY ONCE (never premature,
    // never duplicated): only when the project is still translating.
    if (project.status === "translating") {
      await ctx.db.patch(args.projectId, { status: "all_translated", governorState: "complete" });
      await ctx.scheduler.runAfter(0, api.zipAssembly.buildZip, { projectId: args.projectId });
      return { fired: true as const };
    }
    return { fired: false as const, reason: `status_${project.status}` };
  },
});

// ════════════════════════════════════════════════════════════
// Raw job lookup (dispatcher/actions)
// ════════════════════════════════════════════════════════════

export const getJobRaw = internalQuery({
  args: { jobId: v.id("translationJobs") },
  handler: async (ctx, args) => ctx.db.get(args.jobId),
});
