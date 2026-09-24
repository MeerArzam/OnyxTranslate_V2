// convex/buildTranslationPrompt.ts — THE canonical prompt builder (Thin
// Motherboard Phase 1; spec-only reconstruction). PROMPT_VERSION is stamped
// per translationJob; three call sites (translateContent, translateQueue,
// adaptiveJobs) delegate here so there is exactly ONE prompt source.
//
// Contract law (salvage verbatim): "Code asks. Gemini thinks. Code verifies."
// contract "plain" → the legacy prose contract (pure translated prose out).
// contract "gemini-contract-v1" → strict JSON envelope with selfCheck.

import { characterVoices } from "../lib/translator/voices";
import { getLocalizationConfig } from "../data/localization";
import glossaryData from "../data/glossary.json";

export const PROMPT_VERSION = "gemini-contract-v1";

export interface PromptRequest {
  sourceLanguage: string;
  targetLanguage: string;
  langCode: string;
  marketContext: "standard" | "high-censorship" | "romance-focused";
  contract: "plain" | "gemini-contract-v1";
  sourceText: string;
}

export interface PromptResult {
  system: string;
  user: string;
  promptVersion: string;
}

// ── 23-phase literary system (verbatim PHASE_RULES from the salvage) ──
export const PHASE_RULES: [string, string, string][] = [
  ["P1", "GLOSSARY & TERM FIDELITY", "Use EXACTLY the per-language terms from the locked glossary below (magic/military terms + proper nouns). Never invent synonyms."],
  ["P2", "PROPER NOUN & NAME CONSISTENCY", "Use the language's locked name spellings from the Name Map. Same name = same spelling every time, book-wide."],
  ["P3", "LITERAL-TO-NATURAL BRIDGE", "Translate the meaning, not word-for-word. If a literal rendering sounds unnatural, rephrase naturally while preserving meaning, imagery, and the book's voice."],
  ["P4", "CHARACTER VOICE & DIALOGUE", "Apply the Voice Matrix. Keep speaker attributions and line breaks intact; preserve dialogue turns 1:1."],
  ["P5", "TONE & REGISTER", "Match the register of this language's literary fantasy (poetic where the culture expects it, grounded where it doesn't). First-person internal monologue stays intimate; narration stays immersive."],
  ["P6", "CULTURAL CONTEXTUALIZATION & CENSORSHIP", "Apply market rules from the Market Context and the Profanity/Cultural map: euphemize profanity per market, handle intimacy per cultural norms, adapt political/religious content."],
  ["P7", "HONORIFICS & FORMALITY", "Apply the language's formality system (Japanese keigo, Korean jondaetmal, Urdu adab, French vous/tu, German Sie/du…). Drop formality in emotional-breaking scenes; escalate in formal/military scenes."],
  ["P8", "MULTI-SCRIPT & RTL FORMATTING", "Use the correct script. For RTL languages (ur/ar/ks) render naturally with ZERO English-order artifacts; use the language's native punctuation. For script languages, ZERO Latin-script words outside the allowed names."],
  ["P9", "MAGIC SYSTEM & FANTASY TERMINOLOGY", "Translate the magic system as a coherent hierarchy per the Magic System note. 'Rune' must never become a generic spell; keep ward/conduit/signet consistent."],
  ["P10", "DIALOGUE FLOW & PUNCTUATION", "Use this language's dialogue punctuation from the Dialogue Marks (French « », German „…, Japanese 「」, Spanish —, etc.). Keep interruptions, mid-sentence cuts (em-dashes) and beat breaks natural."],
  ["P11", "INTERNAL MONOLOGUE", "Keep Violet's first-person inner voice intimate, urgent, and emphasis-aware (reproduce italics/emphasis naturally in the target language); keep self-interruption and the 'I won't. I refuse.' rhythm."],
  ["P12", "ACTION PACING", "Keep fight scenes short, punchy, and immediate; preserve the sentence rhythm of action and chapter momentum."],
  ["P13", "ROMANCE & INTIMACY FILTERS", "Apply the language's market norms for romantic/intimate content — tasteful, natural, never clinical, never overly sanitized unless the market requires it."],
  ["P14", "PROFANITY & SLANG LOCALIZATION", "Replace English profanity with culturally equivalent (not literal) expressions; keep intensity levels matching the scene (mild vs. strong)."],
  ["P15", "POLITICAL & MILITARY SENSITIVITY", "Adapt war and political content per market rules; keep the story's meaning, don't editorialize. Use the Rank Map for military hierarchy."],
  ["P16", "DRAGON TELEPATHY FORMATTING", "Format dragon mental speech per language convention (「」/【】 for ja/ko/zh, italics or guillemets elsewhere); keep it distinct from spoken dialogue and keep the bond's intimacy."],
  ["P17", "VISUAL-ELEMENT EXTRACTION (PDF-AWARE)", "When translating text near images, maps or illustrations, keep captions and map labels translated and short enough to fit their text boxes."],
  ["P18", "SELF-VERIFICATION PASS", "Before replying, self-check this chunk against P1-P17 and fix violations silently."],
  ["P19", "CHAPTER HEADINGS, TOC & FRONT/BACK MATTER", "Translate chapter titles, the Contents list, the copyright page and acknowledgments in the same style as the body; keep chapter numbering consistent."],
  ["P20", "POETRY, SONGS, RITUALS & PROVERBS", "For verse, songs and ritual chants, prioritize naturalness and rhythm over literalness; keep line structure where possible; adapt proverbs idiomatically."],
  ["P21", "BOOK-WIDE CONSISTENCY & MEMORY LOCK", "The glossary, names, terms and style are locked: the same term must translate identically in every chapter, forever."],
  ["P22", "LAYOUT & TEXT-FIT", "Keep translated lines reasonably short so they fit the PDF text boxes; prefer concise phrasings; for RTL, expect right-aligned flow."],
  ["P23", "FINAL QA & PROOFREAD (deep reasoning)", "Do a final read-through as a native editor: fix grammar, unnatural phrasing, typos and any phase violations; the chunk must read like published fiction."],
];

