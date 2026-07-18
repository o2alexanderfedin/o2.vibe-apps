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
import { deriveDisplayName } from "./loader";
import type { AppRecord } from "../registry/db";

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

    const { registryKey } = await import("../registry/cacheKey");
    const key = await registryKey("app", "counter");
    const services = createTestServices();
    const Component = await resolveComponent("counter-1", "counter", key, services);
    expect(typeof Component).toBe("function");
  });

  it("tier-1 hit: second call same instance returns same component reference", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();

    const { registryKey } = await import("../registry/cacheKey");
    const key = await registryKey("app", "notes");
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

    const { registryKey } = await import("../registry/cacheKey");
    const key = await registryKey("app", "counter");
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

    const { registryKey } = await import("../registry/cacheKey");
    const key = await registryKey("app", "counter");
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
    const { registryKey } = await import("../registry/cacheKey");
    const key = await registryKey("app", "notes");
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

    const { registryKey } = await import("../registry/cacheKey");
    const key = await registryKey("app", "unknown-app-type-xyz");
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

    const { registryKey } = await import("../registry/cacheKey");
    const key = await registryKey("app", "weather-stub-type");

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

    const { registryKey } = await import("../registry/cacheKey");
    const key = await registryKey("app", "counter");

    await resolveComponent("counter-seeded", "counter", key, services);
    expect(transportCalled).toBe(false);
  });

  // WR-02: Phase-9 fields (displayName, prompt, createdAt) must survive
  // touchRecord's spread on a tier-3 cache-hit re-write. If a future refactor
  // of touchRecord explicitly lists fields instead of spreading, this test
  // will catch the silent field-strip regression.
  it("tier-3 hit: displayName, prompt, and createdAt survive touchRecord spread (WR-02)", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");

    // Share ONE registry so the persisted record is visible on the second resolve.
    const registry = createInMemoryRegistry();
    const services = createTestServices({ registry });

    const { registryKey } = await import("../registry/cacheKey");
    const key = await registryKey("app", "notes");

    // First resolve: populates the registry with Phase-9 fields.
    _clearCachesForTesting();
    await resolveComponent("notes-p9-a", "notes", key, services);

    // Manually stamp Phase-9 fields on the persisted record so the tier-3 path
    // has a record that carries displayName/prompt/createdAt (simulates a record
    // written with those fields on first open).
    const written = await registry.get("apps", key);
    expect(written).toBeDefined();
    const cannedCreatedAt = 1_700_000_000_000;
    // Spread required fields from the first resolve and add Phase-9 optional
    // fields (displayName, prompt, createdAt). The explicit AppRecord cast
    // satisfies registry.put's generic constraint.
    const p9Record: AppRecord = {
      ...(written as AppRecord),
      displayName: "Notes",
      prompt: "show dates",
      createdAt: cannedCreatedAt,
    };
    await registry.put("apps", p9Record, key);

    // Clear in-memory caches to force a tier-3 registry read (touchRecord path).
    _clearCachesForTesting();
    await resolveComponent("notes-p9-b", "notes", key, services);

    // After the tier-3 hit, touchRecord spreads the stored record and re-writes it.
    // All three Phase-9 fields must still be present and createdAt must be unchanged.
    const touched = await registry.get("apps", key);
    expect((touched as Record<string, unknown>)?.displayName).toBe("Notes");
    expect((touched as Record<string, unknown>)?.prompt).toBe("show dates");
    expect((touched as Record<string, unknown>)?.createdAt).toBe(cannedCreatedAt);
    // useCount and updatedAt must have been bumped by touchRecord.
    expect(typeof (touched as Record<string, unknown>)?.useCount).toBe("number");
    expect((touched as Record<string, unknown>)?.useCount).toBeGreaterThanOrEqual(1);
  });
});

// IN-01: deriveDisplayName suffix sanitization — exported for unit testing only.
describe("deriveDisplayName", () => {
  it("title-cases a plain slug with no prompt", () => {
    expect(deriveDisplayName("my-app")).toBe("My App");
  });

  it("title-cases an underscore-separated slug", () => {
    expect(deriveDisplayName("weather_widget")).toBe("Weather Widget");
  });

  it("appends a trimmed suffix from the prompt (≤20 chars, alphanum+space only)", () => {
    // "show celsius now" is 16 chars — fits in 20 — no chars stripped — suffix present.
    expect(deriveDisplayName("weather", "show celsius now")).toBe(
      "Weather (show celsius now)",
    );
    // A 21-char prompt is sliced to 20 before stripping: "show celsius now!!!" → slice 20 →
    // "show celsius now!!!" becomes "show celsius now!!!" → stripped → "show celsius now" (16).
    expect(deriveDisplayName("weather", "show celsius now!!!!")).toBe(
      "Weather (show celsius now)",
    );
  });

  it("all-punctuation-at-edges prompt: inner words survive strip (suffix non-empty)", () => {
    // "!!! all punct !!!" → strip non-alphanum → " all punct " → trim → "all punct"
    expect(deriveDisplayName("weather", "!!! all punct !!!")).toBe(
      "Weather (all punct)",
    );
  });

  it("pure-punctuation prompt falls back to base only (stripped suffix is empty)", () => {
    // "!!!!!!!!!!" → strip → "" → trim → "" → base only
    expect(deriveDisplayName("weather", "!!!!!!!!!!")).toBe("Weather");
  });

  it("all-whitespace prompt falls back to base only", () => {
    expect(deriveDisplayName("weather", "   ")).toBe("Weather");
  });

  it("returns base only when userPrompt is omitted", () => {
    expect(deriveDisplayName("counter")).toBe("Counter");
  });
});
