# Roadmap: Vibe App Store

## Overview

The journey is a Vertical MVP: eight phases, each shipping an end-to-end, user-visible slice rather than a horizontal technical layer. We begin by baking the "apps just exist" devtools-hygiene illusion and the storefront shell into the foundation (Phase 1) — opaque keys, neutral naming, a gated logger, the single Anthropic egress boundary, a source-maps-off build, and a CI lexicon gate are cheaper to establish first than to retrofit. Phase 2 proves the resolve → compile → instantiate → render loop with a seeded static app and model risk removed, de-risking the novel `new Function` + classic-Babel + `createRoot` mechanics. Phase 3 joins the model to that loop, at which point the **core value is met**: an app the user opens that doesn't exist yet is produced, compiled, cached, and rendered — instant on a hit, seamless on a miss, with nothing narrating the mechanic. Phase 4 adds widget composition (transitive pre-warm + synchronous `useWidget` + per-widget isolation), Phase 5 lets the user shape apps via the contextual `⋮` prompt (remove/clone/tweak), Phase 6 hardens the model/API error surface with neutral degradation, Phase 7 adds storage-pressure and cost guardrails, and Phase 8 layers transparent backend-style handlers as a fully independent additive capability. Devtools hygiene and security are cross-cutting acceptance constraints enforced from Phase 1 forward on every subsequent phase.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Hygiene Foundation & Storefront Shell** - Storefront, key/theme config, opaque keys, IndexedDB init, single Anthropic egress, and the CI hygiene gate
- [x] **Phase 2: Static Open-One-App Loop** - Resolve → compile → instantiate → render a seeded app end-to-end, model risk removed
- [x] **Phase 3: Cache-Miss Generation (Core Value)** - An app that doesn't exist yet is produced on demand, cached, and rendered — instant on hit, seamless on miss
- [x] **Phase 4: Widget Composition** - Apps render isolated sub-widgets via transitive pre-warm and synchronous `useWidget`
- [x] **Phase 5: Contextual Modification** - The shared `⋮` prompt lets users remove, clone, and tweak apps and widgets in place
- [x] **Phase 6: API Error Degradation** - Missing/invalid key, rate limiting, and uncaught async errors degrade gracefully with neutral copy
- [x] **Phase 7: Storage & Cost Guardrails** - Storage pressure, eviction, and runaway produce-cost are bounded with neutral messaging
- [ ] **Phase 8: Backend-Style Handlers** - Apps and widgets transparently resolve or produce cached data handlers on first need

## Phase Details

### Phase 1: Hygiene Foundation & Storefront Shell
**Goal**: A user lands on a real marketplace storefront, can activate the platform with their own key and pick a theme, while every foundational hygiene, key-handling, and security control is baked in before any data is stored or any model is called.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: SHELL-01, SHELL-02, SHELL-03, SHELL-04, LOOP-02, LOOP-03, HYGIENE-01, HYGIENE-02, HYGIENE-03, HYGIENE-04, HYGIENE-05, SEC-04
**Success Criteria** (what must be TRUE):
  1. User lands on a storefront showing a grid of available app types and can click one to attempt opening it.
  2. User can set, change, and clear their own Anthropic key from the UI (framed as activating the platform, stored under a neutral `localStorage` key), and switch theme between light/dark/system applied via CSS variables on `:root`.
  3. The IndexedDB registry (`apps`/`widgets`/`handlers`) initializes at startup with a probe write and falls back to an in-memory `Map` when storage is unavailable; cache keys are opaque SHA-256 hex over normalized input.
  4. A repo-wide F12 audit and the CI lexicon-grep gate find no devtools-visible surface (symbols, store/key names, logs, CSS, `data-*`, copy, `localStorage` keys) that narrates the on-demand mechanic, and the production build ships with source maps off and a CSP restricting `connect-src` to `'self' https://api.anthropic.com`.
**Plans**: 4 plans (3 waves)

