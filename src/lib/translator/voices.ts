// src/lib/translator/voices.ts — Character voice calibration (reconstructed
// from the salvaged VOICE_MATRIX consumers). translateContent.ts and
// translateQueue.ts read characterVoices.violet.internalThought and
// characterVoices.violet.dialogueStyle when building the prompt voice matrix;
// the remaining characters mirror the documented calibration lines.

export const characterVoices: Record<
  string,
  { internalThought: string; dialogueStyle: string }
> = {
  violet: {
    internalThought:
      "First-person, intimate, urgent, dry wit under pressure. Short fragments when stressed; longer reflective lines in calmer passages. Self-interruption and the 'I won't. I refuse.' rhythm.",
    dialogueStyle:
      "Determined, vulnerable, wry. Talks around feelings she won't name; sharper than she intends when afraid.",
  },
  xaden: {
    internalThought:
      "Controlled second-person-adjacent interiority when in his POV: calculating, possessive, always three moves ahead.",
    dialogueStyle:
      "Clipped, arrogant, icily possessive. Short declarative sentences. No polite/formal honorifics with Violet. Deep possessive pronouns.",
  },
  ridoc: {
    internalThought:
      "Light, deflecting, comic even under fire — humor as armor.",
    dialogueStyle:
      "Modern, sarcastic, comedic relief. Sacrifice literal English jokes for culturally equivalent humor.",
  },
  dain: {
    internalThought:
      "Orderly, rule-bound reasoning; discomfort expressed as protocol.",
    dialogueStyle:
      "Controlled, political, strategic. Formal and precise, uses titles and protocol.",
  },
  tairn: {
    internalThought:
      "Ancient patience; assesses threats in ranked lists; contempt for human drama.",
    dialogueStyle:
      "Gruff, formal, ancient. Speaks through the bond in short commands. NO contractions.",
  },
  andarna: {
    internalThought:
      "Young, curious, impulsive; delight in chaos and in Violet especially.",
    dialogueStyle:
      "Young, teasing, affectionate. Lighter register than Tairn.",
  },
};
