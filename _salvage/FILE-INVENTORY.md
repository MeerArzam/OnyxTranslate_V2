# OnyxTranslate Backend File Inventory — Phase 0 Gate Document
Generated: 2026-09-23T16:44:35.472Z
Source: salvaged /docs/convex-functions*.html (self-described "full real source" pages)
Status legend: ✅ REAL SOURCE recovered · 📋 SPEC-ONLY (behavior + constants documented in overview-dashboard, source not in docs set)

> Gate: Phase 2 backend code may not be written before this inventory is reviewed.


## convex-functions.html

### ✅ convex/mutations.ts — REAL SOURCE (279 lines)

**Convex functions (11):**

- `mutation generateUploadUrl`
- `mutation createProject`
- `mutation updateProject`
- `mutation deleteProject` · args: `projectId: v.id("projects")`
- `mutation upsertChunk` · args: `projectId: v.id("projects"), langCode: v.string(), chunkIndex: v.number(), sourceText: v.string(),`
- `mutation updateChunk` · args: `chunkId: v.id("chunks"), translatedText: v.optional(v.string()), status: v.optional(v.string()), model: v.optional(v.string()), usage: v.optional(v.any()),`
- `mutation upsertTranslation` · args: `projectId: v.id("projects"), langCode: v.string(), totalChunks: v.number(), status: v.optional(v.string()), completedChunks: v.optional(v.number()), mergedText: v.optional(v.string()),`
- `mutation updateTranslation`
- `mutation deleteChunksForLang` · args: `projectId: v.id("projects"), langCode: v.string(),`
- `mutation createJob` · args: `projectId: v.id("projects"), type: v.string(), langCode: v.optional(v.string()), chunkIndex: v.optional(v.number()), status: v.string(), scheduledFor: v.number(),`
- `mutation saveImageTranslation` · args: `imageBase64: v.string(), extractedText: v.optional(v.string()), translatedText: v.optional(v.string()), langCode: v.string(), status: v.string(),`

### ✅ convex/queries.ts — REAL SOURCE (272 lines)

**Convex functions (18):**

- `query getProjectRateSummary` · args: `projectId: v.id("projects")`
- `query getProject` · args: `projectId: v.id("projects"), sessionId: v.string()`
- `query getLatestProject` · args: `sessionId: v.string()`
- `query getSessionProjects` · args: `sessionId: v.string()`
- `query getProjectTranslations` · args: `projectId: v.id("projects"), sessionId: v.string()`
- `query getProjectRaw` · args: `projectId: v.id("projects")`
- `query getTranslationsRaw` · args: `projectId: v.id("projects")`
- `query getChunkProgress` · args: `projectId: v.id("projects"), langCode: v.string()`
- `query getChunksForLang` · args: `projectId: v.id("projects"), langCode: v.string()`
- `query getAllJobs` · args: `projectId: v.id("projects")`
- `query getChunksForProjectRaw` · args: `projectId: v.id("projects")`
- `query getUploadJobRaw` · args: `uploadJobId: v.id("uploadJobs")`
- `query getExportArtifactsRaw` · args: `projectId: v.id("projects")`
- `query getHistory` · args: `sessionId: v.string()`
- `query getStalledLanguages` · args: `projectId: v.id("projects"), sessionId: v.string()`
- `query getTranslationProgress` · args: `projectId: v.id("projects"), langCode: v.string()`
- `query getAllProjectsForWatchdog`
- `query getLivePreviewText` · args: `projectId: v.id("projects"), langCode: v.string()`

### ✅ convex/history.ts — REAL SOURCE (45 lines)

**Convex functions (2):**

- `mutation saveToHistory` · args: `sessionId: v.string(), projectId: v.id("projects"), fileName: v.string(), pageCount: v.number(), wordCount: v.number(), status: v.string(), languagesCompleted: v.number(), zipUrl: v.optional(v.string()),`
- `mutation deleteHistory` · args: `historyId: v.id("history"),`

### ✅ convex/upload.ts — REAL SOURCE (102 lines)

**Convex functions (4):**

