import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRecord } from "./db";

// fake-indexeddb/auto is already installed via src/test/setup.ts

// Helper to build minimal valid AppRecord objects for tests.
function appRecord(overrides?: Partial<AppRecord>): AppRecord {
  return {
    cacheKey: "test-key",
    type: "test-app",
    source: "function App() { return null; }",
    transpiledJS: "function App() { return null; }",
    ...overrides,
  };
}

describe("registry — happy path (IndexedDB available via fake-indexeddb)", () => {
  beforeEach(() => {
    // Reset module state between tests to get a fresh dbReady promise and clean DB
    vi.resetModules();
    // Reset the fake-indexeddb state by clearing any existing databases
    // Each test gets a fresh module with its own init
  });

  it("dbReady resolves without throwing", async () => {
    const { dbReady } = await import("./registry");
    await expect(dbReady).resolves.toBeUndefined();
  });

  it("put then get round-trips an AppRecord through the apps store", async () => {
    const { dbReady, put, get } = await import("./registry");
    await dbReady;
    const value = appRecord({ cacheKey: "test-key", type: "test-app" });
    await put("apps", value, "test-key");
    const result = await get("apps", "test-key");
    expect(result).toEqual(value);
  });

  it("del removes a value from the apps store", async () => {
    const { dbReady, put, get, del } = await import("./registry");
    await dbReady;
    await put("apps", appRecord({ cacheKey: "temp-key", type: "temp" }), "temp-key");
    await del("apps", "temp-key");
    const result = await get("apps", "temp-key");
    expect(result).toBeUndefined();
  });

  it("the probe key __probe__ does NOT remain in the store after init", async () => {
    const { dbReady, get } = await import("./registry");
    await dbReady;
    const probe = await get("apps", "__probe__");
    expect(probe).toBeUndefined();
  });

  it("AppRecord stores both source and transpiledJS (dual-cache)", async () => {
    const { dbReady, put, get } = await import("./registry");
    await dbReady;
    const rec = appRecord({
      cacheKey: "dual-key",
      type: "counter",
      source: "function App() { return null; }",
      transpiledJS: "'use strict';\nfunction App() { return null; }",
    });
    await put("apps", rec, "dual-key");
    const result = await get("apps", "dual-key");
    expect(result?.source).toBe(rec.source);
    expect(result?.transpiledJS).toBe(rec.transpiledJS);
  });

  it("put and get work for widgets store", async () => {
    const { dbReady, put, get } = await import("./registry");
    await dbReady;
    // Phase 10 (WIDGET-07): WidgetRecord now requires cacheKey/type/source/transpiledJS.
    const widget = { cacheKey: "w-key", type: "counter", source: "// src", transpiledJS: "// js" };
    await put("widgets", widget, "w-key");
    const result = await get("widgets", "w-key");
    expect(result).toEqual(widget);
  });

  it("put and get work for handlers store", async () => {
    const { dbReady, put, get } = await import("./registry");
    await dbReady;
    // Phase 10 (WIDGET-07): HandlerRecord now requires cacheKey/intent/source/transpiledJS.
    const handler = { cacheKey: "h-key", intent: "fetch-data", source: "// src", transpiledJS: "// js" };
    await put("handlers", handler, "h-key");
    const result = await get("handlers", "h-key");
    expect(result).toEqual(handler);
  });

  // Phase 7 (RESIL-06): keys() enumeration + LRU bookkeeping fields ------------

  it("keys() lists every key written to a store (used by LRU eviction)", async () => {
    const { dbReady, put, keys } = await import("./registry");
    await dbReady;
    await put("apps", appRecord({ cacheKey: "k1" }), "k1");
    await put("apps", appRecord({ cacheKey: "k2" }), "k2");
    const allKeys = await keys("apps");
    expect(allKeys).toContain("k1");
    expect(allKeys).toContain("k2");
  });

  it("round-trips the new LRU fields (useCount, updatedAt) on an AppRecord", async () => {
    const { dbReady, put, get } = await import("./registry");
    await dbReady;
    const rec = appRecord({ cacheKey: "lru", useCount: 7, updatedAt: 12345 });
    await put("apps", rec, "lru");
    const result = await get("apps", "lru");
    expect(result?.useCount).toBe(7);
    expect(result?.updatedAt).toBe(12345);
  });

  it("a v1-style record missing useCount/updatedAt reads back without the fields (migration default path)", async () => {
    // Simulate a record written by the v1 schema: NO useCount/updatedAt. The
    // additive v2 upgrade keeps it intact; consumers (the LRU layer) default the
    // missing fields to 0 on read — proven here by their absence on the record.
    const { dbReady, put, get } = await import("./registry");
    await dbReady;
    const v1Record = {
      cacheKey: "legacy",
      type: "legacy",
      source: "s",
      transpiledJS: "j",
    };
    await put("apps", v1Record as never, "legacy");
    const result = await get("apps", "legacy");
    expect(result?.useCount).toBeUndefined();
    expect(result?.updatedAt).toBeUndefined();
    // The original fields survive the upgrade untouched.
    expect(result?.source).toBe("s");
  });

  it("a record missing displayName/prompt/createdAt reads back without those fields (Phase 9 additive migration)", async () => {
    const { dbReady, put, get } = await import("./registry");
    await dbReady;
    const legacyRecord = {
      cacheKey: "v2-legacy",
      type: "counter",
      source: "s",
      transpiledJS: "j",
      useCount: 3,
      updatedAt: 1000,
    };
    await put("apps", legacyRecord as never, "v2-legacy");
    const result = await get("apps", "v2-legacy");
    expect(result?.displayName).toBeUndefined();
    expect(result?.prompt).toBeUndefined();
    expect(result?.createdAt).toBeUndefined();
    // Existing fields survive untouched.
    expect(result?.useCount).toBe(3);
    expect(result?.source).toBe("s");
  });

  it("round-trips displayName, prompt, and createdAt on an AppRecord", async () => {
    const { dbReady, put, get } = await import("./registry");
    await dbReady;
    const rec = appRecord({
      cacheKey: "rich",
      displayName: "Weather",
      prompt: "show celsius",
      createdAt: 99999,
    });
    await put("apps", rec, "rich");
    const result = await get("apps", "rich");
    expect(result?.displayName).toBe("Weather");
    expect(result?.prompt).toBe("show celsius");
    expect(result?.createdAt).toBe(99999);
  });
});

