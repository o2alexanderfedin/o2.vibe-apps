# Architecture Research

**Domain:** Client-side generative-UI app marketplace (no-build, in-browser React runtime that produces, compiles, caches, and renders LLM-authored components on demand)
**Researched:** 2026-06-24
**Confidence:** HIGH for the runtime/React/Babel mechanics (verified against current React + Babel + Anthropic docs); MEDIUM for build-order and devtools-hygiene trade-offs (reasoned from blueprint + verified constraints, not externally benchmarked)

---

## Executive Verdict

The blueprint's layered pipeline (Intent → Registry → Generation → Execution → UI Surface → optional Handlers) is **sound and buildable as described**, with five refinements that are load-bearing and should be locked before phase 1:

1. **Classic JSX runtime is mandatory, not optional.** `new Function()` instantiation only works because classic-runtime Babel emits `React.createElement(...)`, which resolves to the injected `React` arg. Automatic runtime emits `import { jsx } from "react/jsx-runtime"` — an unresolvable import inside `new Function()`. This single config choice is what makes the whole scope-injection model work.
2. **The mounted-roots map stores roots and re-renders them; it does not create a new root per tweak.** `createRoot()` must run **once per container lifetime**; in-place tweaks call `root.render()` on the stored root; removal calls `root.unmount()`. Calling `createRoot` twice on a live container is a React-warned error.
3. **Single React instance is the safety property that makes hooks work** across all generated components — and it is satisfied for free because nothing imports React except the host. This must be *protected*, not engineered: never let a second React load.
4. **`useWidget` synchronicity is achieved entirely by pre-warm**, and pre-warm must be a *transitive* resolve (a widget can itself declare `@widget` deps) feeding a single in-memory `Map` that `useWidget` reads with zero async.
5. **Devtools hygiene forces concrete structural choices** — opaque keys, a host-call boundary that must carry the (visible) `anthropic-dangerous-direct-browser-access` header, neutral module/store/CSS naming, and a single gated logger — that are cheaper to bake in at phase 0 than to retrofit.

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  L0  USER INTERACTION SURFACE  (Marketplace shell, AppBar, ⋮ popover)  │
│  ┌────────────┐  ┌──────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │Marketplace │  │ AppShell │  │ WidgetShell  │  │ ContextualPrompt│   │
│  │   (grid)   │  │  (⋮ app) │  │  (⋮ widget)  │  │   (shared)      │   │
│  └─────┬──────┘  └────┬─────┘  └──────┬───────┘  └────────┬────────┘   │
│        │              │               │                   │            │
├────────┴──────────────┴───────────────┴───────────────────┴───────────┤
│  L1  INTENT RESOLVER     resolver · classifier · prompt-router         │
│        action ─────────────────► Intent{op,kind,type,cacheKey,context} │
├────────────────────────────────────┬───────────────────────────────────┤
│  L2  REGISTRY (async boundary)      │  L4  EXECUTION ENGINE (sync core) │
│  ┌──────────────────────────────┐   │  ┌────────────────────────────┐  │
│  │ IndexedDB  MarketplaceDB v1  │   │  │ transpile (Babel, classic) │  │
│  │  ┌──────┐┌───────┐┌────────┐ │   │  │ instantiate (new Function) │  │
│  │  │ apps ││widgets││handlers│ │   │  │ mount (createRoot map)     │  │
│  │  └──────┘└───────┘└────────┘ │   │  │ useWidget (sync, prewarmed)│  │
│  └──────────────────────────────┘   │  │ ErrorBoundary (per shell)  │  │
│  in-mem: registryCache + transpiledCache  └────────────────────────────┘ │
├────────────────────────────────────┴───────────────────────────────────┤
│  L3  GENERATION   buildPrompt · callModel(host) · selfHeal · clean      │
│        cache MISS ─► host fetch ─► raw JSX ─► clean ─► transpile ─► store│
├──────────────────────────────────────────────────────────────────────────┤
│  L6  HANDLERS (optional)   runHandler(intent,input) → cached/produced fn │
└──────────────────────────────────────────────────────────────────────────┘
                          │ (only outbound network edge)
                          ▼
                  api.anthropic.com /v1/messages   (Haiku, user key)
