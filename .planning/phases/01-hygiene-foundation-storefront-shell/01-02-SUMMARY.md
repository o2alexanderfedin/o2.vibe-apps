---
phase: 01-hygiene-foundation-storefront-shell
plan: 02
subsystem: ui
tags: [react, theme, css-variables, matchmedia, storefront, lucide, key-dialog, error-boundary, skeleton, accessibility]

# Dependency graph
requires:
  - "01-01: CSS variable contract on :root[data-theme], STORAGE_KEY_API/STORAGE_KEY_THEME constants, gated logger, FOUC script, matchMedia test stub"
provides:
  - "ThemeProvider runtime theme switching (light/dark/system) with data-theme application + matchMedia change subscription; useTheme hook"
  - "Storefront grid (Marketplace) rendering APP_REGISTRY with SHELL-02 Opening… stub"
  - "AppBar: wordmark + Account button (opens KeyDialog) + 3-way theme toggle"
  - "KeyDialog set/change/clear flows with sk-ant- validation, neutral copy, focus trap, Escape"
  - "APP_REGISTRY static catalog of 8 neutral app types (cache-key inputs for Phase 2)"
  - "SkeletonCard + ErrorBoundary Phase-1 stubs for Phase 2/3"
  - "Full App.tsx tree: ThemeProvider > ErrorBoundary > AppBar + Marketplace, registry init preserved"
affects:
  - "Phase 2: generated apps inherit CSS variables from :root; APP_REGISTRY ids become resolve/cache-key inputs"
  - "Phase 2: ErrorBoundary stub becomes the compilation/runtime error container"
  - "Phase 3: SkeletonCard stub becomes the cache-miss loading state"
  - "Plan 04: hygiene.test.ts will scan all files produced here for banned tokens"

# Tech tracking
tech-stack:
  added:
    - "@testing-library/dom@^10 (devDep — missing peer of @testing-library/react@16, required for render())"
  patterns:
    - "Theme owner split: inline FOUC script owns first paint; ThemeProvider owns every runtime switch"
    - "matchMedia subscription via addEventListener('change') (not deprecated addListener); cleaned up on unmount/mode-change"
    - "Icon-key (neutral string) in data layer mapped to Lucide component in render layer (Record<id, LucideIcon>)"
    - "Storage keys always referenced via STORAGE_KEY_* constants — no hardcoded localStorage literals in UI"
    - "API key never passed to logger.* and never echoed in error strings (fixed neutral literal)"

key-files:
  created:
    - src/ui/ThemeProvider.tsx
    - src/ui/theme.test.tsx
    - src/data/appRegistry.ts
    - src/ui/Marketplace.tsx
    - src/ui/AppBar.tsx
    - src/ui/KeyDialog.tsx
    - src/ui/SkeletonCard.tsx
    - src/ui/ErrorBoundary.tsx
  modified:
    - src/App.tsx
    - src/index.css
    - package.json
    - package-lock.json

key-decisions:
  - "Added @testing-library/dom as explicit devDep — @testing-library/react@16 declares it as a peer (not bundled); Plan 01 added the react helper but no test exercised render() so the missing peer surfaced here"
  - "AppBar built entirely in Task 2 (finalized) with theme-toggle consuming useTheme from ThemeProvider; Task 1 shipped ThemeProvider + AppBar CSS only — avoids a half-built AppBar committed mid-plan"
  - "Theme-toggle current icon always carries app-bar__icon-btn--active so the displayed mode reads as the active selection (accent color)"
  - "KeyDialog focus trap implemented inline via querySelectorAll on Tab keydown rather than a dependency"

requirements-completed: [SHELL-01, SHELL-02, SHELL-03, SHELL-04, HYGIENE-01]

# Metrics
duration: 7min
completed: 2026-06-24
---

# Phase 01 Plan 02: Storefront Shell Summary

**The full interactive storefront slice — light/dark/system ThemeProvider (data-theme + matchMedia), an 8-card Marketplace grid with the SHELL-02 Opening… stub, an AppBar (wordmark + Account + 3-way theme toggle), and a three-flow KeyDialog with sk-ant- validation — wired into App.tsx over the Walking Skeleton; 22/22 tests green, tsc clean, production build emits no sourcemaps.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-24T22:41:25Z
- **Completed:** 2026-06-24T22:48:50Z
- **Tasks:** 3
- **Files created:** 8 (+ 4 modified)

## Accomplishments

