# Requirements: Vibe App Store — Milestone v2.0 "Vibe OS"

**Defined:** 2026-06-26
**Milestone goal:** Transform the flat storefront into a themeable, multi-window **Vibe OS desktop** — apps open as draggable glass windows sharing one chrome, several at once, managed by a dock and menu bar; a **dock-launched search/launcher panel** (search/describe an app + a pre-installed apps list) replaces the flat grid and places found apps on the desktop; and a switchable, locally-persisted 4-theme system re-skins the entire OS — host chrome and every open app — at a click.

Requirements continue the v1.0/v1.1 REQ-ID families. All v1.0/v1.1 cross-cutting constraints (HYGIENE-01..05 devtools illusion, single Anthropic egress, sourcemaps-off, CSP allowlist, IoC/DI, TDD with real captured-Haiku fixtures, additive DB migrations) remain in force on every requirement below. **Design reference:** `design/VibeOS.dc.html` — structure/visual language only; wording is a free variable. **Research:** `.planning/research/SUMMARY.md`.

---

## v2.0 Requirements

### WIN — Windowing system

> Apps open as draggable glass windows, several at once, managed by a dock + menu bar. (Research: `ARCHITECTURE.md` window-manager/mount integration; `PITFALLS.md` drag/z-order/root-leak.)

- [ ] **WIN-01**: An opened app renders inside a draggable **window** with a shared glass chrome and a macOS-style titlebar (traffic-light close/minimize controls + app icon + title) — the same frame for every app.
- [ ] **WIN-02**: Multiple apps are open **concurrently** as independent windows, each mounted in its own React root; the active window's app name shows in the menu bar.
- [ ] **WIN-03**: Pointer-down on a window **raises** it to front (z-order) and makes it active; dragging the titlebar moves it, **clamped** to the viewport; new windows **cascade**-place.
- [ ] **WIN-04**: A window can be **minimized** to the dock and **restored**.
- [ ] **WIN-05**: A window can be **closed**, fully unmounting its app — no leaked React root, timer, or listener (close routes through the manager that calls `unmountApp`).
- [ ] **WIN-06**: A bottom **dock** shows opened apps with a running indicator (clicking opens/restores; hover-scale) **and a search (magnifier) icon** that opens the search/launcher panel (CREATE-01).
- [ ] **WIN-07**: A top **menu bar** shows the OS wordmark, the active app's name, and a live clock.
- [ ] **WIN-08**: The **desktop surface** is the workspace where apps live — apps launched from the search/launcher panel are placed here (opened as windows and added to the dock); the surface carries the themed wallpaper.

### THEME — Themeable shell

> A named-theme registry of CSS-variable sets, switchable live, persisted, applied to host **and** apps. (Research: `STACK.md` extend ThemeProvider, zero deps; `PITFALLS.md` documentElement/FOUC/alias-bridge.)

- [ ] **THEME-01**: Four built-in themes (**Aurora / Aero / Aqua / Noir**) are selectable from an always-visible switcher in the menu bar.
- [ ] **THEME-02**: Switching the theme **re-skins host chrome AND every open app window live** — no reload, no remount.
- [ ] **THEME-03**: The active theme **persists** across reloads and is restored on first paint with **no flash** of the wrong theme (FOUC-safe).
- [ ] **THEME-04**: Themes apply as CSS custom properties on the **document root**, so the styling reaches every app window's independently-mounted subtree.
- [ ] **THEME-05**: A backward-compat **alias bridge** maps prior style variables to the new theme contract so apps cached **before v2.0** still render correctly after the new variables land.

### CREATE — Search / launcher panel (find or describe → desktop)

> A dock-launched panel that unifies browse + create: search/describe an app or pick a pre-installed one; results land on the desktop. Replaces the flat storefront grid. (Research: `FEATURES.md` create-panel states; `PITFALLS.md` hygiene on new copy.)

- [ ] **CREATE-01**: A **search (magnifier) icon in the dock** opens a **search/launcher panel** containing a text input + action button and a list of **pre-installed apps**.
- [ ] **CREATE-02**: Submitting a description **finds-or-produces** the app via the existing resolve→produce→cache→mount loop (cache hit = instant; miss = produced) with **idle / working / result** states — the working state is a real loading affordance over **genuine** production (never faked, never naming the mechanic) — and the result is **placed on the desktop surface** as a window.
- [ ] **CREATE-03**: Selecting a **pre-installed app** from the panel's list opens it on the desktop; launched apps appear in the dock as installed/running. No surface in the flow names the mechanic.

### TGEN — Theme-aware generation