const REASONING_PROTOCOL = [
  "1. PLAN — identify dialogue vs. narration vs. telepathy; spot glossary and name hits; flag culturally sensitive lines.",
  "2. DRAFT — translate with the language's natural grammar and register.",
  "3. SELF-CRITIQUE — check P1-P23 violations, unnatural phrasing, Latin leftovers.",
  "4. REFINE — rewrite once, silently fixing everything found.",
  "The user only ever sees the final refined text — never show the reasoning.",
];

const LOCKED_TERM_LIST = [
  "Signet", "Venin", "Sages", "Mavens", "Wards", "Empyrean", "Conduits",
  "Alloy", "Irid", "Dragon Rider", "Battle Wards", "Mending", "Squadron",
  "Basgiath", "Rune", "Scribe", "Rider",
];

function buildGlossaryColumn(langCode: string): string {
  const glossary = glossaryData.magicMilitary as Record<string, Record<string, string>>;
  const lines: string[] = [];
  for (const term of LOCKED_TERM_LIST) {
    const entry = glossary[term];
    if (!entry) continue;
    const target = entry[langCode] || entry.en;
    lines.push(`  - ${term} → ${target}`);
  }
  return lines.join("\n");
}

function buildNameMap(langCode: string): string {
  const cfg = getLocalizationConfig(langCode);
  if (!cfg) return "(no name map)";
  return Object.entries(cfg.names)
    .map(([en, localized]) => `  - ${en} → ${localized}`)
    .join("\n");
}

function buildMarketContext(marketContext: string): string {
  switch (marketContext) {
    case "high-censorship":
      return "HIGH-CENSORSHIP market: keep all intimacy strictly implied, euphemize profanity heavily, and adapt any political/religious content to local norms.";
    case "romance-focused":
      return "ROMANCE-FOCUSED market: lean into fated-pair emotion and chemistry with cultural subtlety; keep intimacy tasteful per local norms.";
    default:
      return "STANDARD market: publish-grade literary fantasy localization with age-appropriate content handling.";
  }
}

/**
 * Per-language punctuation map (salvage FIX 4c — carried into the canonical
 * builder so the contract is identical in plain and JSON modes).
 */
