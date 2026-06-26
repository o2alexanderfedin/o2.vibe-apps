# Vibe App Store

## What This Is

A client-only, browser-based **generative app marketplace**. Users browse a storefront, open an **app**, and interact with it — and each app is a live React component produced on demand by a cheap LLM (Claude Haiku, using the user's own API key), compiled in the browser via `@babel/standalone`, cached per-app in IndexedDB, and injected into the page at runtime. Apps can also be composed of smaller **widgets** (the same resolve/cache/produce machinery), and any app can be tweaked, cloned, or removed through a contextual natural-language prompt. To the user there is no "AI" and no "generate" button — apps simply *exist* on the platform.

There is no application server. The user supplies their own Anthropic API key (stored locally in `localStorage`), and the platform calls `api.anthropic.com` directly from the browser. Backend-style data operations are themselves produced on demand as cached **handlers**.

**As actually built (v1.0 + v1.1):** the seeded path (the bundled `Notes` app) ships a complete monolithic source. Every other storefront card takes the on-demand path. As of the v1.1 pivot, unseeded apps default to a **delegated thin-shell**: the model first returns a behavior-free module (initial state + a markup-only view whose interactive elements carry `data-action`, plus a precise action spec), and a permanent shell mounts it with a single container click-delegate that **produces each action's handler on demand and caches it** (stable per-`(appType, action)` key → every re-press is an O(1) cache hit). This makes handlers the primary behavior mechanism, with a graceful fallback to the monolithic path when a delegated module can't be instantiated.

## Core Value

**A user opens an app from the storefront and it renders and works** — instantly on a cache hit, seamlessly produced on a cache miss — **and nothing visible ever reveals that the app was made on demand.** The resolve → cache → compile → render → interact loop is the product; if everything else fails, this loop must still deliver a working, interactive app while preserving the illusion that apps are first-class platform citizens.

This still holds after v1.0. The v1.1 delegated thin-shell refined *how* the loop runs (behavior is attached on first action rather than produced whole up front), but it did not shift what the loop must deliver: an interactive app that betrays no on-demand mechanic.

## Current Milestone: v1.1 Real & Robust

**Goal:** Turn the working-but-shallow v1.0 marketplace into a real, robust one — apps that need live data actually get it, produced behavior is correct more often, the storefront has depth, and widget composition becomes a first-class path.

**Target features:**
- **Sanctioned network-data path** — a controlled, hygiene-safe egress so network-dependent apps (Weather / Currency) fetch real data instead of degrading to a fallback in the sandboxed handler scope.
- **Reliability hardening** — reduce state-machine quirks in produced delegated reducers (stronger action-spec contracts, validation, self-heal on bad transitions) so produced behavior is correct more often.
- **Richer storefront** — persist `displayName` / `prompt` for faithful re-produce (G5) and add a "popular on the platform" row driven by `useCount` (POP-01).
- **Activate widget composition** — make the dormant `@widget` path first-class (delegated apps that declare/use sub-widgets), replace the placeholder `WidgetRecord` / `HandlerRecord` types with real schemas (G3), and fully fold `kind` + prompt into the cache key so activated widgets can't collide on a shared type slug (G1-followups).

**Deferred out of v1.1** (in Active, not this milestone): HARD-01 `<iframe sandbox>` / SEC-01–03 (security still deferred per MVP-first); G2 unified `Intent` (internal refactor — defer unless it blocks the above).

## Requirements

### Validated

<!-- Shipped and confirmed valuable. v1.0 milestone PASSED: 42/42 active requirements, 8/8 phases, 368 tests green, released v0.1.0, validated live in-browser. -->

**Storefront & shell**
- ✓ [SHELL-01] Marketplace storefront grid of available app types, openable — v1.0
- ✓ [SHELL-02] Opening an app shows a neutral loading affordance — v1.0
- ✓ [SHELL-03] User can configure / change / clear their own Anthropic API key from the UI (stored locally) — v1.0
- ✓ [SHELL-04] User can switch theme between light / dark / system, applied via CSS variables — v1.0
- ✓ [SHELL-05] An opened app renders inside an app shell with its own contextual menu — v1.0

**Resolve → cache → render loop**
- ✓ [LOOP-01] Opening or interacting produces a structured intent — v1.0
- ✓ [LOOP-02] Opaque, normalization-stable SHA-256 cache-key derivation — v1.0
- ✓ [LOOP-03] Registry init with IndexedDB probe + in-memory Map fallback — v1.0
- ✓ [LOOP-04] On a cache hit, the app renders immediately from the local registry (no model call) — v1.0
- ✓ [LOOP-05] On a cache miss, the platform calls Haiku, compiles, stores, and renders — v1.0
- ✓ [LOOP-06] Generated source is compiled once and the compiled string is stored — v1.0
- ✓ [LOOP-07] Compiled string is re-instantiated via `new Function`, never re-compiled twice in a session — v1.0
- ✓ [LOOP-08] Session-scoped in-memory transpiled cache — v1.0

**Generation (cache-miss core value)**
- ✓ [GEN-01] Eager Babel load (classic runtime) before the first production attempt — v1.0
- ✓ [GEN-02] Single Anthropic egress with the four mandatory browser headers — v1.0
- ✓ [GEN-03] Response code-fence stripping and `max_tokens` truncation guard — v1.0
- ✓ [GEN-04] JSX → JS transpile in-browser, classic-runtime `React.createElement` output — v1.0
- ✓ [GEN-05] Constrained `new Function` instantiation with an explicit named scope — v1.0

**Widgets & composition**
- ✓ [WIDGET-01] An app can declare sub-widgets resolved (cache or produce) before mount — v1.0
- ✓ [WIDGET-02] `@widget` dependency parse — v1.0
- ✓ [WIDGET-03] Transitive widget pre-warm to avoid render-time waterfalls — v1.0
- ✓ [WIDGET-04] A widget renders inside its own shell with its own contextual menu — v1.0
- ✓ [WIDGET-05] A failing widget shows a placeholder without crashing its parent app — v1.0

**Contextual modification**
- ✓ [MOD-01] Shared contextual prompt popover accepting free-form instructions — v1.0
- ✓ [MOD-02] Prompt routing for remove / clone / tweak intents — v1.0
- ✓ [MOD-03] Remove and clone resolved client-side without a model call — v1.0
- ✓ [MOD-04] A tweak produces a new cache key, resolves it, and replaces the target in place — v1.0

**Resilience**
- ✓ [RESIL-01] Typed model HTTP errors (key-missing / 401 / 429 / generic) — v1.0
- ✓ [RESIL-02] Backoff + jitter + token-bucket on the model transport — v1.0
- ✓ [RESIL-03] Render error boundary with retry, contained per app/widget — v1.0
- ✓ [RESIL-04] Self-heal production retries (≈3) feeding the compiler error back into the next attempt — v1.0
- ✓ [RESIL-05] Sliding-window produce cost cap (produce gate) — v1.0
- ✓ [RESIL-06] Storage-pressure LRU eviction over a swappable storage seam — v1.0

**Backend-style handlers**
- ✓ [HANDLER-01] A single helper resolves a cached handler or produces one on first need, transparently — v1.0
- ✓ [HANDLER-02] Dual-cache (session + IndexedDB) for produced handlers — v1.0
- ✓ [HANDLER-03] Handlers run in a constrained, denylist-shadowed `new Function` scope — v1.0

**Devtools hygiene (cross-cutting, non-negotiable)**
- ✓ [HYGIENE-01] No devtools-visible surface narrates the on-demand mechanic — v1.0
- ✓ [HYGIENE-02] The banned "synthesi*" family appears in no source surface — v1.0
- ✓ [HYGIENE-03] CI lexicon gate (`hygiene.test.ts`) enforces the banned-token set across `src/**` + `index.html` — v1.0
- ✓ [HYGIENE-04] Sourcemaps off + neutral naming for stores/keys/logs/CSS — v1.0
- ✓ [HYGIENE-05] API key sent only to `api.anthropic.com`, never logged (proven by console-spy test) — v1.0

**Security (v1 scope)**
- ✓ [SEC-04] CSP meta tag pinning `connect-src` to self + `api.anthropic.com`, tested — v1.0

> **Deferred (not in v1.0):**
> - **SEC-01 / SEC-02 / SEC-03** (general sandbox / iframe isolation hardening) — deferred by explicit user instruction ("forget about safety for now"). Eligible for a later milestone.
> - **HARD-01** (`<iframe sandbox>` isolation) and **POP-01** (popularity row) — deferred to v2.

### Active

<!-- Next-milestone candidates. Drawn from BLUEPRINT-DELTA.md gaps + v2-deferred items. All are hypotheses until shipped. -->

- [ ] **[G1-followups] cacheKey correctness for activated widgets/tweaks** — the v1.0 key is `SHA-256(type)` only (the kind/prompt folding that closed G1 covers the shipped paths). If widgets activate as a first-class path, fold `kind` (and a normalized prompt hash for tweak variants) fully into the key so widgets can't collide on a shared type slug and tweak variants cache distinctly instead of always re-hitting the model.
- [ ] **[G2] Unified `Intent` contract** — collapse the parallel `routeModification` / `Modification` path into the blueprint's single `Intent { operation, kind, contextBundle }` so one resolver drives open / mutate / clone / remove.
- [ ] **[G3] Activate + type widgets and handlers** — the widget generation path is built but dormant (delegated apps never declare `@widget`); make widget composition a first-class user path and replace the `Record<string, unknown>` placeholder `WidgetRecord` / `HandlerRecord` schemas with real types.
- [ ] **[G5] Persist `displayName` and `prompt`** (and `widgetDeps` / `createdAt`) — trimmed for MVP; needed for a richer storefront and faithful re-generation.
- [ ] **[HARD-01] `<iframe sandbox="allow-scripts">` isolation** — move generated code out of the `new Function` scope (containment-by-convention) into an opaque-origin frame brokered by `postMessage`, so the API key never enters the frame. The v2 security end-state.
- [ ] **[POP-01] Popularity row** — surface most-opened apps on the storefront (needs the `useCount` field already persisted for LRU).
- [ ] **Sanctioned network-data path** — a controlled, hygiene-safe egress so network-dependent apps (Weather / Currency) can fetch real data instead of degrading to a fallback in the sandboxed handler scope.
- [ ] **Reducer-reliability hardening** — reduce state-machine quirks in produced reducers (e.g., stronger action-spec contracts, validation, or self-heal on bad transitions).

### Out of Scope

<!-- Explicit boundaries with reasoning. -->

- **Server-side application backend** — the architecture is deliberately client-only; "handlers" run in-browser. No server to build or operate. *(Still valid.)*
- **Real authentication / accounts / billing** — the only credential is the user's own Anthropic API key in `localStorage`; the subscription framing is product narrative. *(Still valid.)*
- **Multi-user sync / sharing of generated apps** — the registry is local (IndexedDB) per browser; no cloud registry. *(Still valid.)*
- **A user-visible "generate / AI" surface** — actively excluded by the core illusion; the user never sees the mechanic. *(Still valid — and enforced by the CI hygiene gate.)*
- **Proxying the Anthropic API through our own server** — would break the client-only, zero-infra model and the "never proxy the key" rule; the key goes browser → `api.anthropic.com` only. *(Still valid.)*
- **Streaming code generation** — non-streaming is required (can't compile partial JSX) and a visible source stream in the Network tab is a hygiene leak surface. *(Still valid.)*

> **Moved out of Out-of-Scope:** `<iframe sandbox>` isolation was previously listed here as a known tradeoff. It is now a tracked **Active** v2 candidate (HARD-01), not an excluded boundary.

## Context

- **Current size & stack.** ~7k+ LOC of strict TypeScript (production code; ~12k including the test suite), **368 tests green**, `tsc` 0, build clean, released `v0.1.0`. Stack: **Vite 8**, **React 19.2 / react-dom 19.2**, **@babel/standalone classic-runtime** (pinned v7 default), **idb 8** over IndexedDB, **Claude Haiku** (`claude-haiku-4-5-20251001`) via direct browser `fetch`. Flat `MAX_TOKENS = 8192` (raised from 2048, which truncated real components).
- **Module layout** (diverged from the blueprint tree, by design): `src/registry/` (db, cacheKey, registry, storagePressure), `src/intent/` (resolver, routeModification), `src/execution/` (producer, transpile, widgetParse, widgetPrewarm, instantiate, mount), `src/host/` (modelClient, resilience: token-bucket, backoff, produce gate, error backstop), `src/services/` (IoC seams: transport / registry / key / gate injected for tests), `src/data/` + `src/apps/` (app registry + seeds), `src/ui/` (AppShell, WidgetShell, ContextualPrompt, Marketplace, AppBar, KeyDialog, ThemeProvider).
- **Pure browser application, no build step for generated code.** Generated JSX is compiled in-browser and instantiated with `new Function(...)` receiving only an explicit named scope (`React`, plus `useWidget` / `runHandler` / a `require` shim). `window` / `document` / `localStorage` are reachable as ambient globals — `new Function` is containment-by-convention, not a security boundary (HARD-01 is the fix).
- **Local-first registry.** A single IndexedDB database holds three object stores — `apps`, `widgets`, `handlers` — keyed by opaque hashes, with an in-memory `Map` fallback behind an identical async interface when IndexedDB is unavailable.
- **The illusion is enforced, not aspirational.** A CI lexicon gate (`src/hygiene.test.ts`) bans the mechanic-revealing lexicon across `src/**` + `index.html`; production ships with `build.sourcemap: false`; stores, keys, logs, and CSS use neutral naming; the gated logger is the only logging path.
- **Known tech debt (from the blueprint-vs-built delta):**
  - **Network apps can't fetch in the sandboxed handler scope** — Weather / Currency degrade to a fallback. Inherent to the current handler containment; the Active "sanctioned network-data path" addresses it.
  - **Generated reducers can have state-machine quirks** — inherent to on-demand apps; the Active "reducer-reliability hardening" item addresses it.
  - **cacheKey latent constraint** — historically `SHA-256(type)` dropped `kind` + `prompt`; matters once widgets activate or per-prompt tweak variants need distinct keys (tracked under Active G1-followups / G3).
- **Reference blueprint:** `docs/vibeappstore.md` — the **pre-pivot v1.0 blueprint**. Reality has moved past it (v1.1 delegated thin-shell, flat token budget, host/services layers); doc reconciliation is a known follow-up.

## Constraints

- **Tech stack**: React + react-dom, `@babel/standalone` (in-browser JSX compilation, loaded eagerly at init), IndexedDB via the `idb` wrapper, Anthropic Claude Haiku (`claude-haiku-4-5-20251001`) via direct browser `fetch` to `/v1/messages` — Why: zero-infra, client-only, on-demand generation with the user's own key.
- **Security**: generated code runs only in a `new Function()` scope with an explicit named parameter list (no `eval`, no global pollution); rendering goes through React's virtual DOM (no `innerHTML`); the API key lives in `localStorage`, is sent only to `api.anthropic.com`, and is never logged or proxied — Why: arbitrary generated code must be contained and the user's secret protected.
- **Devtools hygiene (hard rule)**: nothing visible via F12 may reveal the on-demand mechanic; the banned token family must not appear in any devtools-visible surface, including source comments — Why: the entire product premise is that apps simply exist on the platform. Enforced by the CI lexicon gate.
- **Performance**: load Babel before the first production attempt (its download must not block a cache miss); compile each app/widget once and persist the compiled string; keep a session-scoped in-memory compiled cache; pre-warm an app's declared widget dependencies before mounting it — Why: the loop must feel instant on hits and acceptable on misses.
- **Storage discipline**: never store compiled functions in IndexedDB — store the compiled JS string and re-instantiate via `new Function()` on load — Why: functions aren't serializable and recompilation must be controlled.
- **Resilience budget**: bounded self-heal retries (≈3) feeding the **compiler** error (not the runtime error) back to the model — Why: compiler errors are more actionable, maximizing the chance a cache miss still yields a working app.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Structure the roadmap as a **Vertical MVP** — each phase ships an end-to-end working slice | Get a usable marketplace fast, then add capability slice by slice | ✓ Good — 8 phases, each a working slice; v1.0 shipped end-to-end |
| Treat **devtools hygiene first** — the "apps just exist" illusion as a first-class, enforced constraint (naming, logs, storage, network, comments, CSS, errors), gated in CI | The illusion is the product; a single leak breaks it | ✓ Good — CI lexicon gate + sourcemaps-off held green across all 8 phases |
| **Classic-runtime Babel + `new Function`** for the runtime path (pin v7 classic default; explicit scope: `React`, `useWidget`, `runHandler`) | Classic `React.createElement` output matches the injected scope; v8 automatic runtime would break instantiation | ✓ Good — confirmed working; superior Babel diagnostics feed the self-heal loop |
| **Run generated code in a constrained `new Function()` scope** rather than `<iframe>` for v1 | Simpler v1; the code is the user's own key generating UI for the same user | ⚠ Revisit — containment-by-convention, not a security boundary; HARD-01 (iframe) is the v2 fix |
| **Delegated thin-shell** as the default for unseeded apps (v1.1 pivot, post-v1.0) — behavior-free module + per-action handlers produced on demand and cached | Contradicts the monolithic `<400`-line model; makes handlers the primary behavior mechanism; re-press is an O(1) cache hit | ✓ Good — built, merged, validated live; graceful fallback to monolith keeps legacy/seed paths non-breaking |
| **Flat `MAX_TOKENS = 8192`** (not the blueprint's per-kind 1500/1000/800 budgets) | 2048 truncated real components → transpile failures; a single generous cap is simpler and more reliable | ✓ Good — arguably better than the per-kind scheme; flag only for doc reconciliation |
| **IoC / DI everywhere** — inject the LLM transport, registry, key store, and produce gate so tests substitute the model | Makes the open→render flow testable with real captured Haiku fixtures and no live network | ✓ Good — DI invariant verified (single injected egress chokepoint; 368 tests run offline) |
| **registryKey folds `kind` + `prompt`** (the G1 close for shipped paths) | Stable, distinct keys per app/kind/prompt within the shipped surface | ⚠ Revisit — fully extends only once widgets activate (Active G1-followups / G3); the bare `SHA-256(type)` collision risk remains latent until then |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-26 — v1.1 Real & Robust milestone started*
