// src/lib/translator/cultural.ts — P6/P13/P14 market filters (reconstructed
// to the salvaged import contract: applyCulturalFilters(text, langCode,
// marketContext) and detectExplicitContent). The filter pass applies
// market-context rules (standard / high-censorship / romance-focused):
// euphemize profanity per market, keep intimacy tasteful per norms. It never
// rewrites narrative prose beyond proven market-required substitutions.

export type MarketContext = "standard" | "high-censorship" | "romance-focused";

/** Per-market euphemism ladder for English profanity roots. */
const PROFANITY_EUPHEMISMS: Record<MarketContext, Array<[RegExp, string]>> = {
  standard: [],
  "high-censorship": [
    [/\b(goddamn|damn(ed)?)\b/gi, "d—"],
    [/\bshit\b/gi, "—"],
    [/\b(f+u+c+k+)(ing|in|ed)?\b/gi, "—"],
    [/\bbastard(s)?\b/gi, "scoundrel$1"],
    [/\bhell\b/gi, "the underworld"],
  ],
  "romance-focused": [],
};

export function applyCulturalFilters(
  text: string,
  _langCode: string,
  marketContext: string,
): string {
  const market = (
    ["standard", "high-censorship", "romance-focused"].includes(marketContext)
      ? marketContext
      : "standard"
  ) as MarketContext;

  let out = text;
  for (const [re, replacement] of PROFANITY_EUPHEMISMS[market]) {
    out = out.replace(re, replacement);
  }
  return out;
}

/** Coarse screen used by the legacy queue to route intimacy-heavy scenes
 * through the stricter market handling. Returns true when explicit markers
 * are present so the caller can tighten the market context. */
export function detectExplicitContent(text: string): boolean {
  return (
    /\b(explicit|graphic)\b/i.test(text) &&
    /\b(sex|desire|naked|undress)\b/i.test(text)
  );
}