```

### Component Responsibilities

| Component | Owns | Talks to | Notes |
|-----------|------|----------|-------|
| **Marketplace / AppBar** (L0) | Storefront grid, open-app lifecycle, API-key + theme config | Intent Resolver, mount map | The only place that holds the list of "open apps" |
| **AppShell / WidgetShell** (L0) | One framed instance + its `⋮`, hosts the ErrorBoundary, owns the container `<div>` | Execution Engine (mount), ContextualPrompt | Shell owns the DOM node passed to `createRoot` |
| **ContextualPrompt** (L0) | Free-text capture, routes to remove/clone/mutate | Prompt Router (L1) | Shared by app + widget; target passed in |
| **Intent Resolver** (L1) | action → `Intent`, cacheKey derivation, prompt normalization | Registry (L2) | Pure/cheap; classifier's Haiku fallback is the one async path here |
| **Prompt Router** (L1) | Keyword routing: remove/clone client-side, else mutate | Registry, Generation | remove + clone never call the model |
| **Registry** (L2) | IndexedDB CRUD, opaque keys, schema/version, in-mem caches | Execution, Generation | The async boundary; everything below it is sync |
| **Generation** (L3) | Prompt assembly, host model call, clean, transpile-on-miss, self-heal, `@widget` dep parse | Registry (store), Execution (transpile) | Only component that touches the network |
| **Execution Engine** (L4) | transpile → instantiate → mount, `useWidget` factory, mounted-roots map, ErrorBoundary | Registry (read caches), DOM | Synchronous core; never awaits during render |
| **Handlers** (L6) | `runHandler` resolve-or-produce-then-exec for data ops | Registry, Generation | Transparent to apps/widgets |
| **Host Boundary** (cross-cutting) | The single `fetch` to `api.anthropic.com`, header assembly, gated logger | Generation, Classifier | Isolating this one function localizes every network-hygiene rule |

**The two boundaries that define the system:**
- **Async/sync boundary** sits at the top of L4. Everything above (resolve, registry read, generation, pre-warm) is async and `await`-heavy. Everything inside a React render (instantiate, `useWidget`, mount) is synchronous. *No `await` may cross into a render cycle.*
- **Network boundary** is a single host-call function. It is the only outbound edge, and therefore the only place that must satisfy network-tab hygiene.

---

## Recommended Project Structure

The blueprint's structure is good. The refinements below add the three modules the blueprint implies but does not name as files, and rename for the async/sync and network boundaries.

```
src/
├── host/
│   └── modelClient.ts        # THE single fetch() to api.anthropic.com; header
│                             #   assembly incl. anthropic-dangerous-direct-
│                             #   browser-access; gated logger lives here
├── db/
│   ├── index.ts              # openDB(), version+upgrade, typed get/put/delete
│   ├── apps.ts               # apps store CRUD
│   ├── widgets.ts            # widgets store CRUD
│   └── handlers.ts           # handlers store CRUD
├── registry/
│   ├── cacheKey.ts           # opaque stable key (normalize → hash)
│   ├── registry.ts           # resolve(): registryCache → IndexedDB → generate
│   └── caches.ts             # in-mem Map registries: components + transpiledJS
├── intent/
│   ├── resolver.ts           # action → Intent (app + widget aware)
│   ├── classifier.ts         # static map + Haiku fallback (cached)
│   └── router.ts             # remove/clone/mutate keyword routing
├── generation/
│   ├── app.ts                # buildAppPrompt(), parseWidgetDeps()
│   ├── widget.ts             # buildWidgetPrompt()
│   ├── handler.ts            # handler generation
│   ├── transpile.ts          # Babel wrapper (CLASSIC runtime) + in-mem cache
│   └── selfHeal.ts           # retry loop, BABEL error fed back
├── execution/
│   ├── instantiate.ts        # new Function() → React component (scope-injected)
│   ├── mount.ts              # mounted-roots Map; createRoot once, render/unmount
│   ├── useWidget.ts          # sync hook factory, reads pre-warmed component Map
│   ├── prewarm.ts            # transitive @widget resolve before mount
│   └── ErrorBoundary.tsx     # per-shell isolation boundary
├── ui/
│   ├── Marketplace.tsx · AppShell.tsx · WidgetShell.tsx
│   ├── ContextualPrompt.tsx · AppBar.tsx
├── store/
│   ├── apiKey.ts · theme.ts  # localStorage (neutral keys)
└── app.tsx                   # root: eager Babel load, DB init, theme init, shell
```

### Structure Rationale

- **`host/modelClient.ts` is new and deliberate.** Collapsing every model call into one function makes the network-hygiene rule a one-file invariant (header set once, prompt is the only body, logger gated here) and gives self-heal/classifier a single seam to call.
- **`registry/` is split out from `db/`.** `db/` is raw IndexedDB; `registry/` is the resolve-or-produce policy plus the two in-memory caches. This keeps the "compile-once / read-sync" caches next to the lookup logic that populates them, away from storage plumbing.
- **`execution/prewarm.ts` is named explicitly** because pre-warm is the mechanism that makes `useWidget` synchronous — it deserves to be a first-class, testable unit, not a method buried in AppShell.
- **`execution/` is the synchronous island.** Everything in it must be callable from inside a render with no `await`. Keeping it physically separate from `generation/` (which is all async) enforces the boundary by directory.

---

## Architectural Patterns

### Pattern 1: Resolve-or-Produce (one engine for apps, widgets, handlers)

**What:** A single `resolve(intent)` function: check in-mem registry → check IndexedDB → on miss, generate + store. Apps, widgets, and handlers differ only by store name and prompt template.

**When:** Every meaningful action and every dependency edge.

**Trade-offs:** One mental model and one tested path (huge for a small team); cost is that the three slightly different schemas share a code path and need care to not over-couple (handlers have no `transpiledJS`, only `sourceCode`).

```typescript
async function resolve(intent: Intent): Promise<Resolved> {
  const hit = registryCache.get(intent.cacheKey);      // in-mem, sync
  if (hit) return hit;
  const stored = await db.get(storeFor(intent.kind), intent.cacheKey);
  if (stored) return hydrate(stored);                  // populates caches
  const produced = await generate(intent);             // model + transpile + store
  return produced;
}
```

### Pattern 2: Classic-runtime transpile + named-scope instantiation

**What:** Babel `preset react` (classic runtime → `React.createElement`) produces a CommonJS-shaped string; `new Function("module","exports","React", ...extras, code)` runs it and returns `module.exports.default`.

**When to use:** Every instantiation. This is the core trick of the whole system.

**Trade-offs:** Classic runtime is required so the only free identifier the code needs is `React` (which we inject). The price: generated code must never `import`/`require` anything; the prompt enforces "no imports other than React" and the scope provides no resolver, so a stray import throws at instantiation (caught by self-heal or ErrorBoundary). **Lock the Babel config to classic runtime explicitly — do not rely on the default, which flips to automatic in Babel 8.**

```typescript
// transpile.ts — pin runtime so a Babel major bump can't break instantiation
Babel.transform(sourceJSX, {
  presets: [["react", { runtime: "classic" }]],
  filename: "component.jsx",
}).code;

