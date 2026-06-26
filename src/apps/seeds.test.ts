// Tests for seeded Weather + Currency delegated modules (DATA-03).
// Verifies initialState, actionSpec, and view() output against the DelegatedModule
// contract, using canned fixture data — no real network.

import { describe, it, expect } from "vitest";
import { SEEDED_SOURCES } from "./seeds";
import { instantiateDelegated } from "../execution/delegated";
import { transpile } from "../execution/transpile";

// Helper: instantiate a seeded delegated module by appType
function instantiate(appType: string) {
  const source = SEEDED_SOURCES.get(appType);
  if (!source) throw new Error(`No seeded source for appType "${appType}"`);
  const js = transpile(source, { filename: appType + ".tsx" });
  return instantiateDelegated(js);
}

describe("SEEDED_SOURCES — Weather module (DATA-03)", () => {
  it("has an entry for 'weather'", () => {
    expect(SEEDED_SOURCES.has("weather")).toBe(true);
    expect(SEEDED_SOURCES.get("weather")).toBeTruthy();
  });

  it("instantiates to a valid DelegatedModule", () => {
    const mod = instantiate("weather");
    expect(typeof mod.view).toBe("function");
    expect(typeof mod.actionSpec).toBe("string");
    expect(typeof mod.initialState).toBe("object");
  });

  it("initialState has required fields with correct initial values", () => {
    const { initialState } = instantiate("weather");
    expect(initialState.query).toBe("");
    expect(initialState.place).toBe("");
    expect(initialState.tempC).toBeNull();
    expect(initialState.condition).toBe("");
    expect(initialState.status).toBe("idle");
  });

  it("actionSpec includes the state shape and search action description", () => {
    const { actionSpec } = instantiate("weather");
    expect(actionSpec).toContain("query");
    expect(actionSpec).toContain("tempC");
    expect(actionSpec).toContain("condition");
    expect(actionSpec).toContain("status");
    expect(actionSpec).toContain("search");
  });

  it("actionSpec is a single-line string with no embedded newlines", () => {
    const { actionSpec } = instantiate("weather");
    expect(actionSpec).not.toContain("\n");
  });

  it("view returns a ReactNode for idle status", () => {
    const { view, initialState } = instantiate("weather");
    const node = view(initialState);
    expect(node).toBeTruthy();
    expect(typeof node).toBe("object");
  });

  it("view in loading status returns node with aria-busy", () => {
    const { view, initialState } = instantiate("weather");
    const node = view({ ...initialState, status: "loading" }) as unknown as Record<string, unknown>;
    expect(node).toBeTruthy();
    // The node props should have aria-busy="true"
    const props = node.props as Record<string, unknown>;
    expect(props["aria-busy"]).toBe("true");
  });

  it("view in error status returns node with neutral error copy", () => {
    const { view, initialState } = instantiate("weather");
    // Render to string by walking React element tree
    const node = view({ ...initialState, status: "error" });
    const str = JSON.stringify(node);
    // Check for the error copy (apostrophe may be curly or straight depending on source encoding)
    expect(str).toMatch(/Couldn.t load conditions/);
  });

  it("view in idle status contains 'Enter a location'", () => {
    const { view, initialState } = instantiate("weather");
    const node = view(initialState);
    const str = JSON.stringify(node);
    expect(str).toContain("Enter a location");
  });

  it("view in ready status shows place and temperature", () => {
    const { view, initialState } = instantiate("weather");
    const state = { ...initialState, place: "London, GB", tempC: 12, condition: "Partly cloudy", status: "ready" };
    const node = view(state);
    const str = JSON.stringify(node);
    expect(str).toContain("London, GB");
    expect(str).toContain("12");
  });

  it("interactive elements use data-action='search', not onClick", () => {
    const { view, initialState } = instantiate("weather");
    const node = view(initialState);
    const str = JSON.stringify(node);
    expect(str).toContain("data-action");
    expect(str).toContain("search");
    // No onClick in the view markup (shell owns event handling)
    expect(str).not.toContain("onClick");
  });

  it("view contains no mechanic-revealing copy", () => {
    const { view, initialState } = instantiate("weather");
    for (const status of ["idle", "loading", "ready", "error"]) {
      const str = JSON.stringify(view({ ...initialState, status }));
      expect(str).not.toMatch(/\bAI\b/);
      expect(str).not.toMatch(/\bllm\b/i);
      expect(str).not.toMatch(/synthesi[sz]/i);
      expect(str).not.toMatch(/\bgenerat(e|ed|ing)\b/i);
    }
  });
});

