import { sameContext, validContext, type QueueContext } from "./queue-context";

export type LegacyDecision = "needs_origin_confirmation" | "invalid" | "duplicate_reference" | "foreign_identity";
export interface LegacyReviewItem {
  source: "pending" | "rejected";
  index: number;
  client_ref: string | null;
  decision: LegacyDecision;
}
/**
 * Preflight only: classifies legacy queue records without altering storage,
 * binding identities, or contacting the sales API.
 * Even valid records remain blocked until an authenticated administrator verifies
 * the original server/operator and reconciles client_ref against the server.
 */
export function reconcileLegacyPreview(
  pending: unknown, rejected: unknown, current: QueueContext | null,
): LegacyReviewItem[] {
  const seen = new Set<string>();
  const result: LegacyReviewItem[] = [];
  for (const [source, records] of [["pending", pending], ["rejected", rejected]] as const) {
    if (!Array.isArray(records)) {
      result.push({ source, index: -1, client_ref: null, decision: "invalid" });
      continue;
    }
    for (const [index, raw] of records.entries()) {
      const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
      const payload = record?.payload && typeof record.payload === "object"
        ? record.payload as Record<string, unknown> : null;
      const ref = typeof payload?.client_ref === "string" && payload.client_ref.trim()
        ? payload.client_ref : null;
      let decision: LegacyDecision = "needs_origin_confirmation";
      if (!ref || typeof record?.total !== "number" || !Number.isFinite(record.total) ||
          record.total < 0 || !Array.isArray(payload?.items) || payload.items.length === 0) {
        decision = "invalid";
      } else if (seen.has(ref)) {
        decision = "duplicate_reference";
      } else if (payload?.sync_context !== undefined &&
        (!validContext(payload.sync_context) || !sameContext(payload.sync_context, current))) {
        decision = "foreign_identity";
      }
      if (ref) seen.add(ref);
      result.push({ source, index, client_ref: ref, decision });
    }
  }
  return result;
}
