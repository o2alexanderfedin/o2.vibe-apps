// Backend-style data handlers (Phase 8, HANDLER-01..03) — the FINAL capability.
//
// A produced app or widget occasionally needs a "backend" data operation
// (compute a summary, filter a list, derive a forecast) without any real server,
// network, or stored credential. `runHandler(intent, input, services)` gives it
// one TRANSPARENTLY: it resolves a cached handler for the intent or PRODUCES one
// on first need, executes it in a constrained scope over the caller's `input`,
// and returns a neutral `{ data? , error? }`. The mechanic is never revealed —
// any failure (produce, compile, or a throwing handler) returns `{ error }` with
// mechanic-free copy.
//
// HOW IT MIRRORS THE APP/WIDGET PATH (DRY):
//   - PRODUCE goes through the SAME `produceComponent` machinery as apps/widgets
//     (prompt → extract → self-heal → truncation handling), selected by
//     `kind: "handler"` so it strips TS only (no react preset) and asks for a
//     plain `handler(input)` rather than an `App` export.
//   - CACHE uses the existing `handlers` store. Writes set `useCount:0` /
//     `updatedAt:Date.now()`; a hit bumps `useCount` + refreshes `updatedAt`,
//     exactly like the loader's app path — so handlers participate in the Phase 7
//     LRU eviction sweep for free (it already sweeps `handlers`).
//   - COST: a produce MISS consults `services.produceGate.tryAcquire()` — the
//     same sliding-window soft cap apps use — BEFORE the model call, so a runaway
//     of fresh handler intents is bounded too.
//
// HANDLER-03 — CONSTRAINED SCOPE (the security requirement of this phase):
//   The handler is instantiated via `new Function(<denylisted-globals…>, "input",
//   body)` with every dangerous global SHADOWED TO `undefined` in the parameter
//   list. Inside the function body those identifiers resolve to the parameters
//   (undefined), NOT the real globals — so the handler cannot reach the network
//   (`fetch`/`XMLHttpRequest`), storage (`localStorage`/`sessionStorage`/
//   `indexedDB`), the API key, or the DOM (`window`/`document`). This is a
//   targeted, handler-specific denylist; general sandboxing (iframe) is deferred
//   to v2 (HARD-01). The handler receives ONLY its `input`.
//
// IoC/DI: every dependency arrives via the injected `Services` bundle (transport,
// registry, getApiKey, produceGate). Tests substitute a canned transport, an
// in-memory registry, and a fixed key getter — no real network, storage, or
// IndexedDB in unit scope.

import { transpileHandler } from "./transpile";
import { produceComponent } from "./producer";
import type { Services } from "../services/services";
import type { HandlerRecord } from "../registry/db";
import { registryKey } from "../registry/cacheKey";
import { logger } from "../lib/logger";
import { WEATHER_HANDLER_SOURCES } from "../apps/weatherHandlers";
import { CURRENCY_HANDLER_SOURCES } from "../apps/currencyHandlers";

/**
 * Aggregated seeded handler sources. The map keys are the exact intent strings
 * buildActionIntent produces for each seeded app action. A match here short-circuits
 * the registry lookup and the model call — these handlers are host-authored and always
 * available with zero cost (DATA-03). To add more seeded handlers, spread their
 * ReadonlyMap into this array.
 */
const SEEDED_HANDLER_SOURCES: ReadonlyMap<string, string> = new Map([
  ...WEATHER_HANDLER_SOURCES,
  ...CURRENCY_HANDLER_SOURCES,
]);

/**
 * The neutral result a handler returns. Exactly one of `data` / `error` is set
 * in practice; the type allows either so a thrown handler maps cleanly to
 * `{ error }`. The copy in `error` is always mechanic-free.
 */
export interface HandlerResult {
  data?: unknown;
  error?: string;
}

/**
 * The globals SHADOWED TO `undefined` in the handler's `new Function` parameter
 * list (HANDLER-03). Because each name is a PARAMETER, a reference to it inside
 * the handler body resolves to the parameter (undefined) instead of the real
 * global — a targeted denylist that blocks network, storage, the DOM, and (via
 * the absence of any key parameter) the API key. Order is irrelevant; the call
 * site passes one `undefined` per name, positionally.
 *
 * NOTE: this is deliberately a DENYLIST of the specific globals the requirement
 * names, not a full allowlist sandbox (that is HARD-01, deferred to v2). Pure
 * language built-ins (Math, JSON, Date, Array, Object, structuredClone, …) stay
 * reachable so a handler can do real local computation.
 */
export const DENIED_GLOBALS: readonly string[] = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "window",
  "document",
];

/**
 * Neutral error copy returned to the caller when a handler cannot be run or
 * throws. It NEVER names the produce/compile/exec mechanic (HYGIENE) — to an app
 * it just looks like a data operation that didn't complete.
 */
