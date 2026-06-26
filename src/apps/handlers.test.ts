// Integration tests for Phase 12 handler path: seeded Weather + Currency handlers
// with real-shape API fixtures, no-broker fallback, and fetch-bypass proof.
//
// Coverage notes:
//   - Tests 7 + 8 (weather/currency integration): also covered in seededHandlers.test.ts
//     with slightly different fixture shapes; this file uses the EXACT verified live
//     API response shapes from CONTEXT.md and verifies specific numeric fields.
//   - Test 9 (no-broker fallback): also covered in handler.test.ts
//     ("runHandler with no fetchDataBroker: boundFetchData returns neutral {error}").
//   - Test 10 (fetch bypass via executeHandlerSource): this file provides the
//     specific boolean-form assertion not covered elsewhere.
//
// All tests run offline — no real network, no real IndexedDB.

import { describe, it, expect } from "vitest";
import { runHandler, executeHandlerSource } from "../execution/handler";
import { createTestServices } from "../services/testServices";
import type { DataFetchBroker } from "../data/dataBroker";
import { WEATHER_HANDLER_SOURCES } from "./weatherHandlers";
import { CURRENCY_HANDLER_SOURCES } from "./currencyHandlers";

// ---------------------------------------------------------------------------
// Verified live API response fixtures (CONTEXT.md specifics, 2026-06-26)
// ---------------------------------------------------------------------------

const GEOCODE_FIXTURE = {
  results: [
    {
      name: "London",
      latitude: 51.5085,
      longitude: -0.1257,
      country: "United Kingdom",
      country_code: "GB",
      admin1: "England",
      timezone: "Europe/London",
    },
  ],
  generationtime_ms: 0.5,
};

const FORECAST_FIXTURE = {
  latitude: 51.5,
  longitude: -0.125,
  elevation: 11.0,
  timezone: "Europe/London",
  current_units: {
    time: "iso8601",
    interval: "seconds",
    temperature_2m: "°C",
    weather_code: "wmo code",
    wind_speed_10m: "km/h",
  },
  current: {
    time: "2026-06-26T12:00",
    interval: 900,
    temperature_2m: 18.3,
    weather_code: 2,
    wind_speed_10m: 14.4,
  },
};

const FX_FIXTURE = {
  amount: 1.0,
  base: "USD",
  date: "2026-06-26",
  rates: { EUR: 0.928, GBP: 0.7863, JPY: 159.42 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Routes fetchData calls by sourceId — enables sequential geocode→forecast tests. */
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
// Test 7: Weather seeded handler — real-shape geocode + forecast fixtures
// ---------------------------------------------------------------------------

describe("Weather seeded handler — real-shape fixtures (DATA-03, DATA-04)", () => {
  const [weatherIntent] = [...WEATHER_HANDLER_SOURCES.keys()];

  it("maps geocode + forecast fixtures to correct state fields", async () => {
    // Sequential broker: first call (weather-geocode) returns the geocode fixture;
    // second call (weather-forecast) returns the forecast fixture.
    const broker = routingBroker({
      "weather-geocode": { data: GEOCODE_FIXTURE },
      "weather-forecast": { data: FORECAST_FIXTURE },
    });
    const services = createTestServices({ fetchDataBroker: broker });

    const result = await runHandler(
      weatherIntent!,
      {
        state: { query: "London", place: "", tempC: null, condition: "", status: "idle" },
        payload: "search",
      },
      services,
    );

    expect(result.error).toBeUndefined();
    const state = (result.data as { state: Record<string, unknown> })?.state;
    expect(state).toBeDefined();
    // place: first result's name + ", " + country
    expect(state?.place).toBe("London, United Kingdom");
    // tempC: Math.round(18.3) → 18
    expect(state?.tempC).toBe(18);
    // condition: WMO code 2 → "Partly cloudy"
    expect(state?.condition).toBe("Partly cloudy");
    expect(state?.status).toBe("ready");
  });
});

// ---------------------------------------------------------------------------
// Test 8: Currency seeded handler — real-shape fx fixture
// ---------------------------------------------------------------------------

describe("Currency seeded handler — real-shape fx fixture (DATA-03)", () => {
  const [currencyIntent] = [...CURRENCY_HANDLER_SOURCES.keys()];

  it("maps fx fixture to correct state fields", async () => {
    const broker = routingBroker({
      "fx-latest": { data: FX_FIXTURE },
    });
    const services = createTestServices({ fetchDataBroker: broker });

    const result = await runHandler(
      currencyIntent!,
      { state: { base: "USD", rates: null, status: "idle" }, payload: "load" },
      services,
    );

    expect(result.error).toBeUndefined();
    const state = (result.data as { state: Record<string, unknown> })?.state;
    expect(state).toBeDefined();
    // rates.EUR from the fixture
    expect((state?.rates as Record<string, number>)?.EUR).toBe(0.928);
    expect(state?.status).toBe("ready");
    expect(state?.base).toBe("USD");
  });
});

// ---------------------------------------------------------------------------
// Test 9: No-broker fallback — absent broker → state.status="error", no throw
// ---------------------------------------------------------------------------

describe("No-broker fallback — status='error', never a thrown rejection (DATA-01)", () => {
  const [weatherIntent] = [...WEATHER_HANDLER_SOURCES.keys()];

  it("returns status='error' when fetchDataBroker is absent (not a rejection)", async () => {
    // createTestServices() with NO fetchDataBroker — the bound fetchData stub
    // returns { error } and the handler propagates it to state.status.
    const services = createTestServices();

    const result = await runHandler(
      weatherIntent!,
      {
        state: { query: "London", place: "", tempC: null, condition: "", status: "idle" },
        payload: "search",
      },
      services,
    );

    // Must NOT throw — result is always a { data } or { error } HandlerResult.
    expect(result).toBeDefined();
    // The handler receives { error } from fetchData and propagates it to state.status.
    const state = (result.data as { state: Record<string, unknown> } | undefined)?.state;
    if (state !== undefined) {
      expect(state.status).toBe("error");
    } else {
      // If the handler itself returned { error }, the broker absence was surfaced neutrally.
      expect(typeof result.error).toBe("string");
      expect(result.error).not.toMatch(/broker|service|inject/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 10: Fetch bypass proof — executeHandlerSource with typeof checks
// ---------------------------------------------------------------------------

describe("Handler constrained scope — fetch bypass proof (DATA-01, HANDLER-03)", () => {
  it("fetch and XMLHttpRequest are both undefined in the handler scope", async () => {
    // This handler checks typeof fetch and typeof XMLHttpRequest using the
    // boolean form (=== 'undefined') so both false-positive surfaces are caught.
    const source = `
      async function handler(input) {
        return {
          data: {
            fetchIsUndefined: typeof fetch === 'undefined',
            xhrIsUndefined: typeof XMLHttpRequest === 'undefined',
          }
        };
      }
    `;

    const result = await executeHandlerSource(source, {});

    expect(result.error).toBeUndefined();
    const data = result.data as { fetchIsUndefined: boolean; xhrIsUndefined: boolean };
    expect(data.fetchIsUndefined).toBe(true);
    expect(data.xhrIsUndefined).toBe(true);
  });

  it("WebSocket is undefined in the handler scope", async () => {
    const source = `
      async function handler(input) {
        return { data: { wsIsUndefined: typeof WebSocket === 'undefined' } };
      }
    `;
    const result = await executeHandlerSource(source, {});
    expect(result.error).toBeUndefined();
    expect((result.data as { wsIsUndefined: boolean }).wsIsUndefined).toBe(true);
  });
});
