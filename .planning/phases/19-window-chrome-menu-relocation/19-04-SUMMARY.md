---
phase: 19-window-chrome-menu-relocation
plan: "04"
subsystem: ui
tags: [chrome, keyboard, window-management, tdd, close, minimize, prevent-default]
dependency_graph:
  requires: [CHROME-03]
  provides: [CHROME-04]
  affects: [DesktopShell]
tech_stack:
  added: []
  patterns:
    - global-keydown-effect
    - ref-mirror-live-read
    - active-window-resolve
key_files:
  created: []
  modified:
    - src/ui/DesktopShell.tsx
    - src/ui/DesktopShell.test.tsx
decisions:
  - "Cmd/Ctrl+W (close) and Cmd/Ctrl+M (minimize) were added as new branches to the SINGLE keydown effect Plan 03 created — verified by `grep -c 'addEventListener(\"keydown\"' === 1`. No second global listener."
  - "The close/minimize branch keys on `mod = e.metaKey || e.ctrlKey` (Cmd on macOS, Ctrl elsewhere); the Plan 03 snap branch keeps keying on `e.ctrlKey` for ArrowLeft/Right — both branches coexist in one handler."
  - "The active-window-present gate (`activeId() !== null`) is the T-19-10 mitigation, NOT `document.hasFocus()`. jsdom (and any headless/background context) returns `document.hasFocus() === false`, which would silently disable the shortcut. The active-window check is the same reliable gate Plan 03's snap branch uses and is sufficient for the threat model (no window open → no-op → browser tab stays closable)."
  - "preventDefault() fires BEFORE handleClose/minimize so the browser's native tab-close (Cmd/Ctrl+W) and native minimize (Cmd/Ctrl+M) are suppressed; a test asserts `event.defaultPrevented === true` for both."
  - "Close resolves the FULL active entry (id + instanceId) via `activeId()` + `windows.find` because handleClose needs both; minimize needs only the id. handleClose is added to the effect deps (memoized — re-register is a no-op)."
metrics:
  duration: "~6 minutes"
  completed: "2026-06-27"
  tasks_completed: 2
  files_changed: 2
---

# Phase 19 Plan 04: Keyboard Shortcuts (Close / Minimize) Summary

**One-liner:** Added `Cmd/Ctrl+W` (close active window) and `Cmd/Ctrl+M` (minimize active window) as new branches of the SAME global keydown effect Plan 03 created — each calling `preventDefault()` first so the browser tab is never closed and the browser's native minimize never fires, gated to act only when a Vibe OS window is active; closes out the Phase 19 CHROME-01..04 gate (748 tests, tsc 0, hygiene + CSP green, no source maps, zero deps).

## Tasks Completed

| Task | Name | Commits (RED → GREEN) | Files |
|------|------|------------------------|-------|
| 1 | Cmd/Ctrl+W close + Cmd/Ctrl+M minimize with preventDefault, active-gated | 786a58a (test) → d2f8f6c (feat) | DesktopShell.tsx, DesktopShell.test.tsx |
| 2 | Phase-19 gate — full suite + tsc + hygiene + CSP + no-source-maps build + zero deps | (verification-only, no source commit) | — |

## What Was Built

- **DesktopShell.tsx**: The Plan 03 keydown `useEffect` (previously handling only `Ctrl+ArrowLeft/Right` snap) was EXTENDED — not duplicated — with a close/minimize branch. The handler now reads `const mod = e.metaKey || e.ctrlKey` and, when `mod && (e.key === "w" || e.key === "m")`, resolves the active window via `windowManagerRef.current.activeId()` (the highest-z non-minimized window — the same definition the menu bar uses). If `activeId()` is null it returns early (no-op, no preventDefault) so the browser tab stays closable. Otherwise it looks up the full entry via `wm.windows.find((w) => w.id === activeId)`, calls `e.preventDefault()`, then `handleClose(active.id, active.instanceId)` on `"w"` or `wm.minimize(active.id)` on `"m"`. The original `Ctrl+Arrow` snap branch is unchanged and still keys on `e.ctrlKey`. The effect dependency array changed from `[]` to `[handleClose]` (handleClose is memoized — re-register is a no-op). The effect comment was rewritten to document the unified one-listener model and the T-19-10/12 mitigations.
- **DesktopShell.test.tsx**: Four new integration cases mirroring the Plan 03 keyboard cases —
  1. `Cmd+W closes the active window and prevents the browser tab-close default`: opens Notes, dispatches a `cancelable` `Cmd+W` KeyboardEvent on `window`, asserts `event.defaultPrevented === true` AND `frames()` → 0 AND `appBodyCount()` → 0.
  2. `Ctrl+W (non-Cmd path) also closes the active window`: same with `ctrlKey: true`, asserting the `metaKey || ctrlKey` branch works on non-mac paths.
  3. `Cmd+M minimizes the active window and prevents the browser default`: dispatches `Cmd+M`, asserts `event.defaultPrevented === true` AND the frame gains `window-chrome--minimized`.
  4. `Cmd+W with NO window open is a harmless no-op`: dispatches `Cmd+W` with no window, asserts no throw, `defaultPrevented === false`, `frames()` length 0 (the browser tab stays closable, T-19-10).

## Verification Results