// instantiate.ts
const argNames  = ["module", "exports", "React", ...Object.keys(extras)];
const argValues = [mod, mod.exports, React, ...Object.values(extras)];
new Function(...argNames, code)(...argValues);
return mod.exports.default ?? mod.exports;
```

### Pattern 3: Single shared React via reference injection (no globals)

**What:** Hooks require that the `React` a component uses is the *same module object* as the one whose dispatcher is active during render. Passing the host's imported `React` as a `new Function()` argument satisfies this by identity — no `window.React`, no global pollution.

**When:** Always. It is the safety property behind every generated hook.

**Trade-offs:** Free and clean *as long as exactly one React copy exists in the page*. The risk is not "how do I share it" but "how do I avoid a second one." Concretely: do not load React from a second `<script>`/CDN, do not let a generated app import React (the prompt forbids it and the scope can't resolve it anyway), and dedupe React/react-dom in the bundle. A second instance manifests as the "Invalid hook call / dispatcher is null" failure, isolated to that widget by its ErrorBoundary but confusing to debug — so make "one React, injected by reference" an explicit invariant in code comments (written neutrally, per hygiene).

```typescript
import * as React from "react";   // the one and only instance
// ...passed by reference into every generated component's scope
makeUseWidget(appId);             // closure also closes over the same React
```

### Pattern 4: Transitive pre-warm → synchronous `useWidget`

**What:** Before mounting an app, parse its `@widget` declarations, resolve each (cache or produce), and — because a widget may itself declare `@widget` deps — recurse until the dependency closure is fully in the in-memory component `Map`. Only then mount. `useWidget(type)` is a pure `Map.get` returning the component synchronously.

**When to use:** Every app mount and every widget mount that has its own deps.

**Trade-offs:** Eliminates render waterfalls and keeps `useWidget` sync (the blueprint's hard requirement). Cost: pre-warm is a serial-or-parallel async phase before first paint; parallelize sibling resolves (`Promise.all`) and guard against cycles with a visited-set. A widget requested *dynamically* (not declared) legitimately can't be pre-warmed — for that case `useWidget` returns a neutral skeleton and kicks off background resolution + re-render, which is acceptable as a documented fallback, not the main path.

```typescript
async function prewarm(deps: string[], seen = new Set<string>()) {
  await Promise.all(deps.map(async (type) => {
    if (seen.has(type)) return;
    seen.add(type);
    const w = await resolve(widgetIntent(type));   // cache or produce
    componentMap.set(componentKey("widget", type), instantiate(w.transpiledJS, { /* React only */ }));
    if (w.widgetDeps?.length) await prewarm(w.widgetDeps, seen);  // transitive
  }));
}
// useWidget — synchronous, render-safe
const useWidget = (type) => componentMap.get(componentKey("widget", type)) ?? Skeleton;
```

### Pattern 5: Mounted-roots map — create once, render-to-update, unmount-to-remove

**What:** `Map<containerId, Root>`. First mount: `createRoot(container)`, store, `root.render(tree)`. In-place tweak: look up the existing root, call `root.render(newTree)` — **do not** create a new root. Removal: `root.unmount()` then drop the map entry (and only then remove the DOM node).

**When to use:** Every mount, every tweak, every removal.

**Trade-offs:** Matches React's contract (calling `createRoot` twice on a live container is a warned error and double-manages reconciliation). The discipline cost is real: tweak-in-place must reuse the root, and removal must unmount before DOM detach to avoid leaks/zombie roots. Keying the map by the stable instance id (not cacheKey — two instances of the same app type can coexist) is essential.

```typescript
const roots = new Map<string, Root>();
function mountInstance(id: string, container: HTMLElement, tree: ReactNode) {
  let root = roots.get(id);
  if (!root) { root = ReactDOM.createRoot(container); roots.set(id, root); }
  root.render(<ErrorBoundary>{tree}</ErrorBoundary>);   // re-render reuses root
}
function unmountInstance(id: string) {
  roots.get(id)?.unmount();
  roots.delete(id);
}
```

### Pattern 6: Layered cache (component Map ▸ transpiled Map ▸ IndexedDB ▸ model)

**What:** Three read tiers in front of the model. Tier 0: instantiated-component `Map` (skips even `new Function()`). Tier 1: `transpiledJS` `Map` (skips Babel). Tier 2: IndexedDB (`sourceJSX` + `transpiledJS`, survives reload). Tier 3: model call (last resort).

**When to use:** Every resolve.

**Trade-offs:** Guarantees "compile once per session" and "never re-run Babel from storage twice." Cost: cache-key discipline must be airtight — same type + normalized prompt → same key, or you silently duplicate. Storage rule: **never persist the instantiated function** (not serializable); persist the `transpiledJS` string and re-instantiate on load. The component `Map` is the only tier holding live functions and it is session-scoped.

---

## Data Flow

### Request Flow (cache miss, app with widget deps)

```
open app
   ↓
