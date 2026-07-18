// Tests for the curated data-source manifest.
// Each source is a keyless-CORS-allowlisted origin with restricted params and a TTL.

import { describe, it, expect, beforeAll } from "vitest";
import { SOURCE_MANIFEST } from "./sourceManifest";
import type { SourceManifestEntry } from "./sourceManifest";

describe("SOURCE_MANIFEST — curated data-source catalog (DATA-01, DATA-02)", () => {
  it("has exactly three entries", () => {
    expect(SOURCE_MANIFEST.size).toBe(3);
  });

  it("contains weather-geocode entry", () => {
    expect(SOURCE_MANIFEST.has("weather-geocode")).toBe(true);
  });

  it("contains weather-forecast entry", () => {
    expect(SOURCE_MANIFEST.has("weather-forecast")).toBe(true);
  });

  it("contains fx-latest entry", () => {
    expect(SOURCE_MANIFEST.has("fx-latest")).toBe(true);
  });

  it("returns undefined for an unknown sourceId", () => {
    expect(SOURCE_MANIFEST.get("unknown")).toBeUndefined();
    expect(SOURCE_MANIFEST.get("")).toBeUndefined();
    expect(SOURCE_MANIFEST.get("anthropic-api")).toBeUndefined();
  });

  describe("weather-geocode entry", () => {
    let entry: SourceManifestEntry;
    beforeAll(() => {
      entry = SOURCE_MANIFEST.get("weather-geocode")!;
    });

    it("has the correct geocoding origin", () => {
      expect(entry.origin).toBe("https://geocoding-api.open-meteo.com");
    });

    it("has the correct path", () => {
      expect(entry.path).toBe("/v1/search");
    });

    it("allows exactly the declared params", () => {
      expect(entry.allowedParams).toEqual(["name", "count", "language", "format"]);
    });

    it("has 10-minute TTL (600_000 ms)", () => {
      expect(entry.ttlMs).toBe(600_000);
    });
  });

  describe("weather-forecast entry", () => {
    let entry: SourceManifestEntry;
    beforeAll(() => {
      entry = SOURCE_MANIFEST.get("weather-forecast")!;
    });

    it("has the correct forecast origin", () => {
      expect(entry.origin).toBe("https://api.open-meteo.com");
    });

    it("has the correct path", () => {
      expect(entry.path).toBe("/v1/forecast");
    });

    it("allows exactly the declared params", () => {
      expect(entry.allowedParams).toEqual(["latitude", "longitude", "current"]);
    });

    it("has 10-minute TTL (600_000 ms)", () => {
      expect(entry.ttlMs).toBe(600_000);
    });
  });

  describe("fx-latest entry", () => {
    let entry: SourceManifestEntry;
    beforeAll(() => {
      entry = SOURCE_MANIFEST.get("fx-latest")!;
    });

    it("has the correct FX origin (.dev not .app)", () => {
      expect(entry.origin).toBe("https://api.frankfurter.dev");
    });

    it("has the correct path", () => {
      expect(entry.path).toBe("/v1/latest");
    });

    it("allows exactly the declared params", () => {
      expect(entry.allowedParams).toEqual(["base", "symbols"]);
    });

    it("has 30-minute TTL (1_800_000 ms)", () => {
      expect(entry.ttlMs).toBe(1_800_000);
    });
  });

  it("allowedParams arrays are readable arrays", () => {
    const entry = SOURCE_MANIFEST.get("weather-geocode")!;
    expect(Array.isArray(entry.allowedParams)).toBe(true);
    expect(entry.allowedParams.length).toBeGreaterThan(0);
  });
});
