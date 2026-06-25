// Test-only services builders — in-memory registry + canned transport.
//
// These are test doubles (named "stub"/"canned"/"testTransport", never the
// banned hygiene tokens). They let tests exercise the real loader/producer/open
// flow with NO network and NO real IndexedDB: the registry is a plain Map and
// the transport is a function the test controls. This module is imported only
// by *.test.* files and is pruned from the production bundle.

import type { Registry, StoreName, StoreValue } from "./registry";
import type { ApiKeyGetter, Services } from "./services";
import type { TransportFn, MessagesResponse } from "../host/modelClient";

/** Build an in-memory Registry backed by a Map per store. */
export function createInMemoryRegistry(): Registry {
  const stores: Record<StoreName, Map<string, unknown>> = {
    apps: new Map(),
    widgets: new Map(),
    handlers: new Map(),
  };
  return {
    get: <S extends StoreName>(store: S, key: string) =>
      Promise.resolve(stores[store].get(key) as StoreValue<S> | undefined),
    put: <S extends StoreName>(store: S, value: StoreValue<S>, key: string) => {
      stores[store].set(key, value);
      return Promise.resolve();
    },
    del: (store: StoreName, key: string) => {
      stores[store].delete(key);
      return Promise.resolve();
    },
  };
}

/** A transport that returns the given component text on every call. */
export function cannedTransport(text: string): TransportFn {
  return (_url, _init) =>
    Promise.resolve<MessagesResponse>({
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
    });
}

/** A transport that should never be called — fails the test if it is. */
export const unusedTransport: TransportFn = () => {
  throw new Error("transport was invoked unexpectedly");
};

export interface TestServicesOverrides {
  transport?: TransportFn;
  registry?: Registry;
  apiKey?: string | null;
}

/**
 * Build a Services bundle wired entirely from test doubles. Defaults: an
 * in-memory registry, a transport that throws if called (forcing tests to opt
 * into network behavior), and a present key so the producer does not bail.
 */
export function createTestServices(overrides: TestServicesOverrides = {}): Services {
  const apiKey = "apiKey" in overrides ? (overrides.apiKey ?? null) : "sk-test-key";
  const getApiKey: ApiKeyGetter = () => apiKey;
  return {
    transport: overrides.transport ?? unusedTransport,
    registry: overrides.registry ?? createInMemoryRegistry(),
    getApiKey,
  };
}
