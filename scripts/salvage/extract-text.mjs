// PHASE 0 — DOC TEXT EXTRACTOR.
// Converts salvaged docs HTML into plain text (code blocks preserved as-is)
// under _salvage/docs-txt/ so they can be grepped/read for the inventory.
// Usage: node scripts/salvage/extract-text.mjs

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const IN = "_salvage/docs";
const OUT = "_salvage/docs-txt";

function decodeEnt(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function htmlToText(html) {
  // capture <title>
  const title = decodeEnt((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "");
  // isolate code blocks first (pre + .code/.language-* regions)
  const codeChunks = [];
  let h = html.replace(/<pre[\s\S]*?<\/pre>/gi, (m) => {
    codeChunks.push("\n```\n" + decodeEnt(m.replace(/<[^>]+>/g, "")) + "\n```\n");
    return `\u0000CODE${codeChunks.length - 1}\u0000`;
  });
  // drop scripts/styles
  h = h.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  // block-level boundaries → newlines
  h = h.replace(/<\/(div|p|li|tr|h[1-6]|section|article|table|ul|ol|blockquote)>/gi, "\n");
  h = h.replace(/<br\s*\/?>/gi, "\n");
  h = h.replace(/<\/(td|th)>/gi, " | ");
  // strip remaining tags
  h = h.replace(/<[^>]+>/g, "");
  h = decodeEnt(h);
  // restore code
  h = h.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => codeChunks[Number(i)]);
  // collapse whitespace (not inside code fences)
  const parts = h.split(/\n/);
  const out = [];
  let inCode = false;
  for (const line0 of parts) {
    const line = line0.trim();
    if (line === "```") {
      inCode = !inCode;
      out.push("```");
      continue;
    }
    out.push(inCode ? line0.replace(/\s+$/, "") : line.replace(/\s{2,}/g, " "));
  }
  const text = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return (title ? `${title}\n${"=".repeat(title.length)}\n\n` : "") + text + "\n";
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const files = (await readdir(IN)).filter((f) => f.endsWith(".html"));
  for (const f of files) {
    const html = await readFile(join(IN, f), "utf8");
    const text = htmlToText(html);
    await writeFile(join(OUT, f.replace(/\.html$/, ".txt")), text, "utf8");
    console.log(`${f} → ${text.length} chars`);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
