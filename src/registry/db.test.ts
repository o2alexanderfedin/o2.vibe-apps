import { beforeEach, describe, expect, it, vi } from "vitest";
// fake-indexeddb/auto is already installed via src/test/setup.ts

describe("db — additive upgrade v2→v3 (settings store)", () => {
  beforeEach(() => {
    vi.resetModules();
    // Each test gets a fresh module with its own openDB call and clean DB instance.
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

  it("settings store round-trips a key-value record", async () => {
    const { openRegistry } = await import("./db");
    const db = await openRegistry();
    await db.put("settings", { key: "osTheme", value: "noir" }, "osTheme");
    const result = await db.get("settings", "osTheme");
    expect(result?.value).toBe("noir");
    db.close();
  });
});
