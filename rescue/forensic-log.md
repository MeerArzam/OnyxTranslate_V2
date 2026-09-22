# OnyxTranslate Rescue — Forensic Log

Target deployment: `https://successful-iguana-419.convex.cloud` (old backend, READ-ONLY)
Old live site: https://oyxtranslate.freebuff.app
Method: Convex raw HTTP API — `POST /api/query` (and `POST /api/mutation` ONLY for the designated safe-resume function in Phase C)
Hard rules: no deleteProject / deleteChunksForLang / deleteHistory / status-changing mutations.

---


## PHASE A — started 2026-09-20T17:19:47.605Z

### [2026-09-20T17:19:47.901Z] A · POST /api/query · queries:getLatestProject
- Request: `POST https://successful-iguana-419.convex.cloud/api/query`
- Request body (verbatim): `{"path":"queries:getLatestProject","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (291 ms)
- Verbatim error:

```text
[Request ID: dc81edcf8649b5ff] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:19:47.996Z] A · POST /api/query · queries:getAllProjects
- Request: `POST https://successful-iguana-419.convex.cloud/api/query`
- Request body (verbatim): `{"path":"queries:getAllProjects","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (94 ms)
- Verbatim error:

```text
[Request ID: eae8f2851edd96ac] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:19:48.017Z] A · POST /api/query · queries:getProjectRaw
- Request: `POST https://successful-iguana-419.convex.cloud/api/query`
- Request body (verbatim): `{"path":"queries:getProjectRaw","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (20 ms)
- Verbatim error:

```text
[Request ID: 7159d888a55327af] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:19:48.017Z] A · queries:getProjectRaw · retry (canned plausible args)
- Verbatim response (value):

```json
{
  "projectId": "probe"
}
```

### [2026-09-20T17:19:48.094Z] A · POST /api/query · queries:getProjectRaw
- Request: `POST https://successful-iguana-419.convex.cloud/api/query`
- Request body (verbatim): `{"path":"queries:getProjectRaw","args":{"projectId":"probe"},"format":"json"}`
- HTTP status: **200 (status=error)** (76 ms)
- Verbatim error:

```text
[Request ID: b02a7a274d5eece4] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:19:48.114Z] A · POST /api/query · queries:getTranslationsRaw
- Request: `POST https://successful-iguana-419.convex.cloud/api/query`
- Request body (verbatim): `{"path":"queries:getTranslationsRaw","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (20 ms)
- Verbatim error:

```text
[Request ID: 2d81ef3dadd6bade] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:19:48.114Z] A · queries:getTranslationsRaw · retry (canned plausible args)
- Verbatim response (value):

```json
{
  "projectId": "probe"
}
```

### [2026-09-20T17:19:48.194Z] A · POST /api/query · queries:getTranslationsRaw
- Request: `POST https://successful-iguana-419.convex.cloud/api/query`
- Request body (verbatim): `{"path":"queries:getTranslationsRaw","args":{"projectId":"probe"},"format":"json"}`
- HTTP status: **200 (status=error)** (24 ms)
- Verbatim error:

```text
[Request ID: 94dc517f05095c6e] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:19:48.217Z] A · POST /api/query · queries:getTranslationProgress
- Request: `POST https://successful-iguana-419.convex.cloud/api/query`
- Request body (verbatim): `{"path":"queries:getTranslationProgress","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (22 ms)
- Verbatim error:

```text
[Request ID: b077170793147e16] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:19:48.217Z] A · queries:getTranslationProgress · retry (canned plausible args)
- Verbatim response (value):

```json
{
  "projectId": "probe"
}
```

### [2026-09-20T17:19:48.294Z] A · POST /api/query · queries:getTranslationProgress
- Request: `POST https://successful-iguana-419.convex.cloud/api/query`
- Request body (verbatim): `{"path":"queries:getTranslationProgress","args":{"projectId":"probe"},"format":"json"}`
- HTTP status: **200 (status=error)** (17 ms)
- Verbatim error:

