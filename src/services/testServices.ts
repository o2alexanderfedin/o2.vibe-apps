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
import type { ProduceGate } from "../host/produceGate";
import type { StoragePressureSeam } from "../host/storageEstimate";
import type { DataFetchBroker } from "../data/dataBroker";
import type { SettingsStore } from "../host/settingsStore";

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
    keys: (store: StoreName) => Promise.resolve([...stores[store].keys()]),
  };
}

/**
 * A produce gate that never throttles — the default for tests that are not
 * exercising the cost cap, so the produce path runs unblocked. Tests that DO
 * exercise the cap inject a real createProduceGate with a stub clock.
 */
export const passthroughProduceGate: ProduceGate = { tryAcquire: () => {} };

/**
 * A storage seam that reports NO pressure (usage 0, quota large) so the LRU pass
 * never evicts in tests not exercising it, and persist always "succeeds". Tests
 * that DO exercise eviction inject a stub returning a controlled estimate.
 */
export const noPressureStorageSeam: StoragePressureSeam = {
  requestPersist: () => Promise.resolve(true),
  estimate: () => Promise.resolve({ usage: 0, quota: 1_000_000 }),
};

/**
 * An in-memory settings store that records every write — the test double for
 * the IDB-backed `realSettingsStore`. It keeps the last written value in memory
 * (so `read` round-trips) and exposes a `writes` log + `writeCount` so IoC tests
 * can assert exactly how many times, and with what value, the provider mirrored
 * the choice — all offline, with no real IndexedDB.
 *
 * Phase 21 (PERSIST-01) additions: `rawWrites` and `rawWriteCount(key)` track
 * per-key writeRaw calls so the debounce test in Plan 21-04 can assert that
 * exactly 1 writeRaw("windowLayout", ...) call fired during a drag session.
 */
export interface RecordingSettingsStore extends SettingsStore {
  /** Every value passed to `write`, in call order. */
  readonly writes: string[];
  /** Convenience: number of `write` calls so far. */
  readonly writeCount: number;
  /**
   * Ordered list of values written per raw key (Phase 21, PERSIST-01).
   * The map key is the IDB settings key (e.g. "windowLayout"); the value is
   * an ordered array of every string passed to writeRaw for that key.
   */
  readonly rawWrites: ReadonlyMap<string, readonly string[]>;
  /**
   * Convenience count of writeRaw calls for a specific key (Phase 21, PERSIST-01).
   * Returns 0 for a key that has never been written.
   */
  rawWriteCount(key: string): number;
}

export function createRecordingSettingsStore(): RecordingSettingsStore {
  const writes: string[] = [];
  let current: string | null = null;
  const rawWritesMap = new Map<string, string[]>();
  const rawCurrentMap = new Map<string, string>();
  return {
    write(value: string): Promise<void> {
      writes.push(value);
      current = value;
      return Promise.resolve();
    },
    read(): Promise<string | null> {
      return Promise.resolve(current);
    },
    writeRaw(key: string, value: string): Promise<void> {
      const existing = rawWritesMap.get(key);
      if (existing) {
        existing.push(value);
      } else {
        rawWritesMap.set(key, [value]);
      }
      rawCurrentMap.set(key, value);
      return Promise.resolve();
    },
    readRaw(key: string): Promise<string | null> {
      return Promise.resolve(rawCurrentMap.get(key) ?? null);
    },
    get writes() {
      return writes;
    },
    get writeCount() {
      return writes.length;
    },
    get rawWrites(): ReadonlyMap<string, readonly string[]> {
      // Return a snapshot with frozen value arrays so the ReadonlyMap contract
      // is honest — callers cannot mutate the store's internal write history
      // even with a cast (IN-01). Test-double only; no production impact.
      return new Map(
        [...rawWritesMap.entries()].map(([k, v]) => [k, Object.freeze([...v])]),
      );
    },
    rawWriteCount(key: string): number {
      return rawWritesMap.get(key)?.length ?? 0;
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
  /** Inject a real produce gate (with a stub clock) to exercise the cost cap. */
  produceGate?: ProduceGate;
  /** Inject a stub storage seam to exercise LRU eviction / pressure. */
  storage?: StoragePressureSeam;
  /** Inject a canned broker for handler integration tests. */
  fetchDataBroker?: DataFetchBroker;
  /** Inject a recording settings store to assert the theme-mirror seam. */
  settingsStore?: SettingsStore;
  /** Override the app-body render mode; defaults to "in-tree" for the JSDOM suite. */
  frameMode?: "iframe" | "in-tree";
}

/**
 * Build a Services bundle wired entirely from test doubles. Defaults: an
 * in-memory registry, a transport that throws if called (forcing tests to opt
 * into network behavior), a present key so the producer does not bail, a
 * never-throttling produce gate, and a no-pressure storage seam. Tests opt into
 * the cost-cap / eviction behavior by injecting a real gate / stub seam.
 */
export function createTestServices(overrides: TestServicesOverrides = {}): Services {
  const apiKey = "apiKey" in overrides ? (overrides.apiKey ?? null) : "sk-test-key";
  const getApiKey: ApiKeyGetter = () => apiKey;
  return {
    transport: overrides.transport ?? unusedTransport,
    registry: overrides.registry ?? createInMemoryRegistry(),
    getApiKey,
    produceGate: overrides.produceGate ?? passthroughProduceGate,
    storage: overrides.storage ?? noPressureStorageSeam,
    fetchDataBroker: overrides.fetchDataBroker,
    settingsStore: overrides.settingsStore ?? createRecordingSettingsStore(),
    frameMode: overrides.frameMode ?? "in-tree",
  };
}

/**
 * A broker that returns a fixed response — for handler integration tests.
 * Mirrors the cannedTransport pattern.
 */
export function cannedBroker(response: {
  data?: unknown;
  error?: string;
}): DataFetchBroker {
  return {
    fetch: (_sourceId: string, _params: unknown) => Promise.resolve(response),
  };
}

/**
 * A broker that should never be called — mirrors unusedTransport.
 * Use in tests that do not exercise the data-fetch path.
 */
export const unusedBroker: DataFetchBroker = {
  fetch: () => {
    throw new Error("DataFetchBroker was invoked unexpectedly");
  },
};
