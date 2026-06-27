---
phase: 16-desktop-shell
plan: 02
subsystem: desktop-chrome
tags: [ui, dock, menu-bar, launcher, ioc, css, glass]
requires:
  - "16-01 (WindowFrame hideClose + title-group)"
  - "WindowEntry shape (src/ui/useWindowManager.tsx)"
  - "APP_REGISTRY catalog (src/data/appRegistry.ts)"
  - "ThemeSelector relocated into the menu bar (src/ui/ThemeSelector.tsx)"
provides:
  - "Dock leaf component (WIN-06) — props-injected windows/onFocus/onRestore/onOpenLauncher"
  - "MenuBar leaf component (WIN-07) — activeName + onOpenAccount + relocated ThemeSelector + live clock"
  - "MinimalLauncher stub — APP_REGISTRY grid, opens-then-closes (Phase 17 replaces)"
  - "iconForApp shared glyph helper (ICONS map + iconForAppType)"
  - ".dock / .menu-bar / .launcher glass CSS (running dot + hover-scale, theme-var-referenced)"
affects:
  - "src/ui/Dock.tsx (new)"
  - "src/ui/MenuBar.tsx (new)"
  - "src/ui/MinimalLauncher.tsx (new)"
  - "src/ui/iconForApp.tsx (new)"
  - "src/index.css (append)"
tech-stack:
  added: []
  patterns:
    - "IoC/DI leaf components (no useWindowManager() hook inside; callbacks injected) — mirrors WindowFrame"
    - "Live clock via setInterval-in-useEffect, cleared on unmount (no timer leak)"
    - "Overlay + stopPropagation dialog pattern (mirrors KeyDialog)"
    - "Neutral data-key → glyph mapping centralized in one render-layer module"
key-files:
  created:
    - "src/ui/iconForApp.tsx"
    - "src/ui/Dock.tsx"
    - "src/ui/Dock.test.tsx"
    - "src/ui/MenuBar.tsx"
    - "src/ui/MenuBar.test.tsx"
    - "src/ui/MinimalLauncher.tsx"
    - "src/ui/MinimalLauncher.test.tsx"
  modified:
    - "src/index.css"
decisions:
  - "Dock keeps a type-only import of WindowEntry from useWindowManager (no hook call) — the prescribed PATTERNS.md interface; IoC is satisfied because there are zero useWindowManager() invocations."
  - "iconForApp left as a standalone shared module; Marketplace's own inline ICONS copy is intentionally NOT touched (plan 16-03 owns Marketplace's rewire)."
metrics:
  duration_min: 6
  tasks: 3
  files_created: 7
  files_modified: 1
  tests_added: 14
  completed: 2026-06-26
---

# Phase 16 Plan 02: Desktop Chrome Leaf Components Summary

Built the three desktop-shell chrome leaf components — `Dock` (WIN-06), `MenuBar` (WIN-07), and the `MinimalLauncher` stub — as pure IoC/DI components (no `useWindowManager()` inside), plus a shared `iconForApp` glyph helper and their `.dock` / `.menu-bar` / `.launcher` glass CSS, all tested offline with substituted callbacks.

## What Was Built

### Task 1 — `iconForApp.tsx` shared glyph helper (commit `5277265`)
- Moved the `ICONS: Record<string, LucideIcon>` map (cloud/calculator/notes/timer/currency/recipes/calendar/budget → lucide glyphs) into a new shared render-layer module and exported it.
- Added `iconForAppType(appType)`: resolves a window's `appType` via `APP_REGISTRY` → its neutral `icon` key → `ICONS`, with a `Cloud` fallback for unknown types (e.g. apps produced on demand outside the catalog).
- Marketplace's inline copy left in place by design (16-03 owns that rewire).

### Task 2 — `Dock.tsx` + `Dock.test.tsx` (commit `3b1b882`, TDD RED→GREEN)
- `<nav className="dock" aria-label="Open apps">` with a magnifier (`Search`, `aria-label="Open launcher"`) followed by one `dock__icon` button per window.
- Each window icon: glyph from `iconForAppType(entry.appType)`, `aria-label={entry.title}`, a child `dock__running-dot`, and `onClick={() => entry.minimized ? onRestore(entry.id) : onFocus(entry.id)}`.
- Pure props-injection: zero `useWindowManager()` calls (only the `WindowEntry` type import).
- 5 behavior tests (icon-per-window + magnifier; running dot; active→onFocus; minimized→onRestore; magnifier→onOpenLauncher).

