// Tests for seeded Weather + Currency handler sources (DATA-03).
//
// The handlers call fetchData(sourceId, params). Tests inject a canned broker
// that returns fixture-shaped data — no real network.
//
// Two test strategies are used:
//   1. Short-circuit tests (lines 60-111): empty registry, confirms the seeded
//      handler fires before any registry lookup or model call.
//   2. Behavior tests (lines 115+): pre-seeded registry, exercises handler logic
//      with specific fixture shapes.

import { describe, it, expect } from "vitest";
import { WEATHER_HANDLER_SOURCES } from "./weatherHandlers";
import { CURRENCY_HANDLER_SOURCES } from "./currencyHandlers";
import { transpileHandler } from "../execution/transpile";
import { runHandler } from "../execution/handler";
import { createTestServices, createInMemoryRegistry } from "../services/testServices";
import type { DataFetchBroker } from "../data/dataBroker";
import { registryKey } from "../registry/cacheKey";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pre-seed a registry with a transpiled handler source so runHandler hits the cache. */
async function seedRegistry(intent: string, source: string) {
  const registry = createInMemoryRegistry();
  const transpiledJS = transpileHandler(source, { filename: "seeded-handler.ts" });
  const key = await registryKey("handler", intent);
  await registry.put(
    "handlers",
    {
      cacheKey: key,
      intent,
      source,
      transpiledJS,
      useCount: 0,
      updatedAt: Date.now(),
    },
    key,
  );
  return { registry, transpiledJS };
}

/** A broker that routes by sourceId, returning different fixtures per source. */
function routingBroker(
  responses: Record<string, { data?: unknown; error?: string }>,
): DataFetchBroker {
  return {
    fetch: (sourceId: string, _params: unknown) => {
      const r = responses[sourceId];
      return Promise.resolve(r ?? { error: "Requested data is not available." });
    },
  };
}

// ---------------------------------------------------------------------------
// Short-circuit in resolveHandlerJS (Task 3)
// ---------------------------------------------------------------------------

describe("SEEDED_HANDLER_SOURCES short-circuit in resolveHandlerJS (DATA-03)", () => {
  it("weather handler runs WITHOUT a registry entry — short-circuit fires before cache lookup", async () => {
    // Empty registry: no pre-seeded entry, no transport configured.
    // The short-circuit must fire and execute the seeded handler.
    const [weatherIntent] = [...WEATHER_HANDLER_SOURCES.keys()];
    const broker = routingBroker({
      "weather-geocode": {
        data: { results: [{ name: "Paris", latitude: 48.8, longitude: 2.3, country: "France" }] },
      },
      "weather-forecast": {
        data: { current: { temperature_2m: 18, weather_code: 1 } },
      },
    });
    // NO transport override — unusedTransport is the default, it would throw if called
    const services = createTestServices({ fetchDataBroker: broker });

    const result = await runHandler(
      weatherIntent!,
      { state: { query: "Paris", place: "", tempC: null, condition: "", status: "idle" }, payload: "search" },
      services,
    );

    // Short-circuit fires, handler runs, no model call, no registry miss needed
    expect(result.error).toBeUndefined();
    const state = (result.data as { state: Record<string, unknown> })?.state;
    expect(state?.place).toBe("Paris, France");
    expect(state?.tempC).toBe(18);
    expect(state?.condition).toBe("Mainly clear"); // WMO code 1
    expect(state?.status).toBe("ready");
  });

  it("currency handler runs WITHOUT a registry entry — short-circuit fires before cache lookup", async () => {
    const [currencyIntent] = [...CURRENCY_HANDLER_SOURCES.keys()];
    const broker = routingBroker({
      "fx-latest": {
        data: { base: "EUR", date: "2026-06-26", rates: { USD: 1.08, GBP: 0.85 } },
      },
    });
    const services = createTestServices({ fetchDataBroker: broker });

    const result = await runHandler(
      currencyIntent!,
      { state: { base: "EUR", rates: null, status: "idle" }, payload: "load" },
      services,
    );

    expect(result.error).toBeUndefined();
    const state = (result.data as { state: Record<string, unknown> })?.state;
    expect(state?.base).toBe("EUR");
    expect(state?.rates).toEqual({ USD: 1.08, GBP: 0.85 });
    expect(state?.status).toBe("ready");
  });
});

