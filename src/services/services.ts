// Composition root — the single place that builds the real external
// dependencies and bundles them into a `Services` object.
//
// IoC/DI rationale: business logic (loader, producer, the open flow) consumes
// these dependencies through the `Services` interface instead of reaching for
// singletons, `fetch`, `localStorage`, or `indexedDB` directly. That makes the
// substitutable seams explicit: a test supplies a canned transport (no
// network), an in-memory registry (no IndexedDB), and a fixed key getter —
// while production wires the real implementations here. The scope is
// deliberately small (KISS): only the model transport, the registry, and the
// API-key getter are injected, because those are the things tests must replace.

import { defaultTransport, type TransportFn } from "../host/modelClient";
import { realClock } from "../host/clock";
import { TokenBucket } from "../host/tokenBucket";
import { createResilientTransport } from "../host/resilientTransport";
import { createProduceGate, type ProduceGate } from "../host/produceGate";
import {
  navigatorStorageSeam,
  type StoragePressureSeam,
} from "../host/storageEstimate";
import { STORAGE_KEY_API } from "../lib/storage";
import type { Registry } from "./registry";
import { realRegistry } from "./realRegistry";
import { createDataBroker, type DataFetchBroker } from "../data/dataBroker";
import { realSettingsStore, type SettingsStore } from "../host/settingsStore";

/** Reads the access key. Returns null when unavailable. */
export type ApiKeyGetter = () => string | null;

/** The injected dependency bundle threaded through the open flow. */
export interface Services {
  /** Model HTTP transport (real fetch in production, canned in tests). */
  transport: TransportFn;
  /** Persistent app/widget/handler store (IndexedDB in production). */
  registry: Registry;
  /** Reads the access key (localStorage in production). */
  getApiKey: ApiKeyGetter;
  /**
   * Produce-cost guardrail (Phase 7, RESIL-05): the loader calls this before a
   * cache MISS reaches the model, soft-capping produce calls per rolling window.
   */
  produceGate: ProduceGate;
  /**
   * Storage-pressure seam (Phase 7, RESIL-06): persist request + usage/quota
   * estimate, driving LRU eviction when the registry approaches quota.
   */
  storage: StoragePressureSeam;
  /**
   * Data-fetch broker for the sanctioned network-data path (DATA-01).
   * Optional — core flow unaffected when absent.
   */
  fetchDataBroker?: DataFetchBroker;
  /**
   * Durable mirror for user preferences (Phase 14, THEME-01): the named-theme
   * provider writes the chosen theme here as a best-effort IDB mirror, while
   * localStorage stays the source of truth for first paint.
   */
  settingsStore: SettingsStore;
  /**
   * Render mode for app bodies (SANDBOX-05): "iframe" runs each app in an
   * opaque-origin frame; "in-tree" renders it directly in the host subtree.
   * Production uses "iframe"; tests default to "in-tree" so the existing
   * JSDOM/RTL suite runs the direct path without a real browser.
   */
  frameMode: "iframe" | "in-tree";
}

/**
 * Production key getter: reads the access key from localStorage.
 * Returns null if localStorage is unavailable or the key is absent.
 */
export const localStorageApiKeyGetter: ApiKeyGetter = () => {
  try {
    return localStorage.getItem(STORAGE_KEY_API);
  } catch {
    return null;
  }
};

/**
 * Build the production model transport: the real fetch transport wrapped with
 * the shared token-bucket limiter and 429 backoff (Phase 6, RESIL-04).
 *
 * The limiter is constructed HERE, once, so a single instance governs the whole
 * session at the single egress chokepoint — apps, widgets, and tweaks all share
 * the same rate/concurrency budget (the place Phase 7's cost cap will also hang).
 * Defaults are conservative for the direct-browser path: a small burst, a slow
 * sustained rate, and ≤2 simultaneous in-flight requests (matching the widget
 * pre-warm concurrency cap). The real wall clock is injected for backoff/refill.
 */
export function createModelTransport(inner: TransportFn = defaultTransport): TransportFn {
  const limiter = new TokenBucket({
    capacity: 4,
    refillPerSec: 1,
    maxConcurrent: 2,
    clock: realClock,
  });
  return createResilientTransport({ inner, limiter, clock: realClock });
}

/**
 * Build the production services bundle: the resilient model transport, the real
 * IndexedDB registry, and the localStorage key getter. The transport now carries
 * the limiter + 429 backoff (Phase 6); the success path is unchanged, so the open
 * flow behaves identically on a healthy connection.
 */
export function createServices(): Services {
  return {
    transport: createModelTransport(),
    registry: realRegistry,
    getApiKey: localStorageApiKeyGetter,
    // RESIL-05: one gate per session, anchored on the real wall clock, so its
    // rolling window matches real elapsed time at the produce chokepoint.
    produceGate: createProduceGate({ clock: realClock }),
    // RESIL-06: the real navigator.storage seam (guarded persist + estimate).
    storage: navigatorStorageSeam,
    // DATA-01: real broker wired with manifest + limiter + ttlCache + realClock.
    fetchDataBroker: createDataBroker({ clock: realClock }),
    // THEME-01: best-effort IDB mirror of the named-theme preference (DB v3).
    settingsStore: realSettingsStore,
    // SANDBOX-05: production renders app bodies inside opaque-origin frames.
    frameMode: "iframe",
  };
}
