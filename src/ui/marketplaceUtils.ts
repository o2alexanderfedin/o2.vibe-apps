// Pure storefront utilities — no React, no async, no side effects (Phase 9, STORE-02).
// These are the sole owners of the sort/filter contract for the popular row so that
// Marketplace.tsx and any future consumer can delegate ranking without duplicating logic.
import type { AppRecord } from "../registry/db";

/**
 * Title-case a type slug for display use.
 * Examples: "weather" → "Weather", "my-app" → "My App".
 */
export function titleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Return the top-N most-opened app records from an arbitrary set of records.
 *
 * This function is the SOLE owner of the `useCount >= 1` membership filter for
 * the popular row. Callers pass raw registry records and receive only the entries
 * that have been opened at least once, sorted for display.
 *
 * Sort order (fully deterministic across sessions):
 *   1. useCount descending   — most-opened first
 *   2. updatedAt descending  — most-recently-used as tie-breaker
 *   3. cacheKey ascending    — stable lexicographic tiebreak
 *
 * @param records  Array of record projections (cacheKey, useCount, updatedAt).
 * @param topN     Maximum number of records to return (default 5).
 */
export function rankPopular<
  T extends Pick<AppRecord, "cacheKey" | "useCount" | "updatedAt">,
>(records: T[], topN = 5): T[] {
  return records
    .filter((r) => (r.useCount ?? 0) >= 1)
    .sort((a, b) => {
      const ucDiff = (b.useCount ?? 0) - (a.useCount ?? 0);
      if (ucDiff !== 0) return ucDiff;
      const uaDiff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      if (uaDiff !== 0) return uaDiff;
      return a.cacheKey < b.cacheKey ? -1 : 1;
    })
    .slice(0, topN);
}
