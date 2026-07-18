---
phase: 23-live-frame-re-skin
plan: 01
subsystem: ui
tags: [react, usememo, iframe, postmessage, theme, sandboxframe]

# Dependency graph
requires:
  - phase: 20-opaque-origin-frame-isolation
    provides: THEME_PUSH postMessage path and broadcastTheme wiring fully implemented and tested
provides:
  - srcdoc useMemo dep array changed from [transpiledJS, themeVars] to [transpiledJS] in SandboxFrame.tsx
  - RESKIN-01: theme switch no longer reloads the iframe; in-frame React state is preserved
  - JSDOM unit test asserting buildSrcdoc is called exactly once across a themeVars-only rerender
affects: [phase-24, phase-25-smoke-03, any plan that opens/re-skins app frames]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Intentional useMemo dep omission: exclude themeVars from dep array so iframe element is stable; factory closure still captures then-current themeVars at memo re-run time (when transpiledJS changes), preserving first-paint correctness"
    - "Spy injection via makeUtils({ buildSrcdoc: vi.fn() }) for asserting memo dep behavior in JSDOM (where iframe srcDoc changes do not trigger real reloads)"

key-files:
  created: []
  modified:
    - src/ui/SandboxFrame.tsx
    - src/ui/SandboxFrame.test.tsx

key-decisions:
  - "Remove themeVars from srcdoc useMemo dep array (line 114) — iframe element is now stable across theme changes; THEME_PUSH postMessage is the live re-skin mechanism"
  - "No themeVarsRef needed inside the memo — factory closure captures then-current themeVars from the render scope when the memo re-runs on transpiledJS change"
  - "Test strategy: spy on buildSrcdoc via makeUtils injection seam and assert call count stays 1 after themeVars-only rerender — correct proxy for memo dep behavior in JSDOM"
  - "CSP hash in index.html unchanged — buildSrcdoc script body is byte-stable; only the React dep array changed"

patterns-established:
  - "Intentional dep omission pattern: eslint-disable-next-line react-hooks/exhaustive-deps + detailed comment documenting WHY each dep is excluded and which mechanism compensates"

requirements-completed: [RESKIN-01]

# Metrics
duration: 3min
completed: 2026-06-30
---

# Phase 23 Plan 01: Live Frame Re-Skin Summary

**useMemo dep array narrowed from [transpiledJS, themeVars] to [transpiledJS] in SandboxFrame, activating the latent THEME_PUSH re-skin path so theme switches preserve in-frame React state**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-30T09:55:00Z
- **Completed:** 2026-06-30T09:58:00Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- Removed `themeVars` from the srcdoc `useMemo` dependency array in `SandboxFrame.tsx` (one line change + comment update)
- Added JSDOM unit test asserting `buildSrcdoc` is called exactly once across a `themeVars`-only rerender (RESKIN-01 criterion #4)
- Full suite: 936 tests pass (935 baseline + 1 new); tsc 0 errors; frameCsp + csp + hygiene all green; CSP hash in index.html unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing criterion-#4 unit test (RED)** - `f3f3979` (test)
2. **Task 2: Apply dep-array fix and verify full suite green (GREEN)** - `3fb5337` (feat)

**Plan metadata:** committed with SUMMARY

_TDD: RED commit (test) followed by GREEN commit (feat)_

## Files Created/Modified
- `src/ui/SandboxFrame.tsx` - dep array changed from `[transpiledJS, themeVars]` to `[transpiledJS]`; comment updated to document intentional exclusion of both utils and themeVars
- `src/ui/SandboxFrame.test.tsx` - new test "srcdoc memo does NOT rebuild when only themeVars changes (RESKIN-01 criterion #4)" using buildSrcdocSpy via makeUtils injection seam

## Decisions Made
- Remove `themeVars` from dep array only — do not change `buildSrcdoc` signature, `frameMount.ts`, `VibeThemeProvider.tsx`, or `index.html`
- Use factory closure capture (not a new `themeVarsRef`) for first-paint CSS correctness on memo re-runs
- Test via spy call-count (not iframe element identity) because JSDOM does not trigger real frame reloads on `srcDoc` changes

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- RESKIN-01 is complete: theme switches no longer reload the iframe; in-frame React state (scroll, form, counter, timer) is preserved across theme changes
- The THEME_PUSH path (already implemented in Phase 20) is now reliably delivered to connected frames
- Real-browser proof (visually verify live re-skin without state loss) is Phase 25 / SMOKE-03

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (test) | f3f3979 | PASS — new test failed as expected on pre-fix code (spy called 2 times) |
| GREEN (feat) | 3fb5337 | PASS — all 936 tests pass after dep-array fix |

## Self-Check: PASSED

- `src/ui/SandboxFrame.tsx` — FOUND (dep array is `[transpiledJS]` at line 114)
- `src/ui/SandboxFrame.test.tsx` — FOUND (new test at line 277)
- Commit f3f3979 — FOUND
- Commit 3fb5337 — FOUND
- 936 tests pass — VERIFIED
- tsc 0 errors — VERIFIED
- frameCsp + csp + hygiene green — VERIFIED
- CSP hash unchanged — VERIFIED

---
*Phase: 23-live-frame-re-skin*
*Completed: 2026-06-30*