- **Theme system (SHELL-04, TDD):** `ThemeProvider` holds `mode: light|dark|system` (default `system`), applies `data-theme` on `:root`, resolves `system` via `window.matchMedia("(prefers-color-scheme: dark)")`, and subscribes to OS changes with `addEventListener("change", …)` (cleaned up on unmount/mode-change). `cycleTheme()` advances light→dark→system→light and persists via `STORAGE_KEY_THEME`. Six `theme.test.tsx` cases prove application, persistence, system resolution, and live re-application.
- **Storefront grid (SHELL-01/02):** `Marketplace` renders `.storefront-grid` with one `<button>.app-card` per `APP_REGISTRY` row (8 neutral app types), each with `aria-label="{name} — {description}"` and an `aria-hidden` 32px Lucide icon. Clicking shows an inline `Opening…` affordance for ~800ms then resets (no real loop) and logs only neutral product copy via the gated logger.
- **AppBar (SHELL-03/04):** `<header role="banner">` with the "Marketplace" wordmark, an Account button (opens KeyDialog), and a 3-way theme toggle (Sun/Moon/Monitor) whose `aria-label` communicates the NEXT action.
- **KeyDialog (SHELL-03):** `role="dialog" aria-modal="true"` modal with three flows — Set (`Connect your account`, `type="password"` access-key input, `Connect` CTA), Change (`Account connected` with `CheckCircle2`, `Change key`/`Disconnect`), and inline Disconnect confirmation. Validates `^sk-ant-`, shows the exact neutral format error without echoing the entered value, persists/clears via `STORAGE_KEY_API`, and never passes the key to the logger. Focus trap + Escape + first-element focus on open.
- **Phase-1 stubs:** `SkeletonCard` (shimmer blocks, `aria-label="Loading"`, `aria-busy`, visually-hidden `role="status"` `Opening…` region) and a neutral `ErrorBoundary` class component (`Something went wrong` / `Try again`, technical errors swallowed) — both compile and are ready for Phase 2/3.
- **App.tsx wiring:** Replaced the Walking Skeleton with `ThemeProvider > ErrorBoundary > (AppBar + main>Marketplace)`, KeyDialog open/close state lifted to App, and the Plan-01 `dbReady` registry-init `useEffect` preserved.

## Task Commits

1. **Task 1 — Theme system (TDD):** `9f25ff3` (test, RED) + `a984aaf` (feat, GREEN)
2. **Task 2 — Storefront grid + AppBar Account + KeyDialog:** `eeea266` (feat)
3. **Task 3 — Stubs + App.tsx wiring:** `b00efaf` (feat)

## Files Created/Modified

- `src/ui/ThemeProvider.tsx` — context provider; data-theme application, matchMedia subscription, `cycleTheme`, `useTheme` hook
- `src/ui/theme.test.tsx` — 6 tests covering all `<behavior>` bullets
- `src/data/appRegistry.ts` — `APP_REGISTRY` of 8 neutral app types (exact UI-SPEC copy)
- `src/ui/Marketplace.tsx` — `.storefront-grid` of `.app-card` buttons; icon-key→Lucide map; SHELL-02 Opening… stub
- `src/ui/AppBar.tsx` — wordmark + Account button + 3-way theme toggle
- `src/ui/KeyDialog.tsx` — set/change/clear flows, sk-ant- validation, focus trap, Escape
- `src/ui/SkeletonCard.tsx` — Phase-3 loading stub
- `src/ui/ErrorBoundary.tsx` — Phase-2 error container stub
- `src/App.tsx` — full tree, registry init preserved
- `src/index.css` — `.app-bar*`, `.storefront-grid`, `.app-card*`, `.key-dialog*`, `.skeleton-card*`, `.error-boundary-fallback*` per UI-SPEC dimensions/colors
- `package.json` / `package-lock.json` — `@testing-library/dom@^10` devDep

## Decisions Made

- **`@testing-library/dom` added as an explicit devDep.** `@testing-library/react@16` declares it as a peer rather than bundling it. Plan 01 installed the react helper but no test called `render()`, so the missing peer went unnoticed until `theme.test.tsx` imported `render`. (See Deviations — Rule 3.)
- **AppBar finalized in Task 2, not split.** Task 1 shipped `ThemeProvider` + the `.app-bar*` CSS only; the complete `AppBar` component (Account + theme toggle consuming `useTheme`) lands in Task 2 so no half-built component is committed mid-plan. The plan explicitly permits this coordination.
- **Theme toggle uses `--active` styling on the current icon** so the displayed mode reads as the active selection (accent color), matching UI-SPEC §2 "active theme icon receives accent".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing `@testing-library/dom` peer dependency**
- **Found during:** Task 1 (running `theme.test.tsx`)
- **Issue:** `@testing-library/react@16` imports from `@testing-library/dom`, which is a peer dependency and was not installed by Plan 01 (no prior test used `render()`). Test suite failed to load with "Cannot find module '@testing-library/dom'".
- **Fix:** `npm install -D @testing-library/dom@^10`.
- **Files modified:** `package.json`, `package-lock.json`
- **Commit:** `a984aaf`

