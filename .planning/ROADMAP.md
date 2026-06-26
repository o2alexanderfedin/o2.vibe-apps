# Roadmap: Vibe App Store

## Milestones

- ✅ **v1.0 MVP** — Phases 1–8 (shipped 2026-06-26) — full detail archived in [milestones/v1.0-ROADMAP.md](./milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Real & Robust** — Phases 9–13 (shipped 2026-06-26) — full detail archived in [milestones/v1.1-ROADMAP.md](./milestones/v1.1-ROADMAP.md)
- 🚧 **v2.0 Vibe OS** — Phases 14–18 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–8) — SHIPPED 2026-06-26</summary>

- [x] Phase 1: Hygiene Foundation & Storefront Shell (4/4 plans) — completed 2026-06-24
- [x] Phase 2: Static Open-One-App Loop — completed 2026-06-24
- [x] Phase 3: Cache-Miss Generation (Core Value) — completed 2026-06-24
- [x] Phase 4: Widget Composition (1/1) — completed 2026-06-24
- [x] Phase 5: Contextual Modification (1/1) — completed 2026-06-24
- [x] Phase 6: API Error Degradation (1/1) — completed 2026-06-24
- [x] Phase 7: Storage & Cost Guardrails (1/1) — completed 2026-06-24
- [x] Phase 8: Backend-Style Handlers (1/1) — completed 2026-06-24

Full phase detail, success criteria, and requirement mapping are archived in
[milestones/v1.0-ROADMAP.md](./milestones/v1.0-ROADMAP.md). Post-v1.0 work landed
outside the milestone: the **v1.1 delegated thin-shell** pivot (now the default for
unseeded apps) and quick task **260625-q08** (the `registryKey` cache-key contract,
gap G1). See [BLUEPRINT-DELTA.md](./BLUEPRINT-DELTA.md).

</details>

<details>
<summary>✅ v1.1 Real & Robust (Phases 9–13) — SHIPPED 2026-06-26</summary>

All 5 phases complete and merged to `develop`; 12/12 requirements satisfied; 552 tests green. Full phase detail archived in [milestones/v1.1-ROADMAP.md](./milestones/v1.1-ROADMAP.md).

- [x] **Phase 9: Richer Storefront** — Apps carry a real name and re-produce faithfully; a popular row surfaces the most-opened apps with honest local copy.
- [x] **Phase 10: Widget Schema & Key Correctness** — Real typed widget/handler records and every cache-key call site folds kind+prompt, so activated widgets can't collide with apps on a shared type slug.
- [x] **Phase 11: Reliability Hardening** — Produced delegated behavior is correct more often: invalid state is rejected and prior state kept, unknown actions are no-ops, no extra model round-trips.
- [x] **Phase 12: Sanctioned Network-Data Path** — Weather and Currency apps fetch real data through a host-brokered, allowlisted, keyless egress; the API key never enters app scope.
- [x] **Phase 13: Activate Widget Composition** — Delegated apps can declare and render `@widget` sub-widgets, each isolated, with a bounded composition depth.

</details>

### v2.0 Vibe OS (Phases 14–18)

- [x] **Phase 14: Theme Foundation** — The CSS-variable theme contract and FOUC-safe persistence are established; the alias bridge keeps pre-v2 cached apps rendering. Dependency root for all v2.0 phases. (completed 2026-06-26)
- [ ] **Phase 15: Window Manager** — Apps open as draggable glass windows with z-order, focus, minimize, close, and no React root leaks.
- [ ] **Phase 16: Desktop Shell** — The desktop surface, animated wallpaper, dock (with running indicators and the launcher icon), and menu bar (wordmark, active-app name, clock) replace the flat storefront as the root UI.
- [ ] **Phase 17: Search / Launcher Panel** — A dock-launched panel lets the user describe an app or pick a pre-installed one; results open as windows on the desktop via the real produce loop.
- [ ] **Phase 18: Theme-Aware Generation** — All produce-prompt branches mandate the CSS-var contract; a post-compile static check feeds violations into the self-heal loop; model-supplied names are sanitized; the CI lexicon gate covers all new surfaces.

## Phase Details