// ---------------------------------------------------------------------------
// WEATHER_HANDLER_SOURCES
// ---------------------------------------------------------------------------

describe("WEATHER_HANDLER_SOURCES — map structure (DATA-03)", () => {
  it("exports a ReadonlyMap with exactly one entry", () => {
    expect(WEATHER_HANDLER_SOURCES.size).toBe(1);
  });

  it("the entry key includes the correct appType and action", () => {
    const [key] = [...WEATHER_HANDLER_SOURCES.keys()];
    expect(key).toContain("weather action 'search':");
    expect(key).toContain("The handler input is { state, payload }");
    expect(key).toContain("Return { data: { state } }");
  });

  it("the entry value is a non-empty handler source string", () => {
    const [, source] = [...WEATHER_HANDLER_SOURCES.entries()][0]!;
    expect(typeof source).toBe("string");
    expect(source.length).toBeGreaterThan(100);
    expect(source).toContain("weather-geocode");
    expect(source).toContain("weather-forecast");
  });
});

describe("WEATHER_HANDLER_SOURCES — handler behavior", () => {
  const [weatherIntent, weatherSource] = [...WEATHER_HANDLER_SOURCES.entries()][0]!;

  const GEOCODE_FIXTURE = {
    results: [{ name: "London", latitude: 51.5, longitude: -0.1, country: "United Kingdom" }],
  };
  const FORECAST_FIXTURE = {
    current: { temperature_2m: 12.3, weather_code: 3, wind_speed_10m: 15.2 },
  };

  it("returns ready state with place, tempC, condition on successful fetch", async () => {
    const { registry } = await seedRegistry(weatherIntent, weatherSource);
    const broker = routingBroker({
      "weather-geocode": { data: GEOCODE_FIXTURE },
      "weather-forecast": { data: FORECAST_FIXTURE },
    });
    const services = createTestServices({ registry, fetchDataBroker: broker });

    const result = await runHandler(
      weatherIntent,
      { state: { query: "London", place: "", tempC: null, condition: "", status: "idle" }, payload: "search" },
      services,
    );

    expect(result.error).toBeUndefined();
    const state = (result.data as { state: Record<string, unknown> })?.state;
    expect(state).toBeDefined();
    expect(state?.place).toBe("London, United Kingdom");
    expect(state?.tempC).toBe(12);
    expect(state?.condition).toBe("Overcast"); // WMO code 3
    expect(state?.status).toBe("ready");
  });

  it("maps WMO code 0 to 'Clear sky'", async () => {
    const { registry } = await seedRegistry(weatherIntent, weatherSource);
    const broker = routingBroker({
      "weather-geocode": { data: GEOCODE_FIXTURE },
      "weather-forecast": { data: { current: { temperature_2m: 20, weather_code: 0 } } },
    });
    const services = createTestServices({ registry, fetchDataBroker: broker });
    const result = await runHandler(weatherIntent, { state: { query: "London", place: "", tempC: null, condition: "", status: "idle" }, payload: "search" }, services);
    const state = (result.data as { state: Record<string, unknown> })?.state;
    expect(state?.condition).toBe("Clear sky");
  });

  it("maps WMO code 2 to 'Partly cloudy'", async () => {
    const { registry } = await seedRegistry(weatherIntent, weatherSource);
    const broker = routingBroker({
      "weather-geocode": { data: GEOCODE_FIXTURE },
      "weather-forecast": { data: { current: { temperature_2m: 15, weather_code: 2 } } },
    });
    const services = createTestServices({ registry, fetchDataBroker: broker });
    const result = await runHandler(weatherIntent, { state: { query: "London", place: "", tempC: null, condition: "", status: "idle" }, payload: "search" }, services);
    const state = (result.data as { state: Record<string, unknown> })?.state;
    expect(state?.condition).toBe("Partly cloudy");
  });

  it("returns status:'error' when geocode returns error", async () => {
    const { registry } = await seedRegistry(weatherIntent, weatherSource);
    const broker = routingBroker({
      "weather-geocode": { error: "Network error" },
    });
    const services = createTestServices({ registry, fetchDataBroker: broker });
    const result = await runHandler(
      weatherIntent,
      { state: { query: "London", place: "", tempC: null, condition: "", status: "idle" }, payload: "search" },
      services,
    );
    expect(result.error).toBeUndefined();
    const state = (result.data as { state: Record<string, unknown> })?.state;
    expect(state?.status).toBe("error");
  });

  it("returns status:'error' when geocode returns empty results", async () => {
    const { registry } = await seedRegistry(weatherIntent, weatherSource);
    const broker = routingBroker({
      "weather-geocode": { data: { results: [] } },
    });
    const services = createTestServices({ registry, fetchDataBroker: broker });
    const result = await runHandler(
      weatherIntent,
      { state: { query: "London", place: "", tempC: null, condition: "", status: "idle" }, payload: "search" },
      services,
    );
    const state = (result.data as { state: Record<string, unknown> })?.state;
    expect(state?.status).toBe("error");
  });

  it("returns status:'error' when forecast returns error", async () => {
    const { registry } = await seedRegistry(weatherIntent, weatherSource);
    const broker = routingBroker({
      "weather-geocode": { data: GEOCODE_FIXTURE },
      "weather-forecast": { error: "Forecast unavailable" },
    });
    const services = createTestServices({ registry, fetchDataBroker: broker });
    const result = await runHandler(
      weatherIntent,
      { state: { query: "London", place: "", tempC: null, condition: "", status: "idle" }, payload: "search" },
      services,
    );
    const state = (result.data as { state: Record<string, unknown> })?.state;
    expect(state?.status).toBe("error");
  });

  it("resets status to idle when query is empty", async () => {
    const { registry } = await seedRegistry(weatherIntent, weatherSource);
    const broker = routingBroker({});
    const services = createTestServices({ registry, fetchDataBroker: broker });
    const inputState = { query: "", place: "London, United Kingdom", tempC: 12, condition: "Overcast", status: "ready" };
    const result = await runHandler(
      weatherIntent,
      { state: inputState, payload: "search" },
      services,
    );
    expect(result.error).toBeUndefined();
    const state = (result.data as { state: Record<string, unknown> })?.state;
    // Empty query → no fetchData call, status reset to idle, other fields preserved
    expect(state?.place).toBe("London, United Kingdom");
    expect(state?.tempC).toBe(12);
    expect(state?.status).toBe("idle");
  });

  it("resets status to idle when query is empty and status was loading", async () => {
    const { registry } = await seedRegistry(weatherIntent, weatherSource);
    const broker = routingBroker({});
    const services = createTestServices({ registry, fetchDataBroker: broker });
    const inputState = { query: "", place: "", tempC: null, condition: "", status: "loading" };
    const result = await runHandler(
      weatherIntent,
      { state: inputState, payload: "search" },
      services,
    );
    expect(result.error).toBeUndefined();
    const state = (result.data as { state: Record<string, unknown> })?.state;
    // Empty query with stuck loading status must reset to idle — never echo loading back
    expect(state?.status).toBe("idle");
  });
});

