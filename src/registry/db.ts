// IndexedDB schema for the Marketplace registry (D-20, D-21).
// DB name: "MarketplaceRegistry", three neutral object stores.
//
// Phase 7 (RESIL-06): records now carry LRU bookkeeping — `useCount` (how many
// times the entry was read) and `updatedAt` (epoch ms of the last write/hit).
// These drive least-recently-used eviction when storage approaches quota. The
// schema bumps to VERSION 2; the upgrade is additive (no store renames), and
// existing records simply lack the two new fields — the registry adapter defaults
// them on read (useCount: 0, updatedAt: 0) so v1 data keeps working.
//
// Phase 9 (STORE-01): three further additive optional fields — `displayName`,
// `prompt`, and `createdAt` — follow the same additive-no-migration pattern as
// the Phase 7 LRU fields. No DB version bump; old records lacking these fields
// satisfy the interface via the `[key: string]: unknown` catch-all and the
// optional typing; consumers provide fallbacks on read.
//
// Phase 14 (THEME-01): schema bumps to VERSION 3; adds the `settings` object
// store for persistent named-theme preference and any future user preferences.
// The upgrade is additive — existing apps/widgets/handlers stores and their data
// are untouched; the new store is created only when absent.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/** DB version — bumped to 3 in Phase 14 for the settings store. */
export const REGISTRY_DB_VERSION = 3;

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
// Phase 9: adds displayName, prompt, createdAt (all optional, additive).
export interface AppRecord extends LruMeta {
  cacheKey: string;
  type: string;
  source: string;
  transpiledJS: string;
  /** Human-readable title shown on storefront cards (Phase 9, STORE-01). */
  displayName?: string;
  /**
   * The user's intent that produced this app (Phase 9, STORE-01).
   * Stores the userPrompt / instruction only — never the model system-prompt
   * (which contains mechanic lexicon visible via devtools → IndexedDB).
   * This field is display/inspection metadata only; faithful re-production
   * is keyed by registryKey(type, instruction), not by reading this field back.
   */
  prompt?: string;
  /** Epoch ms when the record was first written (Phase 9, STORE-01). Never overwritten on touch. */
  createdAt?: number;
  [key: string]: unknown; // allow forward-compat extra fields
}
// Phase 10 (WIDGET-07): replace placeholder Record-alias types with explicit
// interfaces that mirror the AppRecord pattern — named required fields for every
// property actually written at the identity write sites, plus an index signature
// for forward-compat extra fields (same pattern as AppRecord above).
export interface WidgetRecord extends LruMeta {
  cacheKey: string;
  type: string;
  source: string;
  transpiledJS: string;
  [key: string]: unknown; // allow forward-compat extra fields
}
export interface HandlerRecord extends LruMeta {
  cacheKey: string;
  /** The intent slug that produced this handler (mirrors handler write shape). */
  intent: string;
  source: string;
  transpiledJS: string;
  [key: string]: unknown; // allow forward-compat extra fields
}

/** User preference record stored in the `settings` object store (Phase 14). */
export interface SettingRecord {
  key: string;
  value: unknown;
  [key: string]: unknown;
}

export interface RegistrySchema extends DBSchema {
  apps: { key: string; value: AppRecord };
  widgets: { key: string; value: WidgetRecord };
  handlers: { key: string; value: HandlerRecord };
  settings: { key: string; value: SettingRecord }; // Phase 14
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
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
    },
  });
}
