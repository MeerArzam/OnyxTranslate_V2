// convex/translationContract.ts — Thin Motherboard Phase 2 (spec-only
// reconstruction). Overview dashboard law, verbatim:
//
//   "strict JSON response contract (parser + validators + retry-once-stricter,
//   needs_review terminal state, raw diagnostics preserved; contract-mode
//   assembly = pure concatenation — code NEVER rewrites prose; needs_review
//   cannot deadlock ZIP or language completion)"
//
// Fixture law: 25/25 PASS LOCAL_SIMULATED in the salvage; validators here
// mirror that behavior — conservative, evidence-preserving.

export interface ContractSelfCheck {
  phasesViolated?: string[];
  notes?: string;
}

export interface ContractEnvelope {
  translation: string;
  selfCheck?: ContractSelfCheck;
}

export type ContractVerdict =
  | { ok: true; envelope: ContractEnvelope }
  | { ok: false; reason: string; raw: string };

/**
 * Parse the model reply into a contract envelope. Accepts:
 *  - a bare JSON object
 *  - a ```json fenced block containing the object
 *  - tolerant extraction of the outermost {...} from chatty replies
 * Rejects: empty translations, non-object JSON, missing translation field.
 */
export function parseContractResponse(raw: string): ContractVerdict {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, reason: "empty_response", raw: "" };

  // Strip markdown fences if present.
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  const candidates: string[] = [unfenced];
  // Tolerant: extract the outermost JSON object if the model added prose.
  const first = unfenced.indexOf("{");
  const last = unfenced.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(unfenced.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      const obj = parsed as Record<string, unknown>;
      const translation = obj.translation;
      if (typeof translation !== "string" || translation.trim().length === 0) {
        continue;
      }
      const selfCheck =
        obj.selfCheck && typeof obj.selfCheck === "object"
          ? (obj.selfCheck as ContractSelfCheck)
          : undefined;
      return {
        ok: true,
        envelope: { translation: translation.trim(), selfCheck },
      };
    } catch {
      // try next candidate
    }
  }
  return { ok: false, reason: "not_json_or_missing_translation", raw: trimmed.slice(0, 2000) };
}

/**
 * Decide the post-validation action for a job.
 *  - valid envelope + no P-violations → done
 *  - valid envelope + self-reported violations → needs_review (the model
 *    completed the work; code never rewrites prose — the violation report
 *    travels with the chunk)
 *  - invalid envelope on the FIRST attempt → retry_once_stricter
 *  - invalid envelope after the strict retry → needs_review with reason
 *    preserved (terminal — never deadlocks completion)
 */
export type ContractOutcome =
  | { action: "done"; translation: string; needsReview: false }
  | { action: "needs_review"; translation: string | undefined; needsReview: true; reviewReason: string }
  | { action: "retry_once_stricter"; reviewReason: string };

export function evaluateContract(
  verdict: ContractVerdict,
  attempt: number,
): ContractOutcome {
  if (verdict.ok) {
    const violations = verdict.envelope.selfCheck?.phasesViolated ?? [];
    if (violations.length > 0) {
      return {
        action: "needs_review",
        translation: verdict.envelope.translation,
        needsReview: true,
        reviewReason: `self_reported_violations:${violations.slice(0, 5).join(",")}`,
      };
    }
    return { action: "done", translation: verdict.envelope.translation, needsReview: false };
  }
  if (attempt === 0) {
    return { action: "retry_once_stricter", reviewReason: verdict.reason };
  }
  return {
    action: "needs_review",
    translation: undefined,
    needsReview: true,
    reviewReason: `invalid_contract_after_strict_retry:${verdict.reason}`,
  };
}

/** The stricter retry instruction appended on the single allowed retry. */
export const STRICT_RETRY_SUFFIX = [
  "# RESPONSE FORMAT (STRICT — second and final attempt)",
  "Your previous reply was not the required JSON envelope. Reply with EXACTLY ONE JSON object and nothing else:",
  '{"translation": "<the complete translated prose>", "selfCheck": {"phasesViolated": [], "notes": "<one short sentence>"}}',
  "No markdown fences. No commentary. Preserve every __PHn__ token verbatim.",
].join("\n");

/**
 * Contract-mode assembly: PURE concatenation of per-chunk translations in
 * order. Code NEVER rewrites, re-punctuates, or re-paragraphs prose here —
 * that is the Phase 2 law that retires the legacy transforms once gates pass.
 */
export function assembleContractTranslations(translations: (string | undefined)[]): string {
  return translations
    .map((t) => (t ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}
