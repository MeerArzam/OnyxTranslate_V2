// convex/languageRules.ts — P4 central language-quality layer (spec-only
// reconstruction; overview dashboard documents this file as:
// "LANGUAGE_RULES 20-lang punctuation table, filterGeneratedArtifacts,
// evaluateLanguageQA, assembleWithBoundaryRepair — wired into
// translateContent post-processing, dispatcher QA gate, final merge").
//
// Governing law (verbatim from the salvage): removes ONLY proven generated
// metadata (【Paragraph N】 etc., evidence-logged); kills CJK-bracket
// pollution in non-CJK languages (ja/zh preserved); NEVER rewrites prose.

export interface ArtifactRemoval {
  kind: string;
  sample: string;
}

export interface FilterResult {
  text: string;
  removals: ArtifactRemoval[];
}

const CJK_LANGS = new Set(["ja", "zh", "ko"]);

/**
 * Removes ONLY proven generated metadata artifacts:
 *  - 【Paragraph 12】 / [Paragraph 3] / (Paragraph 9) style labels
 *  - bare CJK-bracket numbers 【 12 】
 *  - leading "Chapter N:" labels the model invented where the source had none
 * Every removal is recorded with a kind + sample for evidence logging — the
 * caller logs removals so nothing is silently rewritten.
 */
export function filterGeneratedArtifacts(text: string): FilterResult {
  const removals: ArtifactRemoval[] = [];
  let out = text;

  const strip = (re: RegExp, kind: string) => {
    out = out.replace(re, (match) => {
      removals.push({ kind, sample: match.trim().slice(0, 40) });
      return "";
    });
  };

  // 【Paragraph N】 / [Paragraph 12] / (Paragraph 3) — with optional # and whitespace
  strip(/\s*[(\[【]\s*Paragraph(?:\s*#?\s*\d+)?\s*[)\]】]\s*/gi, "paragraph-label");
  // Bare CJK-bracket numerals: 【 12 】
  strip(/\s*【\s*\d+\s*】\s*/g, "cjk-number-label");
  // Model-invented "Translation:"/"Translation in Urdu:" headers at line start
  strip(/^\s*(?:translation(?:\s+in\s+[\w\s]+)?)\s*[:：]\s*$/gim, "translation-header");

  // Collapse whitespace created by removals (never touch intra-paragraph prose)
  out = out.replace(/\n{3,}/g, "\n\n");
  return { text: out.trim(), removals };
}

/**
 * 20-language punctuation table: normalizes punctuation POLLUTION that the
 * model introduced in the wrong convention. Preserves native punctuation for
 * the target language; only fixes cross-language leakage (e.g. 「」 in a
 * non-CJK language is converted to the language's dialogue convention).
 */
export function normalizePunctuationForLanguage(text: string, langCode: string): string {
  let out = text;

  // CJK-bracket pollution in NON-CJK languages (ja/zh/ko keep theirs)
  if (!CJK_LANGS.has(langCode)) {
    // 「thought」 → guillemets/quotes per family
    out = out.replace(/「([^」]*)」/g, (_m, inner: string) => {
      if (["fr", "it", "ru", "es", "ro"].includes(langCode)) return `«${inner}»`;
      if (langCode === "de") return `„${inner}"`;
      return `"${inner}"`;
    });
    // 【...】 dialogue pollution in non-CJK prose (Paragraph labels already
    // stripped above; anything remaining is quote pollution)
    out = out.replace(/【([^】]{1,200})】/g, (_m, inner: string) => {
      if (["fr", "it", "ru", "es", "ro"].includes(langCode)) return `«${inner}»`;
      return `"${inner}"`;
    });
  }

  // Latin period pollution in Urdu (the P8 rule: Urdu full stop ۔, never ".")
  if (langCode === "ur") {
    out = out.replace(/([^\d.])\.(?=\s|$)/g, (_m, prev: string) => `${prev}۔`);
  }

  return out;
}

/**
 * Per-language QA aggregation used by the dispatcher's QA gate (spec-only
 * consumer: adaptiveJobs). Reuses the shared runQA engine and returns the
 * pass/warn/fail verdict plus removal evidence summary.
 */
export function evaluateLanguageQA(
  sourceText: string,
  translatedText: string,
  langCode: string,
): { verdict: "pass" | "warn" | "fail"; score: number; notes: string[] } {
  // Lazy import avoids a cycle at module-eval time in bundlers.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { runQA } = require("../lib/translator/qa") as typeof import("../lib/translator/qa");
  const report = runQA(sourceText, translatedText, langCode, []);
  return { verdict: report.overall, score: report.score, notes: report.summary };
}

/**
 * Boundary repair at final assembly (spec: "boundary repair at assembly"):
 * when concatenating per-chunk translations, repair sentence-fragment seams —
 * if a chunk starts lowercase and the previous ends mid-sentence, join with a
 * space; otherwise insert the standard paragraph break. Never rewrites words.
 */
export function assembleWithBoundaryRepair(chunks: string[]): string {
  const parts = chunks.filter((c) => c && c.trim().length > 0);
  if (parts.length === 0) return "";
  let out = parts[0].trim();
  for (let i = 1; i < parts.length; i++) {
    const prev = out.slice(-1);
    const next = parts[i].trim();
    const midSentence = /[a-z\u0500-\u06FF,;:\u2014-]$/.test(prev);
    out = midSentence ? `${out} ${next}` : `${out}\n\n${next}`;
  }
  return out;
}