> Produced apps reference the theme contract so they re-skin for free. The load-bearing, novel piece. (Research: `ARCHITECTURE.md` buildPrompt update; `PITFALLS.md` hardcoded-colors + name-sanitization.)

- [ ] **TGEN-01**: Produced apps/widgets **reference the theme variable contract** (accents, text, glass, border, …) instead of hardcoded colors, so they re-skin automatically on theme switch.
- [ ] **TGEN-02**: A **post-compile static check** detects hardcoded colors in produced code and feeds violations into the existing **compile-error self-heal loop** — no extra round-trips beyond the shipped resilience budget.
- [ ] **TGEN-03**: Model-supplied app names/text rendered in chrome (titlebar, dock, menu bar) are **sanitized** so no banned-lexicon token can reach a visible surface.

### Cross-cutting acceptance constraints (every phase — not standalone phases)

- [ ] **HYGIENE-06**: The CI lexicon gate is **extended to all new v2.0 surfaces/files** (window chrome, dock, menu bar, create panel) plus the sanitization of model-supplied display strings (TGEN-03).
- [ ] **PERF-01**: With several windows open plus the animated wallpaper, the desktop stays responsive — **minimized windows don't composite**, and blur/animation **degrade** under `prefers-reduced-motion` / weak-GPU conditions.
- The FOUC theme script's SHA-256 hash stays in sync with `csp.test.ts` (same-commit invariant). All v1.0/v1.1 constraints (HYGIENE-01..05, single egress, sourcemaps-off, CSP allowlist, IoC/DI, TDD) remain binding.

---

## Future Requirements (deferred beyond v2.0)

- **User-created / custom themes** — built-in four only this milestone; a theme editor (and persisting custom themes in the IDB `settings` store) is a v2.x follow-up.
- **Window-position / desktop-layout persistence** — restoring exact window geometry and the `installed[]` dock across reloads; deferred (active-theme persistence ships, layout doesn't).
- **HARD-01 `<iframe sandbox>` isolation** + **SEC-01/02/03** — security still deferred; the windowing/theming layer is designed so the iframe move stays a contained change later.
- **G2 unified `Intent` contract** — internal refactor, no user-facing value.

## Out of Scope (explicit exclusions, with reasoning)

- **Window resize handles** — break fixed-width generated app layouts; the glass windows are content-sized.
- **Maximize / fullscreen** — conflicts with the partial-glass desktop aesthetic.
- **Snap / tiling / multi-desktop** — over-engineered for widget-scale apps; not the product.
- **Any application server / sync** — the desktop, registry, and theming are all client-only; no backend.
- **Naming the mechanic** — no AI/LLM/generate/synthesize/fake/mock in any visible or devtools surface (the create surface is allowed; naming the mechanic is not); no streamed source as a progress affordance.
- **A drag/animation/CSS-in-JS library** — research verdict is hand-roll, zero new npm deps.

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| THEME-01 | Phase 14 — Theme Foundation | Pending |
| THEME-02 | Phase 14 — Theme Foundation | Pending |
| THEME-03 | Phase 14 — Theme Foundation | Pending |
| THEME-04 | Phase 14 — Theme Foundation | Pending |
| THEME-05 | Phase 14 — Theme Foundation | Pending |
| WIN-01 | Phase 15 — Window Manager | Pending |
| WIN-02 | Phase 15 — Window Manager | Pending |
| WIN-03 | Phase 15 — Window Manager | Pending |
| WIN-04 | Phase 15 — Window Manager | Pending |
| WIN-05 | Phase 15 — Window Manager | Pending |
| WIN-06 | Phase 16 — Desktop Shell | Pending |
| WIN-07 | Phase 16 — Desktop Shell | Pending |
| WIN-08 | Phase 16 — Desktop Shell | Pending |
| PERF-01 | Phase 16 — Desktop Shell | Pending |
| CREATE-01 | Phase 17 — Search / Launcher Panel | Pending |
| CREATE-02 | Phase 17 — Search / Launcher Panel | Pending |
| CREATE-03 | Phase 17 — Search / Launcher Panel | Pending |
| TGEN-01 | Phase 18 — Theme-Aware Generation | Pending |
| TGEN-02 | Phase 18 — Theme-Aware Generation | Pending |
| TGEN-03 | Phase 18 — Theme-Aware Generation | Pending |
| HYGIENE-06 | Phase 18 — Theme-Aware Generation | Pending |

**Coverage:** 21/21 requirements mapped across 5 phases. Cross-cutting constraints (HYGIENE-01..05, single egress, sourcemaps-off, CSP, IoC/DI, TDD, additive DB migrations, FOUC-script/CSP-hash invariant) apply to all phases.
