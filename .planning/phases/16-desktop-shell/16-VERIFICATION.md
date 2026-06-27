---
status: passed
phase: 16
verified: 2026-06-26
verifier: autonomous-orchestrator (independent gates + live Aurora-vs-Noir viewed-screenshot smoke)
---

# Phase 16 — Desktop Shell — Verification

**Status: PASSED** — all 4 requirements verified by independent gate runs + a live viewed-screenshot smoke (the human checkpoint deferred from 16-04). **This phase delivers the OS's colors** — switching themes now visibly re-skins the whole screen.

## Requirement coverage (WIN-06, WIN-07, WIN-08, PERF-01)

| REQ | Criterion | Evidence |
|-----|-----------|----------|
| WIN-06 | Dock: running indicators + hover-scale + search icon | **Viewed**: glass dock with a magnifier ("Open launcher") icon; after opening Notes, a running Notes icon appeared in the dock. |
| WIN-07 | Menu bar: wordmark + active-app + theme switcher + clock | **Viewed**: "Vibe OS" wordmark, active-app name "Notes", 4-theme pills, live clock "18:32". |
| WIN-08 | Desktop surface as workspace; launched apps land here | **Viewed**: themed `--wall` wallpaper + 4 animated blobs as root; launcher → Notes opened as a window on the desktop. Flat storefront grid removed (`Marketplace.tsx` deleted; tests migrated to `DesktopShell`). |
| PERF-01 | Responsive; minimized don't composite; degrade under reduced-motion | Automated tests pass: `prefers-reduced-motion` degrade; minimized = `display:none`. |

## Headline acceptance — theme re-skin (the "colors" payoff)

- **Viewed Aurora vs Noir**: switching theme visibly re-skins the entire screen — wallpaper gradient + the 4 blobs change palette (Aurora: purple/teal/pink/green; Noir: magenta/teal/crimson), and the glass chrome (dock, menu bar, window) re-tints. Aurora desktop matches the design's `idle.png`.
- Automated acceptance: `documentElement` `--wall` AND `--text` differ across aurora/noir and match `VIBE_THEMES` verbatim.
- Window glass chrome now **pops over the dark wallpaper** (resolves the Phases 14–15 "pale over white" state).

## Gate results (independent re-run by orchestrator)

- `npx tsc --noEmit` → **0 errors**
- Full suite → **636/636 passed** (79 files; +36 over the 600 baseline)
- `npm run build` → success; **0 source maps** in `dist`
- Hygiene gate → green (neutral `DesktopShell`/`Dock`/`MenuBar`/`MinimalLauncher`/`.desktop`/`.dock`/`.menu-bar`)
- Code review → 0 Critical / 5 Warning (all fixed) → re-review clean
- Live smoke → desktop, blobs, menu bar, dock, launcher, window-on-desktop, theme re-skin all confirmed by **viewed screenshots**

## Phase-15 chrome fixes (folded in, 16-01)

- `AppShell.hideClose` prop suppresses the redundant inner `×` when framed (traffic-light close authoritative).
- WindowFrame titlebar centers app icon + title.
- Gentler window cascade.

## Notes / deviations

- 16-03 took plan Option B: deleted `Marketplace.tsx`, migrated its 8 test files to `DesktopShell` via a shared test kit (the desktop is the new root — clean).
- The dock magnifier opens a **MinimalLauncher** (pre-installed app grid → open) — the deliberate Phase-16 stub that **Phase 17 replaces** with the full search/describe/produce panel (idle/working/result).
- Cosmetic polish for later: Notes window content looked a touch cramped; window default sizing could be tuned (non-blocking).
