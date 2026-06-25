// Widget pre-warm pass (Phase 4, WIDGET-02 + WIDGET-03 plumbing).
//
// Before a host app mounts, every widget it declares (`// @widget <type>`) — and
// every widget THOSE widgets declare, transitively — must be resolved so that
// `useWidget(type)` is a pure synchronous `Map.get` at render time (WIDGET-03).
// This module performs that transitive resolution and returns the populated
// widget-component map (type → ComponentType) the host instance renders against.
//
// Three invariants the pass enforces:
//   1. Transitive: a widget's own `@widget` declarations are parsed and queued.
//   2. Cycle guard: a type already resolved (or in progress) is never re-queued,
//      so A→B→A terminates instead of looping forever (WIDGET-02).
//   3. Concurrency cap ≤2: at most two widgets resolve/produce at once, via a
//      tiny Promise pool, to avoid a request storm / render waterfall (WIDGET-02).
//
// Failure isolation (WIDGET-05): a widget that fails to resolve/produce does NOT
// fail the whole pass. It is simply absent from the map; `useWidget` returns null
// for it, and the host renders the widget through a per-widget ErrorBoundary that
// shows a neutral placeholder. So one bad widget never blanks the parent app.
//
// IoC/DI: every external dependency arrives through the injected `Services`
// bundle (registry + transport + key getter). The pass never imports the
// registry singleton, `fetch`, or `localStorage` — tests substitute an in-memory
// registry and a canned transport through the same seam used everywhere else.

import type { ComponentType } from "react";
import { instantiate, makeUseWidget } from "./instantiate";
import { transpile } from "./transpile";
import { produceComponent } from "./producer";
import { parseWidgetDeps } from "./widgetParse";
import { wrapWidget } from "../ui/widgetWrap";
import { SEEDED_SOURCES } from "../apps/seeds";
import { cacheKey } from "../registry/cacheKey";
import type { Services } from "../services/services";
import { logger } from "../lib/logger";

/** The maximum number of widgets resolved concurrently (WIDGET-02). */
export const WIDGET_CONCURRENCY = 2;

/** A widget's resolved source + transpiled JS (mirrors the app dual-cache). */
interface ResolvedWidget {
  source: string;
  transpiledJS: string;
}

/**
 * Resolve ONE widget type to its source + transpiled JS, mirroring the app
 * loader's resolve path but against the `widgets` store and with `kind:"widget"`:
 *   - registry hit (by cacheKey) → reuse stored source + transpiledJS
 *   - seeded source              → transpile locally, persist
 *   - full miss                  → produce via the model, persist (dual-cache)
 *
 * Returns null when the widget cannot be resolved (no key, produce/transpile
 * failure). A null result is isolated by the caller (WIDGET-05) — it does not
 * abort the rest of the pre-warm.
 */
async function resolveWidget(
  widgetType: string,
  services: Services,
): Promise<ResolvedWidget | null> {
  const key = await cacheKey(widgetType);

  // Registry hit — reuse both pieces, no recompile, no model call.
  const stored = await services.registry.get("widgets", key);
  const storedSource = stored?.["source"];
  const storedJS = stored?.["transpiledJS"];
  if (typeof storedSource === "string" && typeof storedJS === "string") {
    logger.info("Widget pre-warm: registry hit for " + widgetType);
    return { source: storedSource, transpiledJS: storedJS };
  }

  // Seeded widget source (none ship in v1, but the seam mirrors the app path).
  const seeded = SEEDED_SOURCES.get(widgetType);
  let source: string;
  let transpiledJS: string;
  try {
    if (seeded) {
      logger.info("Widget pre-warm: compiling seeded source for " + widgetType);
      source = seeded;
      transpiledJS = transpile(source, { filename: widgetType + ".tsx" });
    } else {
      logger.info("Widget pre-warm: requesting widget for " + widgetType);
      const produced = await produceComponent(
        widgetType,
        services.transport,
        services.getApiKey,
        "widget",
      );
      source = produced.source;
      transpiledJS = produced.transpiledJS;
    }
  } catch (err) {
    // Isolated failure (WIDGET-05): log, return null, let the host placeholder it.
    logger.error("Widget pre-warm: could not resolve " + widgetType + ": " + String(err));
    return null;
  }

  // Persist both pieces so the next open is an instant registry hit (GEN-04 parity).
  await services.registry.put(
    "widgets",
    { cacheKey: key, type: widgetType, source, transpiledJS },
    key,
  );
  return { source, transpiledJS };
}

