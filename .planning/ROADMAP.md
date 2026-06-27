# Roadmap: Vibe App Store

## Milestones

- ✅ **v1.0 MVP** — Phases 1–8 (shipped 2026-06-26) — full detail archived in [milestones/v1.0-ROADMAP.md](./milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Real & Robust** — Phases 9–13 (shipped 2026-06-26) — full detail archived in [milestones/v1.1-ROADMAP.md](./milestones/v1.1-ROADMAP.md)
- ✅ **v2.0 Vibe OS** — Phases 14–18 (shipped 2026-06-26) — full detail archived in [milestones/v2.0-ROADMAP.md](./milestones/v2.0-ROADMAP.md)
- 🔵 **v3.0 Trusted Desktop** — Phases 19–22 (in progress)

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

<details>
<summary>✅ v2.0 Vibe OS (Phases 14–18) — SHIPPED 2026-06-26</summary>

All 5 phases complete and merged to `develop`; 21/21 requirements satisfied; 727 tests green. Full phase detail archived in [milestones/v2.0-ROADMAP.md](./milestones/v2.0-ROADMAP.md).

- [x] **Phase 14: Theme Foundation** — The CSS-variable theme contract and FOUC-safe persistence are established; the alias bridge keeps pre-v2 cached apps rendering. Dependency root for all v2.0 phases. (completed 2026-06-26)
- [x] **Phase 15: Window Manager** — Apps open as draggable glass windows with z-order, focus, minimize, close, and no React root leaks. (completed 2026-06-26)
- [x] **Phase 16: Desktop Shell** — The desktop surface, animated wallpaper, dock (with running indicators and the launcher icon), and menu bar (wordmark, active-app name, clock) replace the flat storefront as the root UI. (completed 2026-06-27)
- [x] **Phase 17: Search / Launcher Panel** — A dock-launched panel lets the user describe an app or pick a pre-installed one; results open as windows on the desktop via the real produce loop. (completed 2026-06-26)
- [x] **Phase 18: Theme-Aware Generation** — All produce-prompt branches mandate the CSS-var contract; a post-compile static check feeds violations into the self-heal loop; model-supplied names are sanitized; the CI lexicon gate covers all new surfaces. (completed 2026-06-26)

</details>

### v3.0 Trusted Desktop (Phases 19–22)

- [ ] **Phase 19: Window Chrome & Menu Relocation** - Relocate the `⋮` contextual menu into the window titlebar (right-aligned), add maximize/snap/keyboard shortcuts; hard prerequisite for all iframe work.
- [ ] **Phase 20: Opaque-Origin Frame Isolation** - Convert each app body to `<iframe sandbox="allow-scripts">` brokered by `postMessage`; the API key never enters the frame; 727 RTL tests remain green via in-tree fallback.
- [ ] **Phase 21: Desktop Persistence** - Restore window geometry, z-order, open-app set, and minimized state across reloads using additive keys in the existing IDB `settings` store; no DB version bump.
- [ ] **Phase 22: Theme Editor & Custom Themes** - Create, name, edit, and save custom themes over the 12-var contract; custom themes appear in the menu-bar switcher and survive reload FOUC-free.

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

> **Archived.** Full phase details for Phases 14–18 are in [milestones/v2.0-ROADMAP.md](./milestones/v2.0-ROADMAP.md).

### Phase 14: Theme Foundation (COMPLETE — 5/5 plans — 2026-06-26)
### Phase 15: Window Manager (COMPLETE — 4/4 plans — 2026-06-26)
### Phase 16: Desktop Shell (COMPLETE — 4/4 plans — 2026-06-27)
### Phase 17: Search / Launcher Panel (COMPLETE — 4/4 plans — 2026-06-26)
### Phase 18: Theme-Aware Generation (COMPLETE — 4/4 plans — 2026-06-26)

---

## v3.0 Trusted Desktop — Phase Details

### v3.0 cross-cutting acceptance constraints (binding on every phase 19–22)

Carried forward from v1.0–v2.0 and extended for v3.0 — these are acceptance criteria on every phase, not separate phases:

- **HYGIENE-01..06** — no devtools-visible surface narrates the on-demand mechanic; the banned token family applies; the CI lexicon gate (`hygiene.test.ts`) must stay green across `src/**` + `index.html` + srcdoc template strings + postMessage field names + IDB keys. Extended in Phase 20 to all new v3.0 files (HYGIENE-07).
- **Key never enters the frame** — `buildSrcdoc(transpiledJS, themeVars, parentOrigin)` is type-enforced with no other parameters accepted; CI-tested at every phase after Phase 20.
- **Zero new npm runtime dependencies** — Playwright is permitted as a devDependency for SANDBOX-05 only; nothing enters the runtime bundle.
- **IoC / DI** — new components reach the test suite via the `in-tree` fallback mode via `ServicesProvider`; no live network in any test.
- **`build.sourcemap: false`** + minify in prod; CSP `connect-src 'self' api.anthropic.com` (frames never call Anthropic directly).
- **Additive IDB only** — new keys (`"windowLayout"`, `"customTheme:<name>"`) in the existing `settings` store; no DB version bump, no migration.
- **FOUC script / CSP hash invariant** — any change to the `index.html` FOUC script must be accompanied by a SHA-256 hash update in `csp.test.ts` in the same commit.
- **The words "iframe", "sandbox", "isolation"** must not appear in any user-visible copy, error message, or devtools-visible surface — enforced by the extended lexicon gate (HYGIENE-07).

---

### Phase 19: Window Chrome & Menu Relocation

**Goal**: The window titlebar owns all host-controlled actions — the `⋮` contextual menu lives in the titlebar chrome, not the app body — and the window gains maximize, snap, and keyboard shortcuts; completing this phase makes the app body a chrome-free zone ready to become an opaque frame.

**Depends on**: Phase 18 (v2.0 complete; `WindowFrame`, `AppShell`, `useWindowManager` exist)

**Requirements**: CHROME-01, CHROME-02, CHROME-03, CHROME-04

**Success Criteria** (what must be TRUE):
  1. A user clicks the `⋮` button in the window titlebar (right of the traffic lights) and the contextual modify/clone/remove prompt opens — the in-body app-shell header with its `⋮` is gone; MOD-01 through MOD-04 all still work.
  2. A user double-clicks the titlebar (or presses `Cmd/Ctrl+Z` maximize shortcut) and the window zooms to fill the work area between menu bar and dock — not OS full-screen, dock and menu bar remain visible; double-clicking again restores the prior geometry.
  3. A user drags a window to the left or right screen edge, sees a translucent drop-zone preview, releases, and the window snaps to that half; pressing `Ctrl+Left` or `Ctrl+Right` snaps the active window to the corresponding half without a drag.
  4. Pressing `Cmd/Ctrl+W` closes the active window and pressing `Cmd/Ctrl+M` minimizes it — the browser tab is never accidentally closed (`preventDefault` confirmed by a test that asserts `event.defaultPrevented`).
  5. All prior 727 tests remain green; the hygiene gate passes; no new runtime npm dependencies.

**Risks / Notes**:
  - CHROME-01 is the hard prerequisite for all of Phase 20 — once the app body becomes an opaque frame, no mechanism exists to inject host chrome from outside (`createPortal` across an opaque-origin iframe boundary requires `allow-same-origin`, which must never be set). Do not proceed to Phase 20 until this gate is confirmed by the MOD-01..04 test suite.
  - Snap preview requires a translucent overlay rendered by `DesktopShell` — coordinate with the existing `useDrag` pointer-capture rAF loop to detect edge proximity without breaking existing drag behavior.
  - Maximize must target the work area (`100vh - menuBarHeight - dockHeight`), not OS full-screen. Hard-code as a constraint; OS full-screen is permanently excluded.

**Plans**: TBD
**UI hint**: yes

---

### Phase 20: Opaque-Origin Frame Isolation

**Goal**: Each app body runs inside `<iframe sandbox="allow-scripts">` at an opaque origin — the API key is structurally unable to enter the frame, generated code cannot reach `localStorage`, and every app↔host interaction is brokered by typed `postMessage` RPC; all 727 existing tests remain green via the in-tree fallback, and a Playwright integration test proves the real round-trip.

**Depends on**: Phase 19 (CHROME-01 gate confirmed; `⋮` is host-owned chrome before any app body becomes a frame)

**Requirements**: SANDBOX-01, SANDBOX-02, SANDBOX-03, SANDBOX-04, SANDBOX-05, SANDBOX-06, HYGIENE-07

**Success Criteria** (what must be TRUE):
  1. A user opens any app and it renders inside a sandboxed frame — the app is fully interactive (buttons, inputs, handlers work) and the user sees no visual difference from the pre-Phase-20 experience; the frame renders with correct theme colors on first paint.
  2. From inside the frame, reading `localStorage` throws a `SecurityError` — a Playwright test asserts this. A CI test asserts the mounted iframe `sandbox` attribute never contains the string `"allow-same-origin"`.
  3. A CI test asserts that `iframeEl.getAttribute('srcdoc')` does not match the pattern `/sk-ant/` — the API key can never be baked into the srcdoc template. A forged `postMessage` from an unknown `source` (not the live frame's `contentWindow`) is dropped without error — a Playwright test confirms.
  4. Switching themes re-skins all open app frames live, in lockstep with the host chrome — a Playwright test drives a theme switch while two apps are open and asserts that both frames' `:root` CSS vars update.
  5. All 727 prior RTL/JSDOM tests pass without a real browser (the `in-tree` fallback mode, injected via `ServicesProvider`, is active in the test environment).
  6. An app that stops responding triggers a visible overlay (not a blank window) with a force-close action — the rest of the desktop remains usable; a test confirms the overlay appears after the ping timeout.

**Risks / Notes** (all seven critical pitfalls from SUMMARY.md):
  - **Pitfall 1 — `allow-same-origin` + `allow-scripts` destroys the sandbox**: If both are set, the frame's scripts can call `window.frameElement.removeAttribute('sandbox')`, escaping all isolation. Use exactly `sandbox="allow-scripts"` — no exceptions ever. CI test must assert `!sandboxAttr.includes("allow-same-origin")`.
  - **Pitfall 2 — API key leaking into the frame**: Three vectors: (a) srcdoc-building function inadvertently receiving the `services` graph; (b) `postMessage` init payload including config built from the settings store; (c) error messages echoing raw handler input containing key material. Prevention: `buildSrcdoc(transpiledJS: string, themeVars: Record<string,string>, parentOrigin: string)` — type signature accepts no other parameters.
  - **Pitfall 3 — Missing `event.source` check**: Checking `event.origin` alone is insufficient. Correct guard for opaque-origin frames: `event.origin === "null" && event.source === knownIframeContentWindow`. Use `crypto.randomUUID()` for correlation IDs; namespace the pending-callback map by `[frameId, correlationId]`.
  - **Pitfall 4 — CSS custom properties do not cross the iframe boundary**: The frame has its own `:root`. Bake 12 theme vars into the srcdoc `<style>` block at construction. On every `setTheme()` call, `broadcastTheme(vars)` sends `postMessage({ type: 'THEME_PUSH', vars }, "*")` to all registered frame `contentWindow` references.
  - **Pitfall 5 — `⋮` must be host-owned before iframe work**: Completed in Phase 19. Do not begin Phase 20 until the Phase 19 MOD-01..04 gate is confirmed.
  - **Pitfall 6 — `postMessage` to opaque-origin frames uses `"*"` as targetOrigin**: Sending to the string `"null"` does not work — the browser blocks it. Use `"*"` for parent-to-frame messages; audit that no payload contains key-adjacent data. Frame-to-parent messages use the injected `parentOrigin` (real host origin).
  - **Pitfall 7 — React 19 has no UMD builds**: Inline React CJS from `node_modules` as IIFEs assigning `window.React` / `window.ReactDOM`. Total per-frame srcdoc string ~553KB. Store the template as a module-level constant so it is built once and reused across all frame instances.
  - **Known limitation — infinite-loop frame cannot be `terminate()`d**: An iframe cannot be killed like a Worker. SANDBOX-06 mitigates with a ping/timeout/overlay/force-close; document explicitly that the loop continues in the orphaned frame until it is force-closed.
  - **New test category — Playwright**: This is the first phase requiring a real browser for integration tests. Playwright is permitted as a devDependency; the decision on test infrastructure (Playwright vs another browser-native approach) must be made at the start of Phase 20 planning.

**Plans**: TBD
**UI hint**: yes

---

### Phase 21: Desktop Persistence

**Goal**: When a user reloads the page, the desktop they left is restored — every open window appears at its saved position, geometry, and z-order, and previously opened apps come back through the cache-hit path without triggering the produce gate.

**Depends on**: Phase 19 (Phase 20 is independent at the data-model level; can begin immediately after Phase 19 completes — does not need to wait for Phase 20)

**Requirements**: PERSIST-01, PERSIST-02, PERSIST-03

**Success Criteria** (what must be TRUE):
  1. A user opens 3 apps, moves them to different positions, then reloads — all 3 windows reappear at their saved positions, with correct z-order and minimized state, using fresh `instanceId`s minted at restore time.
  2. Dragging a window 50+ times does not cause 50 IDB writes — a test confirms that only 1 write (debounced, ~300ms trailing) lands in the `settings` store per drag sequence, preventing a write-storm.
  3. An app that was evicted from the cache and cannot be re-resolved on restore opens as a placeholder with a visible retry action — it never silently spends API quota.
  4. Restoring 5 windows does not throw a produce-gate error — restores are serialized (concurrency-capped at 1–2 concurrent), and all 5 windows complete restore before any produce-gate threshold is reached.
  5. The IDB `settings` store record for `"windowLayout"` contains exactly `{ appType, title, icon, x, y, z, minimized }` per entry — no `instanceId`, no `transpiledJS`, no API key, no Component reference.

**Risks / Notes**:
  - **No DB version bump** — additive keys (`"windowLayout"`, `"openSet"`) are added to the existing `settings` store via `writeRaw(key, value)` / `readRaw(key)`. Do not bump `REGISTRY_DB_VERSION`; no migration path is needed.
  - **Stale `instanceId` on restore** — persisted `instanceId` values are session-scoped UUIDs meaningless to the next session. Always mint a fresh `instanceId` via `windowManager.open()` using the persisted `appType` — never restore a raw `instanceId`.
  - **Multi-tab IDB conflict** — two tabs open during reload may write conflicting `"windowLayout"` values. Last-write-wins via IDB transaction ordering is acceptable for v3.0; document as known multi-tab behavior, not a bug.
  - **No in-app state persisted** — scroll position, form values, and any runtime state of generated apps are intentionally not saved; generated apps have no stable serialization contract. A user returning to an app sees its initial state.

**Plans**: TBD

---

### Phase 22: Theme Editor & Custom Themes

**Goal**: A user can create, name, edit, and save custom themes over the 12-variable contract, see them in the menu-bar switcher alongside the built-ins, and find them waiting after a hard reload — without any Aurora flash on first paint.

**Depends on**: Phase 19 (Phase 20 and Phase 21 are independent at the data-model level; can begin in parallel with Phase 21 or immediately after Phase 19)

**Requirements**: THEME-06, THEME-07, THEME-08, THEME-09, THEME-10

**Success Criteria** (what must be TRUE):
  1. A user opens the theme editor from the menu bar, adjusts color pickers for any of the 12 CSS vars, and sees the desktop re-skin in real time — the live preview mutates `:root` vars without saving.
  2. A user names and saves a custom theme, then sees it appear in the menu-bar theme switcher alongside Aurora, Aero, Aqua, and Noir; selecting it re-skins the host AND all open frames live (via `THEME_PUSH`), identical to a built-in switch.
  3. A user tries to enter an invalid color value in the editor — the value is rejected before any IDB write (`CSS.supports` gate) and the current theme is unchanged.
  4. A user creates a custom theme, reloads the page — the custom theme is still in the switcher, and if it was the active theme, it is applied on first paint with no Aurora flash (the FOUC script reads the mirrored `localStorage` vars; `csp.test.ts` SHA-256 hash is updated in the same commit as the FOUC script change).
  5. A user tries to create a custom theme named `"aurora"` — it is rejected or auto-namespaced to `"custom:aurora"`; the built-in Aurora is still accessible and unmodified. Deleting the currently active custom theme auto-switches to Aurora before the delete completes.
  6. The theme editor shows an inline, non-blocking contrast warning when a text/background pairing falls below WCAG AA — the user can still save; it is advisory, not blocking.

**Risks / Notes**:
  - **FOUC for custom themes** — the FOUC script currently hard-codes the 4 built-in themes. Mirror custom theme vars to `localStorage["vibe.customTheme.<name>"]` at save time; extend the FOUC script to check `localStorage` for the active custom theme if `vibeStored` starts with `"custom:"`. Any FOUC script change requires `csp.test.ts` SHA-256 hash recompute in the same commit (the invariant from Phase 14).
  - **Alpha-color inputs** — `<input type="color">` returns only `#rrggbb` hex. For the `--glass` / `--glass2` vars (which carry alpha), use a dual range+color pattern or accept a text-field input for alpha vars during Phase 22 planning.
  - **Name collision guard** — custom themes use `"custom:<name>"` key namespace in IDB so they can never collide with built-in four names. `sanitizeDisplayName` must be applied to user-supplied theme names before any DOM render or IDB write.
  - **THEME_PUSH to frames** — Phase 22 must call the same `broadcastTheme(vars)` path introduced in Phase 20 when a custom theme is activated. If Phase 21 completes before Phase 20, a stub `broadcastTheme` (no-op) must exist to avoid a runtime error; it becomes live when Phase 20 lands.

**Plans**: TBD
**UI hint**: yes

---

## Progress

**Execution Order:**
v1.0 → v1.1 → v2.0 → v3.0 phases execute in numeric order: 1 → … → 18 → 19 → 20 → 21 → 22

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
| 15. Window Manager | v2.0 | 4/4 | Complete   | 2026-06-26 |
| 16. Desktop Shell | v2.0 | 4/4 | Complete | 2026-06-27 |
| 17. Search / Launcher Panel | v2.0 | 4/4 | Complete | 2026-06-26 |
| 18. Theme-Aware Generation | v2.0 | 4/4 | Complete | 2026-06-26 |
| 19. Window Chrome & Menu Relocation | v3.0 | 0/TBD | Not started | - |
| 20. Opaque-Origin Frame Isolation | v3.0 | 0/TBD | Not started | - |
| 21. Desktop Persistence | v3.0 | 0/TBD | Not started | - |
| 22. Theme Editor & Custom Themes | v3.0 | 0/TBD | Not started | - |

**v1.0 MVP shipped 2026-06-26 — 8 phases, 42/42 active requirements satisfied, 378 tests green.**
**v1.1 Real & Robust shipped 2026-06-26 — 5 phases, 12/12 requirements satisfied, 552 tests green.**
**v2.0 Vibe OS shipped 2026-06-26 — 5 phases, 21/21 requirements satisfied, 727 tests green.**
**v3.0 Trusted Desktop in progress — 4 phases (19–22), 19 requirements.**

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
