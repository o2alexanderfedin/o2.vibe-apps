// Tests for DataFetchBroker — host-side fetch orchestrator.
// Verifies: manifest lookup, param filtering, TTL cache hit/miss, neutral errors.
// All tests use injected doubles — no real network, no real timers.

import { describe, it, expect, vi } from "vitest";
import { createDataBroker } from "./dataBroker";
import type { DataFetchBroker, DataBrokerOptions } from "./dataBroker";
import { createStubClock } from "../host/clock";
import { TtlCache } from "../host/ttlCache";
import { TokenBucket } from "../host/tokenBucket";

// ---- Fixtures (verified live API shapes from CONTEXT.md) ----

const GEOCODE_FIXTURE = {
  results: [
    {
      name: "London",
      latitude: 51.50853,
      longitude: -0.12574,
      country: "United Kingdom",
      country_code: "GB",
      admin1: "England",
      timezone: "Europe/London",
    },
  ],
  generationtime_ms: 0.96,
};

const FORECAST_FIXTURE = {
  latitude: 51.5,
  longitude: -0.12,
  timezone: "Europe/London",
  current_units: {
    temperature_2m: "°C",
    weather_code: "wmo code",
    wind_speed_10m: "km/h",
  },
  current: {
    time: "2026-06-26T10:00",
    interval: 900,
    temperature_2m: 18.5,
    weather_code: 2,
    wind_speed_10m: 12.3,
  },
};

const FX_FIXTURE = {
  amount: 1,
  base: "USD",
  date: "2026-06-26",
  rates: { EUR: 0.92, GBP: 0.79, JPY: 156.3 },
};

// ---- Helpers ----

/** Track the last URL passed to the fetch double so tests can inspect it. */
let lastFetchedUrl = "";

/**
 * Create a fetch stub that records the URL it was called with into `lastFetchedUrl`,
 * then returns the given JSON body with status 200.
 */
function okFetch(body: unknown): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((url: string) => {
    lastFetchedUrl = url;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  });
}

/** Create a fetch stub that returns a non-2xx response */
function errorFetch(status = 500): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error: "server error" }),
  });
}

/** Create a fetch stub that throws a network error */
function throwingFetch(message = "Network error"): ReturnType<typeof vi.fn> {
  return vi.fn().mockRejectedValue(new Error(message));
}

/** Build a broker with stub infrastructure (no real timers, no real network) */
function makeBroker(
  fetchFn: ReturnType<typeof vi.fn>,
  opts: Partial<DataBrokerOptions> = {},
): DataFetchBroker {
  const clock = createStubClock(0);
  const limiter = new TokenBucket({ capacity: 10, refillPerSec: 10, maxConcurrent: 10, clock });
  const ttlCache = new TtlCache({ clock });
  return createDataBroker({
    clock,
    limiter,
    ttlCache,
    fetchFn: fetchFn as unknown as typeof fetch,
    ...opts,
  });
}

// ---- Tests ----

