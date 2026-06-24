import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ANTHROPIC_API_BASE,
  ANTHROPIC_MODEL,
  assertAnthropicTarget,
  buildHeaders,
} from "./modelClient";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("modelClient — Anthropic egress header stub", () => {
  it("exposes the base URL and dated model constants", () => {
    expect(ANTHROPIC_API_BASE).toBe("https://api.anthropic.com");
    expect(ANTHROPIC_MODEL).toBe("claude-haiku-4-5-20251001");
  });

  it("buildHeaders returns exactly the 4 mandatory headers with exact values", () => {
    const headers = buildHeaders("sk-ant-test123");
    expect(headers).toEqual({
      "content-type": "application/json",
      "x-api-key": "sk-ant-test123",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
    // Exactly 4 keys — no extras leak into the request shape.
    expect(Object.keys(headers)).toHaveLength(4);
  });

  it("places the key at call time only — no console.* fires during buildHeaders", () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "info").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
      vi.spyOn(console, "debug").mockImplementation(() => {}),
    ];

    buildHeaders("sk-ant-secret-should-never-be-logged");

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("does not retain the key in any module-level state between calls", () => {
    // Two distinct keys must each only appear in their own returned object.
    const first = buildHeaders("sk-ant-alpha");
    const second = buildHeaders("sk-ant-beta");
    expect(first["x-api-key"]).toBe("sk-ant-alpha");
    expect(second["x-api-key"]).toBe("sk-ant-beta");
    // The first object is unchanged by the second call (no shared mutable state).
    expect(first["x-api-key"]).toBe("sk-ant-alpha");
  });

  it("assertAnthropicTarget is a Phase-1 no-op seam (does not throw)", () => {
    expect(() => assertAnthropicTarget("https://api.anthropic.com/v1/messages")).not.toThrow();
    // Even a non-Anthropic target does not throw in Phase 1 (Phase 3 enforces).
    expect(() => assertAnthropicTarget("https://example.com/")).not.toThrow();
  });
});
