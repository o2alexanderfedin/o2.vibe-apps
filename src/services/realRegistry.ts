// Production Registry adapter — wraps the IndexedDB-backed singleton.
//
// This is the ONLY place that touches ../registry/registry from the services
// layer. It is a thin pass-through so production behavior is byte-for-byte the
// same as before the DI refactor: the same dbReady gate, the same in-memory
// fallback, the same store semantics. Business logic depends on the Registry
// interface; this adapter supplies it in the composition root.

import { get, put, del } from "../registry/registry";
import type { Registry, StoreName, StoreValue } from "./registry";

export const realRegistry: Registry = {
  get: <S extends StoreName>(store: S, key: string) =>
    get(store, key) as Promise<StoreValue<S> | undefined>,
  put: <S extends StoreName>(store: S, value: StoreValue<S>, key: string) =>
    put(store, value, key),
  del: (store: StoreName, key: string) => del(store, key),
};
