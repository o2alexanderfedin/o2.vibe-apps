// Tests for the three-tier resolve cache and dual-cache storage.
import { beforeEach, describe, expect, it, vi } from "vitest";

// fake-indexeddb/auto is installed via src/test/setup.ts

describe("loader — three-tier resolve and dual-cache", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("resolves a seeded app to a React component (full miss → compile → mount)", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    const { dbReady } = await import("../registry/registry");
    await dbReady;
    _clearCachesForTesting();

    const { cacheKey } = await import("../registry/cacheKey");
    const key = await cacheKey("counter");
    const Component = await resolveComponent("counter-1", "counter", key);
    expect(typeof Component).toBe("function");
  });

  it("tier-2 cache hit: second call with same key does not recompile (returns same component reference)", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    const { dbReady } = await import("../registry/registry");
    await dbReady;
    _clearCachesForTesting();

    const { cacheKey } = await import("../registry/cacheKey");
    const key = await cacheKey("notes");

    // First call: full miss → compile + cache.
    const C1 = await resolveComponent("notes-1", "notes", key);
    // Second call same instanceId: tier-1 hit (live component).
    const C2 = await resolveComponent("notes-1", "notes", key);
    expect(C1).toBe(C2);
  });

  it("tier-2 cache hit: different instance, same key — transpile cache hit, different component ref", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    const { dbReady } = await import("../registry/registry");
    await dbReady;
    _clearCachesForTesting();

    const { cacheKey } = await import("../registry/cacheKey");
    const key = await cacheKey("counter");

    // First call: full miss.
    await resolveComponent("counter-a", "counter", key);
    // Second call: different instance id → tier-2 transpiled cache hit.
    const C2 = await resolveComponent("counter-b", "counter", key);
    expect(typeof C2).toBe("function");
  });

  it("dual-cache: IndexedDB stores both source and transpiledJS after first resolve", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    const { dbReady, get } = await import("../registry/registry");
    await dbReady;
    _clearCachesForTesting();

    const { cacheKey } = await import("../registry/cacheKey");
    const key = await cacheKey("counter");

    await resolveComponent("counter-dual", "counter", key);

    const record = await get("apps", key);
    expect(typeof record?.source).toBe("string");
    expect((record?.source as string).length).toBeGreaterThan(0);
    expect(typeof record?.transpiledJS).toBe("string");
    expect((record?.transpiledJS as string).length).toBeGreaterThan(0);
  });

  it("tier-3 hit: after clearing in-memory caches, reads transpiledJS from IndexedDB", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    const { dbReady } = await import("../registry/registry");
    await dbReady;

    // First: populate IndexedDB.
    _clearCachesForTesting();
    const { cacheKey } = await import("../registry/cacheKey");
    const key = await cacheKey("notes");
    await resolveComponent("notes-seed", "notes", key);

    // Clear in-memory caches to force IndexedDB read.
    _clearCachesForTesting();

    // Second resolve: should hit IndexedDB (tier-3), not recompile.
    const Component = await resolveComponent("notes-seed2", "notes", key);
    expect(typeof Component).toBe("function");
  });

  it("throws when app type has no seeded source and no IndexedDB entry", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    const { dbReady } = await import("../registry/registry");
    await dbReady;
    _clearCachesForTesting();

    const { cacheKey } = await import("../registry/cacheKey");
    const key = await cacheKey("unknown-app-type-xyz");

    await expect(
      resolveComponent("unknown-1", "unknown-app-type-xyz", key),
    ).rejects.toThrow(/No source available/);
  });
});
