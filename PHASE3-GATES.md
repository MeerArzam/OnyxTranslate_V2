# Phase 3 adaptive freeze-proof pipeline

Date: 2026-09-25 (blocker verification same day)
Deployment: `charming-stork-436.convex.cloud`

## Salvaged-law conflicts

The recovered architecture is authoritative when the Phase 3 request conflicts with it.

| Area | Salvaged law | Phase 3 request | Result |
|---|---|---|---|
| Watchdog cadence | `watchdogIntervalMs: 180000` / 3 minutes | 60 seconds | Kept 3 minutes; `crons.ts` remains the old cadence. |
| Attempts | `maxAttempts: 6` | default 5 | Kept 6. |
| Job statuses | `pending`, `claimed`, `running`, `done`, `retry_wait`, `failed` | adds `paused_budget` | Kept `retry_wait`; daily exhaustion pauses the project governor and preserves jobs. |
| Rate pool | One rolling-60s pool **per project**; five keys are one quota pool | one singleton counters row across all projects/keys | Kept the salvaged per-project pool; no global counter was silently substituted. |
| Dispatcher | Claim budget 2/tick, 15-second normal tick, self-rescheduling | 2-second reschedule | Kept the salvaged 15-second interval. |
| Pair merge | Salvaged adaptive implementation contains adjacent pair merge | Phase 3 describes one job per worker | Dispatcher uses the safe single-job sequential path; the pair helpers remain available but are not allowed to strand a second claimed row. |

## Implemented in this pass

- Durable lease fields (`leaseOwner`, `leaseToken`, `leaseVersion`, `leaseExpiresAt`) and watchdog indexes were added without removing salvaged fields.
- `claimJob` now serializes candidates, increments the lease version, enforces the first unfinished chunk per language, and caps project in-flight workers at two.
- Result and failure writes are lease-token fenced. Workers check cancellation before the request and again after the external call; a late result cannot write after cancellation or a newer claim.
- The dispatcher is a bounded tick: at most two language workers, no inline Gemini call, and a dispatcher lease prevents overlapping watchdog re-kicks.
- Watchdog reclaim now schedules dispatch for durable work and never revives `cancelled` projects. A translating project with no jobs is marked `stalled` and sent through safe resume.
- Resume derives missing work from persisted chunks, skips done chunks, resets stale leases, promotes due retries, and re-arms dispatch.
- The governor accepts a test-only `dailyBudgetOverride` used only by the deterministic gate action; production callers continue to use the guarded 1,200/day constant.
- No PDF-generation or UI files were changed in this phase.

## Gate evidence

### Backend gates

Command:

```text
bun convex dev --once && bun tsc -b --noEmit
```

Verbatim result:

```text
▌ Developing against deployment:
▌ [Development] freebuff:0370263a-98a2-4360-9987-295ca7297639:dev/vly-dev-service-account (dev) (dashboard: https://dashboard.convex.dev/t/freebuff/0370263a-98a2-4360-9987-295ca7297639/charming-stork-436)
▌ └─ https://charming-stork-436.convex.cloud
- Preparing Convex functions...
✔ Convex functions ready!
```

The Convex push and TypeScript gate passed after the final backend edits.

### T1–T7

Command:

```text
bun convex run phase3TestGates:runPhase3Gates '{}'
```

Verbatim result:

```text
✖ Failed to run function "phase3TestGates:runPhase3Gates":
Error: [Request ID: c348a57d0fc086d6] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.
error: "convex" exited with code 1
```

Therefore T1–T7 are **BLOCKED, not passed**. The deterministic backend action is present in `src/convex/phase3TestGates.ts`, but Convex will not execute any query, mutation, or action while this deployment is paused. The platform pause is external; code cannot run schedulers, workers, or the watchdog during the pause. Resume the deployment, then rerun the exact command above and preserve its JSON output before claiming the gates passed.

## Git/GitHub boundary

The requested per-module commit/push verification is not independently available in this environment because Git/GitHub commands are managed/blocked by the platform. No push was attempted from this session. The deployment and source changes are left for the platform-managed synchronization boundary.

## Blocker verification (2026-09-25, second pass)

### BLOCKER 1 — security