describe("DataFetchBroker — host data orchestrator (DATA-01, DATA-04)", () => {

  describe("unknown sourceId → immediate rejection, no network call", () => {
    it("returns {error} for an unknown sourceId", async () => {
      const fetchFn = okFetch({});
      const broker = makeBroker(fetchFn);
      const result = await broker.fetch("nonexistent-source", {});
      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/not available/i);
    });

    it("makes no fetch call for an unknown sourceId", async () => {
      const fetchFn = vi.fn();
      const broker = makeBroker(fetchFn);
      await broker.fetch("totally-unknown", {});
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("returns {error} for empty string sourceId", async () => {
      const broker = makeBroker(okFetch({}));
      const result = await broker.fetch("", {});
      expect(result.error).toBeDefined();
    });
  });

  describe("TTL cache hit", () => {
    it("returns cached data on the second call without a second fetch", async () => {
      const fetchFn = okFetch(GEOCODE_FIXTURE);
      const broker = makeBroker(fetchFn);

      // First call — populates cache
      const first = await broker.fetch("weather-geocode", { name: "London" });
      expect(first.data).toEqual(GEOCODE_FIXTURE);

      // Second call — same params → cache hit
      const second = await broker.fetch("weather-geocode", { name: "London" });
      expect(second.data).toEqual(GEOCODE_FIXTURE);

      // Fetch should only have been called once
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("uses a different cache key for different params", async () => {
      const fetchFn = okFetch(GEOCODE_FIXTURE);
      const broker = makeBroker(fetchFn);

      await broker.fetch("weather-geocode", { name: "London" });
      await broker.fetch("weather-geocode", { name: "Paris" });

      // Both should have triggered a network call (different cache keys)
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  describe("TTL cache miss after expiry", () => {
    it("re-fetches after the TTL expires (clock-controlled)", async () => {
      const clock = createStubClock(0);
      const limiter = new TokenBucket({ capacity: 10, refillPerSec: 10, maxConcurrent: 10, clock });
      const ttlCache = new TtlCache({ clock });
      const fetchFn = okFetch(GEOCODE_FIXTURE);

      const broker = createDataBroker({
        clock,
        limiter,
        ttlCache,
        fetchFn: fetchFn as unknown as typeof fetch,
      });

      // First call
      await broker.fetch("weather-geocode", { name: "London" });
      expect(fetchFn).toHaveBeenCalledTimes(1);

      // Advance clock past the 10-minute TTL for weather-geocode
      await clock.sleep(600_001);

      // Second call — cache is expired; should re-fetch
      await broker.fetch("weather-geocode", { name: "London" });
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  describe("param injection guard (T-12-01-B)", () => {
    it("drops params not in allowedParams for weather-geocode", async () => {
      const fetchFn = okFetch(GEOCODE_FIXTURE);
      const broker = makeBroker(fetchFn);

      lastFetchedUrl = "";
      await broker.fetch("weather-geocode", {
        name: "London",
        injectedKey: "evil",
        origin: "https://evil.com",
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      // Check via the captured URL
      expect(lastFetchedUrl).toContain("name=London");
      expect(lastFetchedUrl).not.toContain("injectedKey");
      expect(lastFetchedUrl).not.toContain("evil.com");
    });

    it("uses the manifest origin, not any caller-supplied origin", async () => {
      const fetchFn = okFetch(GEOCODE_FIXTURE);
      const broker = makeBroker(fetchFn);

      lastFetchedUrl = "";
      await broker.fetch("weather-geocode", { name: "London" });
      expect(lastFetchedUrl).toContain("https://geocoding-api.open-meteo.com");
    });

    it("includes allowed params and drops unknown extras in the same call", async () => {
      // Verifies that allowed keys (name, count) ARE encoded and unknown keys
      // (injectedKey) are dropped — both conditions in one fetch call.
      const fetchFn = okFetch(GEOCODE_FIXTURE);
      const broker = makeBroker(fetchFn);

      lastFetchedUrl = "";
      await broker.fetch("weather-geocode", {
        name: "London",
        injectedKey: "bad",
        count: 1,
      });

      // Allowed params present in URL
      expect(lastFetchedUrl).toContain("name=London");
      expect(lastFetchedUrl).toContain("count=1");
      // Unknown param dropped
      expect(lastFetchedUrl).not.toContain("injectedKey");
    });

    it("encodes only allowedParams for fx-latest", async () => {
      const fetchFn = okFetch(FX_FIXTURE);
      const broker = makeBroker(fetchFn);

      lastFetchedUrl = "";
      await broker.fetch("fx-latest", { base: "USD", symbols: "EUR,GBP", apiKey: "secret" });

      expect(lastFetchedUrl).toContain("base=USD");
      expect(lastFetchedUrl).toContain("symbols=");
      expect(lastFetchedUrl).not.toContain("apiKey");
      expect(lastFetchedUrl).not.toContain("secret");
    });
  });

  describe("URL construction from manifest", () => {
    it("builds the correct URL for weather-geocode", async () => {
      const fetchFn = okFetch(GEOCODE_FIXTURE);
      const broker = makeBroker(fetchFn);

      lastFetchedUrl = "";
      await broker.fetch("weather-geocode", { name: "London" });
      expect(lastFetchedUrl).toMatch(/^https:\/\/geocoding-api\.open-meteo\.com\/v1\/search/);
    });

    it("builds the correct URL for weather-forecast", async () => {
      const fetchFn = okFetch(FORECAST_FIXTURE);
      const broker = makeBroker(fetchFn);

      lastFetchedUrl = "";
      await broker.fetch("weather-forecast", { latitude: "51.5", longitude: "-0.12", current: "temperature_2m" });
      expect(lastFetchedUrl).toMatch(/^https:\/\/api\.open-meteo\.com\/v1\/forecast/);
    });

    it("builds the correct URL for fx-latest", async () => {
      const fetchFn = okFetch(FX_FIXTURE);
      const broker = makeBroker(fetchFn);

      lastFetchedUrl = "";
      await broker.fetch("fx-latest", { base: "USD" });
      expect(lastFetchedUrl).toMatch(/^https:\/\/api\.frankfurter\.dev\/v1\/latest/);
    });
  });

  describe("successful fetch → {data}", () => {
    it("returns {data} with parsed JSON for a successful geocode request", async () => {
      const broker = makeBroker(okFetch(GEOCODE_FIXTURE));
      const result = await broker.fetch("weather-geocode", { name: "London" });
      expect(result.error).toBeUndefined();
      expect(result.data).toEqual(GEOCODE_FIXTURE);
    });

    it("returns {data} with parsed JSON for a successful FX request", async () => {
      const broker = makeBroker(okFetch(FX_FIXTURE));
      const result = await broker.fetch("fx-latest", { base: "USD" });
      expect(result.error).toBeUndefined();
      expect(result.data).toEqual(FX_FIXTURE);
    });
  });

  describe("error paths → neutral {error} (T-12-01-C)", () => {
    it("returns neutral {error} on non-2xx HTTP response", async () => {
      const broker = makeBroker(errorFetch(500));
      const result = await broker.fetch("fx-latest", {});
      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
      // Error copy must not reveal the HTTP status code or provider name
      expect(result.error).not.toMatch(/500/i);
      expect(result.error).not.toMatch(/frankfurter/i);
    });

    it("returns neutral {error} on network throw (CORS/network error)", async () => {
      const broker = makeBroker(throwingFetch("Failed to fetch"));
      const result = await broker.fetch("weather-geocode", { name: "London" });
      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
    });

    it("returns neutral {error} on 404 not found", async () => {
      const broker = makeBroker(errorFetch(404));
      const result = await broker.fetch("weather-forecast", { latitude: "0", longitude: "0" });
      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
    });

    it("neutral error copy does not contain on-demand mechanic terms", async () => {
      const broker = makeBroker(errorFetch(500));
      const result = await broker.fetch("fx-latest", {});
      const errorText = result.error ?? "";
      // These words would reveal the on-demand data production mechanic to users
      expect(errorText.toLowerCase()).not.toContain("on-demand");
      expect(errorText.toLowerCase()).not.toContain("api key");
    });
  });

  describe("cache population on success", () => {
    it("stores the parsed response in the TTL cache after a successful fetch", async () => {
      const clock = createStubClock(0);
      const limiter = new TokenBucket({ capacity: 10, refillPerSec: 10, maxConcurrent: 10, clock });
      const ttlCache = new TtlCache({ clock });
      const fetchFn = okFetch(FX_FIXTURE);

      const broker = createDataBroker({
        clock,
        limiter,
        ttlCache,
        fetchFn: fetchFn as unknown as typeof fetch,
      });

      // Fetch once — should populate cache
      await broker.fetch("fx-latest", { base: "USD" });

      // Fetch again — should hit cache (same stub count)
      const result = await broker.fetch("fx-latest", { base: "USD" });
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(result.data).toEqual(FX_FIXTURE);
    });
  });

  describe("stable cache key (deterministic for same inputs)", () => {
    it("uses same cache slot regardless of param key order", async () => {
      const fetchFn = okFetch(FORECAST_FIXTURE);
      const broker = makeBroker(fetchFn);

      // Call with params in different orders
      await broker.fetch("weather-forecast", { latitude: "51.5", longitude: "-0.12", current: "temperature_2m" });
      await broker.fetch("weather-forecast", { current: "temperature_2m", longitude: "-0.12", latitude: "51.5" });

      // Same cache key → only one fetch
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("default construction (no options)", () => {
    it("can be created with no options (uses defaults for all deps)", () => {
      // Should not throw
      expect(() => createDataBroker()).not.toThrow();
    });

    it("still rejects unknown sourceIds when created with defaults", async () => {
      const broker = createDataBroker();
      const result = await broker.fetch("never-known", {});
      expect(result.error).toBeDefined();
    });
  });
});
