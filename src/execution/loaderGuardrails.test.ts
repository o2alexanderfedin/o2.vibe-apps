// DI integration tests — the loader consumes the INJECTED produce gate and
// storage seam for the Phase 7 guardrails (RESIL-05 cost cap, RESIL-06 LRU).
//
// Everything is injected: a real produce gate wired to a STUB clock (so the
// rolling window is driven by virtual time — zero real waits), a canned transport
// (no network), an in-memory registry (no IndexedDB), and a stub storage seam
// returning a controlled usage/quota (no real navigator.storage). So the cap, the
// hit/miss accounting, and the pre-write eviction are proven with NO real time and
// NO real storage. Doubles are named canned/stub (never the banned tokens).

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestServices,
  createInMemoryRegistry,
  cannedTransport,
} from "../services/testServices";
import type { Registry } from "../services/registry";
import type { StoragePressureSeam, StorageEstimate } from "../host/storageEstimate";
import { createProduceGate, ProduceThrottledError } from "../host/produceGate";
import { createStubClock } from "../host/clock";

const CANNED_SOURCE = `
function App() {
  return React.createElement('div', null, 'Canned');
}
`;

/** A storage seam whose ratio falls as the registry shrinks (models relief). */
function shrinkingSeam(registry: Registry, quota: number, bytesPerEntry: number): StoragePressureSeam {
  return {
    requestPersist: () => Promise.resolve(true),
    estimate: async (): Promise<StorageEstimate> => {
      const count =
        (await registry.keys("apps")).length +
        (await registry.keys("widgets")).length +
        (await registry.keys("handlers")).length;
      return { usage: count * bytesPerEntry, quota };
    },
  };
}

beforeEach(() => {
  vi.resetModules();
});

describe("DI — produce-cost cap is enforced at the loader produce path (RESIL-05)", () => {
  it("allows up to N misses, then blocks the (N+1)th with the neutral throttled error", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();
    const { registryKey } = await import("../registry/cacheKey");

    const clock = createStubClock();
    const produceGate = createProduceGate({ clock, cap: 2, windowMs: 1000 });
    const services = createTestServices({
      transport: cannedTransport(CANNED_SOURCE),
      produceGate,
    });

    // Two distinct UNSEEDED types → two produce misses → both allowed.
    for (const type of ["miss-type-a", "miss-type-b"]) {
      const key = await registryKey("app", type);
      await expect(
        resolveComponent(type + "-1", type, key, services),
      ).resolves.toBeTypeOf("function");
    }

    // A third distinct unseeded type → the (N+1)th produce → blocked, no model call.
    const key = await registryKey("app", "miss-type-c");
    await expect(
      resolveComponent("miss-type-c-1", "miss-type-c", key, services),
    ).rejects.toBeInstanceOf(ProduceThrottledError);
  });

  it("RECOVERS after the window advances (stub clock) — a later open succeeds", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();
    const { registryKey } = await import("../registry/cacheKey");

    const clock = createStubClock();
    const produceGate = createProduceGate({ clock, cap: 1, windowMs: 1000 });
    const services = createTestServices({
      transport: cannedTransport(CANNED_SOURCE),
      produceGate,
    });

    const k1 = await registryKey("app", "recover-a");
    await resolveComponent("recover-a-1", "recover-a", k1, services); // allowed

    const k2 = await registryKey("app", "recover-b");
    await expect(
      resolveComponent("recover-b-1", "recover-b", k2, services),
    ).rejects.toBeInstanceOf(ProduceThrottledError);

    // Advance virtual time past the window — capacity frees up (no real wait).
    clock.sleep(1001);

    const k3 = await registryKey("app", "recover-c");
    await expect(
      resolveComponent("recover-c-1", "recover-c", k3, services),
    ).resolves.toBeTypeOf("function");
  });

  it("cache HITS do NOT count against the cap (only misses that reach the model)", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();
    const { registryKey } = await import("../registry/cacheKey");

    const clock = createStubClock();
    // cap 1: exactly one produce miss is allowed in the window.
    const produceGate = createProduceGate({ clock, cap: 1, windowMs: 10_000 });
    const registry = createInMemoryRegistry();
    const services = createTestServices({
      transport: cannedTransport(CANNED_SOURCE),
      produceGate,
      registry,
    });

    const key = await registryKey("app", "hot-type");

    // First open: a MISS → produce → counts as 1 (the only allowed slot).
    await resolveComponent("hot-1", "hot-type", key, services);

    // Re-open the SAME key many times after clearing the in-memory caches so each
    // hits the REGISTRY (tier-3), not the model. None should consume a gate slot.
    for (let i = 2; i <= 6; i++) {
      _clearCachesForTesting();
      await expect(
        resolveComponent("hot-" + i, "hot-type", key, services),
      ).resolves.toBeTypeOf("function");
    }

    // A brand-new unseeded type would be the SECOND miss — proving the hits above
    // never spent the budget (the single slot is still only used by the first miss).
    const fresh = await registryKey("app", "fresh-type");
    await expect(
      resolveComponent("fresh-1", "fresh-type", fresh, services),
    ).rejects.toBeInstanceOf(ProduceThrottledError);
  });

  it("seeded types never consult the gate (no model call) — cap untouched by seeds", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();
    const { registryKey } = await import("../registry/cacheKey");

    const clock = createStubClock();
    // cap 0 is invalid; use cap 1 but open MANY seeded apps — none should throttle.
    const produceGate = createProduceGate({ clock, cap: 1, windowMs: 10_000 });
    const services = createTestServices({ produceGate });

    // counter + notes are the seeded types (transpiled locally, no model call).
    // Open each several times under a cap of 1 — none should ever throttle.
    for (let i = 0; i < 3; i++) {
      for (const type of ["counter", "notes"]) {
        _clearCachesForTesting();
        const key = await registryKey("app", type);
        await expect(
          resolveComponent(`${type}-s${i}`, type, key, services),
        ).resolves.toBeTypeOf("function");
      }
    }
  });
});