- `mutation generatePdfUploadUrl`
- `mutation finalizePdfUpload` · args: `storageId: v.id("_storage")`
- `mutation finalizeUploadedPdf` · args: `uploadJobId: v.id("uploadJobs"), storageId: v.id("_storage"),`
- `mutation beginProcessing` · args: `uploadJobId: v.id("uploadJobs")`

### ✅ convex/identity.ts — REAL SOURCE (372 lines)

**Convex functions (16):**

- `query getResumableJobs` · args: `clientId: v.string(), limit: v.optional(v.number())`
- `query getUploadJobs` · args: `clientId: v.string(), limit: v.optional(v.number())`
- `query getUploadJobByIdempotencyKey` · args: `idempotencyKey: v.string()`
- `mutation createUploadJob`
- `mutation attachProjectToUploadJob` · args: `uploadJobId: v.id("uploadJobs"), projectId: v.id("projects")`
- `mutation createPendingUploadWithPath` · args: `clientId: v.string(), tabSessionId: v.optional(v.string()), fileName: v.string(), fileSize: v.number(), langCodes: v.optional(v.array(v.string())), idempotencyKey: v.optional(v.string()),`
- `query getUploadJob` · args: `uploadJobId: v.id("uploadJobs"), clientId: v.string()`
- `query getPendingUploads` · args: `clientId: v.string()`
- `mutation adoptJob` · args: `projectId: v.id("projects"), clientId: v.string(), tabSessionId: v.string(), sessionId: v.string(),`
- `mutation updateUploadJobStage` · args: `uploadJobId: v.id("uploadJobs"), stage: v.string(), expectedSeq: v.number(), error: v.optional(v.string()),`
- `mutation heartbeatUploadJob` · args: `uploadJobId: v.id("uploadJobs")`
- `mutation failUploadJob` · args: `uploadJobId: v.id("uploadJobs"), error: v.string(), expectedSeq: v.optional(v.number()),`
- `mutation cancelUploadJob` · args: `uploadJobId: v.id("uploadJobs"), clientId: v.string()`
- `mutation createPendingUpload` · args: `clientId: v.string(), tabSessionId: v.optional(v.string()), uploadJobId: v.id("uploadJobs"), fileName: v.string(), fileSize: v.number(), langCodes: v.optional(v.array(v.string())),`
- `mutation discardPendingUpload` · args: `pendingUploadId: v.id("pendingUploads"), clientId: v.string()`
- `mutation sweepStaleUploads`

### ✅ convex/jobMutations.ts — REAL SOURCE (57 lines)

**Convex functions (2):**

- `mutation setProjectIdentity` · args: `projectId: v.id("projects"), clientId: v.optional(v.string()), tabSessionId: v.optional(v.string()), sessionId: v.optional(v.string()),`
- `mutation setProjectStatus` · args: `projectId: v.id("projects"), status: v.string(), uploadJobId: v.optional(v.id("uploadJobs")),`

### ✅ convex/importJob.ts — REAL SOURCE (168 lines)

**Convex functions (1):**

- `action uploadAndImportFromData` · args: `clientId: v.string(), sessionId: v.string(), data: v.any(),`

**Constants:**

- `IMPORTED_STATUSES = new Set([`

### ✅ convex/exportProject.ts — REAL SOURCE (132 lines)

**Convex functions (2):**

- `action buildExportArtifact` · args: `projectId: v.id("projects")`
- `action buildZipNow` · args: `projectId: v.id("projects")`

**Constants:**

- `EXPORT_KIND = "onyx-translate-project"`

### ✅ convex/artifactMutations.ts — REAL SOURCE (83 lines)

**Convex functions (3):**

- `mutation upsertExportArtifact` · args: `projectId: v.id("projects"), storageId: v.id("_storage"), kind: v.string(), sizeBytes: v.number(),`
- `mutation issueExportToken` · args: `projectId: v.id("projects"), fileName: v.string()`
- `query consumeExportToken` · args: `token: v.string()`

### ✅ convex/http.ts — REAL SOURCE (235 lines)

**Convex functions (3):**

- `httpAction downloadExport`
- `httpAction uploadAndCreateJob`
- `httpAction uploadAndImport`

**Helper functions (2):**

- `json(body: unknown, status = 200)`
- `preflight()`

