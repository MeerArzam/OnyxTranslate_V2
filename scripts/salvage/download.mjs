// PHASE 0 — SALVAGE DOWNLOADER (read-only fetch from the old live site).
// Downloads every .js/.css asset referenced by the raw HTML plus the full
// /docs/ technical set into _salvage/, verifies each artifact (status, size,
// content sniff), and writes _salvage/manifest.json with SHA-256 hashes.
// Usage: node scripts/salvage/download.mjs
//
// NOTE: the rebuild prompt names /assets/index-D608_tX5.js; a live probe on
// 2026-09-22 found /assets/index-BdJdZrIT.js. This script trusts the LIVE HTML
// as ground truth and records both facts in the manifest.

import { createHash } from "node:crypto";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const BASE = "https://oyxtranslate.freebuff.app";
const OUT = "_salvage";

const DOCS = [
  "overview-dashboard.html",
  "architecture.html",
  "translation-pipeline.html",
  "frontend.html",
  "convex-functions.html",
  "convex-functions-2.html",
  "convex-functions-3.html",
  "convex-functions-4.html",
  "convex-functions-5.html",
  "history.html",
  "live-tests.html",
];

const logPath = join(OUT, "salvage-log.md");
const entries = [];

async function log(line) {
  console.log(line);
  await appendFile(logPath, line + "\n", "utf8").catch(() => {});
}

async function fetchTo(dest, url) {
  const res = await fetch(url, { redirect: "follow" });
  const buf = Buffer.from(await res.arrayBuffer());
  const sniff =
    buf.length === 0
      ? "empty"
      : buf[0] === 0x3c
        ? "text/html"
        : buf.subarray(0, 200).toString("utf8").includes("<!doctype")
          ? "text/html"
          : /^[A-Za-z0-9_{}[\]()@:;,.!#*\s-]+$/.test(buf.subarray(0, 400).toString("latin1"))
            ? "text/other"
            : "binary";
  const sha = createHash("sha256").update(buf).digest("hex").slice(0, 16);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  const entry = {
    url,
    dest,
    status: res.status,
    bytes: buf.length,
    sniff,
    sha256_16: sha,
  };
  entries.push(entry);
  await log(
    `- ${res.status} ${String(buf.length).padStart(8)}B ${sniff.padEnd(10)} ${dest.replace(OUT + "/", "")} ← ${url}`,
  );
  if (res.status !== 200 || buf.length === 0) {
    entry.failed = true;
    await log(`  ⚠️ FAILED: status ${res.status}, ${buf.length} bytes — recorded, not fatal`);
  }
  return entry;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await writeFile(
    logPath,
    `# Salvage Log — ${new Date().toISOString()}\nSource: ${BASE} (old live site, static; read-only fetch)\n\n## Fetches\n`,
    "utf8",
  );
  await log("## Fetches\n");

  // 1) Raw HTML → discover real asset list
  const htmlEntry = await fetchTo(join(OUT, "index.html"), BASE);
  const html = htmlEntry.failed ? "" : (await import("node:fs")).readFileSync(htmlEntry.dest, "utf8");
  const assets = [
    ...new Set(
      [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]),
    ),
  ];
  await log(`\nAssets referenced by live HTML: ${JSON.stringify(assets)}\n`);
  for (const a of assets) {
    await fetchTo(join(OUT, a.replace(/^\//, "")), BASE + a);
  }

  // 2) Legacy asset name from the rebuild prompt (may 404 — record verbatim)
  await fetchTo(join(OUT, "assets/index-D608_tX5.js"), `${BASE}/assets/index-D608_tX5.js`);

  // 3) Full docs set
  for (const d of DOCS) {
    await fetchTo(join(OUT, "docs", d), `${BASE}/docs/${d}`);
  }

  const ok = entries.filter((e) => !e.failed);
  const failed = entries.filter((e) => e.failed);
  await writeFile(
    join(OUT, "manifest.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        base: BASE,
        expectedByPrompt: "/assets/index-D608_tX5.js",
        foundInLiveHtml: assets,
        files: entries,
        summary: { total: entries.length, ok: ok.length, failed: failed.length },
      },
      null,
      2,
    ),
    "utf8",
  );
  await log(
    `\n## Summary\n- total: ${entries.length} · ok: ${ok.length} · failed: ${failed.length}\n- manifest: _salvage/manifest.json\n`,
  );
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