Intent Resolver ─► Intent{ op:render, kind:app, type, cacheKey, context }
   ↓
registryCache.get → MISS
   ↓
db.get("apps", cacheKey) → MISS
   ↓
Generation: buildAppPrompt → host.modelClient(prompt) ─► raw JSX
   ↓                                  │ (only network edge)
clean → transpile(classic) → self-heal if Babel error (≤3, Babel err fed back)
   ↓
store {sourceJSX, transpiledJS, widgetDeps} → apps; populate transpiledCache
   ↓
parseWidgetDeps → prewarm(deps)  ⟳ transitive, fills componentMap   [async]
   ════════════════ async/sync boundary ════════════════
   ↓
instantiate(transpiledJS, { React, useWidget:makeUseWidget(appId) })  [sync]
   ↓
mount: createRoot(container) once → root.render(<ErrorBoundary><App/></ErrorBoundary>)
   ↓
App renders → useWidget("line-chart") → componentMap.get → <Widget/> (sync)
   ↓
UI Surface: AppShell frame + ⋮  (widget in own WidgetShell + own ErrorBoundary)
```

### Mutation / tweak Flow (in-place)

```
⋮ → ContextualPrompt → router.route(text, target)
   ├─ /remove|delete|close/  → unmountInstance(id) → drop DOM        (no model)
   ├─ /clone|duplicate|copy/ → new id, same cacheKey, mount again    (no model)
   └─ else (mutate)          → newCacheKey(kind,type,mutationPrompt)
                                → resolve (cache or produce)
                                → roots.get(id).render(newTree)   ← reuse root