**2. [Rule 1 - Bug] theme.test.tsx accumulated DOM nodes across tests**
- **Found during:** Task 1 (3 of 6 theme tests failed with "Found multiple elements")
- **Issue:** `render()` was not unmounting between cases, so repeated `data-testid="cycle"` buttons accumulated in the jsdom document.
- **Fix:** Added `cleanup()` from `@testing-library/react` in the test `afterEach`.
- **Files modified:** `src/ui/theme.test.tsx`
- **Commit:** `9f25ff3` (test file; cleanup added before the test commit)

## Authentication Gates

None — this plan calls no external services.

## Known Stubs

| Stub | File | Reason / Resolution |
|------|------|---------------------|
| `SkeletonCard` not rendered in live flow | `src/ui/SkeletonCard.tsx` | Intentional Phase-1 stub (UI-SPEC §4). Phase 3 wires it as the cache-miss loading state. Compiles and carries correct a11y. |
| `ErrorBoundary` only renders fallback on thrown error | `src/ui/ErrorBoundary.tsx` | Intentional Phase-1 stub (UI-SPEC §5). Phase 2 relies on it to contain compilation/runtime errors. |
| Card click `Opening…` stub (no real loop) | `src/ui/Marketplace.tsx` | Intentional SHELL-02 stub (D-10). The real resolve→cache→render loop is Phase 2. Neutral copy + neutral logger only. |

All stubs are explicitly scoped by Phase 1's CONTEXT/UI-SPEC and do not block the plan's goal (a browsable, account-connectable, theme-switchable storefront). No data-wiring stubs (the grid renders real static `APP_REGISTRY` data).

## Threat Flags

None. The two trust boundaries in the plan's threat model are honored:
- **API key ↔ storage (T-01-07/08/09):** input is `type="password"`; the entered value is never echoed in the format-error literal; the key is never passed to `logger.*` or placed in an `Error.message`; `^sk-ant-` + non-empty validation gates the save.
- **Copy/CSS ↔ devtools (T-01-10):** all visible copy, class names, and `data-*` use neutral language by construction; spot-grep of the four Task-2 files found no banned token. Full enforcement is Plan 04's `hygiene.test.ts`.

No new security surface beyond the planned key-input and neutral-copy boundaries was introduced.

## Issues Encountered

- Node 23.11.0 emits EBADENGINE warnings for some devDeps (e.g., jsdom@29, whatwg-url) — warnings only; install and tests succeed (carried over from Plan 01).

## Next Phase Readiness

- CSS variable contract is consumed end-to-end; generated apps in Phase 2 inherit `:root` variables.
- `APP_REGISTRY` ids are the initial resolve/cache-key inputs for Phase 2.
- `ErrorBoundary` and `SkeletonCard` stubs are in place for Phase 2/3 to wire to the real loop.
- `ThemeProvider`/`useTheme` are available for any future themed surface.

---

## Self-Check

- [x] `src/ui/ThemeProvider.tsx` exists, calls `setAttribute("data-theme", …)`, uses `addEventListener("change", …)`, default `system`, persists via `STORAGE_KEY_THEME`
- [x] `src/ui/theme.test.tsx` exists — 6/6 pass
- [x] `src/data/appRegistry.ts` exports `APP_REGISTRY` with all 8 ids
- [x] `src/ui/Marketplace.tsx` renders `.storefront-grid` + Opening… stub
- [x] `src/ui/AppBar.tsx`, `src/ui/KeyDialog.tsx`, `src/ui/SkeletonCard.tsx`, `src/ui/ErrorBoundary.tsx` exist
- [x] `src/App.tsx` wires ThemeProvider > ErrorBoundary > AppBar + Marketplace and preserves `dbReady`
- [x] KeyDialog validates `^sk-ant-`, uses `STORAGE_KEY_API`, never passes the key to `logger`
- [x] `npx vitest run` exits 0 (22/22 passing)
- [x] `npx tsc --noEmit` exits 0
- [x] `npx vite build` succeeds with 0 `.map` files in `dist/`
- [x] Commits 9f25ff3, a984aaf, eeea266, b00efaf exist in git log

## Self-Check: PASSED

*Phase: 01-hygiene-foundation-storefront-shell*
*Completed: 2026-06-24*