**Constants:**

- `MAX_PATH1_BYTES = 19 * 1024 * 1024; // 19MB — reported honestly, enforced by platform physics`
- `MAX_IMPORT_BYTES = 19 * 1024 * 1024`
- `CORS_HEADERS = {`
- `ALL_LANGS = [`

### ✅ convex/crons.ts — REAL SOURCE (32 lines)


## convex-functions-2.html

### ✅ convex/translateContent.ts — REAL SOURCE (1126 lines)

**Convex functions (1):**

- `action translateLanguage` · args: `projectId: v.id("projects"), langCode: v.string(), marketContext: v.optional(v.string()), nextLangCode: v.optional(v.string()), remainingLangs: v.optional(v.array(v.string())), // all remaining languages after this one`

**Helper functions (13):**

- `buildGlossaryColumn(langCode: string)`
- `buildNameMap(langCode: string)`
- `buildMarketContext(marketContext: string)`
- `buildSystemPrompt(langCode: string, marketContext = "standard")`
- `buildSystemPromptLegacyRetired(langCode: string, marketContext = "standard")`
- `chunkText(text: string, maxWords: number)`
- `applyBiblePassServer(text: string, targetLanguage: string)`
- `restorePlaceholdersServer(text: string, placeholders: Map<string, string>)`
- `stripMetaCommentary(text: string, langCode: string)`
- `normalizeDictionaryFormat(text: string)`
- `escapeRegex(input: string)`
- `extractLastSentences(text: string)`
- `callGemini(keys: string[], systemPrompt: string, userMessage: string,)`

**Constants:**

- `GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"`
- `GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash"`
- `CHUNK_SIZE = 2500`
- `MAX_CHUNKS_PER_RUN = 6`
- `LOCKED_TERM_LIST = [`
- `PHASE_RULES = [`
- `REASONING_PROTOCOL = [`
- `VOICE_MATRIX = [`
- `LIVE_TEST_SOURCE = `Violet wakes up in Aretia confused, with a ring and a note from Xaden: "Don't look for me." ` +`

**PHASE_RULES entries embedded:** 23


## convex-functions-3.html

### ✅ convex/translateQueue.ts — REAL SOURCE (832 lines)

**Convex functions (3):**

- `action startTranslation` · args: `projectId: v.id("projects"), langCodes: v.optional(v.array(v.string())),`
- `action processLanguage` · args: `projectId: v.id("projects"), langCode: v.string(), chunkIndex: v.number(),`
- `action cancelTranslation` · args: `projectId: v.id("projects"),`

**Helper functions (12):**

- `buildGlossaryColumn(langCode: string)`
- `buildNameMap(langCode: string)`
- `buildMarketContext(marketContext: string)`
- `buildSystemPrompt(langCode: string, marketContext = "standard")`
- `buildSystemPromptLegacyRetired(langCode: string, marketContext = "standard")`
- `chunkText(text: string, maxWords: number)`
- `applyBiblePassServer(text: string, targetLanguage: string)`
- `restorePlaceholdersServer(text: string, placeholders: Map<string, string>)`
- `escapeRegExp(input: string)`
- `extractLastSentences(text: string)`
- `callGemini(keys: string[], systemPrompt: string, userMessage: string,)`
- `processChunkInternal(ctx: any, projectId: Id<"projects">, langCode: string, chunkIndex: number,)`

**Constants:**

- `GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"`
- `GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash"`
- `CHUNK_SIZE = 2500`
- `LANGUAGES = [`
- `LOCKED_TERM_LIST = [`
- `PHASE_RULES = [`
- `REASONING_PROTOCOL = [`
- `VOICE_MATRIX = [`

**PHASE_RULES entries embedded:** 23

### ✅ convex/translateImage.ts — REAL SOURCE (156 lines)

**Convex functions (1):**

- `action translateImage` · args: `imageBase64: v.string(), langCode: v.string(),`

**Constants:**

- `GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"`
- `LANGUAGE_NAMES = {`


## convex-functions-4.html

### ✅ convex/parsePdf.ts — REAL SOURCE (207 lines)

**Convex functions (1):**

