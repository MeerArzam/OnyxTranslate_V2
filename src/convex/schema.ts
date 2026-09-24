import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

// ══════════════════════════════════════════════════════════════════════════
// OnyxTranslate tables — VERBATIM from the salvaged architecture docs
// (docs/architecture.html §1, "Convex Schema (verbatim from convex/schema.ts)").
// Field comments preserved where the original had them.
// ══════════════════════════════════════════════════════════════════════════

const onyxTables = {
  projects: defineTable({
    sessionId: v.optional(v.string()), // PHASE 2: durable device + tab identity. clientId survives reopens;
    clientId: v.optional(v.string()),
    tabSessionId: v.optional(v.string()),
    fileName: v.string(),
    pageCount: v.number(),
    wordCount: v.number(),
    pdfStorageId: v.optional(v.string()),
    pageData: v.any(),
    fullText: v.string(),
    parsedPages: v.number(),
    status: v.string(),
    zipStorageId: v.optional(v.string()),
    zipUrl: v.optional(v.string()),
    // PHASE 2: pending-upload staging (set at uploadJob creation, cleared at parse)
    uploadJobId: v.optional(v.id("uploadJobs")),
    // FIX (1MiB limit): when parsed pageData exceeds Convex's 1MiB document
    pageDataStorageId: v.optional(v.id("_storage")),
    // FIX (1MiB limit): same offload mechanism for very large fullText.
    fullTextStorageId: v.optional(v.id("_storage")),
    // ══ ADAPTIVE PARALLEL PIPELINE (additive — legacy fields untouched) ══
    pipelineVersion: v.optional(v.string()), // "legacy" | "adaptive_parallel"
    translationMode: v.optional(v.string()),
    // Thin Motherboard Phase 3: translation-intelligence contract flag.
    translationIntelligenceMode: v.optional(v.string()),
    totalTranslationJobs: v.optional(v.number()),
    completedTranslationJobs: v.optional(v.number()),
    failedTranslationJobs: v.optional(v.number()),
    // Daily governor: Pacific-date-keyed counter of requests actually SENT.
    requestsToday: v.optional(v.number()),
    requestDayPacific: v.optional(v.string()),
    lastRequestAt: v.optional(v.number()),
    // running | daily_paused | waiting_retry | complete | failed
    governorState: v.optional(v.string()),
    governorResumeAt: v.optional(v.number()),
    activeWorkerCount: v.optional(v.number()),
    consecutive429Count: v.optional(v.number()),
    lastDispatcherAt: v.optional(v.number()),
    lastSuccessfulActivityAt: v.optional(v.number()),
    pdfGenerationState: v.optional(v.string()),
    zipState: v.optional(v.string()),
    // RELIABILITY PASS: watchdog + dispatcher telemetry (honest recovery state)
    watchdogLastRunAt: v.optional(v.number()),
    watchdogRecoveredAt: v.optional(v.number()),
    watchdogRecoveryCount: v.optional(v.number()),
    watchdogLastError: v.optional(v.string()),
    lastDispatcherError: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_client", ["clientId"]),

  chunks: defineTable({
    projectId: v.id("projects"),
    langCode: v.string(),
    chunkIndex: v.number(),
    sourceText: v.string(),
    translatedText: v.optional(v.string()),
    status: v.string(),
    model: v.optional(v.string()),
    usage: v.optional(v.any()),
    // Thin Motherboard Phase 3: which intelligence contract produced this
    translationIntelligenceMode: v.optional(v.string()),
  })
    .index("by_project_lang", ["projectId", "langCode", "chunkIndex"])
    .index("by_project_status", ["projectId", "status"]),

  translations: defineTable({
    projectId: v.id("projects"),
    langCode: v.string(),
    status: v.string(),
    totalChunks: v.number(),
    completedChunks: v.number(),
    mergedText: v.optional(v.string()),
    pdfStorageId: v.optional(v.string()),
    pdfUrl: v.optional(v.string()),
    pdfGenerating: v.optional(v.boolean()),
    pdfProgress: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    // Watchdog heartbeat: timestamp of the last completed chunk (FIX 5a)
    lastChunkAt: v.optional(v.number()),
  }).index("by_project_lang", ["projectId", "langCode"]),

  imageTranslations: defineTable({
    projectId: v.optional(v.id("projects")),
    sessionId: v.optional(v.string()), // indexed by_session (original schema had it; doc field list abbreviated)
    imageBase64: v.string(),
    extractedText: v.optional(v.string()),
    translatedText: v.optional(v.string()),
    targetLangCode: v.string(),
    status: v.string(),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),

  history: defineTable({
    sessionId: v.string(),
    projectId: v.id("projects"),
    fileName: v.string(),
    pageCount: v.number(),
    wordCount: v.number(),
    status: v.string(),
    languagesCompleted: v.number(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    zipUrl: v.optional(v.string()),
  }).index("by_session", ["sessionId"]),
  // NOTE: the salvaged doc lists history.by_status_scheduled, but history rows
  // carry no scheduledFor field (that index belongs to jobs). All salvaged
  // code queries history ONLY via by_session — index dropped to keep the
  // schema pushable and the runtime contract identical.

  jobs: defineTable({
    projectId: v.id("projects"),
    type: v.string(),
    langCode: v.optional(v.string()),
    chunkIndex: v.optional(v.number()),
    status: v.string(),
    error: v.optional(v.string()),
    scheduledFor: v.number(),
    createdAt: v.number(),
  })
    .index("by_status_scheduled", ["status", "scheduledFor"])
    .index("by_project", ["projectId"]),

  uploadJobs: defineTable({
    clientId: v.string(),
    tabSessionId: v.optional(v.string()),
    fileName: v.string(),
    fileSize: v.number(),
    storageId: v.optional(v.id("_storage")),
    projectId: v.optional(v.id("projects")),
    status: v.string(),
    // parsed → chunked → translating → generating_pdf → assembling_zip → complete
    processStage: v.optional(v.string()),
    // PHASE 3: which browser→server transport created this job (1 = single request, 2 = direct Storage POST)
    uploadPath: v.optional(v.number()),
    // monotonic counter: a scheduled stage run is only valid if stageSeq matches
    stageSeq: v.optional(v.number()),
    heartbeatAt: v.optional(v.number()),
    error: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    langCodes: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_client", ["clientId"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_status", ["status"]),

  pendingUploads: defineTable({
    clientId: v.string(),
    tabSessionId: v.optional(v.string()),
    uploadJobId: v.id("uploadJobs"),
    fileName: v.string(),
    fileSize: v.number(),
    langCodes: v.optional(v.array(v.string())),
    status: v.string(), // staging | uploaded | finalized | abandoned
    storageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
  })
    .index("by_client", ["clientId"])
    .index("by_status", ["status"]),
  // NOTE: salvage doc listed pendingUploads.by_project, but the table carries
  // uploadJobId (not projectId) — index dropped as incoherent (same class of
  // doc error as history.by_status_scheduled).

  exportArtifacts: defineTable({
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    kind: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  exportTokens: defineTable({
    token: v.string(),
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),

  // ══ ADAPTIVE PARALLEL PIPELINE ══
  translationJobs: defineTable({
    projectId: v.id("projects"),
    clientId: v.optional(v.string()),
    tabSessionId: v.optional(v.string()),
    langCode: v.string(),
    chunkIndex: v.number(),
    chunkCount: v.number(),
    sourceText: v.string(),
    sourceStartOffset: v.optional(v.number()),
    sourceEndOffset: v.optional(v.number()),
    // pending | claimed | running | done | retry_wait | failed
    status: v.string(),
    resultText: v.optional(v.string()),
    attempts: v.number(),
    reclaimCount: v.optional(v.number()),
    lastError: v.optional(v.string()),
    lastHttpStatus: v.optional(v.number()),
    claimedAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    heartbeatAt: v.optional(v.number()),
    nextRetryAt: v.optional(v.number()),
    claimToken: v.optional(v.string()),
    // pair merging: requestGroupId groups the 2 rows sharing one Gemini call
    requestGroupId: v.optional(v.string()),
    mergedWithChunkIndex: v.optional(v.number()),
    splitValidated: v.optional(v.boolean()),
    pairFailureCount: v.optional(v.number()),
    // raw model output saved when pair parsing fails (diagnostics)
    rawModelOutput: v.optional(v.string()),
    idempotencyKey: v.string(),
    pipelineVersion: v.string(),
    // Thin Motherboard Migration Phase 1: which canonical prompt version
    promptVersion: v.optional(v.string()),
    // Thin Motherboard Phase 3: per-job intelligence mode stamp
    translationIntelligenceMode: v.optional(v.string()),
    // Thin Motherboard Phase 2: contract-validation state.
    needsReview: v.optional(v.boolean()),
    reviewReason: v.optional(v.string()),
    // Set when the strict-retry (once) path already ran for this job.
    contractRetried: v.optional(v.boolean()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_project_lang_chunk", ["projectId", "langCode", "chunkIndex"])
    .index("by_idempotencyKey", ["idempotencyKey"]),

  rateLimits: defineTable({
    projectId: v.id("projects"),
    windowStartMs: v.number(),
    requestTimestamps: v.array(v.number()),
    requestsToday: v.number(),
    requestDayPacific: v.string(),
    consecutive429Count: v.number(),
    workerLimit: v.number(),
    // per-language pair-merge circuit breaker (set on repeated malformed pairs)
    pairMergeDisabledLangs: v.optional(v.array(v.string())),
    lastUpdatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  pdfBatches: defineTable({
    projectId: v.id("projects"),
    langCode: v.string(),
    translationId: v.optional(v.id("translations")),
    batchIndex: v.number(),
    pageStart: v.number(),
    pageEnd: v.number(),
    batchSize: v.number(),
    // pending | running | done | failed
    status: v.string(),
    storageId: v.optional(v.id("_storage")),
    checksum: v.optional(v.string()),
    attempts: v.number(),
    error: v.optional(v.string()),
    heartbeatAt: v.optional(v.number()),
    idempotencyKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_project_lang", ["projectId", "langCode"])
    .index("by_status", ["status"])
    .index("by_idempotencyKey", ["idempotencyKey"]),

  liveTests: defineTable({
    langCode: v.string(),
    langName: v.string(),
    nativeName: v.string(),
    script: v.string(),
    rtl: v.boolean(),
    status: v.string(), // pending | running | pass | warn | fail
    score: v.optional(v.number()),
    output: v.optional(v.string()),
    qaSummary: v.optional(v.array(v.string())),
    issueCount: v.optional(v.number()),
    missingNames: v.optional(v.array(v.string())),
    scriptIssues: v.optional(v.array(v.string())),
    model: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    error: v.optional(v.string()),
    testedAt: v.number(),
  }).index("by_lang", ["langCode"]),
};

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // OnyxTranslate domain tables (verbatim from the salvaged schema).
    ...onyxTables,
  },
  {
    schemaValidation: false,
  },
);

export default schema;