Plans:
- [x] 01-01-PLAN.md — Walking Skeleton: Vite+React19+TS scaffold, test infra, CSP/FOUC, IndexedDB registry (probe+Map fallback), gated logger, storage constants (wave 1) — COMPLETED 2026-06-24
- [x] 01-02-PLAN.md — Storefront UI slice: grid (SHELL-01/02), KeyDialog set/change/clear (SHELL-03), light/dark/system theme (SHELL-04), Skeleton/ErrorBoundary stubs (wave 2)
- [x] 01-03-PLAN.md — Opaque SHA-256 cacheKey (LOOP-02) + Anthropic egress header stub (HYGIENE-05), TDD (wave 2)
- [x] 01-04-PLAN.md — CI lexicon-grep hygiene gate (HYGIENE-01/02/03) over src/** + index.html (wave 3)

### Phase 2: Static Open-One-App Loop
**Goal**: A user opens a seeded app from the storefront and it renders and is fully interactive, proving the resolve → compile → instantiate → render core with model nondeterminism removed.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: LOOP-01, LOOP-04, LOOP-05, LOOP-06, LOOP-07, LOOP-08, SHELL-05, SEC-01, SEC-02, SEC-03
**Success Criteria** (what must be TRUE):
  1. User opens a seeded app from the storefront and it renders inside an app shell (showing the app name and a `⋮` menu) and is interactive, including hooks like `useState`/`useEffect` working with no "Invalid hook call".
  2. Re-opening the same app renders instantly from cache with no recompilation (three-tier resolve: component Map → transpiled-string Map → IndexedDB), and a test asserts classic-runtime output (`React.createElement`, no `react/jsx-runtime` import).
  3. Each app container gets exactly one React root (created once, re-rendered on update, unmounted on removal) tracked by instance id, with no `createRoot` double-call warning across repeated open/close cycles.
  4. A red-team component attempting `window`, `localStorage`, `[].constructor.constructor`, `fetch`, or `dangerouslySetInnerHTML` is shadowed-to-`undefined` and/or rejected by the static-reject pass before instantiation, and rendering goes only through React's virtual DOM.
**Plans**: TBD

Plans:
- [ ] 02-01: TBD during planning

### Phase 3: Cache-Miss Generation (Core Value)
**Goal**: A user opens an app that has never existed before, sees a neutral "Opening…" state, and it is produced on demand, compiled, cached, and rendered — so the storefront feels instant on a hit and seamless on a miss, with nothing revealing it was made on demand. **This phase meets the project's core value.**
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: GEN-01, GEN-02, GEN-03, GEN-04, GEN-05
**Success Criteria** (what must be TRUE):
  1. User opens an unseeded app type and, after a neutral skeleton/"Opening…" state (never "Generating…" or any AI language), a working interactive app renders.
  2. On a cache miss the platform calls Claude Haiku via the single browser `fetch` to `api.anthropic.com/v1/messages` with the user's key and the mandatory `anthropic-dangerous-direct-browser-access`, `x-api-key`, and `anthropic-version` headers, and robustly extracts compilable JSX from prose/markdown-fenced output.
  3. A failed compile triggers a bounded self-heal retry (≤3) that feeds the Babel compiler error (not the runtime error) back into the next prompt and early-stops on identical consecutive errors.
  4. A successfully produced app is stored (`sourceJSX` + `transpiledJS` + neutral metadata) so the next open is an instant cache hit, and the stored `prompt`/record fields contain only neutral product copy.
**Plans**: TBD

Plans:
- [ ] 03-01: TBD during planning

### Phase 4: Widget Composition
**Goal**: A user opens an app composed of sub-widgets and every widget appears already rendered and isolated, so the app feels native rather than assembled piece by piece.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: WIDGET-01, WIDGET-02, WIDGET-03, WIDGET-04, WIDGET-05
**Success Criteria** (what must be TRUE):
  1. User opens an app that declares `@widget` dependencies and all declared widgets appear already rendered on first paint (no pop-in waterfall), each inside its own widget shell with an independent `⋮` menu.
  2. Declared widgets are pre-warmed transitively before the app mounts, with a cycle guard and a concurrency cap (≤2), and `useWidget(type)` returns the resolved component synchronously at render time (a pure `Map.get`, never triggering async work during render).
  3. A widget that fails to load or throws shows a neutral placeholder via its own error boundary without crashing or visibly degrading its parent app.
**Plans**: 1 plan (executed in worktree feature/phase-4-widget-composition)
**UI hint**: yes

Plans:
- [x] 04-01 — Widget composition: `@widget` parser, transitive pre-warm (cycle guard + concurrency cap ≤2), synchronous `useWidget`, WidgetShell + per-widget ErrorBoundary, DRY widget producer — COMPLETED 2026-06-24

### Phase 5: Contextual Modification
**Goal**: A user opens the shared `⋮` prompt on any app or widget and can remove it, clone it, or tweak it with a free-form instruction, with the change applied in place and no surfaced version history.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: MOD-01, MOD-02, MOD-03, MOD-04
**Success Criteria** (what must be TRUE):
  1. User opens a shared contextual prompt popover (on both app and widget shells) that names the target and accepts free-form natural-language instructions.
  2. User types "remove" / "clone" and the target is removed or duplicated instantly with no model call (remove unmounts the root and detaches the node; clone creates a new instance id from the stored record).
  3. User types a tweak instruction and the target is replaced in place — a new cache key is derived, resolved (cache or produce), and re-rendered through the existing root — with no version history shown and no double `createRoot`.
**Plans**: TBD
**UI hint**: yes

Plans:
- [x] 05-01 — Contextual Modification: shared `⋮` ContextualPrompt popover (MOD-01), client-side prompt router (MOD-02), in-place app tweak + clone/remove with no model call (MOD-03/04), and widget `⋮` in-place tweak — COMPLETED 2026-06-24

### Phase 6: API Error Degradation
**Goal**: When the key is missing/invalid, the API rate-limits, or generated code throws asynchronously, the user sees neutral, non-revealing recovery rather than a crash or a leak of the mechanic.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: RESIL-01, RESIL-02, RESIL-03, RESIL-04
**Success Criteria** (what must be TRUE):
  1. A render error is caught by a per-app/per-widget error boundary offering a neutral retry without taking down the rest of the page, and a throwing `onClick` or async effect is routed by the global async backstop (`window.onerror` + `unhandledrejection` + React `onUncaughtError`) to the same neutral handling.
  2. A missing or invalid key (401) degrades to an inline key-reconfiguration prompt with neutral copy and no crash; the storefront stays browsable.
  3. Rate limiting (429) is handled with exponential backoff + jitter honoring `retry-after`, shared via a token bucket at the single egress point, then a neutral user-visible error if exhausted.
**Plans**: TBD

Plans:
- [x] 06-01 — API Error Degradation: typed `ModelHttpError`/`parseRetryAfter` transport refactor, `TokenBucket` limiter + exponential-backoff-with-jitter `createResilientTransport` (injected `Clock`, honors `retry-after`, neutral `ModelUnavailableError` on exhaustion), `installGlobalErrorBackstop` + React `onUncaughtError` async backstop, `ProduceAuthError` → inline KeyDialog reconfigure path, `WidgetErrorBoundary` retry — COMPLETED 2026-06-24 (worktree feature/phase-6-api-error-degradation)

### Phase 7: Storage & Cost Guardrails
**Goal**: Heavy and returning users keep a working registry and bounded cost — storage pressure is managed before quota is hit and a soft cap prevents runaway produce calls — all surfaced with neutral messaging.
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: RESIL-05, RESIL-06
**Success Criteria** (what must be TRUE):
  1. `navigator.storage.persist()` is requested at init and, as the registry approaches quota, least-recently-used entries (by `useCount`/`updatedAt`) are evicted so the loop keeps working instead of throwing.
  2. After a configured threshold of cache misses per time window, a cost guardrail soft-caps further produce calls and surfaces neutral messaging rather than silently running up the user's Anthropic spend.
**Plans**: 1 plan (executed in worktree feature/phase-7-storage-cost-guardrails)

Plans:
- [x] 07-01 — Storage & Cost Guardrails: sliding-window `createProduceGate` (N=10 misses / 5-min window, injected `Clock`, neutral `ProduceThrottledError` surfaced via the failed-open fallback) hooked at the loader produce path; `useCount`/`updatedAt` LRU bookkeeping (DB schema v2, additive upgrade, default-on-read for v1 records); `evictUnderPressure` LRU eviction (oldest `updatedAt`, tie-broken by lowest `useCount`, until under a 0.9 usage/quota threshold) run before produce writes; injectable `StoragePressureSeam` (guarded `navigator.storage.persist`/`estimate`) + `Registry.keys()` enumeration — COMPLETED 2026-06-24

### Phase 8: Backend-Style Handlers
**Goal**: A generated app or widget that needs a data operation gets one transparently — resolved from cache or produced on first need — without any visible "backend" and without ever reaching the network or the API key.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: HANDLER-01, HANDLER-02, HANDLER-03
**Success Criteria** (what must be TRUE):
  1. An app or widget calls a single `runHandler(intent, input)` helper that transparently resolves a cached handler or produces one on first need, executes it, and returns `{ data?, error? }`.
  2. A produced handler is cached in the `handlers` store and reused on subsequent calls with no further model call.
  3. Handler code executes in a constrained scope with no `fetch` and no storage/key access — local/mock data operations only — verified by a handler attempting network or storage access being blocked.
**Plans**: TBD

Plans:
- [ ] 08-01: TBD during planning

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Hygiene Foundation & Storefront Shell | 4/4 | Complete | 2026-06-24 |
| 2. Static Open-One-App Loop | Complete | Complete | 2026-06-24 |
| 3. Cache-Miss Generation (Core Value) | Complete | Complete | 2026-06-24 |
| 4. Widget Composition | 1/1 | Complete | 2026-06-24 |
| 5. Contextual Modification | 1/1 | Complete | 2026-06-24 |
| 6. API Error Degradation | 1/1 | Complete | 2026-06-24 |
| 7. Storage & Cost Guardrails | 1/1 | Complete | 2026-06-24 |
| 8. Backend-Style Handlers | 0/TBD | Not started | - |
