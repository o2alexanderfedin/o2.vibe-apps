---
status: passed
phase: 15
verified: 2026-06-26
verifier: autonomous-orchestrator (independent gates + live browser smoke with viewed screenshots)
---

# Phase 15 — Window Manager — Verification

**Status: PASSED** — all 5 success criteria verified by independent gate runs + live browser smoke (screenshots viewed, per the verify-visually discipline).

## Requirement coverage (WIN-01..05)

| REQ | Criterion | Evidence |
|-----|-----------|----------|
| WIN-01 | Draggable glass window w/ shared traffic-light chrome | **Viewed**: Notes + Currency open inside `WindowFrame` with macOS traffic-light titlebar + themed glass; app content (incl. contextual `⋮` menu) renders inside. |
| WIN-02 | Multiple concurrent windows | **Viewed**: 2 windows open at once (Currency + Notes), independent state. In-tree React subtrees (see deviation) — concurrent + isolated. |
| WIN-03 | Raise/focus + drag (clamped, cascade) | **Viewed**: Currency focused (bold title, raised). Drag pointer-capture + viewport-clamp covered by unit tests; CR-01 (drag double-position) fixed with regression tests. |
| WIN-04 | Minimize ↔ restore | Unit-tested: minimize = `display:none` (never unmounts), restore via manager API. Dock restore UI lands in Phase 16. |
| WIN-05 | Close fully unmounts (no leak) | **Viewed**: closing Notes removed its window; Currency remained, no crash. Leak invariant: `appBodyCount()` returns to baseline (test); no surviving timers/listeners. |

## Gate results (independent re-run by orchestrator)

- `npx tsc --noEmit` → **0 errors**
- Full suite → **600/600 passed** (72 files; +30 over the 570 baseline)
- `npm run build` → success; **0 source maps** in `dist`
- Hygiene gate → green (neutral identifiers `useWindowManager`/`WindowFrame`/`.window-chrome`/`.desktop`)
- Live browser smoke → window render, multi-window, focus, close all confirmed by **viewed screenshots**; 0 console errors
- Code review → 1 Critical (CR-01 drag double-position) + 4 warnings, **all fixed + re-verified**

## Architectural deviation (sound)

Wave-3 rendered windows **in-tree** (windows as React subtrees of the main root) instead of separate `mountApp` createRoot roots — separate roots ran outside test `act()` causing real hangs. The zero-leak invariant is preserved via React subtree unmount + `appBodyCount()` assertion. WIN-02's intent (concurrent, independent windows) is met; the literal "own React root" mechanism changed for testability + simplicity (and it eliminates the root-leak class entirely).

## Cosmetic follow-ups for Phase 16 (non-blocking)

- Titlebar should center an **app icon + title** (currently the title is right-aligned, no icon) — match the design.
- The window's themed glass is **pale over the white storefront**; it will pop once the Phase-16 **themed wallpaper** sits behind it.
- Hide the **redundant inner `×`** (AppShell's own close) when an app is wrapped in a `WindowFrame` (the traffic-light close is authoritative).
- Tune cascade placement (windows appeared spread top-left/bottom-right rather than gently cascaded).