describe("SEEDED_SOURCES — Currency module (DATA-03)", () => {
  it("has an entry for 'currency'", () => {
    expect(SEEDED_SOURCES.has("currency")).toBe(true);
    expect(SEEDED_SOURCES.get("currency")).toBeTruthy();
  });

  it("instantiates to a valid DelegatedModule", () => {
    const mod = instantiate("currency");
    expect(typeof mod.view).toBe("function");
    expect(typeof mod.actionSpec).toBe("string");
    expect(typeof mod.initialState).toBe("object");
  });

  it("initialState has required fields with correct initial values", () => {
    const { initialState } = instantiate("currency");
    expect(initialState.base).toBe("USD");
    expect(initialState.rates).toBeNull();
    expect(initialState.status).toBe("idle");
  });

  it("actionSpec includes the state shape and load action description", () => {
    const { actionSpec } = instantiate("currency");
    expect(actionSpec).toContain("base");
    expect(actionSpec).toContain("rates");
    expect(actionSpec).toContain("status");
    expect(actionSpec).toContain("load");
  });

  it("actionSpec is a single-line string with no embedded newlines", () => {
    const { actionSpec } = instantiate("currency");
    expect(actionSpec).not.toContain("\n");
  });

  it("view returns a ReactNode for idle status", () => {
    const { view, initialState } = instantiate("currency");
    const node = view(initialState);
    expect(node).toBeTruthy();
    expect(typeof node).toBe("object");
  });

  it("view in loading status returns node with aria-busy", () => {
    const { view, initialState } = instantiate("currency");
    const node = view({ ...initialState, status: "loading" }) as unknown as Record<string, unknown>;
    const props = node.props as Record<string, unknown>;
    expect(props["aria-busy"]).toBe("true");
  });

  it("view in loading status contains 'Loading rates'", () => {
    const { view, initialState } = instantiate("currency");
    const node = view({ ...initialState, status: "loading" });
    const str = JSON.stringify(node);
    expect(str).toContain("Loading rates");
  });

  it("view in error status contains neutral error copy", () => {
    const { view, initialState } = instantiate("currency");
    const node = view({ ...initialState, status: "error" });
    const str = JSON.stringify(node);
    // Check for the error copy (apostrophe may be curly or straight depending on source encoding)
    expect(str).toMatch(/Couldn.t load rates/);
  });

  it("view in ready status renders rate information", () => {
    const { view, initialState } = instantiate("currency");
    const state = { ...initialState, base: "USD", rates: { EUR: 0.93, GBP: 0.79 }, status: "ready" };
    const node = view(state);
    const str = JSON.stringify(node);
    expect(str).toContain("EUR");
    expect(str).toContain("GBP");
    expect(str).toContain("USD");
  });

  it("interactive elements use data-action='load', not onClick", () => {
    const { view, initialState } = instantiate("currency");
    const node = view(initialState);
    const str = JSON.stringify(node);
    expect(str).toContain("data-action");
    expect(str).toContain("load");
    expect(str).not.toContain("onClick");
  });

  it("view contains no mechanic-revealing copy", () => {
    const { view, initialState } = instantiate("currency");
    for (const status of ["idle", "loading", "ready", "error"]) {
      const str = JSON.stringify(view({ ...initialState, status }));
      expect(str).not.toMatch(/\bAI\b/);
      expect(str).not.toMatch(/\bllm\b/i);
      expect(str).not.toMatch(/synthesi[sz]/i);
      expect(str).not.toMatch(/\bgenerat(e|ed|ing)\b/i);
    }
  });
});

describe("SEEDED_SOURCES — map integrity", () => {
  it("has all 4 expected entries (counter, notes, weather, currency)", () => {
    expect(SEEDED_SOURCES.has("counter")).toBe(true);
    expect(SEEDED_SOURCES.has("notes")).toBe(true);
    expect(SEEDED_SOURCES.has("weather")).toBe(true);
    expect(SEEDED_SOURCES.has("currency")).toBe(true);
    expect(SEEDED_SOURCES.size).toBe(4);
  });
});
