# Vibe App Store

## What This Is

A client-only, browser-based **generative app marketplace**. Users browse a storefront, open an **app**, and interact with it — and each app is a live React component produced on demand by a cheap LLM (Claude Haiku, using the user's own API key), compiled in the browser via `@babel/standalone`, cached per-app in IndexedDB, and injected into the page at runtime. Apps can also be composed of smaller **widgets** (the same resolve/cache/produce machinery), and any app can be tweaked, cloned, or removed through a contextual natural-language prompt. To the user there is no "AI" and no "generate" button — apps simply *exist* on the platform.

There is no application server. The user supplies their own Anthropic API key (stored locally in `localStorage`), and the platform calls `api.anthropic.com` directly from the browser. Backend-style data operations are themselves produced on demand as cached **handlers**.

**As actually built (v1.0 + v1.1):** the seeded path (the bundled `Notes` app) ships a complete monolithic source. Every other storefront card takes the on-demand path. As of the v1.1 pivot, unseeded apps default to a **delegated thin-shell**: the model first returns a behavior-free module (initial state + a markup-only view whose interactive elements carry `data-action`, plus a precise action spec), and a permanent shell mounts it with a single container click-delegate that **produces each action's handler on demand and caches it** (stable per-`(appType, action)` key → every re-press is an O(1) cache hit). This makes handlers the primary behavior mechanism, with a graceful fallback to the monolithic path when a delegated module can't be instantiated.

## Core Value

**A user opens an app from the storefront and it renders and works** — instantly on a cache hit, seamlessly produced on a cache miss — **and nothing visible ever reveals that the app was made on demand.** The resolve → cache → compile → render → interact loop is the product; if everything else fails, this loop must still deliver a working, interactive app while preserving the illusion that apps are first-class platform citizens.

This still holds after v1.0. The v1.1 delegated thin-shell refined *how* the loop runs (behavior is attached on first action rather than produced whole up front), but it did not shift what the loop must deliver: an interactive app that betrays no on-demand mechanic.

## Shipped: v2.0 Vibe OS (2026-06-26)

Themeable multi-window desktop — 5 phases (14–18), 21/21 requirements satisfied, 727 tests green, tagged `v2.0`. The flat storefront is now a draggable-glass-window OS with 4 switchable themes, a dock + menu bar, a search/launcher panel, and theme-aware app generation. See MILESTONES.md.

## Prior: v1.1 Real & Robust (2026-06-26)

Network-data path, reliability hardening, richer storefront, and activated widget composition — all merged, tagged `v1.1`, 552 tests green.

## Current Milestone: v3.0 Trusted Desktop

**Goal:** Make the Vibe OS desktop *safe to run untrusted generated code*, *durable across reloads*, and *personalizable* — without breaking the illusion that apps simply exist.

**Target features (build order reflects dependencies):**
- **Window UX & chrome** — relocate the `⋮` contextual menu out of the app body into the **window titlebar (right-aligned)**, drop the now-redundant in-body app-shell header, and add maximize/snap + keyboard affordances. This puts the contextual control in host-owned chrome — the hard prerequisite for iframe isolation.
- **Security: `<iframe sandbox>` isolation (HARD-01)** — run each app body inside `<iframe sandbox="allow-scripts">` (opaque origin, no `allow-same-origin`); broker data / handler / modify calls via `postMessage`; the Anthropic key never enters the frame. Theme CSS vars re-injected per frame.
- **Desktop persistence** — restore window geometry / z-order, the open-app set, and last theme across reloads.
- **Theme editor / custom themes** — create, name, edit, and save user themes over the 12-var contract, persisted in the IDB `settings` store; the built-in four remain.

**Key context:** The `⋮`→titlebar move is a *prerequisite* for the iframe work (contextual UI must be host-owned once the body is an opaque frame). Theme vars must be re-injected into each sandboxed frame (CSS custom properties don't cross the iframe boundary). Zero-new-dependency bias and the devtools-hygiene lexicon gate stay in force. Drove from a user design screenshot (the `⋮`-to-titlebar annotation).

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
- ✓ [HYGIENE-06] CI gate extended to all new v2.0 surfaces + model-supplied display string sanitization — v2.0

**Security (v1 scope)**
- ✓ [SEC-04] CSP meta tag pinning `connect-src` to self + `api.anthropic.com`, tested — v1.0

**Windowing system (v2.0)**
- ✓ [WIN-01] Draggable glass window with macOS-style titlebar (traffic-light + icon + title) — v2.0
- ✓ [WIN-02] Multiple concurrent independent windows; active-app name in menu bar — v2.0
- ✓ [WIN-03] Window raise (z-order), drag clamped to viewport, cascade placement — v2.0
- ✓ [WIN-04] Minimize to dock / restore — v2.0
- ✓ [WIN-05] Close with full subtree teardown, no root leaks — v2.0
- ✓ [WIN-06] Dock with running indicators + hover-scale + magnifier launcher icon — v2.0
- ✓ [WIN-07] Menu bar: OS wordmark + active-app name + live clock — v2.0
- ✓ [WIN-08] Desktop surface with themed animated wallpaper — v2.0

**Themeable shell (v2.0)**
- ✓ [THEME-01] Four built-in themes (Aurora / Aero / Aqua / Noir) selectable from menu bar — v2.0
- ✓ [THEME-02] Theme switch re-skins host chrome AND all open app windows live — v2.0
- ✓ [THEME-03] Active theme persists; FOUC-safe first paint — v2.0
- ✓ [THEME-04] Themes as CSS custom properties on document root — v2.0
- ✓ [THEME-05] Backward-compat alias bridge for pre-v2.0 cached apps — v2.0

**Search / launcher panel (v2.0)**
- ✓ [CREATE-01] Dock magnifier opens SearchLauncherPanel with text input + pre-installed apps — v2.0
- ✓ [CREATE-02] Describe → find-or-produce → window on desktop (cache hit = instant) — v2.0
- ✓ [CREATE-03] Pre-installed app selection opens window on desktop, dock running dot — v2.0

**Theme-aware generation (v2.0)**
- ✓ [TGEN-01] Produced apps reference theme CSS-var contract (no hardcoded colors) — v2.0
- ✓ [TGEN-02] Post-compile colorCheck → self-heal loop on violations (≤3 retries) — v2.0
- ✓ [TGEN-03] Model-supplied names sanitized before titlebar/dock/menu — v2.0

**Performance (v2.0)**
- ✓ [PERF-01] Minimized windows display:none; animated wallpaper degrades under prefers-reduced-motion — v2.0

> **Deferred beyond v2.0:**
> - **SEC-01 / SEC-02 / SEC-03** (general sandbox / iframe isolation hardening) — eligible for a later milestone.
> - **HARD-01** (`<iframe sandbox>` isolation) — windowing layer designed for contained future adoption.
> - **G2** unified `Intent` contract — internal refactor.
> - Custom themes, window-layout persistence — v3.x candidates.

### Active

<!-- Next-milestone candidates. All are hypotheses until shipped. -->

- [ ] **[HARD-01] `<iframe sandbox="allow-scripts">` isolation** — move generated code out of the `new Function` scope into an opaque-origin frame brokered by `postMessage`, so the API key never enters the frame. The v3.x security end-state. Windowing layer designed for this as a contained future change.
- [ ] **[G2] Unified `Intent` contract** — collapse the parallel `routeModification` / `Modification` path into a single `Intent { operation, kind, contextBundle }` resolver. Internal refactor; no user-facing value yet.
- [ ] **User-created / custom themes** — theme editor + persisting custom themes in the IDB `settings` store; built-in four only in v2.0.
- [ ] **Window-position / desktop-layout persistence** — restoring exact window geometry and the `installed[]` dock across reloads; active-theme persistence ships in v2.0, layout deferred.
- [ ] **SearchLauncherPanel CSS polish** — 6 interior classes (`.launcher__search`, `.launcher__input`, `.launcher__open-btn`, `.launcher__working`, `.launcher__chips`, `.launcher__chip`) partially styled by audit-debt fix (commit `8f0e601`); a final theme-glass treatment pass remains.
- [ ] **SEC-01/02/03** — general sandbox / iframe isolation hardening; deferred.

### Out of Scope

<!-- Explicit boundaries with reasoning. -->

- **Server-side application backend** — the architecture is deliberately client-only; "handlers" run in-browser. No server to build or operate. *(Still valid.)*
- **Real authentication / accounts / billing** — the only credential is the user's own Anthropic API key in `localStorage`; the subscription framing is product narrative. *(Still valid.)*
- **Multi-user sync / sharing of generated apps** — the registry is local (IndexedDB) per browser; no cloud registry. *(Still valid.)*
- **Naming the mechanic (AI / LLM / "generate" / "synthesize") in any user- or devtools-visible surface** — still actively excluded and enforced by the CI lexicon gate. *(Still valid.)* **Note (v2.0):** a *visible creation surface* is no longer excluded — the user may describe an app and open it through a branded front-door — but it must never name the underlying mechanic.
- **Proxying the Anthropic API through our own server** — would break the client-only, zero-infra model and the "never proxy the key" rule; the key goes browser → `api.anthropic.com` only. *(Still valid.)*
- **Streaming code generation** — non-streaming is required (can't compile partial JSX) and a visible source stream in the Network tab is a hygiene leak surface. *(Still valid.)*

> **Moved out of Out-of-Scope:** `<iframe sandbox>` isolation was previously listed here as a known tradeoff. It is now a tracked **Active** v2 candidate (HARD-01), not an excluded boundary.

## Context

- **Current size & stack.** ~21k LOC of strict TypeScript (production + test suite; 727 tests green), `tsc` 0, build clean, tagged `v2.0`. Stack: **Vite 8**, **React 19.2 / react-dom 19.2**, **@babel/standalone classic-runtime** (pinned v7 default), **idb 8** over IndexedDB (DB v3 with `settings` store), **Claude Haiku** (`claude-haiku-4-5-20251001`) via direct browser `fetch`. **Zero new npm dependencies added in v2.0.**
- **Module layout** (diverged from blueprint tree, by design): `src/registry/` (db, cacheKey, registry, storagePressure, settingsStore), `src/intent/` (resolver, routeModification), `src/execution/` (producer, transpile, widgetParse, widgetPrewarm, instantiate, mount, colorCheck, sanitizeDisplayName), `src/host/` (modelClient, resilience: token-bucket, backoff, produce gate, error backstop), `src/services/` (IoC seams: transport / registry / key / gate / settings injected for tests), `src/data/` + `src/apps/` (app registry + seeds + dataBroker), `src/ui/` (DesktopShell, WindowFrame, Dock, MenuBar, SearchLauncherPanel, VibeThemeProvider, ThemeSelector, AppShell, WidgetShell, ContextualPrompt, AppBar, KeyDialog, useDrag, useWindowManager, iconForApp).
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
| **registryKey folds `kind` + `prompt`** (the G1 close for shipped paths) | Stable, distinct keys per app/kind/prompt within the shipped surface | ⚠ Revisit — fully extends only once widgets activate; the bare `SHA-256(type)` collision risk remains latent until then |
| **Theme vars on `document.documentElement`** (not React context) | CSS inheritance reaches all app subtrees regardless of mount strategy; FOUC-safe via `localStorage` sync-read in `index.html` | ✓ Good — Phase 14 confirmed; re-skin acceptance test proves all subtrees update |
| **Windows render in-tree (memoized `WindowBody`) not separate `createRoot` roots** | Detached roots ran outside `act()` scope in tests → self-updating fixture hung; in-tree eliminates the root-leak class | ✓ Good — Phase 15 architectural deviation; WIN-02 intent (concurrent, independent) fully met; appBodyCount invariant green |
| **Zero new npm dependencies for v2.0** | react-draggable has React 19 `findDOMNode` breakage; framer-motion is 674KB–4.8MB | ✓ Good — hand-rolled `useDrag` (setPointerCapture + rAF) + VibeThemeProvider + all desktop components within the constraint |
| **`colorCheck` allows grayscale hex + neutral-alpha shadows** | Prevents false positives on legitimate shadow/border conventions in generated UIs | ✓ Good — 44/44 colorCheck tests include the shadow-not-flagged case; CR-02 closed the 4-digit `#rgba` evasion path |
| **`sanitizeDisplayName` wired in `useWindowManager.open()`** (not in the producer) | Sanitization happens at chrome-render time, not at produce time — catches model-supplied names from any path | ✓ Good — "AI Weather" → "Weather" behavioral test green; titlebar/dock/menu can't render a banned token |
| **FOUC script duplicates VIBE_THEMES verbatim** (not shared import) | Script must run before any module load; sync by convention (copied values) + same-commit CSP hash invariant | ✓ Good — FOUC gate green across all phase exits; csp.test.ts recomputes hash from live file |

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
*Last updated: 2026-06-26 — started milestone v3.0 Trusted Desktop (iframe sandbox + persistence + theme editor + window-chrome UX); baseline 727 tests green, `v2.0` tagged*
