/**
 * convex/sourceData.ts — 1MiB document-limit helper (reconstructed).
 *
 * The salvaged mutations.ts and importJob.ts both import isOversized from
 * here (the file itself was not part of the docs set, but its contract is
 * fully specified by its call sites):
 *
 *   - mutations.createProject: pageData/fullText larger than Convex's 1MiB
 *     per-document cap are swapped for empty stubs on the row, while the
 *     calling ACTION stores the real bytes in Storage and passes
 *     pageDataStorageId / fullTextStorageId refs.
 *   - importJob.uploadAndImportFromData: same test decides whether to offload
 *     imported pageData / fullText to Storage before the createProject call.
 *
 * Convex hard limit: 1,048,576 bytes per document value. We keep a headroom
 * band below it for envelope/index overhead so a value that "just fits" the
 * estimate can never blow up the write.
 */

const CONVEX_DOC_LIMIT_BYTES = 1_048_576;
const OVERSIZED_HEADROOM_BYTES = 96 * 1024;
const SIZE_THRESHOLD_BYTES = CONVEX_DOC_LIMIT_BYTES - OVERSIZED_HEADROOM_BYTES;

/** Serialized size in bytes (TextEncoder → correct for non-ASCII text too). */
export function approximateJsonSize(value: unknown): number {
  if (value === undefined || value === null) return 2;
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    // Unserializable values can never ride a mutation argument — treat as oversized.
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * True when the value must ride in Convex Storage instead of the document row.
 * Used ONLY at the mutation/action boundary — readers resolve refs transparently.
 */
export function isOversized(value: unknown): boolean {
  return approximateJsonSize(value) > SIZE_THRESHOLD_BYTES;
}
