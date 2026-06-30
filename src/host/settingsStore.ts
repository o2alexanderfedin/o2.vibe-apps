// Settings persistence seam (Phase 14, THEME-01) — an injectable port for
// mirroring the user's named-theme preference into the IndexedDB `settings`
// store. localStorage is the source of truth for first paint (the FOUC script
// reads it synchronously); this store is a best-effort durable mirror.
//
// IoC/DI rationale: the named-theme provider depends on this interface, never on
// IndexedDB directly. Production wires `realSettingsStore` (IDB-backed) through
// the Services composition root; tests inject an in-memory recording double so
// the open→render→theme flow runs offline with zero real IndexedDB.

import { openRegistry, type SettingRecord } from "../registry/db";

/** Injectable port for durably mirroring a single preference string. */
export interface SettingsStore {
  /** Persist the value (best-effort; never throws). */
  write(value: string): Promise<void>;
  /** Read the persisted value, or null when absent/unavailable. */
  read(): Promise<string | null>;
  /**
   * Persist an arbitrary string under an explicit IDB key (best-effort; never
   * throws). Accepts a caller-supplied key so multiple preferences can share
   * the same `settings` object store without a fixed SETTINGS_KEY constant.
   * Phase 21 (PERSIST-01): used by the layout persistence seam.
   */
  writeRaw(key: string, value: string): Promise<void>;
  /**
   * Read the value stored under the given key, or null when absent.
   * Mirrors writeRaw — the caller supplies the key, not a fixed constant.
   */
  readRaw(key: string): Promise<string | null>;
  /**
   * Delete the record stored under the given key (best-effort; never throws).
   * Used by the custom-theme delete path to remove orphaned IDB entries.
   */
  deleteRaw(key: string): Promise<void>;
}

// Fixed neutral key under which the named-theme preference is stored inside the
// `settings` object store. The store key and the record's `key` field match so
// the record is self-describing on inspection.
const SETTINGS_KEY = "osTheme";

/**
 * Production settings store backed by the registry's `settings` object store
 * (DB v3). Every IndexedDB access is guarded: this mirror is best-effort, so a
 * failed open/read/write degrades silently — localStorage remains authoritative.
 *
 * Note: this opens the registry directly via `openRegistry()` rather than the
 * typed `Registry` adapter, because the adapter's `StoreName` union intentionally
 * covers only `apps`/`widgets`/`handlers`. The settings store lives outside that
 * cache-eviction surface, so it is reached through the raw db handle here.
 */
export const realSettingsStore: SettingsStore = {
  async write(value: string): Promise<void> {
    let db: Awaited<ReturnType<typeof openRegistry>> | null = null;
    try {
      db = await openRegistry();
      const record: SettingRecord = { key: SETTINGS_KEY, value };
      await db.put("settings", record, SETTINGS_KEY);
    } catch {
      // Best-effort mirror — localStorage is the source of truth. Swallow.
    } finally {
      db?.close();
    }
  },
  async read(): Promise<string | null> {
    let db: Awaited<ReturnType<typeof openRegistry>> | null = null;
    try {
      db = await openRegistry();
      const record = await db.get("settings", SETTINGS_KEY);
      // `record` is undefined when the key is absent. The schema now types
      // `value` as string, but IndexedDB is an untyped runtime boundary, so a
      // defensive typeof keeps the read path safe against stale/foreign data.
      if (record && typeof record.value === "string") {
        return record.value;
      }
    } catch {
      // Best-effort mirror — fall through to null.
    } finally {
      db?.close();
    }
    return null;
  },
  async writeRaw(key: string, value: string): Promise<void> {
    let db: Awaited<ReturnType<typeof openRegistry>> | null = null;
    try {
      db = await openRegistry();
      const record: SettingRecord = { key, value };
      await db.put("settings", record, key);
    } catch {
      // Best-effort mirror — caller-supplied key, same swallow pattern as write().
    } finally {
      db?.close();
    }
  },
  async readRaw(key: string): Promise<string | null> {
    let db: Awaited<ReturnType<typeof openRegistry>> | null = null;
    try {
      db = await openRegistry();
      const record = await db.get("settings", key);
      if (record && typeof record.value === "string") {
        return record.value;
      }
    } catch {
      // Best-effort mirror — fall through to null.
    } finally {
      db?.close();
    }
    return null;
  },
  async deleteRaw(key: string): Promise<void> {
    let db: Awaited<ReturnType<typeof openRegistry>> | null = null;
    try {
      db = await openRegistry();
      await db.delete("settings", key);
    } catch {
      // Best-effort — caller-supplied key, same swallow pattern as writeRaw().
    } finally {
      db?.close();
    }
  },
};
