// Host-side data fetch orchestrator (DATA-01, DATA-04).
//
// All network requests for app data flow through this broker — not through
// app handler code. The broker owns URL construction (from the curated source
// manifest), param filtering (allowedParams only), the in-memory TTL cache,
// rate-limit wrapping (TokenBucket), and neutral error handling.
//
// App handlers call the services-bound `fetchData(sourceId, params)` closure;
// they never see raw network primitives. Raw fetch/XHR remain shadowed to
// undefined in the handler constrained scope.

import type { Clock } from "../host/clock";
import { realClock } from "../host/clock";
import { TokenBucket } from "../host/tokenBucket";
import { TtlCache } from "../host/ttlCache";
import { SOURCE_MANIFEST } from "./sourceManifest";
import { logger } from "../lib/logger";

// Returned on all failure paths — never reveals origin, status code, or
// any mechanism-identifying term (devtools hygiene).
const NEUTRAL_DATA_ERROR = "Couldn't load this data right now.";

// Returned specifically for unknown sourceId (T-12-01-A).
const UNKNOWN_SOURCE_ERROR = "Requested data is not available.";

/** Public interface for the host data broker. */
export interface DataFetchBroker {
  /**
   * Fetch data from a curated, allowlisted source.
   *
   * @param sourceId  A key from the source manifest (e.g. "weather-geocode").
   *                  Unknown keys return {error} immediately with no network call.
   * @param params    Caller-supplied parameters. Only allowedParams-declared keys
   *                  are forwarded; all others are silently dropped.
   * @returns         {data} on success, {error} on any failure (never throws).
   */
  fetch(
    sourceId: string,
    params: unknown,
  ): Promise<{ data?: unknown; error?: string }>;
}

/** Dependency-injection options for createDataBroker. All fields are optional. */
export interface DataBrokerOptions {
  /** Injected time seam — realClock in prod, createStubClock() in tests. */
  clock?: Clock;
  /** Rate/concurrency limiter — shared TokenBucket; a default is created if absent. */
  limiter?: TokenBucket;
  /** In-memory TTL cache — a default is created if absent. */
  ttlCache?: TtlCache;
  /** Network function — globalThis.fetch in prod, a stub in tests. */
  fetchFn?: typeof fetch;
}

/**
 * Build a DataFetchBroker with all dependencies resolved.
 *
 * Default wiring (when no opts supplied):
 *   - clock:    realClock (wall clock)
 *   - limiter:  TokenBucket(capacity=4, refillPerSec=2, maxConcurrent=4)
 *   - ttlCache: TtlCache with the real clock
 *   - fetchFn:  globalThis.fetch
 */
export function createDataBroker(opts: DataBrokerOptions = {}): DataFetchBroker {
  const clock = opts.clock ?? realClock;
  const limiter =
    opts.limiter ??
    new TokenBucket({ capacity: 4, refillPerSec: 2, maxConcurrent: 4, clock });
  const ttlCache = opts.ttlCache ?? new TtlCache({ clock });
  const fetchFn = opts.fetchFn ?? ((url: string, init?: RequestInit) => globalThis.fetch(url, init));

  return {
    async fetch(
      sourceId: string,
      params: unknown,
    ): Promise<{ data?: unknown; error?: string }> {
      // (1) Manifest lookup — unknown sourceId rejected immediately (T-12-01-A).
      const entry = SOURCE_MANIFEST.get(sourceId);
      if (!entry) {
        return { error: UNKNOWN_SOURCE_ERROR };
      }

      // (2) Build a stable, deterministic cache key from sourceId + filtered params.
      //     Sort param keys so {a:1, b:2} and {b:2, a:1} map to the same slot.
      const rawParams =
        params !== null && typeof params === "object" ? (params as Record<string, unknown>) : {};
      const filteredEntries = Object.entries(rawParams)
        .filter(([k]) => entry.allowedParams.includes(k))
        .sort(([a], [b]) => a.localeCompare(b));
      const filteredParams = Object.fromEntries(filteredEntries);
      const cacheKey = sourceId + ":" + JSON.stringify(filteredParams);

      // (3) TTL cache check — return immediately on hit.
      const cached = ttlCache.get(cacheKey);
      if (cached !== undefined) {
        return { data: cached };
      }

      // (4) Build the request URL from the manifest — never from caller input (T-12-01-B).
      const url = new URL(entry.path, entry.origin);
      for (const [key, value] of filteredEntries) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }

      // (5) Rate-limit-wrapped fetch — the same TokenBucket governs all data requests.
      try {
        const response = await limiter.run(() => fetchFn(url.toString()));

        // (6) Non-2xx → neutral error (T-12-01-C).
        if (!response.ok) {
          logger.error("DataBroker: non-2xx response from " + sourceId + " (" + response.status + ")");
          return { error: NEUTRAL_DATA_ERROR };
        }

        // (7) Parse JSON; treat parse failures as data errors.
        let parsed: unknown;
        try {
          parsed = await response.json();
        } catch (parseErr) {
          logger.error("DataBroker: JSON parse failed for " + sourceId + ": " + String(parseErr));
          return { error: NEUTRAL_DATA_ERROR };
        }

        // (8) Populate TTL cache and return the data.
        ttlCache.set(cacheKey, parsed, entry.ttlMs);
        return { data: parsed };
      } catch (err) {
        // Outer catch: network error, CORS failure, or any unexpected throw.
        // Never rethrow — always return a neutral error object (T-12-01-C).
        logger.error("DataBroker: fetch failed for " + sourceId + ": " + String(err));
        return { error: NEUTRAL_DATA_ERROR };
      }
    },
  };
}
