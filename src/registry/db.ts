// IndexedDB schema for the Marketplace registry (D-20, D-21).
// DB name: "MarketplaceRegistry", version 1, three neutral object stores.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

// Phase 1 defines the schema; full record shapes arrive in Phase 2.
export type AppRecord = Record<string, unknown>;
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