// ---------------------------------------------------------------------------
// CURRENCY_HANDLER_SOURCES
// ---------------------------------------------------------------------------

describe("CURRENCY_HANDLER_SOURCES — map structure (DATA-03)", () => {
  it("exports a ReadonlyMap with exactly one entry", () => {
    expect(CURRENCY_HANDLER_SOURCES.size).toBe(1);
  });

  it("the entry key includes the correct appType and action", () => {
    const [key] = [...CURRENCY_HANDLER_SOURCES.keys()];
    expect(key).toContain("currency action 'load':");
    expect(key).toContain("The handler input is { state, payload }");
    expect(key).toContain("Return { data: { state } }");
  });

  it("the entry value is a non-empty handler source string", () => {
    const [, source] = [...CURRENCY_HANDLER_SOURCES.entries()][0]!;
    expect(typeof source).toBe("string");
    expect(source.length).toBeGreaterThan(50);
    expect(source).toContain("fx-latest");
  });
});

describe("CURRENCY_HANDLER_SOURCES — handler behavior", () => {
  const [currencyIntent, currencySource] = [...CURRENCY_HANDLER_SOURCES.entries()][0]!;

  const FX_FIXTURE = {
    amount: 1,
    base: "USD",
    date: "2026-06-26",
    rates: { EUR: 0.93, GBP: 0.79, JPY: 160.0 },
  };

  it("returns ready state with base and rates on successful fetch", async () => {
    const { registry } = await seedRegistry(currencyIntent, currencySource);
    const broker = routingBroker({ "fx-latest": { data: FX_FIXTURE } });
    const services = createTestServices({ registry, fetchDataBroker: broker });

    const result = await runHandler(
      currencyIntent,
      { state: { base: "USD", rates: null, status: "idle" }, payload: "load" },
      services,
    );

    expect(result.error).toBeUndefined();
    const state = (result.data as { state: Record<string, unknown> })?.state;
    expect(state).toBeDefined();
    expect(state?.base).toBe("USD");
    expect(state?.rates).toEqual({ EUR: 0.93, GBP: 0.79, JPY: 160.0 });
    expect(state?.status).toBe("ready");
  });

  it("returns status:'error' when fx-latest returns error", async () => {
    const { registry } = await seedRegistry(currencyIntent, currencySource);
    const broker = routingBroker({ "fx-latest": { error: "Rate data unavailable" } });
    const services = createTestServices({ registry, fetchDataBroker: broker });

    const result = await runHandler(
      currencyIntent,
      { state: { base: "USD", rates: null, status: "idle" }, payload: "load" },
      services,
    );

    expect(result.error).toBeUndefined();
    const state = (result.data as { state: Record<string, unknown> })?.state;
    expect(state?.status).toBe("error");
  });

  it("returns status:'error' when rates field is missing from response", async () => {
    const { registry } = await seedRegistry(currencyIntent, currencySource);
    const broker = routingBroker({ "fx-latest": { data: { base: "USD", amount: 1 } } });
    const services = createTestServices({ registry, fetchDataBroker: broker });

    const result = await runHandler(
      currencyIntent,
      { state: { base: "USD", rates: null, status: "idle" }, payload: "load" },
      services,
    );

    const state = (result.data as { state: Record<string, unknown> })?.state;
    expect(state?.status).toBe("error");
  });

  it("passes the state.base to fx-latest", async () => {
    const { registry } = await seedRegistry(currencyIntent, currencySource);
    let capturedSourceId = "";
    let capturedParams: unknown = null;
    const capturingBroker: DataFetchBroker = {
      fetch: (sourceId: string, params: unknown) => {
        capturedSourceId = sourceId;
        capturedParams = params;
        return Promise.resolve({ data: FX_FIXTURE });
      },
    };
    const services = createTestServices({ registry, fetchDataBroker: capturingBroker });

    await runHandler(
      currencyIntent,
      { state: { base: "EUR", rates: null, status: "idle" }, payload: "load" },
      services,
    );

    expect(capturedSourceId).toBe("fx-latest");
    expect((capturedParams as Record<string, unknown>)?.base).toBe("EUR");
  });

  it("uses 'USD' as base when state.base is missing or empty", async () => {
    const { registry } = await seedRegistry(currencyIntent, currencySource);
    let capturedParams: unknown = null;
    const capturingBroker: DataFetchBroker = {
      fetch: (_sourceId: string, params: unknown) => {
        capturedParams = params;
        return Promise.resolve({ data: FX_FIXTURE });
      },
    };
    const services = createTestServices({ registry, fetchDataBroker: capturingBroker });

    await runHandler(
      currencyIntent,
      { state: { base: "", rates: null, status: "idle" }, payload: "load" },
      services,
    );

    expect((capturedParams as Record<string, unknown>)?.base).toBe("USD");
  });
});
