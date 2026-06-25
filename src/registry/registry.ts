// Registry module — IndexedDB init + probe write/delete + in-memory Map fallback (D-22, D-23).
// All callers await dbReady before any get/put/del call.
// The async interface is identical regardless of storage availability (D-23).
//
// Phase 7 (RESIL-06): adds `keys(store)` enumeration so the LRU eviction pass can
// list candidate victims, and routes the persist request through the injectable
// storage-pressure seam (guarded — persist may be undefined).
import { openRegistry, type AppRecord, type WidgetRecord, type HandlerRecord } from "./db";
import { navigatorStorageSeam } from "../host/storageEstimate";
import { logger } from "../lib/logger";

type StoreName = "apps" | "widgets" | "handlers";
type StoreValue<S extends StoreName> = S extends "apps"
  ? AppRecord
  : S extends "widgets"
    ? WidgetRecord
    : HandlerRecord;

let storageAvailable = true;
let _db: Awaited<ReturnType<typeof openRegistry>> | null = null;

// In-memory fallback maps — one per store (D-23).
const memApps = new Map<string, AppRecord>();
const memWidgets = new Map<string, WidgetRecord>();
const memHandlers = new Map<string, HandlerRecord>();

function mapFor(store: StoreName): Map<string, unknown> {
  if (store === "apps") return memApps as Map<string, unknown>;
  if (store === "widgets") return memWidgets as Map<string, unknown>;
  return memHandlers as Map<string, unknown>;
}

// dbReady resolves after init completes (probe ok → IndexedDB; probe throws → Map fallback).
export const dbReady: Promise<void> = (async () => {
  try {
    const db = await openRegistry();
    // Probe write + delete to verify storage is functional in this browsing context (D-22).
    // Cast required: the probe is not a real AppRecord but the field values are irrelevant.
    await db.put("apps", { __probe: true } as unknown as import("./db").AppRecord, "__probe__");
    await db.delete("apps", "__probe__");
    _db = db;
  } catch {
    storageAvailable = false; // private mode / zero quota — degrade to Map
  }
  // Fire-and-forget persist request through the guarded seam (RESIL-06); the seam
  // is a no-op (resolves false) where navigator.storage.persist is unavailable.
  void navigatorStorageSeam.requestPersist();
  logger.info("Registry initialized");
})();

// Unified async interface — callers never branch on storageAvailable (D-23).

// Parameterize on the store NAME (S), so the value type covaries with the
// store via StoreValue<S>. This correlates store and value (and return type),
// giving per-store type checking once the record shapes diverge in Phase 2 —
// and removes the Parameters<...> casts the value-keyed generic forced (WR-03).
export async function get<S extends StoreName>(
  store: S,
  key: string,
): Promise<StoreValue<S> | undefined> {
  await dbReady;
  if (storageAvailable && _db !== null) {
    return _db.get(store, key) as Promise<StoreValue<S> | undefined>;
  }
  return mapFor(store).get(key) as StoreValue<S> | undefined;
}

export async function put<S extends StoreName>(
  store: S,
  value: StoreValue<S>,
  key: string,
): Promise<void> {
  await dbReady;
  if (storageAvailable && _db !== null) {
    await _db.put(store, value, key);
  } else {
    mapFor(store).set(key, value);
  }
}

export async function del(store: StoreName, key: string): Promise<void> {
  await dbReady;
  if (storageAvailable && _db !== null) {
    await _db.delete(store, key);
  } else {
    mapFor(store).delete(key);
  }
}

/**
 * List all keys in a store (Phase 7, RESIL-06). The LRU eviction pass uses this
 * to enumerate candidate victims across the three stores. Same async interface
 * regardless of backend — IndexedDB `getAllKeys` or the in-memory Map's keys.
 */
export async function keys(store: StoreName): Promise<string[]> {
  await dbReady;
  if (storageAvailable && _db !== null) {
    return (await _db.getAllKeys(store)) as string[];
  }
  return [...mapFor(store).keys()];
}
