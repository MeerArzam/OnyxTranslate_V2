// PHASE 0 — FILE INVENTORY BUILDER.
// Parses the salvaged convex-functions*.html docs (which contain FULL REAL
// SOURCE of the old backend) and produces _salvage/FILE-INVENTORY.md:
// every backend file, its functions/signatures, constants, and code size.
// Usage: node scripts/salvage/build-inventory.mjs

import { readFile, writeFile } from "node:fs/promises";

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

function extractSections(html) {
  // <h2>convex/foo.ts — full real source</h2> ... <pre> blocks
  const sections = [];
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  const heads = [...html.matchAll(re)];
  for (let i = 0; i < heads.length; i++) {
    const title = decodeEnt(heads[i][1].replace(/<[^>]+>/g, "")).trim();
    const start = heads[i].index + heads[i][0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index : html.length;
    const body = html.slice(start, end);
    const code = [...body.matchAll(/<pre[\s\S]*?<\/pre>/gi)]
      .map((m) => decodeEnt(m[0].replace(/<[^>]+>/g, "")))
      .join("\n\n");
    sections.push({ title, code });
  }
  return sections;
}

function analyze(code) {
  const lines = code.split("\n");
  const fns = [];
  const constRe =
    /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(query|mutation|action|internalQuery|internalMutation|internalAction|httpAction)/g;
  for (const m of code.matchAll(constRe)) {
    // capture args block if present
    const after = code.slice(m.index, m.index + 400);
    const argsMatch = after.match(/args:\s*{([^}]*)}/s);
    const args = argsMatch ? argsMatch[1].replace(/\s+/g, " ").trim().slice(0, 220) : "";
    fns.push({ name: m[1], kind: m[2], args });
  }
  const plainFns = [];
  for (const m of code.matchAll(
    /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/gm,
  )) {
    plainFns.push({ name: m[1], params: m[2].replace(/\s+/g, " ").trim().slice(0, 220) });
  }
  const consts = [];
  for (const m of code.matchAll(
    /^(?:export\s+)?const\s+([A-Z][A-Z0-9_]{2,})\s*(?::[^=]+)?=\s*(.+?);?\s*$/gm,
  )) {
    consts.push({ name: m[1], value: m[2].replace(/\s+/g, " ").trim().slice(0, 160) });
  }
  const phaseRules = (code.match(/\["P\d+"/g) || []).length;
  return { lines: lines.length, fns, plainFns, consts, phaseRules };
}

async function main() {
  let md = `# OnyxTranslate Backend File Inventory — Phase 0 Gate Document
Generated: ${new Date().toISOString()}
Source: salvaged /docs/convex-functions*.html (self-described "full real source" pages)
Status legend: ✅ REAL SOURCE recovered · 📋 SPEC-ONLY (behavior + constants documented in overview-dashboard, source not in docs set)

> Gate: Phase 2 backend code may not be written before this inventory is reviewed.

`;

  const totals = { files: 0, functions: 0, lines: 0 };
  const specOnly = [
    ["convex/translationConfig.ts", "TRANSLATION_CONFIG single source of truth (overview §2 Constants table = every value)"],
    ["convex/adaptiveJobs.ts", "job claim/lease/heartbeat/pair-merge/rate-limiter/governor/flush/zip-finalize (adaptiveJobs.ts:305/422/968/1002)"],
    ["convex/adaptiveDispatcher.ts", "dispatcherTick wrapper + dispatcherTickInner, recordDispatcherError, 20s deadline, claim budget 2/tick, heartbeat"],
    ["convex/adaptiveWatchdog.ts", "3-min cron PRIMARY driver; revives legacy + adaptive; per-project try/catch; persisted telemetry"],
    ["convex/adaptivePdf.ts", "50→25→10 batch plan/shrink/slice/render; assembleLanguagePdf (adaptivePdf.ts:62/136/252/294)"],
    ["convex/resumeServerProject.ts", "safe resume: preserves completed chunks, reclaims ONLY expired leases, Pacific-only governor reset, getServerJobStatus"],
    ["convex/buildTranslationPrompt.ts", "PROMPT_VERSION gemini-contract-v1 canonical builder (3 call sites)"],
    ["convex/translationContract.ts", "strict JSON envelope + selfCheck validators, retry-once-stricter, needs_review terminal"],
    ["convex/languageRules.ts", "LANGUAGE_RULES 20-lang table, filterGeneratedArtifacts, evaluateLanguageQA, assembleWithBoundaryRepair"],
    ["convex/adaptiveTestProbes.ts", "probeGovernorLadder/probeRateSnapshot/probeClaimAndAbandon (test harnesses)"],
    ["convex/forensicProbe.ts", "P0 forensic probe for the frozen 14/92 project"],
  ];

  for (const page of PAGES) {
    const html = await readFile(`_salvage/docs/${page}`, "utf8");
    const sections = extractSections(html).filter(
      (s) => /convex\//.test(s.title) && s.code.length > 100,
    );
    if (sections.length === 0) continue;
    md += `\n## ${page}\n\n`;
    for (const sec of sections) {
      const a = analyze(sec.code);
      totals.files++;
      totals.functions += a.fns.length + a.plainFns.length;
      totals.lines += a.lines;
      md += `### ✅ ${sec.title.replace(/ — full real source.*$/i, "")} — REAL SOURCE (${a.lines} lines)\n\n`;
      if (a.fns.length) {
        md += `**Convex functions (${a.fns.length}):**\n\n`;
        for (const f of a.fns) {
          md += `- \`${f.kind} ${f.name}\`${f.args ? ` · args: \`${f.args}\`` : ""}\n`;
        }
        md += "\n";
      }
      if (a.plainFns.length) {
        md += `**Helper functions (${a.plainFns.length}):**\n\n`;
        for (const f of a.plainFns) md += `- \`${f.name}(${f.params})\`\n`;
        md += "\n";
      }
      if (a.consts.length) {
        md += `**Constants:**\n\n`;
        for (const c of a.consts) md += `- \`${c.name} = ${c.value}\`\n`;
        md += "\n";
      }
      if (a.phaseRules) md += `**PHASE_RULES entries embedded:** ${a.phaseRules}\n\n`;
    }
  }

  md += `\n## 📋 Spec-only files (adaptive core — reimplement from overview spec)\n\n`;
  for (const [f, d] of specOnly) md += `- \`${f}\` — ${d}\n`;

  md += `\n## Totals\n\n- Real-source backend files recovered: **${totals.files}**\n- Functions/signatures inventoried: **${totals.functions}**\n- Verbatim code lines recovered: **${totals.lines}**\n- Spec-only files to reimplement: **${specOnly.length}**\n- Frontend bundle: \`_salvage/assets/index-BdJdZrIT.js\` (604,715 B, minified — reference for UI behavior)\n- Full docs text: \`_salvage/docs-txt/*.txt\` (7,526 lines)\n`;

  await writeFile("_salvage/FILE-INVENTORY.md", md, "utf8");
  console.log(
    `Inventory written: ${totals.files} real-source files, ${totals.functions} functions, ${totals.lines} lines`,
  );
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
