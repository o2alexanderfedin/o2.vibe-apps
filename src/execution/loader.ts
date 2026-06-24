// App loader — three-tier resolve → compile → instantiate (Phase 2, LOOP-04/05/06/07).
//
// Tier 1: live-component Map (in-memory, by instance id) — fastest path.
// Tier 2: transpiled-string Map (in-memory session cache, by cacheKey) — skip recompile.
// Tier 3: IndexedDB `apps` store (persistent, by cacheKey) — read both source + transpiledJS.
// On full miss: use seeded source, transpile, write BOTH pieces to IndexedDB.
//
// The loader does NOT call any model. In Phase 2 all source comes from SEEDED_SOURCES.
// Phase 3 will add a model call after the three-tier miss path.

import type { ComponentType } from "react";
import { get, put } from "../registry/registry";
import { transpile } from "./transpile";
import { instantiate } from "./instantiate";
import { SEEDED_SOURCES } from "../apps/seeds";
import { logger } from "../lib/logger";

/** Tier 1: live component instances, keyed by instance id. */
const liveComponents = new Map<string, ComponentType>();

/** Tier 2: transpiled JS strings, keyed by opaque cacheKey. */
const transpiledCache = new Map<string, string>();

/**
 * Resolve an app type to a live React component, running through three tiers.
 *
 * @param instanceId  Unique id for this mounted instance (e.g. "counter-1").
 * @param appType     App type id from the storefront (e.g. "counter").
 * @param appCacheKey Opaque SHA-256 cache key from the intent resolver.
 */
export async function resolveComponent(
  instanceId: string,
  appType: string,
  appCacheKey: string,
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

  // Tier 3: IndexedDB — read both source and transpiledJS.
  const stored = await get("apps", appCacheKey);
  if (stored?.transpiledJS) {
    logger.info("Loader: tier-3 hit (IndexedDB) for " + appType);
    transpiledCache.set(appCacheKey, stored.transpiledJS);
    const Component = instantiate(stored.transpiledJS);
    liveComponents.set(instanceId, Component);
    return Component;
  }

  // Full miss: use seeded source, transpile, persist both pieces.
  logger.info("Loader: cache miss — compiling seeded source for " + appType);
  const source = SEEDED_SOURCES.get(appType);
  if (!source) {
    throw new Error("No source available for app type: " + appType);
  }

  const transpiledJS = transpile(source, { filename: appType + ".tsx" });
  transpiledCache.set(appCacheKey, transpiledJS);

  // Persist both pieces to IndexedDB (dual-cache requirement).
  await put("apps", { cacheKey: appCacheKey, type: appType, source, transpiledJS }, appCacheKey);

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
