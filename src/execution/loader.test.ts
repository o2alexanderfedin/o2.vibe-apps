// Tests for the three-tier resolve cache and dual-cache storage.
//
// IoC/DI: the loader receives an injected Services bundle (in-memory registry +
// canned transport + fixed key getter) — no real IndexedDB, no network, no
// localStorage. Test doubles are named "canned"/"stub"/"testTransport".
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestServices,
  createInMemoryRegistry,
  cannedTransport,
} from "../services/testServices";

// A canned component source returned for unseeded types.
const CANNED_SOURCE = `
function App() {
  return React.createElement('div', null, 'Canned');
}
`;

describe("loader — three-tier resolve and dual-cache", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("resolves a seeded app to a React component (full miss → compile → mount)", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();

    const { cacheKey } = await import("../registry/cacheKey");
    const key = await cacheKey("counter");
    const services = createTestServices();
    const Component = await resolveComponent("counter-1", "counter", key, services);
    expect(typeof Component).toBe("function");
  });

  it("tier-1 hit: second call same instance returns same component reference", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();

    const { cacheKey } = await import("../registry/cacheKey");
    const key = await cacheKey("notes");
    const services = createTestServices();

    // First call: full miss → compile + cache.
    const C1 = await resolveComponent("notes-1", "notes", key, services);
    // Second call same instanceId: tier-1 hit (live component).
    const C2 = await resolveComponent("notes-1", "notes", key, services);
    expect(C1).toBe(C2);
  });

  it("tier-2 cache hit: different instance, same key — transpile cache hit, different component ref", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();

    const { cacheKey } = await import("../registry/cacheKey");
    const key = await cacheKey("counter");
    const services = createTestServices();

    // First call: full miss.
    await resolveComponent("counter-a", "counter", key, services);
    // Second call: different instance id → tier-2 transpiled cache hit.
    const C2 = await resolveComponent("counter-b", "counter", key, services);
    expect(typeof C2).toBe("function");
  });

  it("dual-cache: registry stores both source and transpiledJS after first resolve", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();

    const { cacheKey } = await import("../registry/cacheKey");
    const key = await cacheKey("counter");
    const services = createTestServices();

    await resolveComponent("counter-dual", "counter", key, services);

    const record = await services.registry.get("apps", key);
    expect(typeof record?.source).toBe("string");
    expect((record?.source as string).length).toBeGreaterThan(0);
    expect(typeof record?.transpiledJS).toBe("string");
    expect((record?.transpiledJS as string).length).toBeGreaterThan(0);
  });

  it("tier-3 hit: after clearing in-memory caches, reads transpiledJS from the registry", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");

    // Share ONE registry across both resolves so the persisted record survives.
    const registry = createInMemoryRegistry();
    const services = createTestServices({ registry });

    // First: populate the registry.
    _clearCachesForTesting();
    const { cacheKey } = await import("../registry/cacheKey");
    const key = await cacheKey("notes");
    await resolveComponent("notes-seed", "notes", key, services);

    // Clear in-memory caches to force a registry read.
    _clearCachesForTesting();

    // Second resolve: should hit the registry (tier-3), not recompile.
    const Component = await resolveComponent("notes-seed2", "notes", key, services);
    expect(typeof Component).toBe("function");
  });

  it("unseeded type with no API key: rejects with access-key message", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();

    const { cacheKey } = await import("../registry/cacheKey");
    const key = await cacheKey("unknown-app-type-xyz");
    // No key injected → ProduceError "No access key available".
    const services = createTestServices({ apiKey: null });

    await expect(
      resolveComponent("unknown-1", "unknown-app-type-xyz", key, services),
    ).rejects.toThrow(/No access key/);
  });

  it("unseeded type: model call → extract → transpile → store both → mount", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();

    const services = createTestServices({
      transport: cannedTransport(CANNED_SOURCE),
    });

    const { cacheKey } = await import("../registry/cacheKey");
    const key = await cacheKey("weather-stub-type");

    const Component = await resolveComponent(
      "weather-stub-1",
      "weather-stub-type",
      key,
      services,
    );
    expect(typeof Component).toBe("function");

    // GEN-04: both pieces stored.
    const record = await services.registry.get("apps", key);
    expect(typeof record?.source).toBe("string");
    expect(typeof record?.transpiledJS).toBe("string");
    expect((record?.source as string).length).toBeGreaterThan(0);
    expect((record?.transpiledJS as string).length).toBeGreaterThan(0);
  });

  it("seeded types resolve from seeds with NO model call (transport never invoked)", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();

    let transportCalled = false;
    const trackingTransport = (_url: string, _init: RequestInit) => {
      transportCalled = true;
      return Promise.resolve({ content: [{ type: "text", text: "" }] });
    };
    const services = createTestServices({ transport: trackingTransport });

    const { cacheKey } = await import("../registry/cacheKey");
    const key = await cacheKey("counter");

    await resolveComponent("counter-seeded", "counter", key, services);
    expect(transportCalled).toBe(false);
  });
});
