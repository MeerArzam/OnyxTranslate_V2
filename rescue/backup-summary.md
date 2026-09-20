# OnyxTranslate Rescue — Backup Summary

- Captured (UTC): 2026-09-20T17:22:11.362Z
- Source: `https://successful-iguana-419.convex.cloud` (old backend, read-only raw HTTP API)
- Backup file: `onyx-backup-20260920T172211Z.json`
- Status: **BLOCKED_DEPLOYMENT_PAUSED** · data captured: **NO**

## ⚠️ Blocker — deployment paused

No data could be read. Every query on the old deployment returns the platform error below.
The backup JSON on disk is an honest empty dump (0 rows) — it preserves NO progress.

```text
[Request ID: 71e2603d0358383e] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.
```

Next step: have Freebuff/Convex dashboard admin resume the `successful-iguana-419` deployment, then re-run `npm run rescue`.

## Row counts per table

| Table | Rows |
| --- | --- |
| projects | 0 |
| translations | 0 |
| chunks | 0 |
| imageTranslations | 0 |

## Frozen 672-page job (Urdu 14/92) — exact state

_No translation doc with completedChunks/totalChunks/governor fields matched the 14/92 fingerprint; see full backup JSON for raw docs._
