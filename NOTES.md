# OnyxTranslate rebuild notes

## Phase 0 — security and salvage

- The salvaged live-site bundle and technical documentation are preserved under the gitignored `_salvage/` directory.
- `_salvage/FILE-INVENTORY.md` is the reviewed Phase 0 gate inventory.
- Environment files, salvage material, dependencies, build output, and `src/convex/_generated/` are excluded by `.gitignore`.
- The hardcoded email-provider key was removed. Email delivery reads `EMAIL_API_KEY` from backend environment configuration.

## Phase 2 — backend spine

The backend uses the recovered 19-file source spine plus the durable adaptive modules reconstructed from the old technical documentation. Translation is not implemented as one long action:

- `adaptiveJobs` persists one row per source chunk, leases claims, renews heartbeats, applies RPM/daily budgets, pairs adjacent chunks when safe, validates the Gemini contract, and flushes results durably.
- `adaptiveDispatcher` performs bounded claim ticks and self-reschedules. It persists crashes and continues the language chain.
- `adaptiveWatchdog` runs every three minutes, isolates failures per project, promotes retryable work, reclaims only expired leases, and revives legacy as well as adaptive projects.
- `adaptivePdf` uses idempotent 50 → 25 → 10-page batches. Storage reads/writes are performed in actions; database planning and state changes remain in mutations.
- `resumeServerProject` preserves all completed work, promotes arrived retries, reclaims expired leases, respects a valid Pacific-day quota pause, and schedules a fresh dispatcher tick.
- `translationConfig` is the single source of truth for the recovered operating constants.

The complete status machines are in `src/convex/STATE-TRANSITIONS.md`.

## Verification

- `bun convex dev --once` completed successfully against the managed development deployment.
- `bun tsc -b --noEmit` completed with zero errors.
- The generated Convex API is gitignored and was not hand-edited.

## Hosting status

`bun convex deploy` completed successfully, but the CLI selected the current Freebuff-managed development deployment at `https://charming-stork-436.convex.cloud` rather than a user-owned production deployment. This is the documented fallback, not the requested permanent hosting target: **the same shared-hosting compute-pause risk remains**. The environment blocks direct inspection of `CONVEX_DEPLOY_KEY`; before production use, the user must place that key in the project's backend Keys/API keys configuration and redeploy to the user-owned deployment. The paused `successful-iguana-419` deployment was never modified.

## Recovered source fidelity

| File | Salvaged lines | Current lines | Delta |
|---|---:|---:|---:|
| artifactMutations.ts | 83 | 83 | 0 |
| crons.ts | 32 | 32 | 0 |
| exportProject.ts | 132 | 132 | 0 |
| generatePdf.ts | 199 | 201 | +2 |
| history.ts | 45 | 45 | 0 |
| http.ts | 235 | 235 | 0 |
| identity.ts | 372 | 372 | 0 |
| importJob.ts | 168 | 168 | 0 |
| jobMutations.ts | 57 | 57 | 0 |
| mutations.ts | 279 | 279 | 0 |
| parsePdf.ts | 207 | 207 | 0 |
| pdfLayout.ts | 265 | 265 | 0 |
| queries.ts | 272 | 272 | 0 |
| renderPdfCore.ts | 633 | 633 | 0 |
| translateContent.ts | 1126 | 1126 | 0 |
| translateImage.ts | 156 | 156 | 0 |
| translateQueue.ts | 832 | 832 | 0 |
| upload.ts | 102 | 102 | 0 |
| zipAssembly.ts | 80 | 80 | 0 |

`generatePdf.ts` has two pre-existing compatibility adaptation lines in the recovered copy. The other 18 recovered source files remain line-for-line unchanged; compatibility changes to shared infrastructure are isolated in reconstructed modules, `src/convex/pdfjs-worker.d.ts`, dependencies, and generated code.
