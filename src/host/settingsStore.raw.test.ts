// Unit tests for the raw-key settings store seam (Phase 21, plan 21-01).
//
// Tests the writeRaw/readRaw extensions on both the realSettingsStore
// (IDB-backed, uses fake-indexeddb polyfill) and the RecordingSettingsStore
// test double (in-memory Map). The fake-indexeddb polyfill is installed globally
// via src/test/setup.ts so these run entirely offline.

import { describe, it, expect } from "vitest";
import { realSettingsStore } from "./settingsStore";
import {
  createRecordingSettingsStore,
  type RecordingSettingsStore,
} from "../services/testServices";

describe("realSettingsStore raw methods", () => {
  it("writeRaw resolves without error", async () => {
    await expect(
      realSettingsStore.writeRaw("windowLayout", '{"test":true}'),
    ).resolves.toBeUndefined();
  });

  it("readRaw returns the value written by writeRaw", async () => {
    const payload = JSON.stringify([{ appType: "notes" }]);
    await realSettingsStore.writeRaw("windowLayout", payload);
    const result = await realSettingsStore.readRaw("windowLayout");
    expect(result).toBe(payload);
  });

  it("readRaw returns null for an absent key", async () => {
    const result = await realSettingsStore.readRaw("nonExistentKey__test");
    expect(result).toBeNull();
  });

  it("multiple keys are independent", async () => {
    await realSettingsStore.writeRaw("keyA", "valueA");
    await realSettingsStore.writeRaw("keyB", "valueB");
    expect(await realSettingsStore.readRaw("keyA")).toBe("valueA");
    expect(await realSettingsStore.readRaw("keyB")).toBe("valueB");
  });

  it("does not interfere with existing write/read methods", async () => {
    // write() uses SETTINGS_KEY = "osTheme"; writeRaw uses the caller-supplied key
    await realSettingsStore.write("dark");
    const theme = await realSettingsStore.read();
    expect(theme).toBe("dark");
  });
});

describe("RecordingSettingsStore raw methods", () => {
  it("rawWriteCount starts at 0 for any key", () => {
    const store: RecordingSettingsStore = createRecordingSettingsStore();
    expect(store.rawWriteCount("windowLayout")).toBe(0);
  });

  it("rawWriteCount increments per writeRaw call on the same key", async () => {
    const store: RecordingSettingsStore = createRecordingSettingsStore();
    await store.writeRaw("windowLayout", "a");
    expect(store.rawWriteCount("windowLayout")).toBe(1);
    await store.writeRaw("windowLayout", "b");
    expect(store.rawWriteCount("windowLayout")).toBe(2);
  });

  it("rawWriteCount is independent per key", async () => {
    const store: RecordingSettingsStore = createRecordingSettingsStore();
    await store.writeRaw("windowLayout", "x");
    await store.writeRaw("otherKey", "y");
    expect(store.rawWriteCount("windowLayout")).toBe(1);
    expect(store.rawWriteCount("otherKey")).toBe(1);
    expect(store.rawWriteCount("neverWritten")).toBe(0);
  });

  it("readRaw returns null before any writeRaw for that key", async () => {
    const store: RecordingSettingsStore = createRecordingSettingsStore();
    expect(await store.readRaw("windowLayout")).toBeNull();
  });

  it("readRaw returns the last value written via writeRaw", async () => {
    const store: RecordingSettingsStore = createRecordingSettingsStore();
    await store.writeRaw("windowLayout", "first");
    await store.writeRaw("windowLayout", "second");
    expect(await store.readRaw("windowLayout")).toBe("second");
  });

  it("rawWrites map reflects all calls in order", async () => {
    const store: RecordingSettingsStore = createRecordingSettingsStore();
    await store.writeRaw("windowLayout", "a");
    await store.writeRaw("windowLayout", "b");
    await store.writeRaw("windowLayout", "c");
    expect(store.rawWrites.get("windowLayout")).toEqual(["a", "b", "c"]);
  });

  it("existing write/read behavior is unchanged", async () => {
    const store: RecordingSettingsStore = createRecordingSettingsStore();
    await store.write("light");
    expect(store.writeCount).toBe(1);
    expect(store.writes).toEqual(["light"]);
    expect(await store.read()).toBe("light");
  });
});

describe("realSettingsStore deleteRaw", () => {
  it("deleteRaw resolves without throwing", async () => {
    await realSettingsStore.writeRaw("custom:testTheme", '{"--text":"#fff"}');
    await expect(
      realSettingsStore.deleteRaw("custom:testTheme"),
    ).resolves.toBeUndefined();
  });

  it("deleteRaw removes the key so readRaw returns null after delete", async () => {
    await realSettingsStore.writeRaw("custom:deleteTest", '{"--text":"#abc"}');
    expect(await realSettingsStore.readRaw("custom:deleteTest")).not.toBeNull();
    await realSettingsStore.deleteRaw("custom:deleteTest");
    expect(await realSettingsStore.readRaw("custom:deleteTest")).toBeNull();
  });

  it("deleteRaw on an absent key resolves without throwing", async () => {
    await expect(
      realSettingsStore.deleteRaw("custom:neverWritten__test"),
    ).resolves.toBeUndefined();
  });
});

describe("RecordingSettingsStore deleteRaw", () => {
  it("readRaw returns null after deleteRaw for the same key", async () => {
    const store: RecordingSettingsStore = createRecordingSettingsStore();
    await store.writeRaw("custom:foo", '{"--text":"#fff"}');
    await store.deleteRaw("custom:foo");
    expect(await store.readRaw("custom:foo")).toBeNull();
  });

  it("rawDeletes.has returns true for a deleted key", async () => {
    const store: RecordingSettingsStore = createRecordingSettingsStore();
    await store.writeRaw("custom:foo", "{}");
    await store.deleteRaw("custom:foo");
    expect(store.rawDeletes.has("custom:foo")).toBe(true);
  });

  it("rawDeletes is a snapshot — new deletes after snapshot do not appear in it", async () => {
    const store: RecordingSettingsStore = createRecordingSettingsStore();
    await store.writeRaw("custom:foo", "{}");
    await store.deleteRaw("custom:foo");
    const snapshot = store.rawDeletes;
    await store.writeRaw("custom:bar", "{}");
    await store.deleteRaw("custom:bar");
    expect(snapshot.has("custom:foo")).toBe(true);
    expect(snapshot.has("custom:bar")).toBe(false);
  });

  it("rawDeletes collapses duplicates — Set semantics, not multiset", async () => {
    const store: RecordingSettingsStore = createRecordingSettingsStore();
    await store.writeRaw("custom:foo", "{}");
    await store.deleteRaw("custom:foo");
    await store.writeRaw("custom:foo", "{}");
    await store.deleteRaw("custom:foo");
    expect(store.rawDeletes.size).toBe(1);
    expect(store.rawDeletes.has("custom:foo")).toBe(true);
  });

  it("rawDeletes does not include keys that were only written, not deleted", async () => {
    const store: RecordingSettingsStore = createRecordingSettingsStore();
    await store.writeRaw("custom:written-only", "{}");
    expect(store.rawDeletes.has("custom:written-only")).toBe(false);
  });
});