### Phase 9: Richer Storefront
**Goal**: A user sees apps by their real name, re-opens them faithfully produced, and can spot the apps they use most via a "popular" row with truthful local copy.
**Depends on**: Phase 8 (v1.0 complete; reuses the additive-schema muscle and the `useCount` field already persisted for LRU)
**Requirements**: STORE-01, STORE-02
**Success Criteria** (what must be TRUE):
  1. A user sees each storefront card labeled with the app's real `displayName` (not a raw type slug), and pre-existing records that lack the new fields still render without a blank title.
  2. After a user re-opens an app, it re-produces faithfully because the original producing `prompt` and `createdAt` are persisted on the app record (raw prompt stored; tweak variants named distinctly).
  3. A user sees a "popular" row of the most-opened apps, ranked by the existing `useCount` with a deterministic tie-break, that is hidden on cold start and labeled with truthful copy (no false "popular across the platform" claim for a local-only signal).
  4. Existing apps and tests keep working — the schema change is additive (read-tolerant of old records), `tsc` is clean, the build emits no source maps, and the hygiene gate stays green.
**Plans**: 3 plans
Plans:
- [x] 09-01-PLAN.md — Schema + loader: extend AppRecord with displayName/prompt/createdAt; wire into loader write sites; extract rankPopular utility
- [x] 09-02-PLAN.md — Tests: v1-record compat for Phase 9 fields + rankPopular determinism tests
- [x] 09-03-PLAN.md — UI: popular row in Marketplace.tsx + displayName fallback chain + visual verification checkpoint

### Phase 10: Widget Schema & Key Correctness
**Goal**: The widget and handler registry records have real types, and every cache-key derivation folds kind+prompt, so an activated widget can never be served the wrong cached artifact or collide with an app of the same type slug.
**Depends on**: Phase 9
**Requirements**: WIDGET-07, WIDGET-08
**Success Criteria** (what must be TRUE):
  1. The `widgets` and `handlers` registry records expose real typed schemas (replacing the `Record<string, unknown>` placeholders), consistent with the typed `apps` record shape, and `tsc` stays clean.
  2. A widget of type `chart` and an app of type `chart` resolve to distinct cache keys (kind is folded in), proven by a test, so they can never collide on the shared slug.
  3. A baseline app and its tweak variant resolve to distinct cache keys (prompt is folded in), and read and write use the same structured `registryKey(kind, type, prompt)` symmetrically — no bare `cacheKey()` survives in any registry path, proven by tests.
  4. The full suite stays green with no regression, the hygiene gate passes, and the build emits no source maps.
**Plans**: 2 plans
Plans:
**Wave 1**
- [x] 10-01-PLAN.md — Schema + LRU parity: replace WidgetRecord/HandlerRecord placeholders with explicit interfaces extending LruMeta; add useCount/updatedAt to widget write sites in widgetPrewarm.ts; verify tsc clean

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 10-02-PLAN.md — Test migration + audit: migrate loader.test.ts + loaderGuardrails.test.ts from bare cacheKey(type) to registryKey("app", type); add WIDGET-08 collision-distinctness audit describe block to cacheKey.test.ts

### Phase 11: Reliability Hardening
**Goal**: Produced delegated apps behave correctly more often — a mis-shaped result never blanks or sticks the app, unknown actions do nothing harmful, and none of this costs extra model round-trips.
**Depends on**: Phase 10
**Requirements**: RELY-01, RELY-02, RELY-03
**Success Criteria** (what must be TRUE):
  1. When a produced action returns a mis-shaped or invalid result, the app keeps its prior visible state — a user never sees a blank or stuck app from a bad transition.
  2. When a user triggers an action that has no produced handler or is otherwise unknown/unhandled, the app does nothing (a silent no-op) — it never throws and never hangs.
  3. The user never sees mechanic-revealing copy from a validation failure, and validation failures trigger no extra model round-trips (compile-error self-heal only, per the shipped RESIL-04 budget).
  4. Produce-success is not lower than before — the validation hardens correctness without making the small model fail more often — verified offline against real captured-Haiku fixtures.
**Plans**: 2 plans
Plans:
**Wave 1**
- [x] 11-01-PLAN.md — zod dep + stateSchema helper + wire validation into the merge step in delegated.tsx (RELY-01, RELY-03)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 11-02-PLAN.md — Full test suite: keep-prior / extra-keys / valid-partial / no-op paths / zero-round-trip (RELY-01, RELY-02, RELY-03 test coverage)