| Instruction | Status | Evidence |
|---|---|---|
| `git rm --cached .env.keys` + delete file | PARTIALLY DONE (environment-blocked) | Direct deletion of `.env.keys` was blocked by the sandbox (`Direct env and sensitive-file access is blocked`), and all Git/GitHub commands are platform-blocked. `.env.keys` still exists locally and must be deleted by the user. |
| `.gitignore` covers `.env*` except `.env.example`, `_salvage/` | ALREADY CORRECT | `.gitignore` contains `.env*`, `!.env.example`, `_salvage/`, `node_modules/`, `dist/`, `src/convex/_generated/`. |
| No hardcoded `fb_email_` key in `src/convex/auth/emailOtp.ts` | VERIFIED FIXED | `grep -R -n 'fb_email_' src` → `no fb_email_ matches in src/`. The file reads `"x-api-key": process.env.EMAIL_API_KEY ?? ""`. |
| Commit + GitHub verification | BLOCKED | `git` commands are platform-blocked (`Git and GitHub commands are blocked; Vly manages version control.`). The user must delete `.env.keys`, and the platform-managed sync must be confirmed on github.com. |

**User duties (cannot be done from the sandbox):**
1. Delete `.env.keys` from the workspace and from GitHub history (the `DOTENV_PRIVATE_KEY_LOCAL` inside it is public — rotate it at dotenvx; old value is compromised forever).
2. If `_salvage/` was ever pushed, untrack it (`git rm -r --cached _salvage/`) and purge it from history — the ignore rule only prevents future commits.
3. Rotate the old `fb_email_...` email key (its value was public regardless of the code fix).

### BLOCKER 2 — paused deployment

The pause is confirmed and current. Verbatim, from this pass:

```text
$ bun convex run phase3TestGates:runPhase3Gates '{}'
✖ Failed to run function "phase3TestGates:runPhase3Gates":
Error: [Request ID: f562406a01323de9] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.
error: "convex" exited with code 1

$ curl -X POST https://charming-stork-436.convex.cloud/api/query ...
{"status":"error","errorMessage":"[Request ID: 602881c19302e815] Server Error\nCannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.\n"}
```

The deployment's function-push path still authenticates (`bun convex dev --once` pushes fine) — only execution is paused. Alternatives were attempted and are blocked here:

```text
$ bunx convex deployment create local
✖ Creating a deployment isn't supported with a deploy key (CONVEX_DEPLOY_KEY). Run npx convex login (or use a project key) and try again.
```

So the deployment is Freebuff-managed and paused; nothing can run until it is resumed. Per the honesty rule: while paused there is no scheduler, no watchdog, no dispatcher.

### BLOCKER 3 — run the gates

The deterministic gates are implemented and deployed (registered on the deployment per `bun convex function-spec`: `phase3TestGates.js:runPhase3Gates` plus fixtures). They cannot execute until Blocker 2 is cleared. Status remains **UNPROVEN**.

**Exact runbook once the deployment is live** (one command; no keys consumed, no real Gemini calls — the gates use fixture rows and the production mutations):

```text
bun convex run phase3TestGates:runPhase3Gates '{}'
```

Expected: JSON with `evidence.T1`–`evidence.T7`, each `{ pass, ... }`, and a top-level `allPassed`. Paste the verbatim JSON into this file under "Gate evidence". T6 asserts the old-docs behavior (governor `daily_paused` with jobs preserved), not a `paused_budget` status, because the salvaged architecture wins that conflict.

### Deployment decision (2026-09-25, blockers round 2)

The user declined creating a personal Convex account: **the project stays on the Freebuff-managed deployment `charming-stork-436`** (accepted trade-off from the start; compute pauses are the known risk of that choice, never hidden). The pause was re-checked after the round-2 instructions and is still active:

```text
$ bun convex run phase3TestGates:runPhase3Gates '{}'
✖ Failed to run function "phase3TestGates:runPhase3Gates":
Error: [Request ID: 9de3fd45ad215c68] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.
error: "convex" exited with code 1
```

Because the deployment is Freebuff-managed, resuming it is a Freebuff platform action, not a Convex-dashboard action. The single remaining blocker for the gates is the user resuming this deployment (or letting the platform's activity-based auto-resume fire), after which one command runs all gates:

```text
bun convex run phase3TestGates:runPhase3Gates '{}'
```

Git untracking (`.env.keys`, `_salvage/`) also remains user-side: the platform blocks both direct sensitive-file deletion and all Git/GitHub commands here. The dotenvx rotation warning stands — the leaked `DOTENV_PRIVATE_KEY_LOCAL` is compromised forever until rotated.

## Honest ETA

The salvaged operating target is 10 RPM across the five-key quota pool, so 92 chunks have a 9.2-minute rate floor per language before latency and retries (realistically about 15–25 minutes). Twenty languages × 92 chunks is 1,840 calls: about 3h04m at the rate floor, and the 1,200/day budget can span more than one day. The target is never automatically increased.
