import { openDB } from "idb";
import { beforeEach, describe, expect, it, vi } from "vitest";
// fake-indexeddb/auto is already installed via src/test/setup.ts

// fake-indexeddb persists at module scope across tests and vi.resetModules()
// does NOT clear it, so each test must start from a deleted database to control
// the version transition it exercises.
function deleteRegistryDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase("MarketplaceRegistry");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe("db — additive upgrade v2→v3 (settings store)", () => {
  beforeEach(async () => {
    vi.resetModules();
    // Wipe the global fake-indexeddb so each test controls its own version
    // state rather than inheriting an already-upgraded DB from a prior test.
    await deleteRegistryDb();
  });

  it("openRegistry resolves at version 3", async () => {
    const { openRegistry, REGISTRY_DB_VERSION } = await import("./db");
    const db = await openRegistry();
    expect(REGISTRY_DB_VERSION).toBe(3);
    expect(db.version).toBe(3);
    db.close();
  });

  it("settings store is present after upgrade", async () => {
    const { openRegistry } = await import("./db");
    const db = await openRegistry();
    expect(db.objectStoreNames.contains("settings")).toBe(true);
    db.close();
  });

  it("apps, widgets, handlers stores are intact after upgrade", async () => {
    const { openRegistry } = await import("./db");
    const db = await openRegistry();
    expect(db.objectStoreNames.contains("apps")).toBe(true);
    expect(db.objectStoreNames.contains("widgets")).toBe(true);
    expect(db.objectStoreNames.contains("handlers")).toBe(true);
    db.close();
  });

  it("existing records in apps store survive the upgrade (non-destructive)", async () => {
    const { openRegistry } = await import("./db");
    const db = await openRegistry();
    await db.put("apps", { cacheKey: "k", type: "t", source: "s", transpiledJS: "j" }, "k");
    db.close();
    // Re-open (simulates a page reload after upgrade)
    const db2 = await openRegistry();
    const result = await db2.get("apps", "k");
    expect(result?.cacheKey).toBe("k");
    db2.close();
  });

  it("v2 data survives the upgrade to v3", async () => {
    // Seed a real v2 database directly: apps/widgets/handlers only, NO settings
    // store. This forces an actual v2→v3 version transition when openRegistry()
    // (v3) opens it, exercising the additive upgrade body for real.
    const v2 = await openDB("MarketplaceRegistry", 2, {
      upgrade(db) {
        for (const store of ["apps", "widgets", "handlers"]) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store);
          }
        }
      },
    });
    expect(v2.version).toBe(2);
    expect(v2.objectStoreNames.contains("settings")).toBe(false);
    await v2.put(
      "apps",
      { cacheKey: "k", type: "t", source: "s", transpiledJS: "j" },
      "k",
    );
    v2.close();

    // Now upgrade to v3 via the production opener.
    const { openRegistry } = await import("./db");
    const v3 = await openRegistry();
    expect(v3.version).toBe(3);
    expect(v3.objectStoreNames.contains("settings")).toBe(true);
    // The record written under v2 is preserved across the upgrade.
    expect((await v3.get("apps", "k"))?.cacheKey).toBe("k");
    v3.close();
  });

  it("settings store round-trips a key-value record", async () => {
    const { openRegistry } = await import("./db");
    const db = await openRegistry();
    await db.put("settings", { key: "osTheme", value: "noir" }, "osTheme");
    const result = await db.get("settings", "osTheme");
    expect(result?.value).toBe("noir");
    db.close();
  });
});
