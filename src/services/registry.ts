// Registry interface — the injectable contract over the app/widget/handler store.
//
// Business logic (loader, producer) depends on THIS interface, never on the
// concrete IndexedDB-backed singleton in ../registry/registry. That keeps the
// persistence implementation swappable: production wires the real IndexedDB
// store (see createServices), tests wire an in-memory store with no real
// IndexedDB. The async signatures are identical regardless of backend, so
// callers never branch on availability.

import type { AppRecord, WidgetRecord, HandlerRecord } from "../registry/db";

/** The three object stores the registry manages. */
export type StoreName = "apps" | "widgets" | "handlers";

/** Maps a store name to its record type. */
export type StoreValue<S extends StoreName> = S extends "apps"
  ? AppRecord
  : S extends "widgets"
    ? WidgetRecord
    : HandlerRecord;

/**
 * The injectable registry contract: get/put/del/keys over the three stores.
 * Mirrors the module-level functions in ../registry/registry exactly so the
 * production adapter is a thin pass-through.
 *
 * Phase 7 (RESIL-06): adds `keys(store)` so the LRU eviction pass can enumerate
 * candidate victims across stores without coupling to a concrete backend.
 */
export interface Registry {
  get<S extends StoreName>(
    store: S,
    key: string,
  ): Promise<StoreValue<S> | undefined>;
  put<S extends StoreName>(
    store: S,
    value: StoreValue<S>,
    key: string,
  ): Promise<void>;
  del(store: StoreName, key: string): Promise<void>;
  /** List every key in a store (used by LRU eviction to enumerate victims). */
  keys(store: StoreName): Promise<string[]>;
}
