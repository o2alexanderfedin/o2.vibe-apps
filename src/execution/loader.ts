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
import { instantiate, makeUseWidget, InstantiateError } from "./instantiate";
import { instantiateDelegated, makeDelegatedComponent } from "./delegated";
import { runHandler } from "./handler";
import { prewarmWidgets } from "./widgetPrewarm";
import { SEEDED_SOURCES } from "../apps/seeds";
import { produceComponent, type TransportFn as ProducerTransport } from "./producer";
import type { Services } from "../services/services";
import { evictUnderPressure } from "../registry/storagePressure";
import { logger } from "../lib/logger";

/**
 * Refresh the LRU bookkeeping of a stored record after a cache HIT (Phase 7,
 * RESIL-06): bump `useCount` and stamp `updatedAt` with "now", then write it back
 * so the entry counts as recently used and survives the next eviction sweep. The
 * write is best-effort — a failure here must never break the open path, so any
 * error is swallowed to the gated logger. "now" comes from the injected storage
 * seam's clock-free path: we use Date.now() at the persistence boundary only (the
 * window-timing clock injection lives in the produce gate, not here).
 */
async function touchRecord(
  services: Services,
  cacheKey: string,
  record: { source: string; transpiledJS: string } & Record<string, unknown>,
  type: string,
): Promise<void> {
  try {
    const useCount =
      typeof record.useCount === "number" ? record.useCount + 1 : 1;
    await services.registry.put(
      "apps",
      {
        ...record,
        cacheKey,
        type,
        useCount,
        updatedAt: Date.now(),
      },
      cacheKey,
    );
  } catch (err) {
    logger.error("Loader: failed to refresh LRU bookkeeping: " + String(err));
  }
}

/** Tier 1: live component instances, keyed by instance id. */
const liveComponents = new Map<string, ComponentType>();

/**
 * Tier 2: compiled app pieces, keyed by opaque cacheKey. Stores BOTH the source
 * (so widget `@widget` deps stay parseable on a cache hit) and the transpiled JS
 * (so no recompile). Phase 4 widened this from a bare JS string to the dual shape.
 */
/**
 * How an app's produced/seeded pieces are instantiated:
 *   - "app"       : a monolithic React component (seeds + any legacy cached records).
 *   - "delegated" : a behavior-free module (initialState + view + actionSpec) mounted
 *                   through the permanent DelegatedShell runtime, with all behavior
 *                   produced on demand per action. The default for newly produced apps.
 */
type AppMode = "app" | "delegated";

interface CachedApp {
  source: string;
  transpiledJS: string;
  mode: AppMode;
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
  // Phase 8 (HANDLER-01): bind the backend-style data handler to THIS app's
  // services and inject it into the component scope as a 2-arg `runHandler(intent,
  // input)`. The app never sees `services` — registry/transport/key stay closed
  // over here — and resolve-or-produce + the constrained-scope exec all happen
  // inside `runHandler`. Apps that never call it pay nothing (it is just a bound
  // function in scope).
  const boundRunHandler = (intent: string, input: unknown) =>
    runHandler(intent, input, services);
  return instantiate(transpiledJS, makeUseWidget(widgetMap), boundRunHandler);
}

/**
 * Instantiate an app's pieces by mode. A "delegated" app is a behavior-free module
 * mounted through the permanent DelegatedShell (its on-demand behavior is bound to
 * THIS app's services-backed runHandler — the app never sees services). An "app" is
 * the monolithic component path (with transitive widget pre-warm). Shared by every
 * non-live tier so the dispatch is identical regardless of where the pieces came
 * from (DRY).
 */