const NEUTRAL_HANDLER_ERROR = "This operation could not be completed.";

/**
 * Instantiate a transpiled handler and execute it over `input` in the constrained
 * scope (HANDLER-03). The dangerous globals are shadowed to `undefined` via the
 * parameter list; the CommonJS `module`/`exports`/`require` shims let a handler
 * that used `export`/`import` resolve its export. The function body ends by
 * returning `handler(input)` so the call yields the handler's result directly.
 *
 * A handler may define `handler` as a top-level declaration OR assign it to an
 * export — both are resolved (declaration first via the trailing `return`, then a
 * fallback to `module.exports`), mirroring how `instantiate` resolves `App`.
 *
 * Any throw (compile-time during `new Function`, or runtime during execution) is
 * surfaced to the caller — `runHandler` maps it to a neutral `{ error }`.
 */
async function executeHandler(
  transpiledJS: string,
  fetchData: (sourceId: string, params: unknown) => Promise<{ data?: unknown; error?: string }>,
  input: unknown,
): Promise<HandlerResult> {
  const mod: { exports: Record<string, unknown> } = { exports: {} };

  // `require` is intentionally hostile: a handler must do LOCAL data work only, so
  // any module request throws (no react, no anything). This closes the one seam
  // the CommonJS transform could otherwise open.
  const requireShim = (specifier: string): unknown => {
    throw new Error(`Handler requested an unavailable module "${specifier}".`);
  };

  // Parameter list: the CJS shims, then EVERY denied global (shadowed to
  // undefined), then `fetchData` (the sanctioned data accessor, DATA-01),
  // then `input`. A reference to e.g. `fetch` inside the body binds to
  // the parameter (undefined) — never the real global (HANDLER-03).
  const params = [
    "module",
    "exports",
    "require",
    ...DENIED_GLOBALS,
    "fetchData",
    "input",
  ];

  // The body runs the handler and returns its result. We resolve `handler` from a
  // top-level declaration first (the common shape), falling back to an export.
  const body =
    transpiledJS +
    "\n;const __h = (typeof handler !== 'undefined') ? handler" +
    " : (module.exports && (module.exports.default || module.exports.handler));" +
    "\nif (typeof __h !== 'function') {" +
    " throw new Error('Handler did not define a handler function'); }" +
    "\nreturn __h(input);";

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function(...params, body);

  // Positional args: the CJS shims, one `undefined` per denied global,
  // then the services-bound fetchData closure, then input.
  const deniedArgs = DENIED_GLOBALS.map(() => undefined);
  const result = await fn(mod, mod.exports, requireShim, ...deniedArgs, fetchData, input);

  // Normalize: a well-behaved handler returns `{ data }` or `{ error }`. Anything
  // else (a bare value, null) is wrapped as `{ data }` so the caller's contract
  // ("returns { data?, error? }") always holds.
  if (result && typeof result === "object" && ("data" in result || "error" in result)) {
    return result as HandlerResult;
  }
  return { data: result };
}

/**
 * Refresh a handler record's LRU bookkeeping after a cache HIT — bump `useCount`,
 * stamp `updatedAt` — consistent with the loader's app path (Phase 7, RESIL-06).
 * Best-effort: a write failure must never break a handler run, so it is swallowed
 * to the gated logger.
 */
async function touchHandler(
  services: Services,
  key: string,
  record: HandlerRecord,
  nowFn: () => number = Date.now,
): Promise<void> {
  try {
    const useCount =
      typeof record.useCount === "number" ? record.useCount + 1 : 1;
    await services.registry.put(
      "handlers",
      { ...record, useCount, updatedAt: nowFn() },
      key,
    );
  } catch (err) {
    logger.error("Handler: failed to refresh LRU bookkeeping: " + String(err));
  }
}

/**
 * Resolve-or-produce the transpiled JS for an intent. Returns the runnable JS
 * string. On a cache hit it refreshes LRU bookkeeping and makes NO model call; on
 * a miss it consults the produce-cost gate, produces via the shared machinery,
 * and dual-caches (source + transpiledJS) under the opaque key.
 *
 * Cache resolution order mirrors the app loader's persistent tier: the `handlers`
 * store, keyed by the opaque SHA-256 of the intent. (Handlers have no per-render
 * live-component tier — they are functions invoked on demand, not mounted — so a
 * single persistent tier is sufficient; KISS.)
 */
