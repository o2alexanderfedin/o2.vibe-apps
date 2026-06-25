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
import { STORAGE_KEY_API } from "../lib/storage";
import type { Registry } from "./registry";
import { realRegistry } from "./realRegistry";

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
  };
}