async function instantiateApp(
  source: string,
  transpiledJS: string,
  mode: AppMode,
  appType: string,
  services: Services,
): Promise<ComponentType> {
  if (mode === "delegated") {
    try {
      const module = instantiateDelegated(transpiledJS);
      const boundRunHandler = (intent: string, input: unknown) =>
        runHandler(intent, input, services);
      return makeDelegatedComponent(appType, module, boundRunHandler);
    } catch (err) {
      // Graceful fallback: if the payload is not actually a delegated module (it
      // exports no `view` — e.g. a monolithic component), mount it as a monolith.
      // Keeps the path robust to either produced shape (real delegated modules take
      // the delegated branch; a monolith still renders).
      if (err instanceof InstantiateError) {
        logger.info("Loader: not a delegated module — mounting as a monolithic app");
        return instantiateWithWidgets(source, transpiledJS, services);
      }
      throw err;
    }
  }
  return instantiateWithWidgets(source, transpiledJS, services);
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
    const Component = await instantiateApp(
      cached.source,
      cached.transpiledJS,
      cached.mode,
      appType,
      services,
    );
    liveComponents.set(instanceId, Component);
    return Component;
  }

  // Tier 3: registry — read both source and transpiledJS.
  const stored = await services.registry.get("apps", appCacheKey);
  if (stored?.transpiledJS && stored?.source) {
    logger.info("Loader: tier-3 hit (registry) for " + appType);
    // Cache HIT: refresh LRU bookkeeping (bump useCount, stamp updatedAt) so this
    // entry is marked recently used and survives the next eviction sweep (RESIL-06).
    // A cache hit makes NO model call, so the produce gate is never consulted here.
    await touchRecord(services, appCacheKey, stored, appType);
    // A record written by the delegated path carries mode:"delegated"; legacy/seeded
    // records have no mode and instantiate as a monolithic "app" (back-compat).
    const mode: AppMode = stored.mode === "delegated" ? "delegated" : "app";
    transpiledCache.set(appCacheKey, {
      source: stored.source,
      transpiledJS: stored.transpiledJS,
      mode,
    });
    const Component = await instantiateApp(
      stored.source,
      stored.transpiledJS,
      mode,
      appType,
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
  let mode: AppMode;

  if (seededSource) {
    // Seeded path: transpile locally, no model call. Seeds are monolithic components.
    logger.info("Loader: cache miss — compiling seeded source for " + appType);
    source = seededSource;
    transpiledJS = transpile(source, { filename: appType + ".tsx" });
    mode = "app";
  } else {
    // Unseeded path: on-demand produce via model (GEN-01..03, GEN-05) in DELEGATED
    // mode — a behavior-free module (initialState + view + actionSpec) mounted through
    // the permanent DelegatedShell, with per-action behavior produced on demand. The
    // produced module is far smaller (and so more reliable) than a monolith. On a
    // tweak (MOD-03) the user's instruction is woven into the produce prompt.
    //
    // RESIL-05 cost guardrail: this is the ONE place a cache miss spends real
    // budget, so the soft cap is checked HERE, immediately before the model call.
    // tryAcquire throws ProduceThrottledError (neutral copy) when the rolling
    // window cap is exceeded; the open flow maps it to the failed-open fallback.
    // A cache hit (tier 1/2/3) never reaches this line, so it is never capped.
    services.produceGate.tryAcquire();
    logger.info("Loader: unseeded type — requesting component for " + appType);
    const produced = await produceComponent(
      appType,
      services.transport,
      services.getApiKey,
      "delegated",
      userPrompt,
    );
    source = produced.source;
    transpiledJS = produced.transpiledJS;
    mode = "delegated";
  }

  transpiledCache.set(appCacheKey, { source, transpiledJS, mode });

  // RESIL-06: before writing a new record, relieve storage pressure if the
  // registry is approaching quota — evict least-recently-used entries so the
  // write succeeds instead of tripping QuotaExceededError. No-ops when under
  // threshold (or when the platform exposes no estimate). Best-effort: an
  // eviction failure must not block the open, so it is swallowed to the logger.
  try {
    await evictUnderPressure({ registry: services.registry, storage: services.storage });
  } catch (err) {
    logger.error("Loader: storage-pressure eviction failed: " + String(err));
  }

  // Persist both pieces to the registry — next open is an instant cache hit (GEN-04).
  // Fresh LRU bookkeeping: useCount 0 (no hits yet), updatedAt = now (RESIL-06).
  await services.registry.put(
    "apps",
    {
      cacheKey: appCacheKey,
      type: appType,
      source,
      transpiledJS,
      mode,
      useCount: 0,
      updatedAt: Date.now(),
    },
    appCacheKey,
  );

  // Instantiate by mode: a delegated module mounts through DelegatedShell; a
  // monolithic app pre-warms its declared widgets and binds useWidget (WIDGET-02/03).
  const Component = await instantiateApp(source, transpiledJS, mode, appType, services);
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
