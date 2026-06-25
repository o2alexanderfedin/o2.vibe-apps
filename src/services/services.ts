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
 * Build the production services bundle: real fetch transport, real IndexedDB
 * registry, and the localStorage key getter. Behavior is identical to the
 * pre-DI implementation — this is wiring only, no behavior change.
 */
export function createServices(): Services {
  return {
    transport: defaultTransport,
    registry: realRegistry,
    getApiKey: localStorageApiKeyGetter,
  };
}
