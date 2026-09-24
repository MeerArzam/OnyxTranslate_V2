// src/lib/translator/formatters.ts — P8/P16 formatting helpers (reconstructed
// to the salvaged import contract: isRTL, formatDragonTelepathy,
// getScriptConfig). formatDragonTelepathy converts *thought* markers into the
// language's telepathy convention: 「」/【】 for ja/ko/zh, guillemets or
// quote-based markers elsewhere; getScriptConfig returns per-script metadata
// used by the PDF renderer to pick fonts and text direction.

export const RTL_LANGS = new Set(["ur", "ar", "ks"]);

export function isRTL(langCode: string): boolean {
  return RTL_LANGS.has(langCode);
}

/** P16: dragon telepathy markers per language convention. */
export function formatDragonTelepathy(thought: string, langCode: string): string {
  switch (langCode) {
    case "ja":
      return `「${thought}」`;
    case "ko":
    case "zh":
      return `【${thought}】`;
    case "fr":
    case "it":
    case "ru":
    case "es":
    case "ro":
      return `«${thought}»`;
    case "de":
      return `„${thought}"`;
    default:
      // ur/ar/ks + Latin-script languages: guillemets are unobtrusive and
      // visually distinct from the dialogue quotes configured per language.
      return `«${thought}»`;
  }
}

export interface ScriptConfig {
  script: string;
  rtl: boolean;
  /** Generic font-family label used by the PDF layer to choose an embedded face. */
  font: "latin" | "arabic" | "devanagari" | "bengali" | "cjk" | "cyrillic";
  /** True when the embedded font carries presentation-form glyphs for bidi shaping. */
  shapingCapable: boolean;
}

const SCRIPT_CONFIGS: Record<string, ScriptConfig> = {
  ur: { script: "Arabic", rtl: true, font: "arabic", shapingCapable: false }, // documented: Nastaliq OOM → word-reversal rendering
  ar: { script: "Arabic", rtl: true, font: "arabic", shapingCapable: true }, // Amiri, presentation forms verified
  ks: { script: "Arabic", rtl: true, font: "arabic", shapingCapable: true },
  hi: { script: "Devanagari", rtl: false, font: "devanagari", shapingCapable: false },
  ne: { script: "Devanagari", rtl: false, font: "devanagari", shapingCapable: false },
  bn: { script: "Bengali", rtl: false, font: "bengali", shapingCapable: false },
  ja: { script: "Japanese", rtl: false, font: "cjk", shapingCapable: false },
  zh: { script: "Chinese", rtl: false, font: "cjk", shapingCapable: false },
  ko: { script: "Hangul", rtl: false, font: "cjk", shapingCapable: false },
  ru: { script: "Cyrillic", rtl: false, font: "cyrillic", shapingCapable: false },
};

const LATIN_DEFAULT: ScriptConfig = {
  script: "Latin",
  rtl: false,
  font: "latin",
  shapingCapable: false,
};

export function getScriptConfig(langCode: string): ScriptConfig {
  return SCRIPT_CONFIGS[langCode] ?? LATIN_DEFAULT;
}