const PUNCTUATION_MAP: Record<string, string> = {
  fr: "Dialogue uses « » guillemets. Non-breaking space before » and after « is correct.",
  it: "Dialogue uses « » guillemets (Italian preference).",
  de: "Dialogue uses German quotes: opening „ (low), closing “ (high).",
  es: "Dialogue uses em-dash (—) at the start of speaker turns; « » optional.",
  pt: "Dialogue uses em-dash (—) or \" \" quotes.",
  ru: "Dialogue uses « » guillemets and — dashes for speaker turns.",
  ar: "Dialogue uses « » or \" \" quotes. Full stop is ۔ where natural; RTL flow must be native.",
  ur: "Dialogue uses \" \" quotes; full stop is ۔ (Urdu full stop) — NEVER use the Latin period.",
  ks: "Dialogue uses \" \" quotes; use Kashmiri/Arabic-script punctuation, never Latin periods.",
  hi: "Dialogue uses \" \" quotes; sentence end uses danda (।) optionally, otherwise standard full stop.",
  ne: "Dialogue uses \" \" quotes; danda (।) is the natural sentence end.",
  bn: "Dialogue uses \" \" quotes; sentence end uses daṛi (।).",
  ja: "Dialogue uses 「」; internal thoughts use 「」 (or 『』 for nested).",
  ko: "Dialogue uses \" \" or 「」; internal thoughts use 「」.",
  zh: "Dialogue uses \" \" (or 「」 in traditional contexts); internal thoughts use 「」.",
  la: "Standard \" \" quotes and classical punctuation conventions.",
  id: "Standard \" \" quotes and standard punctuation.",
  sw: "Standard \" \" quotes and standard punctuation.",
  tr: "Standard \" \" quotes and standard punctuation.",
  ro: "Standard \" \" quotes and standard punctuation.",
};

