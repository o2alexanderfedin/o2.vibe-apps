// IndexedDB schema for the Marketplace registry (D-20, D-21).
// DB name: "MarketplaceRegistry", three neutral object stores.
//
// Phase 7 (RESIL-06): records now carry LRU bookkeeping — `useCount` (how many
// times the entry was read) and `updatedAt` (epoch ms of the last write/hit).
// These drive least-recently-used eviction when storage approaches quota. The
// schema bumps to VERSION 2; the upgrade is additive (no store renames), and
// existing records simply lack the two new fields — the registry adapter defaults
// them on read (useCount: 0, updatedAt: 0) so v1 data keeps working.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/** DB version — bumped to 2 in Phase 7 for the LRU bookkeeping fields. */
export const REGISTRY_DB_VERSION = 2;

/**
 * LRU bookkeeping shared by every stored record (Phase 7, RESIL-06). Optional on
 * the type so records written by the v1 schema (which lack them) still satisfy
 * the interface; the adapter defaults them to 0 on read.
 */
export interface LruMeta {
  /** Times this entry has been read (incremented on every cache hit). */
  useCount?: number;
  /** Epoch ms of the last write or hit — the LRU recency key. */
  updatedAt?: number;
}

// Phase 2: AppRecord carries both the original source and the transpiled JS.
// `source` is the TSX string; `transpiledJS` is the Babel-compiled JS string.
// Phase 7: adds the LRU bookkeeping fields via LruMeta.
export interface AppRecord extends LruMeta {
  cacheKey: string;
  type: string;
  source: string;
  transpiledJS: string;
  [key: string]: unknown; // allow forward-compat extra fields
}
export type WidgetRecord = Record<string, unknown> & LruMeta;
export type HandlerRecord = Record<string, unknown> & LruMeta;

export interface RegistrySchema extends DBSchema {
  apps: { key: string; value: AppRecord };
  widgets: { key: string; value: WidgetRecord };
  handlers: { key: string; value: HandlerRecord };
}

export function openRegistry(): Promise<IDBPDatabase<RegistrySchema>> {
  return openDB<RegistrySchema>("MarketplaceRegistry", REGISTRY_DB_VERSION, {
    // The upgrade is purely additive across versions: create any missing store.
    // The new LRU fields need no migration step — they are optional and the
    // adapter defaults them on read, so old records keep working untouched.
    upgrade(db) {
      if (!db.objectStoreNames.contains("apps")) db.createObjectStore("apps");
      if (!db.objectStoreNames.contains("widgets")) db.createObjectStore("widgets");
      if (!db.objectStoreNames.contains("handlers")) db.createObjectStore("handlers");
    },
  });
}
