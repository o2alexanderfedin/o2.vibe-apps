// Unit tests for LRU storage-pressure eviction (Phase 7, RESIL-06).
//
// BOTH the registry and the storage-estimate seam are INJECTED: an in-memory
// registry (a plain Map, no real IndexedDB) and a stub `estimate()` returning a
// controlled usage/quota that the test can shrink as entries are evicted. So the
// victim selection (oldest updatedAt, tie-broken by lowest useCount) and the
// "evict until under threshold" loop are verified with NO real navigator.storage
// and NO real IndexedDB. Doubles are named stub (never the banned tokens).

import { describe, expect, it } from "vitest";
import { createInMemoryRegistry } from "../services/testServices";
import type { Registry } from "../services/registry";
import type { StoragePressureSeam, StorageEstimate } from "../host/storageEstimate";
import {
  evictUnderPressure,
  DEFAULT_EVICTION_THRESHOLD,
} from "./storagePressure";
import type { AppRecord } from "./db";

/** Minimal valid AppRecord with explicit LRU bookkeeping. */
function appRecord(
  key: string,
  updatedAt: number,
  useCount: number,
): AppRecord {
  return {
    cacheKey: key,
    type: "t-" + key,
    source: "s",
    transpiledJS: "j",
    updatedAt,
    useCount,
  };
}

/**
 * A stub storage seam whose estimate DROPS by `perEviction` bytes each time the
 * registry shrinks. It reads the registry's live `apps` count so the ratio falls
 * as victims are deleted — modeling real pressure relief without IndexedDB.
 */