### Phase 12: Sanctioned Network-Data Path
**Goal**: A user opening the Weather app sees real current conditions and the Currency app shows real FX rates, fetched through a host-brokered allowlisted path — and nothing the user or devtools sees reveals the mechanic or exposes the API key.
**Depends on**: Phase 11 (the merge step must already validate produced state before live network-derived data flows through it — hard ordering constraint)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04
**Success Criteria** (what must be TRUE):
  1. A user opens the Weather app and sees real current conditions for a location, and opens the Currency app and sees real FX rates — each fetched via a host-built request from a curated source manifest, with generated code supplying only a `sourceId` and params (raw `fetch`/`XMLHttpRequest` stay shadowed to `undefined` in app scope).
  2. Each data app shows neutral, data-framed loading / empty / error states (never mechanic-framed); a retry re-runs the fetch rather than re-producing the app, and any fetch failure maps to a neutral fallback that never reveals the mechanic or exposes the API key.
  3. Re-opening a data app is instant and rate-limit-friendly because fetched data is TTL-cached client-side (weather ~10 min, FX ~daily).
  4. Egress is contained: `connect-src` is widened to exactly the finite keyless, CORS-open, read-only origins the broker calls (never `*`), asserted in `csp.test.ts`; a `sourceId` not on the allowlist is rejected by the broker; the API key is never sent anywhere but `api.anthropic.com`.
**Plans**: 5 plans

Plans:
**Wave 1** *(independent — run in parallel)*
- [x] 12-01-PLAN.md — Data infrastructure: sourceManifest.ts (3-entry curated allowlist) + ttlCache.ts (Clock-DI in-memory cache) + dataBroker.ts (host-side fetch with manifest URL build, param filter, TTL cache, rate-limit wrap, neutral errors)
- [x] 12-02-PLAN.md — CSP + assertions: widen index.html connect-src to 4 allowlisted origins; add connectSrcDirective helper + 5-case DATA-02 describe block to csp.test.ts

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 12-03-PLAN.md — Services wiring + handler scope: add fetchDataBroker? to Services; wire real broker in createServices(); add cannedBroker/unusedBroker to testServices.ts; inject fetchData before input in handler constrained scope
- [x] 12-04-PLAN.md — Seeded Weather + Currency apps: delegated module seeds (initialState/view/actionSpec) + seeded handler sources (weatherHandlers.ts, currencyHandlers.ts) + seeded-handler short-circuit in resolveHandlerJS

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 12-05-PLAN.md — Full test suite: broker unit tests (TTL hit/miss, allowlist rejection, param injection guard, non-2xx, network throw) + handler integration tests (weather/currency seeded handlers with real-shape API fixtures, no-broker fallback, fetch bypass proof)