### Task 3 — `MenuBar.tsx` + `MinimalLauncher.tsx` + CSS (commit `51ea4ae`, TDD RED→GREEN)
- **MenuBar (WIN-07):** `<header role="banner" className="menu-bar">` — left group (`menu-bar__wordmark` "Vibe OS" + conditional `menu-bar__active-app`), right group (relocated `<ThemeSelector />`, `Account` button → `onOpenAccount` KeyDialog gate, live `menu-bar__clock`). Clock driven by `setInterval`-in-`useEffect` with module-local `formatClock` (24-hour `toLocaleTimeString`), `clearInterval` on unmount.
- **MinimalLauncher:** `launcher-overlay` (click→`onClose`) wrapping a `role="dialog"` panel (`onClick` stopPropagation) with a neutral close control and a `launcher__grid` of `APP_REGISTRY` buttons; each opens-then-closes (`onOpen(id, displayName); onClose()`).
- **CSS:** appended `.menu-bar` (40px top glass, z-index 9000), `.dock` (bottom-center radius-22 glass), `.dock__icon` (52px, hover `scale(1.22) translateY(-7px)`, cubic-bezier transition, transform-origin bottom), `.dock__running-dot`, the `.menu-bar__*` text rules, and `.launcher-overlay`/`.launcher`/`.launcher__grid`/`.launcher__app-btn` — all referencing theme vars (`--glass`/`--bord`/`--text`/`--hi`) so the chrome re-skins live.
- 9 behavior tests (MenuBar 5 wrapped in `ServicesProvider` + `VibeThemeProvider`; MinimalLauncher 4).

## Deviations from Plan

None — plan executed as written. One minor in-test correction during the TDD GREEN phase (not a code deviation): the clock-advance assertion initially advanced fake timers by 60s, which advanced the simulated system clock one extra minute past the pinned target; changed to advance a single 1s tick after re-pinning the time, so the displayed text re-reads exactly the pinned minute.

## Verification

- `npx vitest run src/ui/Dock.test.tsx src/ui/MenuBar.test.tsx src/ui/MinimalLauncher.test.tsx` — 14/14 pass.
- `npx vitest run` (full suite) — 76 files / 620 tests pass, no regression.
- `npx tsc --noEmit` — exits 0.
- `npx vitest run src/hygiene.test.ts` — pass (no banned tokens in any new file or CSS class).

### Acceptance greps (all satisfied)
- `iconForApp.tsx` exports ≥ 2 (ICONS + iconForAppType).
- `Dock.tsx`: 0 `useWindowManager(` hook calls; `onOpenLauncher` ≥ 1; `dock__running-dot` ≥ 1.
- `MenuBar.tsx`: `ThemeSelector` ≥ 1; `onOpenAccount` ≥ 1; `clearInterval` ≥ 1.
- `index.css`: `.dock`/`.menu-bar`/`.launcher` ≥ 3 (4 matched); `scale(1.22)` ≥ 1.
- `MinimalLauncher` renders exactly `APP_REGISTRY.length` (8) app buttons; click → onOpen then onClose.

## Known Stubs

- **MinimalLauncher** is an intentional minimal stub per CONTEXT decision 4 (keeps the desktop usable this phase). It wires real data (`APP_REGISTRY`) and a real open callback — it is not an empty placeholder — but Phase 17 replaces it with the full launcher. Documented as intentional; the data is wired, so no goal-blocking stub remains.

## Notes for Plan 16-03

- `Dock`, `MenuBar`, `MinimalLauncher`, `iconForApp` are all importable and isolated. 16-03's `DesktopShell` wires them: `<MenuBar activeName={activeWindow?.title ?? null} onOpenAccount={...} />`, `<Dock windows={...} onFocus={mgr.focus} onRestore={mgr.restore} onOpenLauncher={...} />`, `{launcherOpen && <MinimalLauncher onOpen={handleOpen} onClose={...} />}`.
- Marketplace still carries its own inline `ICONS` map; 16-03 should switch it to import from `iconForApp` and drop the duplicate.
- The chrome uses `z-index: 9000`; ensure `.desktop` window stack sits below it (16-03 z-layering).

## Self-Check: PASSED

- All 7 created source files exist on disk + SUMMARY.md.
- All 3 task commits present in git history (`5277265`, `3b1b882`, `51ea4ae`).
