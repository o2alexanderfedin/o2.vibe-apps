# Phase 16: Desktop Shell - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Autonomous (grey areas resolved with noted defaults; research-grounded). The **visual payoff** phase — the OS finally gets its themed colors.

<domain>
## Phase Boundary

Replace the flat white storefront with the **Vibe OS desktop** as the root UI: a themed animated **wallpaper**, a bottom **dock** (running indicators + hover-scale + a search/magnifier icon), and a top **menu bar** (wordmark, active-app name, theme switcher, live clock) — performing responsively with several windows open. Requirements: **WIN-06, WIN-07, WIN-08, PERF-01**.

**In scope:** `DesktopShell` (root), wallpaper + animated blobs, dock, menu bar, relocate the theme switcher here, minimal launcher so the desktop is usable, + fold in the Phase-15 window-chrome cosmetic fixes. **Out of scope this phase:** the full search/describe/produce panel with idle/working/result states (Phase 17 — this phase ships a *minimal* launcher stub it will replace); theme-aware generated apps (Phase 18).

**This phase must make theme-switching VISIBLY re-skin the whole screen** (the wallpaper + chrome) — verified by viewed screenshots per theme. (Addresses the "no colors yet" gap from Phases 14–15, which only shipped the engine + pale window glass over a white page.)
</domain>

<decisions>
## Implementation Decisions (auto-resolved — KISS/design-grounded; override if you disagree)

