# OnyxTranslate state transitions

This file records the state machines implemented by the Phase 2 backend. Status values are stored as strings in Convex, matching the salvaged schema exactly.

## Project

```text
ready ──start translation──> translating ──all durable jobs terminal──> all_translated
  │                               │
  ├──user cancel──> cancelled <───┤
  └──fatal failure─> error <──────┘
```

- `ready`: source is parsed and durable chunks exist; no active translation.
- `translating`: legacy or adaptive translation is active.
- `cancelled`: a stop request was observed. Workers stop and do not write new progress.
- `all_translated`: the adaptive ZIP gate observed no pending, claimed, running, or retry-waiting jobs.
- `error`: terminal export/PDF or pipeline failure.
- A watchdog re-kicks a stale `translating` project; it never changes completed work.

## Translation jobs (`translationJobs`)

```text
pending ──claim──> claimed ──slot acquired──> running ──valid result──> done
  ▲                  │                           │
  │                  └──expired heartbeat────────┘
  │                                              └──terminal error/backoff──> retry_wait
  ├────────────retry time arrived───────────────────────────────────────────────┘
  ├──pair split / safe recovery───────────────────────────────────────────────┘
  └──max attempts exhausted──> failed
```

- `done` is terminal even when `needsReview` is true. The raw response and review reason remain on the job.
- A contract result that cannot be validated after the single strict retry becomes `done + needsReview`, not an endless retry.
- Only expired-heartbeat `claimed`/`running` leases are reclaimed. A live lease is never stolen.
- `pending → claimed → running → done` is the normal path. `retry_wait`, pair splitting, and lease recovery return to `pending` without deleting completed jobs.

## Legacy chunks (`chunks`)

```text
pending ──successful translation──> done
   └──────translation failure────> failed
```

- An existing `done` chunk with translated text is reused; the pipeline never re-chunks `fullText` and never re-translates completed work during safe resume.
- `upsertChunk` is idempotent by `(projectId, langCode, chunkIndex)`.

## Translation rows (`translations`)

```text
in_progress ──all chunks durable-jobs done──> complete
      │                                           │
      │                                           └──PDF generation──> generating_pdf
      │                                                                            │
      └──needs review while all jobs terminal──────────────────────> needs_review  │
                                                                                   ▼
                                                            complete (PDF stored) or error
```

- `completedChunks` is recalculated from durable rows; it is never trusted as a UI-only counter.
- `mergedText` in contract mode is pure ordered concatenation. The backend never rewrites model prose.
- `needs_review` is terminal for scheduling. It allows language promotion and ZIP finalization while preserving `needsReview` diagnostics on jobs.
- `generating_pdf` sets `pdfGenerating = true`; successful generation stores `pdfStorageId`/`pdfUrl` and returns to `complete` with `pdfGenerating = false`.
- PDF failure sets `pdfProgress` and terminal `error`; completed translation text remains intact for retry/export.

## PDF batches (`pdfBatches`)

```text
pending ──claim──> running ──render/store──> done
   ▲                 │
   │                 ├──retryable failure──> failed
   │                 └──watchdog/retry──────> pending
   └────────split 50 → 25 → 10─────────────────┘
```

- A 10-page minimum is preserved; a failed minimum batch fails only its exact page range.
- A stuck `running` batch is recovered by the watchdog without losing page ranges.
- Completed batches are skipped on restart. Their storage IDs are merged in an action (Convex storage is action-only), then the translation is marked complete.

## Upload jobs (`uploadJobs`)

```text
staging/uploaded ──claimed──> processing ──parsed──> ready ──translation kicked──> translating
                                      │                              │
                                      ├──fatal error──> error        └──all language output──> complete
                                      └──cancel request────────────> cancelled
```

- `stageSeq` and `heartbeatAt` gate superseded retries so work cannot move backward.
- Every durable stage is persisted before the next action is scheduled.

## Pending uploads (`pendingUploads`)

```text
staging ──file uploaded──> uploaded ──finalized──> finalized
   └────24h orphan sweep / explicit discard──> abandoned
```

## Image translations (`imageTranslations`)

```text
pending ──multimodal OCR + translation──> complete
   └────────────provider or validation failure──> error
```

## ZIP assembly

The ZIP is scheduled exactly once after every translation job is terminal. It gathers completed language PDFs plus translated text and then records the project ZIP URL. It does not alter project, translation, or chunk progress.