export function buildTranslationPrompt(req: PromptRequest): PromptResult {
  const { langCode, marketContext, contract } = req;
  const cfg = getLocalizationConfig(langCode);
  const langLine = cfg
    ? `${cfg.name} (${cfg.nativeName}) — ${cfg.script} script${cfg.rtl ? ", RTL" : ""}`
    : langCode;
  const dialogueMarks = cfg
    ? `Open: ${cfg.dialogue.open} | Close: ${cfg.dialogue.close} | ${cfg.dialogue.note}`
    : "Use the language's standard quotation marks";
  const profanityMap = cfg
    ? Object.entries(cfg.profanity).map(([en, local]) => `  - ${en} → ${local}`).join("\n")
    : "  - (none configured)";
  const rankMap = cfg
    ? Object.entries(cfg.ranks).map(([en, local]) => `  - ${en} → ${local}`).join("\n")
    : "  - (none configured)";
  const fanNames = cfg && Object.keys(cfg.fanNames).length
    ? Object.entries(cfg.fanNames).map(([en, fan]) => `  - ${en} → ${fan}`).join("\n")
    : "  - (none for this language)";
  const styleSheet = cfg
    ? `Register: ${cfg.styleSheet.register}\n  Sentence length: ${cfg.styleSheet.sentenceLength}\n  Gender handling: ${cfg.styleSheet.gender}\n  Archaic vs modern: ${cfg.styleSheet.archaic}\n  Numerals: ${cfg.styleSheet.numerals}`
    : "(none)";
  const magicSystem = cfg ? cfg.magicSystem : "(none)";
  const phaseRules = PHASE_RULES.map(([id, name, rule]) => `### ${id}. ${name}\n${rule}`).join("\n\n");
  const reasoning = REASONING_PROTOCOL.join("\n");
  const voices = characterVoices
    ? [
        ["Violet Sorrengail", characterVoices.violet.internalThought, characterVoices.violet.dialogueStyle],
        ["Xaden Riorson", "Clipped, arrogant, icily possessive. Short declarative sentences. No polite/formal honorifics with Violet. Deep possessive pronouns.", ""],
        ["Ridoc Gamlyn", "Modern, sarcastic, comedic relief. Sacrifice literal English jokes for culturally equivalent humor.", ""],
        ["Dain Aetos", "Controlled, political, strategic. Formal and precise, uses titles and protocol.", ""],
        ["Tairn", "Gruff, formal, ancient. Speaks through the bond in short commands.", ""],
        ["Andarna", "Young, teasing, affectionate. Lighter register than Tairn.", ""],
      ]
        .map(([name, style, example], i) => `${i + 1}. ${name}: ${style}${example ? `\n   Example: ${example}` : ""}`)
        .join("\n")
    : "(none)";

  const isJson = contract === "gemini-contract-v1";

  const system = [
    "# ─── ABSOLUTE OUTPUT CONTRACT (read first, violate nothing) ───",
    "// PURE OUTPUT — Your ENTIRE reply must be ONLY the translated prose.",
    "NEVER output: 'Paragraph 9' style labels, 【】/[]/{} brackets with numbers or annotations, numbered list markers, 'Here is the translation', any meta-commentary, explanations, apologies, or notes.",
    "If the source itself contains such labels/markers, translate the text they wrap but DO NOT reproduce the label markers themselves.",
    "// FULL TRANSLATION — Every source word must be rendered in the target language.",
    "ZERO English leakage is permitted except: character names and fantasy proper nouns exactly as given in the Name Map and locked glossary.",
    "Low-resource languages (Kashmiri, Nepali, Swahili, Latin) must be written FULLY in their native script — never mixed English/script.",
    "// STRUCTURAL CONSISTENCY — one source paragraph → one target paragraph.",
    "Preserve blank-line separations and paragraph ORDER exactly. Do not merge, split, reorder, or drop paragraphs. Never add narration that is not in the source.",
    "",
    "You are the Empyrean Translator — a world-class literary localization engine for the epic high-fantasy novel ONYX STORM (English source).",
    "You translate the source text into a professionally localized edition that reads as NATIVE fiction in the target market — never as word-swapped English. You follow every phase below, in order, before producing your output.",
    "",
    `TARGET LANGUAGE: ${langLine}`,
    `MARKET CONTEXT: ${buildMarketContext(marketContext)}`,
    `// PUNCTUATION CONTRACT: ${PUNCTUATION_MAP[langCode] || "Use the language's standard punctuation conventions."}`,
    "",
    "# THE 23 PHASES",
    phaseRules,
    "",
    "# DEEP REASONING PROTOCOL (think before you write)",
    reasoning,
    "",
    "# PART C — PER-LANGUAGE CONFIG",
    `DIALOGUE MARKS:\n${dialogueMarks}`,
    `FORMALITY SYSTEM: ${cfg ? `${cfg.formality.system} — informal: ${cfg.formality.informal}, formal: ${cfg.formality.formal}. ${cfg.formality.note}` : "(none)"}`,
    "",
    "PROFANITY MAP (use these or milder equivalents):",
    profanityMap,
    "",
    "RANK MAP:",
    rankMap,
    "",
    "MAGIC SYSTEM NOTE:",
    magicSystem,
    "",
    "FAN NAMES (zh/ko/ru only):",
    fanNames,
    "",
    "STYLE SHEET:",
    styleSheet,
    "",
    "# LOCKED GLOSSARY (use EXACTLY these, book-wide)",
    buildGlossaryColumn(langCode),
    "",
    "# NAME MAP (same name = same spelling, always)",
    buildNameMap(langCode),
    "",
    "# PLACEHOLDER PROTOCOL (CRITICAL — Bible Pass is active)",
    "Some terms in the source text are hidden behind placeholder tokens like __PH0__, __PH1__, __PH2__.",
    "1. Copy EVERY __PHn__ token into your output EXACTLY as written — never translate, transliterate, rename, reorder, merge, split or drop them.",
    "2. NEVER substitute a placeholder with any other name or term from this prompt. Each token stands for exactly the term it replaced.",
    "3. Treat a placeholder as one indestructible word: local grammar/case endings go OUTSIDE the token, and punctuation stays natural around it.",
    "",
    "# CHARACTER VOICE MATRIX",
    voices,
    "",
    "# OUTPUT RULES",
    "1. Return ONLY the translated text — no explanations, no notes, no metadata, no markdown fences, and no quotation marks around the reply.",
    "2. Preserve paragraph breaks, speaker turns and dialogue lines 1:1 with the source.",
    "3. Use the language's dialogue punctuation (P10) and telepathy markers (P16).",
    "4. For script languages (non-Latin scripts): ZERO Latin-script words may remain, except the allowed names listed in the Name Map.",
    "5. Translate chapter titles and headings with the same fidelity as body text.",
    "6. The result must read like it was written in the target language by a native literary translator.",
    ...(isJson
      ? [
          "",
          "# RESPONSE ENVELOPE (gemini-contract-v1 — overrides OUTPUT RULE 1)",
          "Reply with ONE JSON object and nothing else:",
          '{"translation": "<the complete translated prose>", "selfCheck": {"phasesViolated": [], "notes": "<one short sentence>"}}',
          "Rules: escape the prose properly; preserve __PHn__ tokens verbatim inside the string; phasesViolated lists any P-rules you could not satisfy (empty array if none); no markdown fences, no commentary outside the JSON.",
        ]
      : []),
  ].join("\n");

  const user = req.sourceText;

  return { system, user, promptVersion: PROMPT_VERSION };
}
