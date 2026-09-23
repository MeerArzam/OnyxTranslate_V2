// PHASE 0 — SOURCE EXTRACTOR.
// Writes each backend file's recovered real source to _salvage/backend-src/.
// These are REFERENCE copies (never imported at runtime) for faithful rebuild.
// Usage: node scripts/salvage/extract-source.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const PAGES = [
  "convex-functions.html",
  "convex-functions-2.html",
  "convex-functions-3.html",
  "convex-functions-4.html",
  "convex-functions-5.html",
];

const decodeEnt = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

async function main() {
  await mkdir("_salvage/backend-src", { recursive: true });
  const manifest = [];
  for (const page of PAGES) {
    const html = await readFile(`_salvage/docs/${page}`, "utf8");
    const heads = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
    for (let i = 0; i < heads.length; i++) {
      const title = decodeEnt(heads[i][1].replace(/<[^>]+>/g, "")).trim();
      const m = title.match(/^(convex\/[\w-]+\.ts)/);
      if (!m) continue;
      const path = m[1];
      const start = heads[i].index + heads[i][0].length;
      const end = i + 1 < heads.length ? heads[i + 1].index : html.length;
      const body = html.slice(start, end);
      const code = [...body.matchAll(/<pre[\s\S]*?<\/pre>/gi)]
        .map((x) => decodeEnt(x[0].replace(/<[^>]+>/g, "")))
        .join("\n\n");
      if (code.length < 100) continue;
      const out = join("_salvage/backend-src", path.replace("convex/", ""));
      await writeFile(out, code + "\n", "utf8");
      manifest.push({ path, file: out, lines: code.split("\n").length, bytes: code.length });
      console.log(`${path.padEnd(28)} ${String(code.split("\n").length).padStart(5)} lines`);
    }
  }
  await writeFile(
    "_salvage/backend-src/MANIFEST.json",
    JSON.stringify({ extractedAt: new Date().toISOString(), files: manifest }, null, 2),
    "utf8",
  );
  console.log(`\n${manifest.length} reference sources extracted → _salvage/backend-src/`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