### Phase 13: Activate Widget Composition
**Goal**: A delegated app can declare and render `@widget` sub-widgets as a first-class path — each widget isolated in its own shell, a failing widget never crashing its parent, and the composition depth bounded.
**Depends on**: Phase 12 (lands on Phase 10's typed records + audited keys — hard ordering constraint; sequenced after Phase 12 to avoid churn on the shared delegated render path)
**Requirements**: WIDGET-06
**Success Criteria** (what must be TRUE):
  1. A user opens a delegated app that declares `@widget` sub-widgets and sees those widgets render in place — `useWidget` is wired into the delegated `view` scope (closing the gap that the delegated instantiation injected no `useWidget`).
  2. A failing or slow widget shows a placeholder without crashing its parent app, and renders inside its own shell with its own contextual menu (WIDGET-05 stays true under real composition).
  3. Composition is bounded — a code-enforced widget cap and transitive-depth bound prevent runaway or recursive widget trees.
  4. An end-to-end `@widget`-declaring delegated app passes through the chosen scope, the full suite stays green with zero regression, the hygiene gate passes, and the build emits no source maps.
**Plans**: TBD
**UI hint**: yes

---

## v2.0 Vibe OS — Phase Details

### Phase 14: Theme Foundation
**Goal**: The Vibe OS theme contract is live — four named themes apply as CSS custom properties on the document root, the active theme persists with no flash on reload, and a backward-compat alias bridge keeps every pre-v2.0 cached app rendering correctly.
**Depends on**: Phase 13 (v1.1 complete)
**Requirements**: THEME-01, THEME-02, THEME-03, THEME-04, THEME-05
**Success Criteria** (what must be TRUE):
  1. A user clicks any of the four theme pills (Aurora / Aero / Aqua / Noir) and every visible element — host chrome, open app windows, the dock, the menu bar — re-skins instantly with no page reload and no component remount.
  2. On a hard reload after switching to Noir (or any non-default theme), the page paints with the correct Noir palette from the very first frame — no flash of the default Aurora colors at any point during load.
  3. An app that was cached before v2.0 (referencing `--color-surface`, `--color-text`, `--color-accent`) still renders and re-skins correctly after the new theme variables land, because the `:root` alias bridge forwards those old names to the new contract.
  4. The active theme name is persisted in both `localStorage` (for the FOUC script) and the new IDB `settings` store (DB version bumped to 3, additive upgrade), so the choice survives tab close, hard reload, and browser restart.
  5. The FOUC script SHA-256 hash in `csp.test.ts` is updated in the same commit as the script change, and all 552+ existing tests stay green (theme foundation is entirely additive).
**Plans**: 5 plans
Plans:
- [x] 14-01-PLAN.md — Additive registry DB v2→v3 settings store (durable theme-name mirror foundation)
- [x] 14-02-PLAN.md — Alias bridge CSS (pre-v2 apps keep colors) + osTheme storage key
- [x] 14-03-PLAN.md — VibeThemeProvider + VIBE_THEMES contract on document root, dual persistence via injected settings seam
- [x] 14-04-PLAN.md — FOUC script extension + CSP sha256 hash sync (atomic, no-flash first paint)
- [x] 14-05-PLAN.md — ThemeSelector 4-pill switcher in AppBar + switch-path test (temporary home)
**Research pitfalls defended**: Pitfall 5 (CSS vars on documentElement, not React context), Pitfall 6 (FOUC — localStorage sync read in index.html script), Pitfall 7 (theme transition jank — @property or opacity crossfade), Pitfall 11 (new surfaces extend hygiene gate)

### Phase 15: Window Manager
**Goal**: Apps open as independently draggable glass windows — each in its own React root, with z-order/focus/minimize/close lifecycle managed by a single hook — with no root leaks on close and no pointer-event jank during drag.
**Depends on**: Phase 14 (theme CSS vars must be live so WindowFrame chrome can reference them)
**Requirements**: WIN-01, WIN-02, WIN-03, WIN-04, WIN-05
**Success Criteria** (what must be TRUE):
  1. A user opens multiple apps concurrently and sees each as a distinct draggable window with a macOS-style glass chrome (traffic-light close/minimize controls, app icon, title) — windows are independent and do not affect each other's state.
  2. A user drags a window by its titlebar across the desktop — including into the content area of another window and back — and the window tracks the pointer cleanly with no sticking, no text-selection, and no frame drops; the window stops at viewport edges.
  3. Clicking a window's titlebar or body raises it to the front (z-order) and makes it active; a new window opens cascade-placed above and to the right of the previous one.
  4. A user minimizes a window (traffic-light or dock click) and it disappears from the desktop; clicking the dock icon restores it to its prior position and size with its app state intact.
  5. Closing a window fully tears down its React root — `mountedCount()` returns to the pre-open value, no timers or listeners from the closed app survive, and a subsequent open produces a fresh root with no `createRoot` warning.
**Plans**: TBD
**Research pitfalls defended**: Pitfall 1 (setPointerCapture on drag handle), Pitfall 2 (rAF + imperative style writes, state only on pointerup), Pitfall 3 (isolation:isolate container, bounded z-index), Pitfall 4 (display:none minimized windows), Pitfall 8 (three-step close teardown: evict→closeWin→unmountApp), Pitfall 9 (cancellation token on mid-flight close), Pitfall 12 (window raise separate from input focus)

### Phase 16: Desktop Shell
**Goal**: The flat storefront is replaced by the Vibe OS desktop — an animated themed wallpaper, a bottom dock with running indicators and a launcher icon, and a top menu bar with the wordmark, active-app name, and a live clock — all performing responsively even with several windows open.
**Depends on**: Phase 15 (DesktopShell renders WindowFrame components; useWindowManager must exist)
**Requirements**: WIN-06, WIN-07, WIN-08, PERF-01
**Success Criteria** (what must be TRUE):
  1. A user sees the Vibe OS desktop as the root UI — animated themed wallpaper behind open windows, a bottom dock showing an icon for each running app (with a running-indicator dot) plus a launcher (magnifier) icon, and a top menu bar displaying the OS wordmark, the active window's app name, and a live clock.
  2. Clicking a running-app icon in the dock focuses or restores that window; clicking the launcher (magnifier) icon opens the search/launcher panel; hovering any dock icon shows a hover-scale animation.
  3. With four or more windows open plus the animated wallpaper running, the desktop stays at or above 30 fps on integrated graphics — minimized windows do not composite (display:none), blob layers are merged, and blur/animation degrade automatically under `prefers-reduced-motion` or when frame time exceeds the performance budget.
  4. Switching theme with multiple windows open produces no dropped frames (no full-page restyle cascade; @property declarations or opacity-crossfade strategy in place).
**Plans**: TBD
**UI hint**: yes
**Research pitfalls defended**: Pitfall 3 (z-index stacking: dedicated window container with isolation:isolate, blobs in lower-z sibling), Pitfall 4 (backdrop-filter compositing cost — display:none, merged blob layer, prefers-reduced-motion), Pitfall 7 (theme transition jank), Pitfall 11 (neutral CSS class names, neutral IDB store keys, neutral data-* attributes on all new surfaces)

### Phase 17: Search / Launcher Panel
**Goal**: A user can describe any app or pick a pre-installed one from a dock-launched panel, and the result opens as a window on the desktop via the real produce loop — with genuine loading feedback and no surface naming the mechanic.
**Depends on**: Phase 16 (CreatePanel receives onOpen from DesktopShell; the desktop must exist to place windows on it)
**Requirements**: CREATE-01, CREATE-02, CREATE-03
**Success Criteria** (what must be TRUE):
  1. A user clicks the magnifier icon in the dock and a search/launcher panel opens, containing a text input with an action button and a list of pre-installed apps.
  2. A user types a description (e.g. "a pomodoro timer") and submits — the panel enters a working state with branded, mechanic-free step copy ("Reading your vibe…", "Sketching the layout…") that reflects real production time on a cache miss, then transitions to a result state; the result opens as a window on the desktop.
  3. On a cache hit for a previously-described app type, the panel's working state resolves immediately and the window opens — no redundant model call.
  4. A user selects a pre-installed app from the panel's list and it opens as a window on the desktop and appears in the dock as running; no surface in the flow contains a banned lexicon token.
**Plans**: TBD
**UI hint**: yes
**Research pitfalls defended**: Pitfall 11 (create panel copy is the highest new hygiene risk; name sanitization before display; CI gate covers CreatePanel.tsx), Pitfall 12 (create panel input does not steal focus from open app windows)

### Phase 18: Theme-Aware Generation
**Goal**: Every app produced after this phase references the theme CSS-variable contract in its inline styles, re-skins automatically on any theme switch, and never leaks a banned token through a model-supplied display string — with the CI hygiene gate extended to all new v2.0 surfaces.
**Depends on**: Phase 14 (CSS-var contract must be live before prompt changes), Phase 17 (apps must be opening in windows so end-to-end re-skin is verifiable)
**Requirements**: TGEN-01, TGEN-02, TGEN-03, HYGIENE-06
**Success Criteria** (what must be TRUE):
  1. A user produces a new app (cache miss) with the Aqua theme active, switches to Noir, and the generated app's colors update in real time alongside the host chrome — the app contains no hardcoded hex/rgb color literals in its source.
  2. When the model returns generated code that contains a hardcoded hex color literal, the post-compile static check detects it and feeds the violation as a compiler-style error back into the existing self-heal loop (≤3 retries, no new round-trips beyond the shipped budget) — within those retries the app emerges using only CSS variables.
  3. An app named "AI Weather" or "Generated Notes" by the model has its display name sanitized before reaching the titlebar, dock label, or menu bar — no banned token (`AI`, `llm`, `generate`, `fake`, `mock`, or the `synthesi*` family) is visible in any devtools-accessible surface.
  4. The CI lexicon gate (`hygiene.test.ts`) is extended to cover all new v2.0 source files (DesktopShell, WindowFrame, Dock, MenuBar, CreatePanel, VibeThemeProvider, settings, createPanelUtils) and all existing tests remain green with `tsc` clean and the build emitting no source maps.
**Plans**: TBD
**Research pitfalls defended**: Pitfall 10 (generated apps hardcode colors — prompt contract + post-compile hex/rgb regex → self-heal), Pitfall 11 (model-generated names sanitized; CI gate extended to all new surfaces)

---

## Progress

**Execution Order:**
v1.0 → v1.1 → v2.0 phases execute in numeric order: 1 → … → 13 → 14 → 15 → 16 → 17 → 18

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Hygiene Foundation & Storefront Shell | v1.0 | 4/4 | Complete | 2026-06-24 |
| 2. Static Open-One-App Loop | v1.0 | ✓ | Complete | 2026-06-24 |
| 3. Cache-Miss Generation (Core Value) | v1.0 | ✓ | Complete | 2026-06-24 |
| 4. Widget Composition | v1.0 | 1/1 | Complete | 2026-06-24 |
| 5. Contextual Modification | v1.0 | 1/1 | Complete | 2026-06-24 |
| 6. API Error Degradation | v1.0 | 1/1 | Complete | 2026-06-24 |
| 7. Storage & Cost Guardrails | v1.0 | 1/1 | Complete | 2026-06-24 |
| 8. Backend-Style Handlers | v1.0 | 1/1 | Complete | 2026-06-24 |
| 9. Richer Storefront | v1.1 | 3/3 | Complete | 2026-06-26 |
| 10. Widget Schema & Key Correctness | v1.1 | 2/2 | Complete | 2026-06-26 |
| 11. Reliability Hardening | v1.1 | 2/2 | Complete | 2026-06-26 |
| 12. Sanctioned Network-Data Path | v1.1 | 5/5 | Complete | 2026-06-26 |
| 13. Activate Widget Composition | v1.1 | TBD | Complete | 2026-06-26 |
| 14. Theme Foundation | v2.0 | 5/5 | Complete   | 2026-06-26 |
| 15. Window Manager | v2.0 | 0/TBD | Not started | - |
| 16. Desktop Shell | v2.0 | 0/TBD | Not started | - |
| 17. Search / Launcher Panel | v2.0 | 0/TBD | Not started | - |
| 18. Theme-Aware Generation | v2.0 | 0/TBD | Not started | - |

**v1.0 MVP shipped 2026-06-26 — 8 phases, 42/42 active requirements satisfied, 378 tests green.**
**v1.1 Real & Robust shipped 2026-06-26 — 5 phases, 12/12 requirements satisfied, 552 tests green.**

---

### v2.0 cross-cutting acceptance constraints (binding on every phase 14–18)

Carried forward from v1.0/v1.1 — these are acceptance constraints, not separate phases:

- **HYGIENE-01..05** — no devtools-visible surface narrates the on-demand mechanic; the banned token family (`synthesi*`, `AI`, `llm`, `generate`, `fake`, `mock`) appears in no source surface including comments; the CI lexicon gate (`hygiene.test.ts`) stays green across `src/**` + `index.html`. Extended in Phase 18 to all new v2.0 files (HYGIENE-06).
- **Single Anthropic egress** — the API key is sent only to `api.anthropic.com`, never logged, never proxied; the v1.1 host data-broker chokepoint remains the only network-data egress path.
- **Sourcemaps off** — production ships `build.sourcemap: false`; neutral naming for stores/keys/logs/CSS. New stores (`settings`), keys (`vibe.activetheme`), and CSS classes (`.window-chrome`, `.dock-item`, `.create-panel`) use neutral names with no banned tokens.
- **IoC / DI** — new capabilities are wired through the injected `Services` bundle so the open→render flow stays testable offline.
- **TDD with real captured-Haiku fixtures** — RED→GREEN, full suite runs offline with no live network; `tsc` 0 errors and a clean build on every phase exit.
- **Additive DB migrations** — IDB version bump (v2→v3 for the `settings` store) uses the existing non-destructive additive-upgrade pattern; no data loss on upgrade.
- **FOUC script / CSP hash invariant** — any change to the `index.html` FOUC script must be accompanied by a SHA-256 hash update in `csp.test.ts` in the same commit.
