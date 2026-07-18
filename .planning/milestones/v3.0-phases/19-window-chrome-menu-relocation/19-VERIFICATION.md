---
status: passed
phase: 19
verified: 2026-06-27
verifier: autonomous-orchestrator (independent gates + viewed-browser smoke + a found-and-fixed real-browser defect)
---

# Phase 19 — Window Chrome & Menu Relocation — Verification

**Status: PASSED** — all 4 requirements verified by independent gate re-runs + a live **viewed-screenshot** browser smoke. The smoke caught a real-browser defect (titlebar buttons eaten by drag-capture) that the jsdom suite could not see; it was fixed TDD-style and re-verified in-browser.

## Requirement coverage (CHROME-01..04)

| REQ | Criterion | Evidence |
|-----|-----------|----------|
| CHROME-01 | `⋮` contextual menu in the titlebar; app body chrome-free; MOD-01..04 work | a11y tree: `App options` button is in `.window-chrome__titlebar`; body `region` has no app-shell header. **Browser smoke: a real pointer click opens the "Modify: Notes" popover (294×175, fully visible).** AppShell reduced to content-only. |
| CHROME-02 | Maximize = zoom-to-work-area, not OS full-screen; restore | **Browser smoke (viewed): the green button zooms Notes to fill between the menu bar and dock — both remain visible.** `WindowEntry.maximized`/`restoreRect`; double-click + green traffic-light toggle. |
| CHROME-03 | Snap to left/right half (drag-to-edge preview + Ctrl+Left/Right) | `snapLeft`/`snapRight` + `.desktop-snap-preview`; geometry from `workArea()`; covered by DesktopShell/useWindowManager tests. |
| CHROME-04 | Cmd/Ctrl+W close, Cmd/Ctrl+M minimize, preventDefault | Single keydown effect in DesktopShell; tests assert `event.defaultPrevented === true`; editable-target guard. |

## Gate results (independent re-run by orchestrator)

- `npx tsc --noEmit` → **0 errors**
- Full suite → **761/761 passed** (83 files; +36 over the 725 baseline — +35 from the executor, +1 orchestrator regression test)
- `npm run build` → success; **0 source maps** in `dist`
- Hygiene + CSP gates → **13/13 green**; no banned lexicon; "iframe/sandbox/isolation" appear only in source comments + the legitimate CSS `isolation:isolate`, never in UI copy
- Zero new npm runtime dependencies
- Code review (executor) → clean after auto-fix (0 critical / 0 warning / 3 info)

## Defect found-and-fixed at verification (the value of the viewed smoke)

**Symptom:** in a real browser, clicking the titlebar `⋮` (and the green maximize button) did nothing — the popover never opened.
**Root cause:** `useDrag` calls `preventDefault()` + `setPointerCapture()` on the titlebar's `pointerdown`. When the press landed on a control, the drag-capture/preventDefault suppressed that button's synthesized `click`. **jsdom no-ops pointer capture, so all RTL `fireEvent.click` tests passed** — a textbook tests-green-but-browser-broken gap (exactly the visual-verification risk the user flagged).
**Fix (`fix(19)` 7ed2d80, TDD):** the titlebar `onPointerDown` now raises the window but early-returns before `handlePointerDown` when the press target is within a `button`, so the control's click fires normally. A jsdom regression test asserts a press-drag originating on the `⋮` commits no drag (`onMove` not called) — RED before the fix, GREEN after. Re-verified in-browser: popover opens + maximize works on real pointer clicks.

## Verification reality (honest note)

CHROME-03 (snap) and CHROME-04 (keyboard) were verified via the test suite + the executor's coverage, not an exhaustive live drag/keyboard session. CHROME-01/02 — the two titlebar pointer interactions subject to the jsdom blind spot — were explicitly verified live in the browser with viewed screenshots, which is where the defect surfaced.