async function resolveHandlerJS(
  intent: string,
  services: Services,
  nowFn: () => number = Date.now,
): Promise<string> {
  // Seeded-handler short-circuit: host-authored handler sources for known intents.
  // Fires BEFORE the registry lookup and BEFORE any model call (DATA-03). The
  // seeded source is transpiled locally on every call — no registry write needed,
  // as seeded handlers are stateless and cost nothing to re-transpile.
  const seededSource = SEEDED_HANDLER_SOURCES.get(intent);
  if (seededSource) {
    logger.info("Handler: seeded handler hit");
    return transpileHandler(seededSource, { filename: "seeded-handler.ts" });
  }

  const key = await registryKey("handler", intent);

  // Cache HIT: reuse the stored transpiled JS, no model call (HANDLER-02).
  const stored = await services.registry.get("handlers", key);
  if (stored && typeof stored.transpiledJS === "string") {
    logger.info("Handler: cache hit");
    await touchHandler(services, key, stored, nowFn);
    return stored.transpiledJS;
  }

  // MISS: this is the ONE place a handler spends real budget — apply the cost cap
  // BEFORE the model call, exactly like the loader's produce path (RESIL-05). A
  // cache hit above never reaches this line, so reused handlers are never capped.
  services.produceGate.tryAcquire();
  logger.info("Handler: cache miss — requesting handler");
  const produced = await produceComponent(
    intent,
    services.transport,
    services.getApiKey,
    "handler",
  );

  // Persist BOTH pieces under the opaque key with fresh LRU bookkeeping
  // (useCount 0, updatedAt now) — consistent with the apps path so the handler
  // participates in LRU eviction (Phase 7) and the next call is a cache hit.
  await services.registry.put(
    "handlers",
    {
      cacheKey: key,
      intent,
      source: produced.source,
      transpiledJS: produced.transpiledJS,
      useCount: 0,
      updatedAt: nowFn(),
    },
    key,
  );

  return produced.transpiledJS;
}

/**
 * Run a backend-style data handler for an intent (HANDLER-01).
 *
 * Resolve-or-produce-then-exec: transparently resolves a cached handler for the
 * intent (cache hit → no model call) or produces one on first need (miss →
 * cost-gated model call, then dual-cache), executes it over `input` in the
 * constrained scope (HANDLER-03), and returns `{ data? , error? }`.
 *
 * NEVER throws and NEVER reveals the mechanic: a produce failure, a compile
 * failure, or a throwing handler all map to a neutral `{ error }`. A handler that
 * returns `{ error }` itself is passed through unchanged.
 *
 * @param intent    A natural-language description of the data operation. Hashed
 *                  into the opaque cache key (never stored or surfaced verbatim in
 *                  any devtools-visible identifier).
 * @param input     The handler's only input — passed straight through.
 * @param services  Injected dependency bundle (transport, registry, getApiKey,
 *                  produceGate). Tests substitute doubles for all four.
 */
export async function runHandler(
  intent: string,
  input: unknown,
  services: Services,
): Promise<HandlerResult> {
  let transpiledJS: string;
  try {
    transpiledJS = await resolveHandlerJS(intent, services);
  } catch (err) {
    // Produce / compile / throttle failure → neutral error, mechanic hidden.
    // (A ProduceThrottledError, ProduceError, or TranspileError all land here.)
    logger.error("Handler: resolve failed: " + String(err));
    return { error: NEUTRAL_HANDLER_ERROR };
  }

  // Bind the data broker to a closure — the handler receives fetchData(sourceId, params)
  // and never sees the Services object (DATA-01). When the broker is absent the closure
  // returns a neutral { error } without throwing, preserving the core loop (T-12-03-C).
  const boundFetchData = (sourceId: string, params: unknown) =>
    services.fetchDataBroker?.fetch(sourceId, params) ??
    Promise.resolve({ error: "Data not available." });

  try {
    return await executeHandler(transpiledJS, boundFetchData, input);
  } catch (err) {
    // The handler threw at instantiation or execution time. The thrown detail is
    // diagnostics-only (gated logger); the caller sees neutral copy (HANDLER-01).
    logger.error("Handler: execution failed: " + String(err));
    return { error: NEUTRAL_HANDLER_ERROR };
  }
}

/**
 * Transpile-only escape hatch for callers that already hold handler SOURCE (e.g.
 * a captured fixture) and want to run it WITHOUT a model call — used by tests to
 * prove the constrained scope and the `{data}`/`{error}` contract against real
 * handler code. Production code always goes through `runHandler`.
 */
export async function executeHandlerSource(
  source: string,
  input: unknown,
): Promise<HandlerResult> {
  const transpiledJS = transpileHandler(source, { filename: "handler.ts" });
  // No-op stub: tests using this escape hatch do not exercise the data path,
  // so the stub returns a neutral { error } if a handler happens to call fetchData.
  const noOpFetchData = (_sourceId: string, _params: unknown) =>
    Promise.resolve({ error: "Data not available." });
  return executeHandler(transpiledJS, noOpFetchData, input);
}