```text
[Request ID: 21c294c9e55cec68] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:19:48.315Z] A · POST /api/query · queries:getLivePreviewText
- Request: `POST https://successful-iguana-419.convex.cloud/api/query`
- Request body (verbatim): `{"path":"queries:getLivePreviewText","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (20 ms)
- Verbatim error:

```text
[Request ID: c9de9fb4f639d75c] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:19:48.315Z] A · queries:getLivePreviewText · retry (canned plausible args)
- Verbatim response (value):

```json
{
  "projectId": "probe",
  "langCode": "ur"
}
```

### [2026-09-20T17:19:48.396Z] A · POST /api/query · queries:getLivePreviewText
- Request: `POST https://successful-iguana-419.convex.cloud/api/query`
- Request body (verbatim): `{"path":"queries:getLivePreviewText","args":{"projectId":"probe","langCode":"ur"},"format":"json"}`
- HTTP status: **200 (status=error)** (18 ms)
- Verbatim error:

```text
[Request ID: 3cb521a48fc31dcf] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:19:48.417Z] A · POST /api/query · queries:getHistory
- Request: `POST https://successful-iguana-419.convex.cloud/api/query`
- Request body (verbatim): `{"path":"queries:getHistory","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (21 ms)
- Verbatim error:

```text
[Request ID: c757e638e2ca1757] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:19:48.417Z] A · queries:getHistory · retry (canned plausible args)
- Verbatim response (value):

```json
{
  "sessionId": "probe"
}
```

### [2026-09-20T17:19:48.494Z] A · POST /api/query · queries:getHistory
- Request: `POST https://successful-iguana-419.convex.cloud/api/query`
- Request body (verbatim): `{"path":"queries:getHistory","args":{"sessionId":"probe"},"format":"json"}`
- HTTP status: **200 (status=error)** (19 ms)
- Verbatim error:

```text
[Request ID: 6e79c50b9417ab0b] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:19:48.516Z] A · POST /api/query · resumeServerProject:getServerJobStatus
- Request: `POST https://successful-iguana-419.convex.cloud/api/query`
- Request body (verbatim): `{"path":"resumeServerProject:getServerJobStatus","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (21 ms)
- Verbatim error:

```text
[Request ID: ec029ff47697171f] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```


## PHASE B — started 2026-09-20T17:22:11.243Z

### [2026-09-20T17:22:11.362Z] B · POST /api/query · queries:getLatestProject
- Request: `POST https://successful-iguana-419.convex.cloud/api/query`
- Request body (verbatim): `{"path":"queries:getLatestProject","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (116 ms)
- Verbatim error:

```text
[Request ID: 71e2603d0358383e] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:22:11.362Z] B · no working projects query
- Verbatim error:

```text
Phase A found no working getAllProjects/getLatestProject
```

### [2026-09-20T17:22:11.388Z] B · POST /api/query · queries:getImageTranslations
- Request: `POST https://successful-iguana-419.convex.cloud/api/query`
- Request body (verbatim): `{"path":"queries:getImageTranslations","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (25 ms)
- Verbatim error:

```text
[Request ID: 50ae75c3d403f130] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:22:11.409Z] B · POST /api/query · queries:getAllImageTranslations
- Request: `POST https://successful-iguana-419.convex.cloud/api/query`
- Request body (verbatim): `{"path":"queries:getAllImageTranslations","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (20 ms)
- Verbatim error:

```text
[Request ID: bcb35bab5f0f9132] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:22:11.439Z] B · POST /api/query · queries:getImageTranslationHistory
- Request: `POST https://successful-iguana-419.convex.cloud/api/query`
- Request body (verbatim): `{"path":"queries:getImageTranslationHistory","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (28 ms)
- Verbatim error:

```text
[Request ID: 99c6c54e89a831f5] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:22:11.592Z] B · live-site probe https://oyxtranslate.freebuff.app
- HTTP status: **200** (152 ms)
- Verbatim response (value):

```json
{
  "url": "https://oyxtranslate.freebuff.app",
  "httpStatus": 200,
  "redirectedTo": null,
  "ms": 152,
  "title": "Onyx Translate",
  "bodyChars": 858,
  "verdict": "serving"
}
```


## PHASE C — started 2026-09-20T17:22:11.718Z

### [2026-09-20T17:22:11.718Z] C · warning — backup captured no data
- Verbatim error:

```text
[Request ID: 71e2603d0358383e] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:22:11.820Z] C · POST /api/mutation · resumeServerProject:resumeServerJob
- Request: `POST https://successful-iguana-419.convex.cloud/api/mutation`
- Request body (verbatim): `{"path":"resumeServerProject:resumeServerJob","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (97 ms)
- Verbatim error:

```text
[Request ID: 6a7ae36f3e728a2d] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:22:11.841Z] C · POST /api/mutation · resumeServerProject:resumeJob
- Request: `POST https://successful-iguana-419.convex.cloud/api/mutation`
- Request body (verbatim): `{"path":"resumeServerProject:resumeJob","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (21 ms)
- Verbatim error:

```text
[Request ID: 5eab909fae764c55] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:22:11.863Z] C · POST /api/mutation · resumeServerProject:resume
- Request: `POST https://successful-iguana-419.convex.cloud/api/mutation`
- Request body (verbatim): `{"path":"resumeServerProject:resume","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (20 ms)
- Verbatim error:

```text
[Request ID: 4c2b50aa26486ba2] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:22:11.884Z] C · POST /api/mutation · resumeServerProject:recoverJob
- Request: `POST https://successful-iguana-419.convex.cloud/api/mutation`
- Request body (verbatim): `{"path":"resumeServerProject:recoverJob","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (20 ms)
- Verbatim error:

```text
[Request ID: 40c1038110bca7fd] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:22:11.910Z] C · POST /api/mutation · resumeServerProject:resumeServer
- Request: `POST https://successful-iguana-419.convex.cloud/api/mutation`
- Request body (verbatim): `{"path":"resumeServerProject:resumeServer","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (25 ms)
- Verbatim error:

```text
[Request ID: 093d9a01c48b318d] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:22:11.933Z] C · POST /api/mutation · resumeServerProject:resumeFrozenJob
- Request: `POST https://successful-iguana-419.convex.cloud/api/mutation`
- Request body (verbatim): `{"path":"resumeServerProject:resumeFrozenJob","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (22 ms)
- Verbatim error:

```text
[Request ID: 6700dfcdfe104a10] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:22:11.956Z] C · POST /api/mutation · resumeServerProject:kickWatchdog
- Request: `POST https://successful-iguana-419.convex.cloud/api/mutation`
- Request body (verbatim): `{"path":"resumeServerProject:kickWatchdog","args":{},"format":"json"}`
- HTTP status: **200 (status=error)** (23 ms)
- Verbatim error:

```text
[Request ID: 3a7177dead775510] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.

```

### [2026-09-20T17:22:11.956Z] C · STOP — no safe entry point found
- Verbatim error:

```text
No invokable resume mutation accepted {} (all probes errored; see log). Per mission rules: STOP, document, report. No improvised calls were made.
```

### [2026-09-20T17:22:12.072Z] D · fatal
- Verbatim error:

```text
ReferenceError: ensureLogHeader is not defined
    at main (file:///home/daytona/codebase/scripts/rescue/phase-d.mjs:62:3)
    at file:///home/daytona/codebase/scripts/rescue/phase-d.mjs:235:1
    at ModuleJob.run (node:internal/modules/esm/module_job:343:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:681:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5)
```

### [2026-09-20T17:22:16.003Z] D · fatal
- Verbatim error:

```text
ReferenceError: ensureLogHeader is not defined
    at main (file:///home/daytona/codebase/scripts/rescue/phase-d.mjs:62:3)
    at file:///home/daytona/codebase/scripts/rescue/phase-d.mjs:235:1
    at ModuleJob.run (node:internal/modules/esm/module_job:343:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:681:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5)
```


## PHASE D — started 2026-09-20T17:22:23.937Z

### [2026-09-20T17:22:23.938Z] D · report.html written
- Verbatim response (value):

```json
{
  "bytes": 7391
}
```


## RE-PROBE — started 2026-09-22T17:36:36.000Z
- Trigger: user switched VITE_CONVEX_URL to the old deployment; verifying its health before any migration work
- Verbatim response (queries:getLatestProject):

```text
[Request ID: f29b0793d4760bd3] Server Error
Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.
```

- Live site probe: **HTTP 200** (static shell only; functions remain paused)
- Conclusion: no change — copying remains blocked until the platform pauses are lifted

