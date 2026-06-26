// Curated catalog of allowlisted data sources for the host-brokered data path.
// Each entry maps a logical sourceId to its origin, path, allowed query params, and TTL.
// The host data broker reads this catalog to build requests; caller-supplied origins
// and paths are never used. Any sourceId absent from this map is rejected at the broker.

/** Shape of a single data-source entry in the catalog. */
export interface SourceManifestEntry {
  /** The HTTPS origin (scheme + host, no path). */
  origin: string;
  /** The URL path (starts with /). */
  path: string;
  /** Query parameter keys that may be forwarded. All other keys are silently dropped. */
  allowedParams: readonly string[];
  /** How long a successful response is kept in the in-memory TTL cache (milliseconds). */
  ttlMs: number;
}

/**
 * The allowlisted data-source catalog.
 *
 * Sources (verified live 2026-06-26, keyless CORS — no Authorization header needed):
 *   weather-geocode  — Open-Meteo geocoding: name → lat/lng
 *   weather-forecast — Open-Meteo forecast: lat/lng → current conditions
 *   fx-latest        — Frankfurter FX: base/symbols → live rates
 *
 * TTLs: weather 10 min (conditions change quickly), FX 30 min (rates stable intra-day).
 * All origins also appear in the CSP connect-src allowlist in index.html (DATA-02).
 */
export const SOURCE_MANIFEST: ReadonlyMap<string, SourceManifestEntry> = new Map([
  [
    "weather-geocode",
    {
      origin: "https://geocoding-api.open-meteo.com",
      path: "/v1/search",
      allowedParams: ["name", "count", "language", "format"],
      ttlMs: 600_000, // 10 minutes
    },
  ],
  [
    "weather-forecast",
    {
      origin: "https://api.open-meteo.com",
      path: "/v1/forecast",
      allowedParams: ["latitude", "longitude", "current"],
      ttlMs: 600_000, // 10 minutes
    },
  ],
  [
    "fx-latest",
    {
      origin: "https://api.frankfurter.dev",
      path: "/v1/latest",
      allowedParams: ["base", "symbols"],
      ttlMs: 1_800_000, // 30 minutes
    },
  ],
]);