describe("registry — fallback path (storage unavailable)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("get/put/del round-trip through in-memory Map when openRegistry rejects", async () => {
    // Stub openRegistry to throw, simulating private mode / zero quota
    vi.doMock("./db", () => ({
      openRegistry: vi.fn().mockRejectedValue(new Error("IndexedDB unavailable")),
    }));

    const { dbReady, put, get, del } = await import("./registry");
    await dbReady; // must resolve even when storage fails

    const value = appRecord({ cacheKey: "fb-key", type: "fallback-app" });
    await put("apps", value, "fb-key");
    const result = await get("apps", "fb-key");
    expect(result).toEqual(value);

    await del("apps", "fb-key");
    const afterDel = await get("apps", "fb-key");
    expect(afterDel).toBeUndefined();
  });

  it("dbReady resolves even when storage is unavailable (no unhandled rejection)", async () => {
    vi.doMock("./db", () => ({
      openRegistry: vi.fn().mockRejectedValue(new Error("no storage")),
    }));

    const { dbReady } = await import("./registry");
    // Must resolve without throwing
    await expect(dbReady).resolves.toBeUndefined();
  });

  it("keys() works through the in-memory fallback when storage is unavailable", async () => {
    vi.doMock("./db", () => ({
      REGISTRY_DB_VERSION: 2,
      openRegistry: vi.fn().mockRejectedValue(new Error("no storage")),
    }));

    const { dbReady, put, keys } = await import("./registry");
    await dbReady;
    await put("apps", appRecord({ cacheKey: "m1" }), "m1");
    await put("apps", appRecord({ cacheKey: "m2" }), "m2");
    const allKeys = await keys("apps");
    expect(allKeys.sort()).toEqual(["m1", "m2"]);
  });
});

describe("registry — navigator.storage guard", () => {
  it("navigator.storage.persist() being absent does NOT throw during init", async () => {
    vi.resetModules();
    // jsdom does not implement navigator.storage — the guard must prevent a throw
    // This test verifies the guard works when navigator.storage is undefined
    const originalStorage = (navigator as { storage?: unknown }).storage;
    Object.defineProperty(navigator, "storage", {
      value: undefined,
      configurable: true,
    });

    try {
      const { dbReady } = await import("./registry");
      await expect(dbReady).resolves.toBeUndefined();
    } finally {
      // Restore
      Object.defineProperty(navigator, "storage", {
        value: originalStorage,
        configurable: true,
      });
    }
  });
});
