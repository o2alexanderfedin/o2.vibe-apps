# Roadmap: Vibe App Store

## Milestones

- ✅ **v1.0 MVP** — Phases 1–8 (shipped 2026-06-26) — full detail archived in [milestones/v1.0-ROADMAP.md](./milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Real & Robust** — Phases 9–13 (shipped 2026-06-26) — full detail archived in [milestones/v1.1-ROADMAP.md](./milestones/v1.1-ROADMAP.md)
- ✅ **v2.0 Vibe OS** — Phases 14–18 (shipped 2026-06-26) — full detail archived in [milestones/v2.0-ROADMAP.md](./milestones/v2.0-ROADMAP.md)
- ✅ **v3.0 Trusted Desktop** — Phases 19–22 (shipped 2026-06-30) — full detail archived in [milestones/v3.0-ROADMAP.md](./milestones/v3.0-ROADMAP.md)

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

## Phase Details

> **Archived.** Full phase details for all shipped milestones are in their archives:
> [v1.0](./milestones/v1.0-ROADMAP.md) (Phases 1–8) · [v1.1](./milestones/v1.1-ROADMAP.md) (Phases 9–13) · [v2.0](./milestones/v2.0-ROADMAP.md) (Phases 14–18) · [v3.0](./milestones/v3.0-ROADMAP.md) (Phases 19–22). No milestone is currently in progress — run `/gsd-new-milestone` to start the next one.

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
| 19. Window Chrome & Menu Relocation | v3.0 | 4/4 | Complete   | 2026-06-27 |
| 20. Opaque-Origin Frame Isolation | v3.0 | 5/5 | Complete   | 2026-06-27 |
| 21. Desktop Persistence | v3.0 | 4/4 | Complete   | 2026-06-30 |
| 22. Theme Editor & Custom Themes | v3.0 | 5/5 | Complete   | 2026-06-30 |

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
