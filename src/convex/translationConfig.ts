// convex/translationConfig.ts — Central config: single source of truth for
// every adaptive-pipeline constant. Values are VERBATIM from the salvaged
// overview-dashboard Constants table (TRANSLATION_CONFIG — actual values).
// These are OnyxTranslate SAFE OPERATING TARGETS, not Google-official limits;
// the pipeline adapts downward on measured 429s.

export const TRANSLATION_CONFIG = {
  /** Safe operating target (NOT a Google-official limit). */
  targetRpm: 10,
  /** Never intentionally exceeded. */
  absoluteRpmCeiling: 12,
  /** Pacific-date keyed; lower automatically on real RPD evidence. */
  dailyRequestBudget: 1200,
  /** Initial adaptive workers. */
  workerCount: 2,
  /** Claim staleness threshold. */
  heartbeatTtlMs: 180_000, // 3 min
  /** Dispatcher exits before the Convex action timeout. */
  actionSafetyDeadlineMs: 20_000, // 20 s
  /** Cron interval (crons.ts). */
  watchdogIntervalMs: 180_000, // 3 min
  /** Normal next-tick delay. */
  dispatcherIntervalMs: 15_000, // 15 s (salvaged law; not the requested 2 s)
  /** Lease is deliberately longer than the 90 s Gemini abort timeout. */
  workerAbortTimeoutMs: 90_000,
  /** Dispatcher lease prevents overlapping watchdog re-kicks. */
  dispatcherLeaseMs: 30_000,
  /** Per job before failed. */
  maxAttempts: 6,
  /** Exponential backoff base. */
  backoffBaseMs: 2_000,
  /** Backoff cap. */
  backoffMaxMs: 120_000,
  /** Jitter fraction of base. */
  backoffJitterRatio: 0.25,
  /** Adjacent-chunk merging. */
  pairMergeEnabled: true,
  /** Safe ceiling for a merged request. */
  pairMergeMaxEstimatedInputTokens: 6_000,
  /** Safety headroom on the token estimate. */
  pairMergeHeadroomRatio: 0.2,
  /** Estimator divisor. */
  estimatedCharsPerToken: 4,
  /** First PDF batch size. */
  pdfInitialBatchPages: 50,
  /** Shrink floor; a failed 10-page batch fails ONLY that batch. */
  pdfMinimumBatchPages: 10,
  /** 50 → 25 → 10. */
  pdfBatchShrinkFactor: 0.5,
  /** Claim budget per tick. */
  maxJobsClaimedPerDispatch: 2,
  /** Flush budget per action. */
  maxDatabaseWritesPerAction: 50,
  /** Project-level staleness. */
  staleProjectThresholdMs: 600_000, // 10 min
  /**
   * The 5 Gemini keys share ONE Google project → ONE quota pool.
   * (TREAT_KEYS_AS_ONE_POOL — documented law.)
   */
  treatKeysAsOnePool: true,
} as const;

export type TranslationConfig = typeof TRANSLATION_CONFIG;

/**
 * Exponential backoff with jitter and cap:
 *   base·2^(attempts−1) · (1 ± jitterRatio·rand) capped at backoffMaxMs.
 */
export function computeBackoffMs(attempts: number, rand = Math.random()): number {
  const exp = TRANSLATION_CONFIG.backoffBaseMs * Math.pow(2, Math.max(0, attempts - 1));
  const capped = Math.min(exp, TRANSLATION_CONFIG.backoffMaxMs);
  const jitter = capped * TRANSLATION_CONFIG.backoffJitterRatio * (rand * 2 - 1);
  return Math.max(250, Math.round(capped + jitter));
}

/**
 * Safe pair-merge token estimate: (charsA + charsB + envelope) / charsPerToken,
 * multiplied by (1 + headroom). Merged requests must fit under
 * pairMergeMaxEstimatedInputTokens.
 */
export function estimateSafePairTokens(charsA: number, charsB: number): number {
  const envelope = 64; // labels + sliding-window context overhead
  const raw = (charsA + charsB + envelope) / TRANSLATION_CONFIG.estimatedCharsPerToken;
  return raw * (1 + TRANSLATION_CONFIG.pairMergeHeadroomRatio);
}

/** English-echo gate threshold (salvage T3 fix: never fire on real prose —
 * real prose with spaces sits near 0.8; only near-pure-Latin output trips). */
export const ENGLISH_ECHO_GATE = {
  /** Fraction of Latin letters above which output is suspected English echo. */
  latinRatioThreshold: 0.92,
  /** Minimum output length before the echo gate may fire. */
  minLength: 40,
} as const;

/** Pacific-date key (America/Los_Angeles, en-CA YYYY-MM-DD) — governor day. */
export function pacificDateKey(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

/** Milliseconds until the next Pacific midnight (governor auto-resume). */
export function msUntilNextPacificMidnight(now = Date.now()): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(now)).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const pacificNow = asUtc; // approximation good to ±1h DST — midnight gap exact enough for resume arming
  const midnightPacificTodayUtc = asUtc - (pacificNow % 86_400_000) + 8 * 3_600_000;
  const next = midnightPacificTodayUtc > now
    ? midnightPacificTodayUtc
    : midnightPacificTodayUtc + 86_400_000;
  return Math.max(60_000, next - now);
}