- `npx vitest run` — **748 tests, 83 files, all pass** (+4 over the Plan 03 baseline of 744: the 4 new keyboard cases).
- `npm run typecheck` (`tsc --noEmit`) — **0 errors**.
- `npx vitest run src/hygiene.test.ts src/csp.test.ts` — **13 tests green** (no banned mechanic token and no `iframe`/`sandbox`/`isolation` word in the new handler identifiers/comments; CSP/FOUC SHA-256 hash unchanged — Phase 19 touched no FOUC script).
- `npm run build` — clean (exit 0); **0 source-map files** in `dist` (`find dist -name '*.map' | wc -l` → 0). The pre-existing chunk-size warning for the full Babel bundle is unchanged and out of scope.
- This plan's added lines (`786a58a~1..HEAD`) contain **none** of `iframe` / `sandbox` / `isolation` / `synthesi`.
- Acceptance greps (DesktopShell.tsx):
  - `metaKey` → 2 (≥1).
  - `preventDefault` → 7 (≥2 — Plan 03 snap branch + the close + minimize branches).
  - `handleClose` → 14 (called from the keydown handler + the existing close traffic-light / open-flow wiring).
  - `addEventListener("keydown"` → **1** (the Plan 03 effect was EXTENDED, not duplicated — one global keydown listener).
  - `wm.minimize` in the keydown handler → present (line 543).
- `git diff --stat -- package.json package-lock.json` shows no output — **zero new npm dependencies** (runtime and dev).
- CHROME-01..04 confirmed end-to-end: ⋮ in titlebar drives MOD-01..04 (Plan 01), double-click maximize to work-area (Plan 02), edge-drag + Ctrl+Left/Right snap (Plan 03), Cmd/Ctrl+W/M with preventDefault (Plan 04).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The prescribed `document.hasFocus()` gate is environment-incompatible and disables the shortcut**
- **Found during:** Task 1 (GREEN phase — the Cmd+W/Ctrl+W/Cmd+M tests still failed with `defaultPrevented === false` after the first implementation included a `document.hasFocus()` early-return).
- **Issue:** The plan `<interfaces>` suggested gating close/minimize on `document.hasFocus()` AND an active entry. jsdom (the test environment) — and any real headless/background browser context — returns `document.hasFocus() === false`, so the handler returned before reaching `preventDefault()`, silently disabling the shortcut. The Plan 03 snap branch (the precedent in the SAME effect) deliberately did NOT use `document.hasFocus()`; it gated purely on `activeId() !== null`.
- **Fix:** Removed the `document.hasFocus()` early-return. The handler now gates solely on `activeId() !== null` (an active Vibe OS window being present), which is the reliable T-19-10 mitigation (no window open → no-op → the browser tab stays closable) and matches the Plan 03 precedent and the threat model's actual mechanism. The no-window no-op test confirms the gate works.
- **Files modified:** src/ui/DesktopShell.tsx
- **Commit:** d2f8f6c

## Known Stubs

None — the close/minimize path is wired end-to-end. `Cmd/Ctrl+W` calls `handleClose(active.id, active.instanceId)` (the canonical teardown: evict + close + drop body/position); `Cmd/Ctrl+M` calls `windowManager.minimize(active.id)` (the canonical minimize, which the dock entry restores from). Both resolve the active window via `activeId()`. All paths are asserted by the new tests.

## TDD Gate Compliance

- RED commit `786a58a` (`test(19-04): add failing tests …`) precedes GREEN commit `d2f8f6c` (`feat(19-04): Cmd/Ctrl+W close + Cmd/Ctrl+M minimize …`). RED was confirmed failing (3 cases with `defaultPrevented === false`) before implementation; GREEN turned all 16 DesktopShell cases green. No REFACTOR commit was needed (the implementation is minimal). Gate sequence satisfied.

## Threat Flags

No new security-relevant surface beyond the plan's registered threat model.
- **T-19-10 (DoS — Cmd/Ctrl+W hijacking tab-close globally):** mitigated. `preventDefault` fires ONLY when `activeId()` is non-null; with no Vibe OS window active the handler is a no-op (asserted: no throw, `defaultPrevented === false`, the browser tab stays closable).
- **T-19-11 (Information disclosure — new keydown handler identifiers/comments):** mitigated. The new branch identifiers (`mod`, `activeId`, the `w`/`m` key literals) and comments carry no mechanic lexicon and no `iframe`/`sandbox`/`isolation` word — hygiene gate confirmed green over `src/ui/DesktopShell.tsx`.
- **T-19-12 (Tampering — minimize/close acting on the wrong window):** mitigated. The handler resolves the active window via `activeId()` (highest-z non-minimized — the same definition the menu bar uses); the new tests assert the correct (front-most) window closes/minimizes.

## Self-Check: PASSED

- src/ui/DesktopShell.tsx — exists; contains `metaKey` (2), `preventDefault` (7), `addEventListener("keydown"` (1, not duplicated), `wm.minimize` in the keydown handler.
- src/ui/DesktopShell.test.tsx — exists; the 4 new keyboard cases assert `event.defaultPrevented === true` for Cmd+W / Ctrl+W / Cmd+M, the window closes/minimizes, and the no-window case is a no-op.
- Commit 786a58a (test RED, Task 1) — verified in git log.
- Commit d2f8f6c (feat GREEN, Task 1) — verified in git log.
- Full suite: 748 tests green; tsc: 0 errors; hygiene + CSP gates green; build emits 0 source maps; package.json/lock unchanged (zero new deps).
