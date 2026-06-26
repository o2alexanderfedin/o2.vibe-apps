// @vitest-environment node
// Node environment is required: the jsdom key-shim replaces global ArrayBuffer,
// which makes crypto.subtle.digest throw a TypeError (vitest #5365, closed not-planned).
// cacheKey is a pure function with no DOM dependency, so Node is the correct env.
import { describe, expect, it } from "vitest";

import { cacheKey, registryKey } from "./cacheKey";

describe("cacheKey — opaque SHA-256 over normalized input", () => {
  it("is deterministic: the same input twice yields the identical key", async () => {
    const a = await cacheKey("weather");
    const b = await cacheKey("weather");
    expect(a).toBe(b);
  });

  it("normalization equivalence: 'Weather ', 'weather', and 'WEATHER ' all match", async () => {
    const trailing = await cacheKey("Weather ");
    const lower = await cacheKey("weather");
    const upper = await cacheKey("WEATHER ");
    expect(trailing).toBe(lower);
    expect(upper).toBe(lower);
  });

  it("collapses internal whitespace: 'a   b' equals 'a b'", async () => {
    const collapsed = await cacheKey("a   b");
    const single = await cacheKey("a b");
    expect(collapsed).toBe(single);
  });

  it("output is a 64-char lowercase hex string", async () => {
    const key = await cacheKey("weather");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("output is opaque: the readable type slug never appears in the key", async () => {
    const key = await cacheKey("weather");
    expect(key.includes("weather")).toBe(false);
  });

  it("is unicode/emoji safe: does not throw and yields a valid 64-hex key", async () => {
    const key = await cacheKey("weather ☀️ 天气");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("distinct inputs produce distinct keys (no collision on minimal difference)", async () => {
    const weather = await cacheKey("weather");
    const calculator = await cacheKey("calculator");
    expect(weather).not.toBe(calculator);
  });
});

describe("registryKey — structured opaque key over (kind, type, prompt)", () => {
  it("is deterministic for the same parts", async () => {
    expect(await registryKey("app", "weather")).toBe(
      await registryKey("app", "weather"),
    );
  });

  it("folds in kind: app, widget, and handler with the same type slug all differ", async () => {
    const app = await registryKey("app", "weather");
    const widget = await registryKey("widget", "weather");
    const handler = await registryKey("handler", "weather");
    expect(app).not.toBe(widget);
    expect(app).not.toBe(handler);
    expect(widget).not.toBe(handler);
  });

  it("folds in prompt: a prompted variant keys separately from the baseline", async () => {
    const base = await registryKey("app", "weather");
    const tweaked = await registryKey("app", "weather", "make it dark");
    expect(tweaked).not.toBe(base);
  });

  it("normalizes the prompt: case + leading/trailing/inner whitespace are equivalent", async () => {
    const messy = await registryKey("app", "weather", "  Make It   Dark  ");
    const clean = await registryKey("app", "weather", "make it dark");
    expect(messy).toBe(clean);
  });

  it("normalizes the type the same way the single-arg key does", async () => {
    expect(await registryKey("app", "Weather ")).toBe(
      await registryKey("app", "weather"),
    );
  });

  it("an absent prompt equals an empty-string prompt", async () => {
    expect(await registryKey("app", "weather")).toBe(
      await registryKey("app", "weather", ""),
    );
  });

  it("no field-boundary blur: (type='a', prompt='b') differs from (type='a b')", async () => {
    const split = await registryKey("app", "a", "b");
    const joined = await registryKey("app", "a b");
    expect(split).not.toBe(joined);
  });

  it("output is a 64-char lowercase hex string", async () => {
    expect(await registryKey("app", "weather", "x")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("output is opaque: kind, type slug, and prompt never appear in the key", async () => {
    const key = await registryKey("app", "weather", "humidity");
    expect(key.includes("app")).toBe(false);
    expect(key.includes("weather")).toBe(false);
    expect(key.includes("humidity")).toBe(false);
  });

  it("is unicode/emoji safe across every part", async () => {
    expect(await registryKey("widget", "天气 ☀️", "热")).toMatch(/^[0-9a-f]{64}$/);
  });
});