- `action parseUploadedPdf` · args: `pdfStorageId: v.string(),`

### ✅ convex/generatePdf.ts — REAL SOURCE (199 lines)

**Convex functions (1):**

- `action generateTranslatedPdf`

**Helper functions (1):**

- `getFontBytes(url: string)`

### ✅ convex/zipAssembly.ts — REAL SOURCE (80 lines)

**Convex functions (1):**

- `action buildZip` · args: `projectId: v.id("projects")`


## convex-functions-5.html

### ✅ convex/pdfLayout.ts — REAL SOURCE (265 lines)

**Helper functions (3):**

- `mergeItemsIntoLines(items: LayoutTextItem[])`
- `clusterIntoBlocks(lines: LayoutLine[])`
- `itemsToBlocks(items: LayoutTextItem[])`

### ✅ convex/renderPdfCore.ts — REAL SOURCE (633 lines)

**Helper functions (8):**

- `wrapText(font: RenderFont, text: string, maxWidth: number, size: number,)`
- `countWords(text: string)`
- `mapParagraphsToBlocks(paragraphs: string[], blocks: RenderBlock[],)`
- `fitBlockText(font: RenderFont, text: string, block: RenderBlock, isRTL: boolean, useBidiShaping = false,)`
- `reverseWords(line: string)`
- `toVisualBidi(line: string)`
- `planPageOverlay(opts: { textItems: LayoutTextItem[]; storedBlocks: RenderBlock[] | null; pageWidth: number; pageHeight: number; paragraphs: string[]; font: RenderFont; isRTL: boolean; useBidiShaping?: boolean; })`
- `renderTranslatedPdf(opts: { srcBytes: Uint8Array; pageData: SourcePageData[]; mergedText: string; langCode: string; getFontBytes: (url: string)`

**Constants:**

- `SIZE_FLOOR = 6`
- `SIZE_CAP = 16`
- `LINE_HEIGHT_FACTOR = 1.3`
- `RENDER_FONT_URLS = {`
- `RTL_LANGS = new Set(["ar", "ur", "ks"])`


## 📋 Spec-only files (adaptive core — reimplement from overview spec)

- `convex/translationConfig.ts` — TRANSLATION_CONFIG single source of truth (overview §2 Constants table = every value)
- `convex/adaptiveJobs.ts` — job claim/lease/heartbeat/pair-merge/rate-limiter/governor/flush/zip-finalize (adaptiveJobs.ts:305/422/968/1002)
- `convex/adaptiveDispatcher.ts` — dispatcherTick wrapper + dispatcherTickInner, recordDispatcherError, 20s deadline, claim budget 2/tick, heartbeat
- `convex/adaptiveWatchdog.ts` — 3-min cron PRIMARY driver; revives legacy + adaptive; per-project try/catch; persisted telemetry
- `convex/adaptivePdf.ts` — 50→25→10 batch plan/shrink/slice/render; assembleLanguagePdf (adaptivePdf.ts:62/136/252/294)
- `convex/resumeServerProject.ts` — safe resume: preserves completed chunks, reclaims ONLY expired leases, Pacific-only governor reset, getServerJobStatus
- `convex/buildTranslationPrompt.ts` — PROMPT_VERSION gemini-contract-v1 canonical builder (3 call sites)
- `convex/translationContract.ts` — strict JSON envelope + selfCheck validators, retry-once-stricter, needs_review terminal
- `convex/languageRules.ts` — LANGUAGE_RULES 20-lang table, filterGeneratedArtifacts, evaluateLanguageQA, assembleWithBoundaryRepair
- `convex/adaptiveTestProbes.ts` — probeGovernorLadder/probeRateSnapshot/probeClaimAndAbandon (test harnesses)
- `convex/forensicProbe.ts` — P0 forensic probe for the frozen 14/92 project

## Totals

- Real-source backend files recovered: **19**
- Functions/signatures inventoried: **109**
- Verbatim code lines recovered: **5275**
- Spec-only files to reimplement: **11**
- Frontend bundle: `_salvage/assets/index-BdJdZrIT.js` (604,715 B, minified — reference for UI behavior)
- Full docs text: `_salvage/docs-txt/*.txt` (7,526 lines)
