---
phase: 16-desktop-shell
plan: 04
subsystem: ui
tags: [react, css, prefers-reduced-motion, matchMedia, theming, hygiene, vitest]

# Dependency graph
requires:
  - phase: 16-desktop-shell (plan 16-03)
    provides: assembled DesktopShell root, the .desktop-shell__blob + vibeFloat blob layer, the .window-chrome--minimized rule, the menu-bar ThemeSelector
  - phase: 14 (THEME-01)
    provides: VibeThemeProvider + VIBE_THEMES contract (--wall / --text per theme) on document.documentElement
provides:
  - "PERF-01 concrete deliverable: prefers-reduced-motion degrade for the blob layer (CSS media query) + a matchMedia-driven, test-mockable reduced-motion marker on the DesktopShell root with listener cleanup"
  - "Automated theme re-skin acceptance (the phase headline): switching theme changes --wall AND --text on documentElement and matches the target VIBE_THEMES contract"
  - "Automated assertion that minimized windows are display:none (no compositor layer)"
  - "Explicit hygiene-gate coverage of the new Phase-16 surfaces (DesktopShell/Dock/MenuBar/MinimalLauncher/iconForApp)"
affects: [performance-hardening, theming, hygiene, desktop-shell-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "matchMedia seam: read prefers-reduced-motion in an effect (guarded for missing matchMedia), subscribe via addEventListener('change') with an addListener fallback, clean up on unmount, mirror .matches into a root marker class the CSS + tests read"
    - "CSS-from-disk acceptance: tests readFileSync(src/index.css) and isolate a rule/media block to assert the declared degrade, mirroring hygiene.test.ts"

key-files:
  created:
    - src/ui/reducedMotion.test.tsx
    - src/ui/DesktopShellReskin.test.tsx
  modified:
    - src/index.css
    - src/ui/DesktopShell.tsx
    - src/hygiene.test.ts

key-decisions:
  - "Keep the CSS @media (prefers-reduced-motion: reduce) block as the primary, JS-free degrade; the matchMedia-driven .desktop-shell--reduced-motion marker is the test-observable companion (and a hook for future JS degrade paths)."
  - "The media block also targets .desktop-shell--reduced-motion .desktop-shell__blob so the degrade holds whether or not the JS marker is present (belt-and-suspenders)."
  - "Re-skin acceptance asserts BOTH a difference across themes AND equality to the target theme's verbatim VIBE_THEMES values — proves the correct theme applied, not merely that something changed."

patterns-established:
  - "Reduced-motion seam in DesktopShellInner: matchMedia → state → root marker class, with modern + legacy listener APIs and unmount cleanup."
  - "Hygiene-gate explicit coverage assertion: walk(SRC_DIR), normalize to repo-relative paths, assert the new surfaces are in the scanned set."

requirements-completed: [PERF-01, WIN-08]

# Metrics
duration: 4min
completed: 2026-06-27
---

# Phase 16 Plan 04: prefers-reduced-motion degrade + theme re-skin acceptance Summary

**PERF-01 ships its real offline degrade — a `@media (prefers-reduced-motion: reduce)` block disabling the blob animation plus a mockable matchMedia-driven root marker — and the phase headline (a theme switch re-skins the whole desktop) is locked in by an automated assertion that `--wall` and `--text` change across themes and match the VIBE_THEMES contract.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-27T01:58:14Z
- **Completed:** 2026-06-27T02:01:55Z
- **Tasks:** 2 of 3 implemented (Task 3 is a human-verify screenshot checkpoint, deferred to the orchestrator)
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- PERF-01's concrete deliverable: under `prefers-reduced-motion`, the blob animation is turned off (`animation: none`) and the blur widened (CSS media query), with a `matchMedia`-driven `desktop-shell--reduced-motion` marker on the `.desktop-shell` root — subscribed to the live preference and cleaned up on unmount.
- The phase headline is now a hard automated acceptance: clicking the menu-bar Noir pill re-skins `documentElement` so `--wall` AND `--text` both differ from aurora and equal noir's verbatim `VIBE_THEMES` values.
- Minimized windows proven to be `display: none` (no compositor layer) by an assertion reading the rule from `src/index.css`.
- The hygiene gate explicitly covers the new Phase-16 surfaces (`DesktopShell`, `Dock`, `MenuBar`, `MinimalLauncher`, `iconForApp`), so a future path regression that stops scanning them fails loudly (Pitfall 11).
- Full suite green: 633 tests / 79 files, `tsc` 0, production build clean with NO source maps.

## Task Commits

Each task was committed atomically:

1. **Task 1: prefers-reduced-motion degrade (PERF-01) — CSS + matchMedia seam** - `c577e49` (feat)
2. **Task 2: theme re-skin acceptance + minimized display:none + hygiene Phase-16 coverage** - `92ffd41` (test)
3. **Task 3: live viewed-screenshot smoke per theme** - DEFERRED to the orchestrator (checkpoint:human-verify; not run by the executor)

_TDD note: Task 1 followed RED → GREEN in a single feat commit (the failing test and the implementation were committed together as the task unit). Task 2's re-skin/minimized assertions lock in behavior already shipped by plans 14/16-03, so they pass on first write._

## Files Created/Modified
- `src/index.css` - Added the `@media (prefers-reduced-motion: reduce)` block (animation: none + blur(80px) on `.desktop-shell__blob`, also scoped under `.desktop-shell--reduced-motion`).
- `src/ui/DesktopShell.tsx` - Added the `reducedMotion` state + an effect reading `window.matchMedia('(prefers-reduced-motion: reduce)')` (guarded), subscribing with addEventListener/addListener fallback and cleanup, and applying the `desktop-shell--reduced-motion` marker class on the root.
- `src/ui/reducedMotion.test.tsx` - 3 behaviors: matches=true marks the root, matches=false omits it, and the CSS degrade block is asserted from disk.
- `src/ui/DesktopShellReskin.test.tsx` - Re-skin acceptance (aurora → noir: --wall/--text differ AND match the contract) + minimized display:none acceptance.
- `src/hygiene.test.ts` - Added an explicit Phase-16 coverage assertion (walk(SRC_DIR) must include the new surfaces); banned-token set unchanged.

## Decisions Made
- Kept the CSS media query as the primary degrade and the matchMedia marker as the testable JS companion (per CONTEXT decision 6 / Pitfall 4 — GPU frame-timing detection stays deferred).
- The re-skin test asserts difference AND target-contract equality, so it fails if either the live re-skin breaks or the wrong theme is applied.

## Deviations from Plan

None - plan executed exactly as written (Tasks 1 & 2; Task 3 intentionally deferred to the orchestrator per the execution objective).

## Issues Encountered
None.

## Known Stubs
None - no stub/placeholder values introduced; all changes wire real behavior (CSS degrade + matchMedia state) and real assertions.

## User Setup Required
None - no external service configuration required.

## Task 3 (human screenshot smoke) — deferred to the orchestrator

Task 3 is a `checkpoint:human-verify` gate: a live viewed-screenshot smoke comparing the Aurora and Noir desktops (wallpaper + blobs + dock + menu bar + open-window chrome must visibly re-skin, no banned tokens in any devtools surface, no served source maps). The executor does NOT run it — the orchestrator captures and views the two screenshots separately. All automated prerequisites it depends on are green (re-skin + minimized acceptance, full suite, tsc, hygiene gate, and a no-sourcemap production build).

## Next Phase Readiness
- PERF-01 and the theme re-skin headline are proven offline; the only remaining gate is the orchestrator-run visual smoke (Task 3).
- STATE.md / ROADMAP.md updates are owned by the orchestrator (not written here, per the execution objective).

## Self-Check: PASSED

- Created files present: `src/ui/reducedMotion.test.tsx`, `src/ui/DesktopShellReskin.test.tsx` — FOUND.
- Commits present: `c577e49` (Task 1), `92ffd41` (Task 2) — FOUND in git log.
- Verification: `reducedMotion.test.tsx` + `DesktopShellReskin.test.tsx` + `hygiene.test.ts` = 8/8 pass; full suite 633/633; `tsc --noEmit` 0; `npm run build` clean with NO `.map` files.

---
*Phase: 16-desktop-shell*
*Completed: 2026-06-27*