/**
 * Transitively pre-warm every widget declared by `rootSource` (and nested
 * declarations), returning a map of widget type → resolved ComponentType.
 *
 * The returned map is the one the host instance binds its `useWidget` to. Each
 * resolved widget is itself instantiated with a `useWidget` bound to the SAME
 * map, so a widget that composes sub-widgets resolves them synchronously too.
 *
 * @param rootSource  The host app's (or widget's) TSX source — scanned for deps.
 * @param services    Injected dependency bundle (registry, transport, key getter).
 */
export async function prewarmWidgets(
  rootSource: string,
  services: Services,
): Promise<Map<string, ComponentType>> {
  // The shared component map every widget (and the host) reads through useWidget.
  const components = new Map<string, ComponentType>();
  // Resolved sources, kept so a widget's nested `@widget` deps can be parsed.
  const sources = new Map<string, string>();

  // Cycle guard (WIDGET-02): a type seen here is never queued twice, so a
  // dependency cycle (A→B→A) terminates. `seen` includes in-progress types.
  const seen = new Set<string>();
  // FIFO worklist of widget types still needing resolution.
  const queue: string[] = [];

  function enqueue(types: string[]): void {
    for (const t of types) {
      if (!seen.has(t)) {
        seen.add(t);
        queue.push(t);
      }
    }
  }

  // Seed the worklist from the root source's declarations.
  enqueue(parseWidgetDeps(rootSource));

  // Resolve a single type: fetch/produce → record source → instantiate against
  // the shared map → enqueue its nested declarations. All failures are isolated.
  async function processOne(widgetType: string): Promise<void> {
    const resolved = await resolveWidget(widgetType, services);
    if (!resolved) return; // isolated failure — type stays absent from the map
    sources.set(widgetType, resolved.source);
    // Transitive: queue any widgets THIS widget declares (WIDGET-02).
    enqueue(parseWidgetDeps(resolved.source));
    // Instantiate against the SHARED map so nested useWidget calls resolve too,
    // then wrap in WidgetShell + per-widget ErrorBoundary (WIDGET-04/05) so the
    // component the host receives is isolated by construction. A render-time
    // throw is caught by the wrapper's boundary (neutral placeholder); an
    // instantiate-time throw (bad transpiled JS) is isolated here — the type
    // stays absent from the map and useWidget returns null for it (WIDGET-05).
    try {
      const raw = instantiate(resolved.transpiledJS, makeUseWidget(components));
      components.set(widgetType, wrapWidget(widgetType, raw));
    } catch (err) {
      logger.error("Widget pre-warm: could not instantiate " + widgetType + ": " + String(err));
    }
  }

  // Tiny Promise pool: at most WIDGET_CONCURRENCY (≤2) resolutions run at once
  // (WIDGET-02). We spawn exactly WIDGET_CONCURRENCY workers up front; each pulls
  // the next type off the queue. Transitive deps discovered mid-flight are
  // appended to the queue, so a worker that finds the queue momentarily empty
  // must wait for any still-active worker (which may enqueue more) before
  // exiting — only when the queue is empty AND no worker is busy is the pass done.
  // `activeCount` tracks in-flight resolutions so the cap is never exceeded and
  // no transitive dependency is dropped.
  let activeCount = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const next = queue.shift();
      if (next === undefined) {
        // Queue empty: if another worker is still busy it may enqueue more, so
        // yield and re-check. If nothing is active, the pass is complete. Yield
        // to a macrotask (not a microtask) so this idle re-check never hot-spins
        // while the active worker awaits the network/transpile.
        if (activeCount === 0) return;
        await new Promise<void>((r) => setTimeout(r, 0));
        continue;
      }
      activeCount += 1;
      try {
        await processOne(next);
      } finally {
        activeCount -= 1;
      }
    }
  }

  await Promise.all(
    Array.from({ length: WIDGET_CONCURRENCY }, () => worker()),
  );

  return components;
}