1. **`DesktopShell` becomes the root UI**, replacing Marketplace-as-root. Layer order (back→front): themed **wallpaper** (`background: var(--wall)`) → **animated blobs** (4 divs using `--b1..--b4`, `vibeFloat` keyframes, `blur(60px)`, `mix-blend-mode:screen`, low opacity) → **windows layer** (from `useWindowManager`, `isolation:isolate`) → **dock** (bottom) + **menu bar** (top). The flat storefront grid is removed as the root.
2. **Menu bar** (top, ~40px, glass `var(--glass)` + `backdrop-filter` + `--bord`/`--hi`): left = OS **wordmark** (neutral brand mark + name) + the **active-app name** (from `useWindowManager` active window); right = the **4-theme switcher** (RELOCATED here from the AppBar — Phase 14's temp home) + a live **clock** (HH:MM, `setInterval`). Keep the **API-key/account affordance** (SHELL-03 / KeyDialog) reachable — add a small neutral menu-bar control for it; do NOT regress KeyDialog access.
3. **Dock** (bottom-center, glass): an icon per **open/running window** (running-indicator dot, hover-scale `transform`), click → `focus`/`restore` that window (**this completes WIN-04's restore UI** — clicking a minimized app's dock icon restores it); plus a **search (magnifier) icon** at left/right that calls an injected `onOpenLauncher` callback.
4. **Minimal launcher (so the desktop stays usable this phase).** Wire the dock magnifier to a **minimal launcher**: a simple list of the **pre-installed apps**; clicking one opens it as a window on the desktop. This is the **stub Phase 17 replaces** with the full search/describe/produce panel (text input + idle/working/result). Keep it small + neutral; Phase 17 owns CREATE-01..03. (Rationale: the flat grid is gone, the full panel is Phase 17, so the desktop needs *some* way to open apps now.)
5. **WIN-08 desktop surface** = the wallpaper layer is the workspace; apps launched (from the minimal launcher now, the search panel in P17) open as windows here and appear in the dock as running.
6. **PERF-01**: minimized windows stay `display:none` (no compositing — from Phase 15); merge the blob layer / keep it cheap; under `prefers-reduced-motion` disable blob animation and reduce blur radius; a simple frame-budget/`prefers-reduced-motion` media-query degrade is the concrete deliverable (full GPU frame-timing detection is best-effort/deferred). Theme switch must not trigger a full restyle storm — keep vars on `documentElement` (already so).
7. **Theme the chrome** — wallpaper, blobs, dock, menu bar, and window chrome all reference theme vars (`--wall`, `--b1..b4`, `--glass`/`--glass2`, `--bord`, `--hi`, `--text`, `--accentA/B`). **Switching theme must visibly change the wallpaper + chrome** — this is the acceptance signal; prove with a viewed screenshot per theme.
8. **Fold in Phase-15 window-chrome cosmetic fixes** (from 15-VERIFICATION follow-ups):
   - Titlebar: **center the app icon + title** (icon first, then title), matching the design (currently `[traffic-lights][title][icon]`, title right-aligned, no icon group centered).
   - **Hide AppShell's redundant inner `×`** when an app is wrapped in a `WindowFrame` (the traffic-light close is authoritative) — pass a `hideClose`/`chromeless` prop (or stop passing `onClose`) so AppShell doesn't render its own close inside a window.
   - Tune **cascade placement** so new windows gently offset (they appeared spread top-left/bottom-right).
9. **App icons**: the design renders per-app gradient icon tiles (`catalog[kind].grad` + an SVG glyph). Reuse the existing app icon/glyph source (the storefront cards already show glyphs) for dock + titlebar + launcher; keep it neutral-named.

</decisions>

<code_context>
## Existing Code Insights (scouted)

- `src/ui/WindowFrame.tsx` — titlebar markup order is `traffic-lights` → `.window-chrome__title` → `.window-chrome__icon`; wraps `AppShell` with `onClose`/`onModify` (AppShell renders the `⋮` prompt AND its own close — the redundant `×`). Fix the title/icon ordering+centering in CSS and suppress AppShell's inner close when framed.
- `src/ui/useWindowManager.tsx` — `WindowEntry[]` + `open/focus/minimize/restore/close`; the dock + menu-bar active-app read from here; dock-icon click → `focus(id)`/`restore(id)`.
- `src/ui/AppBar.tsx` — currently hosts the temporary `ThemeSelector` (Phase 14) + the old light/dark toggle + account/key. Relocate `ThemeSelector` into the menu bar; decide AppBar's fate (the desktop replaces the storefront shell — the menu bar subsumes its role; preserve KeyDialog access).
- `src/ui/Marketplace.tsx` / `App.tsx` — current root that renders the storefront grid + opens windows (Phase 15). `DesktopShell` becomes the new root; the grid is removed/superseded; the open-window flow stays.
- `src/ui/VibeThemeProvider.tsx` / `VIBE_THEMES` — the theme vars on `documentElement`; the design's `--wall` and `--b1..--b4` are already in the contract for the wallpaper + blobs.
- `design/VibeOS.dc.html` — reference for the menu-bar (40px glass), dock (52px icons, hover-scale, running dots), blob positions/animation (`vibeFloat`), and window-chrome layout.

</code_context>

<specifics>
## Specific Ideas / Acceptance

- The desktop is the root UI: themed wallpaper + animated blobs behind windows; bottom dock with a running-indicator per open app + a magnifier icon; top menu bar with wordmark, active-app name, theme switcher, live clock.
- **Switching theme visibly re-skins the whole screen** (wallpaper + blobs + dock + menu bar + window chrome) — proven by a viewed screenshot in at least two themes (e.g. Aurora vs Noir). THIS is the phase's headline acceptance.
- Dock icon click focuses/restores; hover-scale animates; magnifier opens the minimal launcher; launching opens a window + adds a dock entry.
- With 3–4 windows + animated wallpaper, the desktop stays responsive; minimized windows don't composite; `prefers-reduced-motion` disables blob animation.
- Window chrome is fixed (centered icon+title; no redundant inner ×).
- KeyDialog (SHELL-03) still reachable; contextual prompt (MOD-01..04) still works inside windows.
- All existing tests stay green (600); `tsc` 0; build clean (no source maps); hygiene gate green incl. new files (`DesktopShell`/`Dock`/`MenuBar`/`.desktop`/`.dock`/`.menu-bar` — neutral, no banned tokens). TDD; IoC/DI preserved (inject `onOpenLauncher` etc.).

</specifics>

<deferred>
## Deferred Ideas

- The full **search/describe/produce panel** with idle/working/result states (Phase 17 — replaces the minimal launcher stub).
- Theme-aware **generated** apps (Phase 18).
- Dock **persistence** of installed apps across reload; window-**position** persistence (Future Requirements).
- Custom/user themes; per-device GPU frame-timing auto-degrade beyond `prefers-reduced-motion`.

</deferred>
