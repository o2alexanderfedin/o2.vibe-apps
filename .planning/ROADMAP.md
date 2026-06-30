# Roadmap: Vibe App Store

## Milestones

- ✅ **v1.0 MVP** — Phases 1–8 (shipped 2026-06-26) — full detail archived in [milestones/v1.0-ROADMAP.md](./milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Real & Robust** — Phases 9–13 (shipped 2026-06-26) — full detail archived in [milestones/v1.1-ROADMAP.md](./milestones/v1.1-ROADMAP.md)
- ✅ **v2.0 Vibe OS** — Phases 14–18 (shipped 2026-06-26) — full detail archived in [milestones/v2.0-ROADMAP.md](./milestones/v2.0-ROADMAP.md)
- ✅ **v3.0 Trusted Desktop** — Phases 19–22 (shipped 2026-06-30) — full detail archived in [milestones/v3.0-ROADMAP.md](./milestones/v3.0-ROADMAP.md)
- [ ] **v3.1 Polish & Hardening** — Phases 23–25 (in progress 2026-06-30)

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

<details>
<summary>✅ v3.0 Trusted Desktop (Phases 19–22) — SHIPPED 2026-06-30</summary>

- [x] **Phase 19: Window Chrome & Menu Relocation** (CHROME-01..04) — `⋮` menu into the window titlebar, maximize/snap/keyboard shortcuts; hard prerequisite for all iframe work. (completed 2026-06-27)
- [x] **Phase 20: Opaque-Origin Frame Isolation** (SANDBOX-01..06, HYGIENE-07) — each app body in `<iframe sandbox="allow-scripts">` brokered by `postMessage`; the API key never enters the frame; in-tree fallback + Playwright proves the real round-trip. (completed 2026-06-27)
- [x] **Phase 21: Desktop Persistence** (PERSIST-01..03) — restore window geometry, z-order, open-app set, and minimized state across reloads via additive `settings`-store keys; no DB version bump. (completed 2026-06-30)
- [x] **Phase 22: Theme Editor & Custom Themes** (THEME-06..10) — create/name/edit/save custom themes over the 12-var contract; custom themes appear in the menu-bar switcher and survive reload FOUC-free. (completed 2026-06-30)

</details>

### v3.1 Polish & Hardening (Phases 23–25) — IN PROGRESS

- [x] **Phase 23: Live Frame Re-Skin** — RESKIN-01 — remove `themeVars` from the srcdoc memo deps so theme switches re-skin open opaque frames via `THEME_PUSH` without reloading the iframe; in-frame app state survives. (completed 2026-06-30)
- [ ] **Phase 24: Launcher CSS Polish** — POLISH-01 — glass treatment pass on the 6 SearchLauncherPanel interior classes partially styled by the v3.0 audit-debt fix; visually consistent with the rest of the v3.0 chrome.
- [ ] **Phase 25: Real-Browser Smoke Suite** — SMOKE-01, SMOKE-02, SMOKE-03 — Playwright tests that close the Phase 21/22 `human_needed` gaps: reload restores the desktop, custom theme is FOUC-free on first paint, and a theme switch re-skins open frames live in a real browser.

## Phase Details

> Full phase details for shipped milestones are archived:
> [v1.0](./milestones/v1.0-ROADMAP.md) (Phases 1–8) · [v1.1](./milestones/v1.1-ROADMAP.md) (Phases 9–13) · [v2.0](./milestones/v2.0-ROADMAP.md) (Phases 14–18) · [v3.0](./milestones/v3.0-ROADMAP.md) (Phases 19–22)

---

### Phase 23: Live Frame Re-Skin

**Goal**: Theme switches re-skin every open opaque app frame in place — without reloading the iframe — so in-frame app state is preserved across theme changes.
**Depends on**: Phase 22 (THEME_PUSH postMessage infrastructure already wired; `broadcastTheme(vars)` already exists)
**Requirements**: RESKIN-01
**Success Criteria** (what must be TRUE):
  1. Switching any theme (built-in or custom) while an app is open does not reload the iframe — the frame document is not recreated and no srcdoc re-injection occurs
  2. After a theme switch the open app frame immediately shows the new theme's colors, glass treatment, and accent variables
  3. In-frame app state (scroll position, form input values, counter or timer state) survives a theme switch unchanged
  4. A JSDOM unit test asserts that `themeVars` is absent from the `SandboxFrame` srcdoc memo dependency array
  5. The full existing test suite (935 tests) plus the new unit test all pass; `tsc --noEmit` reports 0 errors
**Plans**: 1 plan
Plans:
- [x] 23-01-PLAN.md — Remove themeVars from srcdoc memo deps; add criterion-#4 spy test (TDD RED->GREEN)

---

### Phase 24: Launcher CSS Polish

**Goal**: The SearchLauncherPanel's interior renders with a full glass treatment matching the rest of the v3.0 chrome across all built-in and custom themes.
**Depends on**: Phase 14 (CSS-var contract) — independent of Phase 23 and Phase 25
**Requirements**: POLISH-01
**Success Criteria** (what must be TRUE):
  1. All six interior classes (`.launcher__search`, `.launcher__input`, `.launcher__open-btn`, `.launcher__working`, `.launcher__chips`, `.launcher__chip`) display the active theme's glass backdrop, border, and background using the 12-var CSS contract
  2. The launcher interior is visually consistent with the window chrome and other glass surfaces across all four built-in themes (Aurora, Aero, Aqua, Noir)
  3. A custom theme's glass variables propagate correctly to all six launcher classes with no hardcoded fallback colors
  4. No new CSS custom properties are introduced; the 12-var contract is unchanged
  5. The full test suite remains green; `tsc --noEmit` reports 0 errors
**Plans**: 1 plan
Plans:
- [ ] 24-01-PLAN.md — Apply glass-var recipe (--glass2/--glass/--hi/--text) to 6 .launcher__* interior classes
**UI hint**: yes

---

### Phase 25: Real-Browser Smoke Suite

**Goal**: The Phase 21 and Phase 22 `human_needed` gaps are permanently closed by automated Playwright tests that run headless in CI.
**Depends on**: Phase 23 (SMOKE-03 verifies RESKIN-01 behavior in a real browser; Phase 23 must complete first so the fix is in place)
**Requirements**: SMOKE-01, SMOKE-02, SMOKE-03
**Success Criteria** (what must be TRUE):
  1. A Playwright test passes: after a hard reload, all previously open windows appear at their saved positions with correct geometry, z-order, and minimized state — the desktop is not blank
  2. A Playwright test passes: with a custom theme active, a hard reload shows the custom theme colors on first paint — no Aurora (default) flash is visible before React hydrates
  3. A Playwright test passes: switching theme while an app is open does not reload the frame, and the new theme colors appear in the frame within one animation frame — in-frame state survives
  4. All three smoke tests run in the CI headless Chromium environment; no `human_needed` annotations remain for these three behaviors
**Plans**: TBD

---

## Progress

**Execution Order:**
v1.0 → v1.1 → v2.0 → v3.0 → v3.1 phases execute in numeric order: 1 → … → 22 → 23 → 24 → 25

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
| 19. Window Chrome & Menu Relocation | v3.0 | 4/4 | Complete   | 2026-06-27 |
| 20. Opaque-Origin Frame Isolation | v3.0 | 5/5 | Complete   | 2026-06-27 |
| 21. Desktop Persistence | v3.0 | 4/4 | Complete   | 2026-06-30 |
| 22. Theme Editor & Custom Themes | v3.0 | 5/5 | Complete   | 2026-06-30 |
| 23. Live Frame Re-Skin | v3.1 | 1/1 | Complete   | 2026-06-30 |
| 24. Launcher CSS Polish | v3.1 | 0/1 | Not started | - |
| 25. Real-Browser Smoke Suite | v3.1 | 0/TBD | Not started | - |

**v1.0 MVP shipped 2026-06-26 — 8 phases, 42/42 active requirements satisfied, 378 tests green.**
**v1.1 Real & Robust shipped 2026-06-26 — 5 phases, 12/12 requirements satisfied, 552 tests green.**
**v2.0 Vibe OS shipped 2026-06-26 — 5 phases, 21/21 requirements satisfied, 727 tests green.**
**v3.0 Trusted Desktop shipped 2026-06-30 — 4 phases (19–22), 19/19 requirements satisfied, 935 tests green.**

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

### v3.1 cross-cutting acceptance constraints (binding on every phase 23–25)

Carried forward from all prior milestones — acceptance constraints, not separate phases:

- **Zero new runtime dependencies** — Playwright is already a devDependency from Phase 20; no new packages may be added to `dependencies` or `devDependencies`.
- **HYGIENE-01..07** — full lexicon gate stays green; the words `iframe`, `sandbox`, `isolation` must not appear in any user-visible or devtools-visible surface; banned token family unchanged.
- **CSP allowlist + FOUC/CSP-hash invariant** — if the FOUC script in `index.html` is touched, `csp.test.ts` hash must be updated in the same commit; `connect-src` stays pinned to self + `api.anthropic.com`.
- **No IDB DB version bump** — `REGISTRY_DB_VERSION` stays at 3; all storage changes use additive `settings`-store keys.
- **Sourcemaps off** — production build ships 0 source maps; no banned token in source comments.
- **Full suite stays green** — every phase exit must pass the full existing test suite (935 baseline) plus any new tests added in that phase; `tsc --noEmit` 0 errors.
- **IoC / DI** — new test code follows the `ServicesProvider` injection pattern; no live network calls in Vitest tests.