describe("DI — cache HIT refreshes LRU bookkeeping (RESIL-06)", () => {
  it("a registry (tier-3) hit increments useCount and refreshes updatedAt", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();
    const { registryKey } = await import("../registry/cacheKey");

    const registry = createInMemoryRegistry();
    const services = createTestServices({
      transport: cannedTransport(CANNED_SOURCE),
      registry,
    });
    const key = await registryKey("app", "lru-type");

    // First open: MISS → write. Fresh record: useCount 0.
    await resolveComponent("lru-1", "lru-type", key, services);
    const afterWrite = await registry.get("apps", key);
    expect(afterWrite?.useCount).toBe(0);
    expect(typeof afterWrite?.updatedAt).toBe("number");

    // Force a tier-3 hit (clear in-memory caches) and re-open: useCount bumps.
    _clearCachesForTesting();
    await resolveComponent("lru-2", "lru-type", key, services);
    const afterHit = await registry.get("apps", key);
    expect(afterHit?.useCount).toBe(1);

    // A second hit bumps again.
    _clearCachesForTesting();
    await resolveComponent("lru-3", "lru-type", key, services);
    expect((await registry.get("apps", key))?.useCount).toBe(2);
  });
});

describe("DI — loader runs LRU eviction before a produce write under pressure (RESIL-06)", () => {
  it("evicts a least-recently-used victim so the new record fits", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();
    const { registryKey } = await import("../registry/cacheKey");

    const registry = createInMemoryRegistry();
    // Pre-seed two OLD records (low updatedAt) directly into the registry.
    await registry.put(
      "apps",
      { cacheKey: "old-a", type: "old-a", source: "s", transpiledJS: "j", useCount: 0, updatedAt: 1 },
      "old-a",
    );
    await registry.put(
      "apps",
      { cacheKey: "old-b", type: "old-b", source: "s", transpiledJS: "j", useCount: 0, updatedAt: 2 },
      "old-b",
    );

    // Pressure: quota 3. With 2 entries we're at 2/3 ≈ 0.67 (under). Adding a 3rd
    // would push 3/3 = 1.0, so the pre-write eviction sweep (which sees the live
    // count) must drop the oldest to make room.
    const storage = shrinkingSeam(registry, 2, 1); // quota 2 → 2 entries already over 0.9
    const services = createTestServices({
      transport: cannedTransport(CANNED_SOURCE),
      registry,
      storage,
    });

    const key = await registryKey("app", "newcomer");
    await resolveComponent("newcomer-1", "newcomer", key, services);

    // The oldest pre-seeded record (old-a, updatedAt 1) was evicted to relieve
    // pressure before the new record was written; the new record is present.
    expect(await registry.get("apps", "old-a")).toBeUndefined();
    expect(await registry.get("apps", key)).toBeDefined();
  });

  it("no eviction when under threshold — pre-existing records survive a new write", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();
    const { registryKey } = await import("../registry/cacheKey");

    const registry = createInMemoryRegistry();
    await registry.put(
      "apps",
      { cacheKey: "keep", type: "keep", source: "s", transpiledJS: "j", useCount: 0, updatedAt: 1 },
      "keep",
    );

    // Plenty of headroom — usage well under threshold, so nothing is evicted.
    const storage: StoragePressureSeam = {
      requestPersist: () => Promise.resolve(true),
      estimate: () => Promise.resolve({ usage: 10, quota: 1000 }),
    };
    const services = createTestServices({
      transport: cannedTransport(CANNED_SOURCE),
      registry,
      storage,
    });

    const key = await registryKey("app", "addition");
    await resolveComponent("addition-1", "addition", key, services);

    expect(await registry.get("apps", "keep")).toBeDefined();
    expect(await registry.get("apps", key)).toBeDefined();
  });
});
