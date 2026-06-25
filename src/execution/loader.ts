// App loader — three-tier resolve → compile → instantiate (Phase 2+3).
//
// Tier 1: live-component Map (in-memory, by instance id) — fastest path.
// Tier 2: transpiled-string Map (in-memory session cache, by cacheKey) — skip recompile.
// Tier 3: registry `apps` store (persistent, by cacheKey) — read both source + transpiledJS.
// On full miss (seeded): use seeded source, transpile, write BOTH pieces to the registry.
// On full miss (unseeded): call the model via produceComponent(), write BOTH pieces (GEN-01..04).
//
// IoC/DI: the registry, transport, and API-key getter arrive as an injected
// `Services` bundle — the loader never imports the registry singleton, `fetch`,
// or `localStorage`. The composition root supplies the real implementations;
// tests supply an in-memory registry and a canned transport.

import type { ComponentType } from "react";
import { transpile } from "./transpile";
import { instantiate } from "./instantiate";
import { SEEDED_SOURCES } from "../apps/seeds";
import { produceComponent, type TransportFn as ProducerTransport } from "./producer";
import type { Services } from "../services/services";
import { logger } from "../lib/logger";

/** Tier 1: live component instances, keyed by instance id. */
const liveComponents = new Map<string, ComponentType>();

/** Tier 2: transpiled JS strings, keyed by opaque cacheKey. */
const transpiledCache = new Map<string, string>();

/** Re-export for tests that need to inject a transport stub. */
export type { ProducerTransport };

/**
 * Resolve an app type to a live React component, running through three tiers.
 *
 * @param instanceId  Unique id for this mounted instance (e.g. "counter-1").
 * @param appType     App type id from the storefront (e.g. "counter").
 * @param appCacheKey Opaque SHA-256 cache key from the intent resolver.
 * @param services    Injected dependency bundle (registry, transport, key getter).
 */
export async function resolveComponent(
  instanceId: string,
  appType: string,
  appCacheKey: string,
  services: Services,
): Promise<ComponentType> {
  // Tier 1: live component already instantiated for this instance.
  const live = liveComponents.get(instanceId);
  if (live) {
    logger.info("Loader: tier-1 hit (live component) for " + instanceId);
    return live;
  }

  // Tier 2: transpiled JS in session cache — instantiate without recompile.
  const cachedJS = transpiledCache.get(appCacheKey);
  if (cachedJS) {
    logger.info("Loader: tier-2 hit (transpiled cache) for " + appType);
    const Component = instantiate(cachedJS);
    liveComponents.set(instanceId, Component);
    return Component;
  }

  // Tier 3: registry — read both source and transpiledJS.
  const stored = await services.registry.get("apps", appCacheKey);
  if (stored?.transpiledJS) {
    logger.info("Loader: tier-3 hit (registry) for " + appType);
    transpiledCache.set(appCacheKey, stored.transpiledJS);
    const Component = instantiate(stored.transpiledJS);
    liveComponents.set(instanceId, Component);
    return Component;
  }

  // Full miss — resolve source.
  const seededSource = SEEDED_SOURCES.get(appType);

  let source: string;
  let transpiledJS: string;

  if (seededSource) {
    // Seeded path: transpile locally, no model call.
    logger.info("Loader: cache miss — compiling seeded source for " + appType);
    source = seededSource;
    transpiledJS = transpile(source, { filename: appType + ".tsx" });
  } else {
    // Unseeded path: on-demand produce via model (GEN-01..03, GEN-05).
    logger.info("Loader: unseeded type — requesting component for " + appType);
    const produced = await produceComponent(
      appType,
      services.transport,
      services.getApiKey,
    );
    source = produced.source;
    transpiledJS = produced.transpiledJS;
  }

  transpiledCache.set(appCacheKey, transpiledJS);

  // Persist both pieces to the registry — next open is an instant cache hit (GEN-04).
  await services.registry.put(
    "apps",
    { cacheKey: appCacheKey, type: appType, source, transpiledJS },
    appCacheKey,
  );

  const Component = instantiate(transpiledJS);
  liveComponents.set(instanceId, Component);
  return Component;
}

/**
 * Evict a live component from Tier 1 (call on unmount to free the reference).
 */
export function evictLiveComponent(instanceId: string): void {
  liveComponents.delete(instanceId);
}

// Exported for tests only — allows clearing in-memory caches between test runs.
export function _clearCachesForTesting(): void {
  liveComponents.clear();
  transpiledCache.clear();
}