```

### State Management

There is no global app-state store and the architecture is better for it. Three explicit state locations:

```
localStorage          marketplace.apiKey, marketplace.theme        (config)
IndexedDB MarketplaceDB   apps · widgets · handlers                (durable registry)
in-memory               registryCache · transpiledCache · roots    (session)
React component state    inside each generated app/widget          (isolated, ephemeral)
```

Generated apps own their own `useState`; they **cannot** reach marketplace state (the `new Function()` scope gives them only `React` + `useWidget`). This isolation is a security property, not just tidiness.

### Key Data Flows

1. **Compile-once:** `sourceJSX` is transpiled exactly once (on miss), the `transpiledJS` string is persisted, and Babel never runs again for that key — the transpiled `Map` serves it for the rest of the session, IndexedDB across reloads.
2. **Pre-warm closure:** an app's declared widget set (transitively) is fully resolved into live components *before* first paint, so the render pass never awaits.
3. **Single network egress:** every model interaction (classify fallback, app/widget/handler generation, self-heal) funnels through one host function — the only place a prompt leaves the browser.

---

## Build Order — Vertical-MVP Slices

Each slice ships an **end-to-end, user-visible capability**. Earlier slices are dependencies of later ones; nothing below is a horizontal "build all of layer N" phase.

> Dependency legend: a slice may only use components delivered in itself or an earlier slice.

**Slice 0 — Hygiene + shell skeleton (foundation, thin but user-visible).**
Deliver: marketplace page renders, AppBar with API-key config + theme toggle, neutral CSS variables on `:root`, the gated logger, opaque `cacheKey()`, and the single `host/modelClient.ts` stub (header assembly incl. `anthropic-dangerous-direct-browser-access`).
*Why first:* the devtools-hygiene constraints (naming, opaque keys, log gating, the mandatory browser-access header) are **cheaper to bake in than retrofit**, and every later slice depends on the host boundary and cacheKey. User sees a real storefront and can save a key.
Depends on: nothing.

**Slice 1 — Open-one-static-app end to end (the loop, minus the model).**
Deliver: IndexedDB init (`apps` store), Intent Resolver (static map), registry resolve, transpile (classic), instantiate, mount via the roots map inside AppShell, ErrorBoundary. Seed one app's `sourceJSX` locally (no model yet).
*Why here:* proves the **resolve→compile→instantiate→render** core — the product's whole reason for being — with model risk removed. First slice where a user opens an app and it works.
Depends on: Slice 0 (shell, cacheKey, mount container).

**Slice 2 — Cache-miss generation (the model joins the loop).**
Deliver: `widgets`-less app generation via `host.modelClient`, clean, store, self-heal loop (≤3, Babel error fed back). Now an app the user opens that isn't seeded gets produced, compiled, cached, rendered.
*Why here:* turns the static loop of Slice 1 into the real on-demand loop. The illusion (`hit = instant, miss = seamless`) becomes demonstrable.
Depends on: Slice 1 (compile/mount path), Slice 0 (host boundary).

**Slice 3 — Composition: widgets + pre-warm + sync `useWidget`.**
Deliver: `widgets` store, `@widget` dep parser, transitive `prewarm`, `makeUseWidget` injection, WidgetShell with its own ErrorBoundary and `⋮`. Apps now render sub-widgets, each isolated.
*Why here:* this is the slice where the three hard concerns (sync `useWidget`, pre-warm-before-mount, per-widget isolation) all land together — they are meaningless individually and must ship as one capability.
Depends on: Slice 2 (generation can now produce widgets too), Slice 1 (mount/ErrorBoundary).

**Slice 4 — Contextual modification: remove / clone / tweak.**
Deliver: ContextualPrompt popover, prompt router, in-place re-render via the roots map (reuse root), new-cacheKey-on-tweak. Remove/clone are client-only; tweak re-enters resolve.
*Why here:* needs live instances (Slices 1–3) to act upon and the roots map to mutate in place. First slice where the user *shapes* apps, not just opens them.
Depends on: Slice 3 (instances + roots map + shells with `⋮`).

**Slice 5 — Resilience hardening + graceful degradation.**
Deliver: missing/invalid key, 401, 429 backoff, IndexedDB-unavailable → in-memory fallback, neutral non-revealing error copy everywhere. (ErrorBoundary already exists from Slice 1; this slice completes the *generation*-error matrix and the messaging.)
*Why here:* you can only harden paths that exist; doing it as its own slice forces the neutral-copy hygiene review across the whole surface at once.
Depends on: Slices 2–4 (the error sources).

**Slice 6 — Backend-style handlers (optional layer).**
Deliver: `handlers` store, `runHandler(intent,input)` resolve-or-produce-then-exec, handler prompt template.
*Why last:* fully independent of the UI loop; nothing above depends on it; it reuses the resolve-or-produce engine wholesale. Pure additive capability.
Depends on: Slice 2's generation engine + Slice 0's host boundary.

**Ordering rationale (dependencies made explicit):**
- The **host boundary + cacheKey + hygiene scaffolding (Slice 0)** must precede every model call and every stored key — retrofitting opaque keys or the mandatory CORS header after data exists is painful.
- **Compile/mount (Slice 1) before generation (Slice 2):** de-risk the novel runtime mechanics with seeded source before adding model nondeterminism.
- **Generation (Slice 2) before composition (Slice 3):** widgets are *produced* the same way apps are; composition can't exist until the generation engine does.
- **Composition (Slice 3) before modification (Slice 4):** tweak/clone/remove operate on live, possibly-composed instances and the roots map.
- **Resilience (Slice 5) after the happy paths exist**, and **handlers (Slice 6) last** as an isolated additive layer.

**First end-to-end slice the product can ship on:** Slice 1 (open one app, it renders and works) is the minimum demonstrable loop; Slice 2 makes it the *real* product (apps that don't exist yet appear on demand). The PROJECT.md core value ("opens an app and it works, instant on hit, seamless on miss") is met at the end of Slice 2.

---

## Scaling Considerations

This is a single-user, client-only app; "scale" means data growth and produced-asset volume per browser, not concurrent users.

| Scale | Adjustments |
|-------|-------------|
| 1 user, tens of apps | Nothing. IndexedDB + in-mem maps are ample. |
| Hundreds of cached apps/widgets | Add `useCount`/`updatedAt`-based eviction (already in schema) before IndexedDB bloat hurts open time; lazy-hydrate the registry rather than loading all rows at init. |
| Heavy session (many distinct types) | Cap the in-memory component `Map` (LRU) so live functions don't accumulate; transpiled strings can stay in IndexedDB and re-instantiate on demand. |

### Scaling Priorities

1. **First bottleneck — first cache miss latency:** dominated by the model round-trip + the eager ~450KB Babel load. Babel must load at init (not lazily) so the first miss doesn't also pay the download. This is a correctness-of-feel issue, not a user-count issue.
2. **Second bottleneck — registry hydration on reload:** loading every stored row at startup grows linearly with cached assets. Hydrate lazily (load a row when its key is first resolved) and keep only an index in memory at boot.

---

## Anti-Patterns

### Anti-Pattern 1: New `createRoot()` per render/tweak
**What people do:** Call `ReactDOM.createRoot(container)` again to re-render after a tweak.
**Why it's wrong:** React warns "container has already been passed to createRoot," double-manages the node, and leaks the old root.
**Do this instead:** Create once, store in the roots map, call `root.render()` to update, `root.unmount()` to remove.

### Anti-Pattern 2: Automatic JSX runtime (or relying on the Babel default)
**What people do:** Use `preset react` defaults, or set automatic runtime.
**Why it's wrong:** Automatic runtime emits `import { jsx } from "react/jsx-runtime"` — an unresolvable import inside `new Function()`. Babel 8 will default to automatic, so even "do nothing" eventually breaks.
**Do this instead:** Pin `["react", { runtime: "classic" }]` so JSX → `React.createElement`, resolved by the injected `React`.

### Anti-Pattern 3: A second React (global/CDN) for generated code
**What people do:** Expose `window.React` or load React from a CDN for generated apps "to be safe."
**Why it's wrong:** Two React instances → "Invalid hook call / dispatcher is null." It also re-introduces the global pollution the security model forbids.
**Do this instead:** One imported React, injected by reference into every scope; generated code never imports React (prompt-enforced and scope-unresolvable).

### Anti-Pattern 4: Async work inside `useWidget` / during render
**What people do:** `useWidget` triggers a generate/await when the widget isn't ready.
**Why it's wrong:** Violates the synchronous-render contract, causes waterfalls and flicker, and can loop.
**Do this instead:** Pre-warm the transitive dep closure before mount so `useWidget` is a pure `Map.get`; reserve async only for the documented dynamic-widget fallback (skeleton + background resolve + re-render).

### Anti-Pattern 5: Persisting instantiated functions
**What people do:** Store the `new Function()` result (or a memoized component) in IndexedDB.
**Why it's wrong:** Functions aren't structured-cloneable; recompilation becomes uncontrolled.
**Do this instead:** Persist only the `transpiledJS` string; re-instantiate on load; keep live functions in the session-scoped component map.

### Anti-Pattern 6: Leaking the mechanic into a devtools-visible surface
**What people do:** Name a store `synthesizedApps`, log `"generating widget…"`, attach `data-generated`, or put the type slug in a readable IndexedDB key.
**Why it's wrong:** Any one leak breaks the entire product premise (apps "just exist").
**Do this instead:** Opaque hashed keys; neutral store/CSS/symbol names; a single logger gated behind `localStorage.debug` emitting neutral copy; neutral prompt phrasing in the request body. See the dedicated section below.

---

## Architectural Decisions Forced by Constraints

### Forced by "no backend"
- **Single network egress to `api.anthropic.com` only**, carrying the user's key — so the host boundary is one file and the CORS/header handling lives in exactly one place.
- **Handlers run in-browser** against mock/local data; "backend" is a generation target, not a server. `runHandler` is just resolve-or-produce-then-exec.
- **No server-side cache/registry** → IndexedDB is the durable tier and the in-memory maps are the fast tier; there is no third place to fall back to except an in-memory `Map` when IndexedDB is unavailable.

### Forced by direct-browser Anthropic calls (verified)
- Calls to `api.anthropic.com/v1/messages` from the browser **require the `anthropic-dangerous-direct-browser-access: true` request header**, plus `x-api-key` and `anthropic-version`. This is mandatory for CORS to succeed.
- **Tension with network-tab hygiene, and its resolution:** the header name and the `api.anthropic.com` host are themselves visible in the Network tab and *cannot* be hidden in a no-backend design. Hygiene therefore targets what *is* controllable — the request **body** (neutral prompt phrasing: "Generate a React component for a weather app," never anything that names the mechanic) and **not** the unavoidable host/header. This is a real, documented limitation of the client-only model: a sufficiently determined observer sees an Anthropic call; the defense is that the *content* never narrates "this app was produced on demand," and the product never exposes a generate button. Flag for the roadmap: the hygiene requirement should be scoped to "no surface *narrates the mechanic*," not "no evidence of an LLM call exists," which is unachievable without the explicitly-out-of-scope proxy.

### Forced by devtools-hygiene (structural, not cosmetic)
- **Opaque cache keys** (hash of normalized `kind::type::prompt`, no readable slug) → IndexedDB key names reveal nothing. This shapes `cacheKey.ts` and means keys must be derivable identically every time (normalize before hashing).
- **Neutral module/store/CSS/symbol naming throughout** (`apps`/`widgets`/`handlers`, `.app-shell`/`.widget-frame`, `resolveApp`/`AppRegistry`). Internal terms (`synthesize`/`generate`) may appear *only* where source maps can't expose them — and since source maps can, the safest rule is: **the token "synthesize/synthesized/synthesis" appears in zero source files**, comments included. This is a lint-enforceable invariant worth a CI check in Slice 0.
- **A single gated logger** (`host/` or a tiny `log.ts`): off by default, enabled via `localStorage.debug`, neutral copy only. Centralizing it prevents stray `console.log` leaks and is why the logger ships in Slice 0.
- **Neutral error copy** ("Couldn't load this app. Try again.") wherever errors reach UI or console — handled as a cross-cutting rule completed in Slice 5's messaging pass.
- **No `data-*` mechanic attributes** on rendered apps/widgets; shells use structural attributes only.

These hygiene choices are concentrated in Slice 0 precisely because keys, naming, and the logger are foundational and expensive to change once data and modules exist.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| `api.anthropic.com/v1/messages` | Single `fetch` in `host/modelClient.ts`; `x-api-key` (user's), `anthropic-version`, **`anthropic-dangerous-direct-browser-access: true`** (mandatory for CORS), neutral prompt body | Host + header are unavoidably visible; only the body is hygiene-controllable. Key never logged/proxied. |
| `@babel/standalone` (CDN/npm) | Loaded **eagerly at init**; `Babel.transform` with pinned classic runtime | ~450KB — must not block first cache miss. |
| IndexedDB (`idb` optional) | Async CRUD behind `db/`; structured-clone-safe rows only (strings, never functions) | Degrade to in-memory `Map` if unavailable. |
| `localStorage` | `store/` for neutral `marketplace.apiKey` / `marketplace.theme` | Keys are neutral and product-branded. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Intent ↔ Registry | direct async call (`resolve(intent)`) | cacheKey is the contract |
| Registry ↔ Generation | direct async call on miss | Generation writes back to Registry |
| Registry/Generation ↔ Execution | **async → sync handoff** | The defining boundary: no `await` crosses into render |
| Execution ↔ generated component | `new Function()` named scope (`React`, `useWidget`) | The only channel into untrusted code; no globals cross it |
| App ↔ its widgets | `useWidget` returns pre-resolved components | Widgets can't reach app/marketplace state |
| Everything ↔ network | the one `host.modelClient` function | Single egress; single hygiene chokepoint |

---

## Open Questions / Flags for Roadmap

- **Dynamic (undeclared) widgets:** the skeleton-then-async fallback is sound but is the one place `useWidget` touches async — confirm in Slice 3 whether the product needs it at all, or whether all widgets are statically declared (simpler, fully sync).
- **Instance identity vs cache identity:** the roots map must key on instance id, not cacheKey, so two instances of the same app type can coexist. Worth an explicit decision when Slice 1's mount map is designed.
- **Hygiene scope reality check (Slice 0/5):** agree explicitly that "no surface narrates the mechanic" is the achievable bar, since the Anthropic host/header are visible by construction in a no-proxy design.
- **Babel-version pin:** treat the classic-runtime pin as a hard dependency constraint; a Babel 8 default flip would silently break instantiation if unpinned.

## Sources

- React — `createRoot` (create-once / render-to-update / unmount contract; double-call warning): https://react.dev/reference/react-dom/client/createRoot — HIGH
- React — Invalid Hook Call (single-instance requirement; dispatcher mismatch): https://legacy.reactjs.org/warnings/invalid-hook-call-warning.html — HIGH
- Babel — `@babel/preset-react` (classic vs automatic runtime; classic → `React.createElement`, Babel 8 default flips to automatic): https://babeljs.io/docs/babel-preset-react/ — HIGH
- Babel — `@babel/standalone` (browser transform API, no config-file access, presets passed inline): https://babeljs.io/docs/babel-standalone/ — HIGH
- Anthropic direct-browser CORS — mandatory `anthropic-dangerous-direct-browser-access` header: https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/ — HIGH
- Project blueprint: `docs/vibeappstore.md`; project context: `.planning/PROJECT.md` — HIGH (primary source)

---
*Architecture research for: client-side generative-UI app marketplace (no-build in-browser React runtime)*
*Researched: 2026-06-24*
