// IndexedDB schema for the Marketplace registry (D-20, D-21).
// DB name: "MarketplaceRegistry", version 1, three neutral object stores.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

// Phase 2: AppRecord now carries both the original source and the transpiled JS.
// `source` is the TSX string; `transpiledJS` is the Babel-compiled JS string.
// Phase 1 used Record<string, unknown>; Phase 2 narrows it to the dual-cache shape.
export interface AppRecord {
  cacheKey: string;
  type: string;
  source: string;
  transpiledJS: string;
  [key: string]: unknown; // allow forward-compat extra fields
}
export type WidgetRecord = Record<string, unknown>;
export type HandlerRecord = Record<string, unknown>;

export interface RegistrySchema extends DBSchema {
  apps: { key: string; value: AppRecord };
  widgets: { key: string; value: WidgetRecord };
  handlers: { key: string; value: HandlerRecord };
}

export function openRegistry(): Promise<IDBPDatabase<RegistrySchema>> {
  return openDB<RegistrySchema>("MarketplaceRegistry", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("apps")) db.createObjectStore("apps");
      if (!db.objectStoreNames.contains("widgets")) db.createObjectStore("widgets");
      if (!db.objectStoreNames.contains("handlers")) db.createObjectStore("handlers");
    },
  });
}
