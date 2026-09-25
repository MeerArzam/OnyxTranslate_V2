# Phase 3 adaptive freeze-proof pipeline

Date: 2026-09-25
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

## Honest ETA

The salvaged operating target is 10 RPM across the five-key quota pool, so 92 chunks have a 9.2-minute rate floor per language before latency and retries (realistically about 15–25 minutes). Twenty languages × 92 chunks is 1,840 calls: about 3h04m at the rate floor, and the 1,200/day budget can span more than one day. The target is never automatically increased.
