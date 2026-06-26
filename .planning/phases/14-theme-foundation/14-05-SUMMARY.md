---
phase: 14-theme-foundation
plan: 05
subsystem: ui
tags: [theming, theme-switcher, app-bar, css-variables, rtl, accessibility]

# Dependency graph
requires:
  - phase: 14-theme-foundation (14-03)
    provides: useVibeTheme() hook + VibeThemeName type + VIBE_THEMES contract in src/ui/VibeThemeProvider.tsx (the setter the selector drives, and the live re-skin it triggers)
  - phase: 14-theme-foundation (14-03)
    provides: VibeThemeProvider mounted in App.tsx so the switcher has context at runtime
  - phase: 14-theme-foundation (settings seam)
    provides: createTestServices({ settingsStore }) + createRecordingSettingsStore double for wrapping the selector in tests
provides:
  - ThemeSelector — a four-pill (Aurora/Aero/Aqua/Noir) switcher wired to useVibeTheme().setTheme, making the named-theme capability visible and interactive now (THEME-01)
  - Live re-skin entry point in the UI — clicking a pill re-applies the theme contract on document.documentElement (THEME-02), verified by a switch-path test
  - Temporary AppBar home for the switcher (Phase 16 relocates it to the menu bar)
affects: [app-bar, theme-switching, phase-16-menu-bar-relocation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static metadata maps (THEME_LABELS / THEME_NAMES) drive the pill list — mirrors the AppBar THEME_META static-map idiom"
    - "Pill active state derived purely from context (theme === name) — no local state; aria-pressed + theme-selector__pill--active both reflect the same predicate"
    - "Additive AppBar mount: new control inserted as first child of app-bar__controls; the existing useTheme/cycleTheme light/dark toggle left completely intact"
    - "Switch-path RTL test asserts the DOM side effect (documentElement --text re-skin) plus localStorage persistence, not just internal state"

key-files:
  created:
    - src/ui/ThemeSelector.tsx
    - src/ui/ThemeSelector.test.tsx
  modified:
    - src/ui/AppBar.tsx
    - src/index.css

key-decisions:
  - "ThemeSelector holds no local state — the active pill is computed from useVibeTheme().theme on every render, so it stays in sync with any theme change (FOUC script, future Phase 16 menu, programmatic setTheme) with no extra wiring"
  - "Pill labels are display-only neutral words (Aurora/Aero/Aqua/Noir) matching the design names; identifiers, classes (theme-selector / theme-selector__pill / --active), and comments are all hygiene-neutral (no banned tokens)"
  - "Mounted as the FIRST child of app-bar__controls (before Account + cycleTheme) and the existing light/dark/system toggle is untouched — purely additive so the 552 tests depending on the old toggle stay green (CONTEXT Decision 8)"
  - "Pill styles use the named-theme contract vars where reasonable (border via var(--bord)) and the host token vars (--color-text-*, --color-accent-primary) for hover/focus/active — kept deliberately minimal since Phase 16 restyles and relocates"
  - "Switch-path test drives a real click through act() and asserts noir's --text (#f5eeff) lands on documentElement — proving the selector → setTheme → applyVibeTheme re-skin chain end to end (THEME-02), not a mocked setter"

patterns-established:
  - "Pattern: a context-backed selector component reads {value, setValue} from a provider hook, renders a static list of pills with className/aria-pressed toggled on (value === item), and is tested by wrapping in the real provider + injected service double and asserting the DOM side effect after a clicked act()"

requirements-completed: [THEME-01, THEME-02]

# Metrics
duration: ~5min
completed: 2026-06-26
---

# Phase 14 Plan 05: ThemeSelector Switcher in AppBar Summary

**A temporary four-pill theme switcher (`ThemeSelector` — Aurora/Aero/Aqua/Noir) is now mounted in the AppBar controls and wired to `useVibeTheme().setTheme`, making the named-theme capability visible and interactive today (THEME-01); clicking a pill drives `setTheme`, which re-applies the theme's CSS custom properties on `document.documentElement` for a live re-skin (THEME-02) — proven by a switch-path RTL test that clicks Noir and asserts `--text` becomes `#f5eeff` on the document root.**

## What Was Built

1. **`src/ui/ThemeSelector.tsx`** (new component):
   - imports `useVibeTheme` + `type VibeThemeName` from `VibeThemeProvider`
   - `THEME_LABELS: Record<VibeThemeName, string>` = {aurora:"Aurora", aero:"Aero", aqua:"Aqua", noir:"Noir"}
   - `THEME_NAMES: ReadonlyArray<VibeThemeName>` = ["aurora","aero","aqua","noir"] (render order)
   - renders `<div className="theme-selector" role="group" aria-label="Color theme">` mapping `THEME_NAMES` to `<button type="button">` pills; each pill's className toggles `theme-selector__pill--active`, `aria-pressed={theme === name}`, `onClick={() => setTheme(name)}`
   - no local state — active pill derived from context on every render

2. **Pill styles** (`src/index.css`): minimal `.theme-selector` (inline flex row), `.theme-selector__pill` (rounded pill, border via `var(--bord)` from the theme contract, host text-secondary color), `:hover` / `:focus-visible` affordances using `--color-accent-primary`, and `.theme-selector__pill--active` (text-primary + accent border + tertiary background). Neutral comments noting the Phase 16 restyle.

3. **`src/ui/ThemeSelector.test.tsx`** (new, 3 cases): wraps the selector in `ServicesProvider services={createTestServices({ settingsStore: createRecordingSettingsStore() })}` → `VibeThemeProvider` (reusing the Plan-03 wrapping). Covers:
   - renders exactly four pills labeled Aurora/Aero/Aqua/Noir
   - only the current theme's pill has `aria-pressed="true"`, others `"false"`
   - **switch path**: clicking the Noir pill via `act()` flips its `aria-pressed` to true, sets `document.documentElement.style.getPropertyValue("--text")` to noir's `#f5eeff`, and persists `marketplace.osTheme = "noir"`
   - `beforeEach` clears localStorage + resets `documentElement.style.cssText`; `afterEach` runs `cleanup()` + resets the style.

4. **AppBar mount** (`src/ui/AppBar.tsx`): added `import { ThemeSelector } from "./ThemeSelector"` and rendered `<ThemeSelector />` as the FIRST child inside the existing `<div className="app-bar__controls">`, before the Account and cycleTheme buttons, with a neutral comment noting Phase 16 relocates it to the menu bar. The existing `useTheme`/`cycleTheme` light/dark/system toggle is untouched — purely additive.

## Verification

All gates passed:

- `npx vitest run src/ui/ThemeSelector.test.tsx` → 3/3 passed
- `npx vitest run src/ui/` → 13 files, 59 tests passed (AppBar + all UI tests green after the additive change)
- `grep -c "<ThemeSelector" src/ui/AppBar.tsx` → 1 (≥ 1)
- `cycleTheme`/`useTheme` count in AppBar.tsx → 3 (the existing toggle is intact)
- `npx tsc --noEmit` → exit 0
- `npx vitest run src/hygiene.test.ts` → 2/2 passed (all new identifiers/classes/comments hygiene-neutral)

## Deviations from Plan

None - plan executed exactly as written. Both tasks landed in two coherent test+impl commits.

## Commits

- `6b53bf5` feat(14-05): add ThemeSelector four-pill switcher with switch-path test
- `bfce87b` feat(14-05): mount ThemeSelector in AppBar controls (temporary home)

## Notes for Phase 16

- `ThemeSelector` is self-contained and context-backed — relocating it to the menu bar is a move of the `<ThemeSelector />` JSX node plus a restyle of the `.theme-selector*` classes; no logic change required.
- The active-pill predicate (`theme === name`) reads live context, so the switcher will reflect any theme change source (FOUC first paint, programmatic `setTheme`, the new menu) automatically once relocated.

## Self-Check: PASSED

- FOUND: src/ui/ThemeSelector.tsx
- FOUND: src/ui/ThemeSelector.test.tsx
- FOUND: .planning/phases/14-theme-foundation/14-05-SUMMARY.md
- FOUND commit: 6b53bf5 (Task 1)
- FOUND commit: bfce87b (Task 2)
- FOUND: `<ThemeSelector` mounted in src/ui/AppBar.tsx
