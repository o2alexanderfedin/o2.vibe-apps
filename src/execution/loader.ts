// App loader — three-tier resolve → compile → instantiate (Phase 2+3; Phase 4
// adds transitive widget pre-warm so composed apps render fully on first paint).
//
// Tier 1: live-component Map (in-memory, by instance id) — fastest path.
// Tier 2: transpiled-source Map (in-memory session cache, by cacheKey) — skip recompile.
// Tier 3: registry `apps` store (persistent, by cacheKey) — read both source + transpiledJS.
// On full miss (seeded): use seeded source, transpile, write BOTH pieces to the registry.
// On full miss (unseeded): call the model via produceComponent(), write BOTH pieces (GEN-01..04).
//
// Phase 4 (WIDGET-02/03): before an app is instantiated, its `@widget`
// declarations are pre-warmed transitively (cycle guard + concurrency cap ≤2),
// and the app is instantiated with a `useWidget` bound to the resulting
// widget-component map — so `useWidget(type)` is a pure synchronous `Map.get` at
// render time and every declared widget is ready on first paint (no pop-in).
// The pre-warm runs on every NON-live path (tier-2, tier-3, full miss): the
// in-memory tier-2 cache now carries the app source, so widgets are resolvable
// even on a transpiled-cache hit. Tier-1 (a live component for the same instance)
// already has its widgets bound and is returned as-is.
//
// IoC/DI: the registry, transport, and API-key getter arrive as an injected
// `Services` bundle — the loader never imports the registry singleton, `fetch`,
// or `localStorage`. The composition root supplies the real implementations;
// tests supply an in-memory registry and a canned transport.

import type { ComponentType } from "react";
import { transpile } from "./transpile";
import { instantiate, makeUseWidget } from "./instantiate";
import { prewarmWidgets } from "./widgetPrewarm";
import { SEEDED_SOURCES } from "../apps/seeds";
import { produceComponent, type TransportFn as ProducerTransport } from "./producer";
import type { Services } from "../services/services";
import { logger } from "../lib/logger";

/** Tier 1: live component instances, keyed by instance id. */
const liveComponents = new Map<string, ComponentType>();

/**
 * Tier 2: compiled app pieces, keyed by opaque cacheKey. Stores BOTH the source
 * (so widget `@widget` deps stay parseable on a cache hit) and the transpiled JS
 * (so no recompile). Phase 4 widened this from a bare JS string to the dual shape.
 */
interface CachedApp {
  source: string;
  transpiledJS: string;
}
const transpiledCache = new Map<string, CachedApp>();

/** Re-export for tests that need to inject a transport stub. */
export type { ProducerTransport };

/**
 * Instantiate an app from its source + transpiled JS, pre-warming every declared
 * widget transitively first (WIDGET-02) and binding the app's `useWidget` to the
 * resulting widget-component map (WIDGET-03). Shared by every non-live tier so
 * the widget path is identical regardless of where the app source came from (DRY).
 */
async function instantiateWithWidgets(
  source: string,
  transpiledJS: string,
  services: Services,
): Promise<ComponentType> {
  const widgetMap = await prewarmWidgets(source, services);
  return instantiate(transpiledJS, makeUseWidget(widgetMap));
}

/**
 * Resolve an app type to a live React component, running through three tiers.
 *
 * @param instanceId  Unique id for this mounted instance (e.g. "counter-1").
 * @param appType     App type id from the storefront (e.g. "counter").
 * @param appCacheKey Opaque SHA-256 cache key from the intent resolver. For a
 *                    tweak (MOD-03) this is derived from (type + instruction) so
 *                    the tweaked variant caches separately from the original.
 * @param services    Injected dependency bundle (registry, transport, key getter).
 * @param userPrompt  Optional free-form mutation instruction (Phase 5 tweak,
 *                    MOD-03). When set on a FULL miss for an unseeded type, it is
 *                    woven into the produce prompt so the produced app reflects
 *                    the request. The resolve/cache machinery is otherwise
 *                    identical to a fresh open (DRY) — a tweaked app that hits the
 *                    cache (same key) reuses the cached variant with no model call.
 */
export async function resolveComponent(
  instanceId: string,
  appType: string,
  appCacheKey: string,
  services: Services,
  userPrompt?: string,
): Promise<ComponentType> {
  // Tier 1: live component already instantiated for this instance.
  const live = liveComponents.get(instanceId);
  if (live) {
    logger.info("Loader: tier-1 hit (live component) for " + instanceId);
    return live;
  }

  // Tier 2: compiled pieces in session cache — instantiate without recompile,
  // pre-warming declared widgets from the cached source first (WIDGET-02/03).
  const cached = transpiledCache.get(appCacheKey);
  if (cached) {
    logger.info("Loader: tier-2 hit (transpiled cache) for " + appType);
    const Component = await instantiateWithWidgets(
      cached.source,
      cached.transpiledJS,
      services,
    );
    liveComponents.set(instanceId, Component);
    return Component;
  }

  // Tier 3: registry — read both source and transpiledJS.
  const stored = await services.registry.get("apps", appCacheKey);
  if (stored?.transpiledJS && stored?.source) {
    logger.info("Loader: tier-3 hit (registry) for " + appType);
    transpiledCache.set(appCacheKey, {
      source: stored.source,
      transpiledJS: stored.transpiledJS,
    });
    const Component = await instantiateWithWidgets(
      stored.source,
      stored.transpiledJS,
      services,
    );
    liveComponents.set(instanceId, Component);
    return Component;
  }

  // Full miss — resolve source. A tweak (userPrompt present) must reflect the
  // user's instruction, so it ALWAYS produces via the model even for a seeded
  // type — the seed is the un-tweaked baseline and ignores the instruction.
  const seededSource = userPrompt ? undefined : SEEDED_SOURCES.get(appType);

  let source: string;
  let transpiledJS: string;

  if (seededSource) {
    // Seeded path: transpile locally, no model call.
    logger.info("Loader: cache miss — compiling seeded source for " + appType);
    source = seededSource;
    transpiledJS = transpile(source, { filename: appType + ".tsx" });
  } else {
    // Unseeded path: on-demand produce via model (GEN-01..03, GEN-05). On a
    // tweak (MOD-03) the user's instruction is woven into the produce prompt so
    // the produced app reflects the request — same produce loop otherwise (DRY).
    logger.info("Loader: unseeded type — requesting component for " + appType);
    const produced = await produceComponent(
      appType,
      services.transport,
      services.getApiKey,
      "app",
      userPrompt,
    );
    source = produced.source;
    transpiledJS = produced.transpiledJS;
  }

  transpiledCache.set(appCacheKey, { source, transpiledJS });

  // Persist both pieces to the registry — next open is an instant cache hit (GEN-04).
  await services.registry.put(
    "apps",
    { cacheKey: appCacheKey, type: appType, source, transpiledJS },
    appCacheKey,
  );

  // Pre-warm declared widgets, then instantiate with the bound useWidget (WIDGET-02/03).
  const Component = await instantiateWithWidgets(source, transpiledJS, services);
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