function shrinkingSeam(
  registry: Registry,
  quota: number,
  bytesPerEntry: number,
): StoragePressureSeam {
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

/** A fixed-estimate stub seam (does not change as entries are deleted). */
function fixedSeam(usage: number, quota: number): StoragePressureSeam {
  return {
    requestPersist: () => Promise.resolve(true),
    estimate: () => Promise.resolve({ usage, quota }),
  };
}

describe("LRU eviction — victim selection (RESIL-06)", () => {
  it("evicts the OLDEST updatedAt first", async () => {
    const registry = createInMemoryRegistry();
    await registry.put("apps", appRecord("old", 100, 5), "old");
    await registry.put("apps", appRecord("mid", 200, 5), "mid");
    await registry.put("apps", appRecord("new", 300, 5), "new");

    // Pressure: 3 entries / quota 3 = 1.0 (over 0.9). Evicting one (3→2) drops to
    // 2/3 ≈ 0.67 < 0.9, so exactly one victim is taken.
    const seam = shrinkingSeam(registry, 3, 1); // quota 3 bytes, 1 byte/entry
    const evicted = await evictUnderPressure({ registry, storage: seam });

    expect(evicted).toBe(1);
    // The oldest (updatedAt 100) was the victim; the newer two remain.
    expect(await registry.get("apps", "old")).toBeUndefined();
    expect(await registry.get("apps", "mid")).toBeDefined();
    expect(await registry.get("apps", "new")).toBeDefined();
  });

  it("breaks an updatedAt tie by evicting the LOWEST useCount first", async () => {
    const registry = createInMemoryRegistry();
    // Same updatedAt; differ only by useCount.
    await registry.put("apps", appRecord("hot", 100, 9), "hot");
    await registry.put("apps", appRecord("cold", 100, 1), "cold");

    const seam = shrinkingSeam(registry, 2, 1); // quota 2, over threshold at 2 entries
    const evicted = await evictUnderPressure({ registry, storage: seam });

    expect(evicted).toBe(1);
    // The least-used (useCount 1) lost the tie; the hotter one survived.
    expect(await registry.get("apps", "cold")).toBeUndefined();
    expect(await registry.get("apps", "hot")).toBeDefined();
  });

  it("treats records missing LRU fields (v1 data) as the oldest/least-used — evicts them first", async () => {
    const registry = createInMemoryRegistry();
    // A v1-style record with NO updatedAt/useCount (simulating pre-Phase-7 data).
    await registry.put(
      "apps",
      { cacheKey: "legacy", type: "t", source: "s", transpiledJS: "j" },
      "legacy",
    );
    await registry.put("apps", appRecord("fresh", 500, 3), "fresh");

    const seam = shrinkingSeam(registry, 2, 1);
    const evicted = await evictUnderPressure({ registry, storage: seam });

    expect(evicted).toBe(1);
    // The legacy record (defaulted to updatedAt 0) was evicted first.
    expect(await registry.get("apps", "legacy")).toBeUndefined();
    expect(await registry.get("apps", "fresh")).toBeDefined();
  });
});

describe("LRU eviction — loop control (RESIL-06)", () => {
  it("evicts UNTIL usage drops back under the threshold (multiple victims)", async () => {
    const registry = createInMemoryRegistry();
    // 5 entries, quota 5 → ratio 1.0; threshold 0.9 → must get under 0.9 (≤ 4.5 →
    // ≤ 4 entries). Wait: 4/5 = 0.8 < 0.9, so evicting 1 → 4/5=0.8 suffices.
    // Use a tighter quota so multiple evictions are required.
    for (let i = 0; i < 5; i++) {
      await registry.put("apps", appRecord("k" + i, i, 0), "k" + i);
    }
    // quota 4: 5 entries → 5/4=1.25; need ratio < 0.9 → usage < 3.6 → ≤ 3 entries.
    // So we must evict 2 (5→3): 3/4 = 0.75 < 0.9.
    const seam = shrinkingSeam(registry, 4, 1);
    const evicted = await evictUnderPressure({ registry, storage: seam });

    expect(evicted).toBe(2);
    expect((await registry.keys("apps")).length).toBe(3);
    // The two oldest (k0, k1) were evicted; k2..k4 remain.
    expect(await registry.get("apps", "k0")).toBeUndefined();
    expect(await registry.get("apps", "k1")).toBeUndefined();
    expect(await registry.get("apps", "k2")).toBeDefined();
  });

  it("NO-OPS when usage is already under the threshold", async () => {
    const registry = createInMemoryRegistry();
    await registry.put("apps", appRecord("a", 1, 0), "a");
    await registry.put("apps", appRecord("b", 2, 0), "b");

    // 50% usage — well under 0.9. Nothing should be evicted.
    const seam = fixedSeam(500, 1000);
    const evicted = await evictUnderPressure({ registry, storage: seam });

    expect(evicted).toBe(0);
    expect((await registry.keys("apps")).length).toBe(2);
  });

  it("NO-OPS when the platform exposes no estimate (cannot tell — safe skip)", async () => {
    const registry = createInMemoryRegistry();
    await registry.put("apps", appRecord("a", 1, 0), "a");
    const noEstimate: StoragePressureSeam = {
      requestPersist: () => Promise.resolve(true),
      estimate: () => Promise.resolve(null),
    };
    const evicted = await evictUnderPressure({ registry, storage: noEstimate });
    expect(evicted).toBe(0);
    expect(await registry.get("apps", "a")).toBeDefined();
  });

  it("evicts across ALL THREE stores (apps, widgets, handlers), oldest first", async () => {
    const registry = createInMemoryRegistry();
    await registry.put("apps", appRecord("app1", 300, 0), "app1");
    // Phase 10 (WIDGET-07): WidgetRecord/HandlerRecord now require named fields.
    await registry.put("widgets", { cacheKey: "wid1", type: "w", source: "// s", transpiledJS: "// j", updatedAt: 100, useCount: 0 }, "wid1");
    await registry.put("handlers", { cacheKey: "hdl1", intent: "h", source: "// s", transpiledJS: "// j", updatedAt: 200, useCount: 0 }, "hdl1");

    // quota 3, 3 entries → 1.0; need < 0.9 → ≤ 2 entries → evict 1 (the oldest = widget).
    const seam = shrinkingSeam(registry, 3, 1);
    const evicted = await evictUnderPressure({ registry, storage: seam });

    expect(evicted).toBe(1);
    expect(await registry.get("widgets", "wid1")).toBeUndefined();
    expect(await registry.get("handlers", "hdl1")).toBeDefined();
    expect(await registry.get("apps", "app1")).toBeDefined();
  });

  it("stops when nothing is left to evict even if still over threshold", async () => {
    const registry = createInMemoryRegistry();
    await registry.put("apps", appRecord("only", 1, 0), "only");
    // Estimate stays pinned over threshold regardless of deletions (pathological).
    const stuck = fixedSeam(1000, 1000);
    const evicted = await evictUnderPressure({ registry, storage: stuck });
    // It evicts everything it can (1), then halts — no infinite loop.
    expect(evicted).toBe(1);
    expect((await registry.keys("apps")).length).toBe(0);
  });

  it("exposes the named, configurable default threshold (0.9)", () => {
    expect(DEFAULT_EVICTION_THRESHOLD).toBe(0.9);
  });

  it("honors a custom threshold override", async () => {
    const registry = createInMemoryRegistry();
    await registry.put("apps", appRecord("a", 1, 0), "a");
    await registry.put("apps", appRecord("b", 2, 0), "b");
    // 60% usage. Under default 0.9 (no-op), but over a custom 0.5 (evicts).
    const seam = shrinkingSeam(registry, 3, 1); // 2/3 ≈ 0.67
    const noopAtDefault = await evictUnderPressure({ registry, storage: seam });
    expect(noopAtDefault).toBe(0);
    const evicted = await evictUnderPressure({
      registry,
      storage: seam,
      threshold: 0.5,
    });
    expect(evicted).toBeGreaterThan(0);
  });
});
