# Project Research Summary

**Project:** Vibe App Store — v2.0 "Vibe OS"
**Domain:** Client-only generative app marketplace → themeable multi-window desktop shell
**Researched:** 2026-06-26
**Confidence:** HIGH

## Executive Summary

v2.0 turns the flat storefront into a **Vibe OS desktop**: apps open as draggable glass **windows** (shared chrome, traffic-light titlebars), several at once, managed by a **dock** and **menu bar**, on an animated wallpaper — with a visible **create panel** ("describe an app → open it") wired to the real on-demand produce path, and a **4-theme system** (Aurora/Aero/Aqua/Noir) persisted locally that re-skins host chrome **and** every open app at a click. The design reference (`design/VibeOS.dc.html`) is the structural/visual spec; its wording is a free variable.

The unanimous engineering verdict across all four research dimensions: **hand-roll, add zero npm dependencies.** The design already implements window drag with raw Pointer Events; the existing `mount.ts` already supports N concurrent React roots keyed by `instanceId`; the existing `ThemeProvider` already applies CSS variables. v2.0 is overwhelmingly *integration and composition* of machinery the codebase already has, not new infrastructure.

The two load-bearing risks are both well-understood: (1) **theming reaches generated apps only if CSS variables are set on `document.documentElement`** — they do *not* cascade through React context into separately-`createRoot`'d subtrees; and (2) **generated apps must be told to use the theme variable contract** (via the produce prompt) or they hardcode colors and look broken on theme switch. Both have concrete mitigations (documentElement application + a CSS alias bridge for old cached apps; prompt contract + a post-compile hex/rgb static check feeding the self-heal loop).

## Key Findings

### Recommended Stack

**Zero new npm dependencies.** Everything is built on React 19.2 core APIs, the existing `idb@8`, `localStorage`, CSS custom properties, and CSS `@keyframes`. Libraries were evaluated and rejected: `react-draggable@4.7` carries React 19 `findDOMNode` breakage (nodeRef boilerplate costs as much as hand-rolling); `framer-motion` is heavy (674KB–4.8MB unpacked) and fights pixel-exact window positioning. See `STACK.md`.

**Core techniques:**
- **Window drag** — a ~60-line `useDrag` hook using `pointerdown/move/up` + `setPointerCapture`; rAF imperative positioning, commit to React state on `pointerup`.
- **Theme apply** — `document.documentElement.style.setProperty` over the 11-var contract (`--accentA/B`, `--text`, `--glass/2`, `--bord`, `--hi`, `--wall`, `--b1..b4`); extend `ThemeProvider`.
- **Theme persistence** — `localStorage` (sync, FOUC-safe; mirrors existing `marketplace.theme`) for the active theme name; additive `settings` object store in `idb` (DB v2→v3) for any richer desktop state.
- **Z-order** — module-level `let zTop = 200`, incremented on focus.
- **Animation** — CSS keyframes only (the 6 from the design: `vibeWin/Float/Sweep/Sheen/Pulse/Spin`).

### Expected Features

**Must have (table stakes — all low-complexity unless noted):**
- Draggable glass windows: z-order/raise, focus, close, minimize→dock, restore, cascade placement, bounds clamping
- Bottom dock (running indicators, hover-scale) + top menu bar (wordmark, active-app name, clock)
- 4-theme segmented switcher, live apply, persisted; applies to chrome **and** apps
- Create panel with idle/working/result states, wired to the **real** produce path *(medium)*
- AppShell→window-content refactor enabling **N concurrent React roots** *(medium)*
- Theme-aware generated apps — produce-prompt mandates the CSS-var contract *(medium; non-obvious, load-bearing)*

**Should have (low-cost signature polish):** animated blob wallpaper, glass-morphism chrome, window-open animation, branded (mechanic-free) progress copy.

**Defer (v2.x):** dock/`installed[]` persistence across reload, window-position persistence, cache-key contract versioning to force re-produce of pre-v2 cached apps, ContextualPrompt z-index hardening.

**Anti-features (explicitly cut):** window resize handles (break fixed-width generated layouts), maximize/fullscreen (conflicts with partial-glass aesthetic), snap/tiling, multi-desktop, user-created/custom themes. Plus hygiene exclusions: any copy naming AI/LLM/generate; streaming code as a progress affordance.

### Architecture Approach

The existing `mount.ts` roots Map is **untouched** — it already supports N concurrent roots. A new `useWindowManager` hook owns `WindowEntry[]` (x/y/z/min/drag) in React state, parallel to the roots Map on the same `instanceId` key. A `WindowFrame` component wraps the existing `AppShell` (contextual prompt stays inside) and drives `mountApp`/`unmountApp` via `useEffect`. A `DesktopShell` becomes the root UI (replacing `Marketplace` as the shell), hosting the wallpaper, windows, dock, and menu bar. Theme switching writes CSS vars to `document.documentElement` → O(1) re-skin of all windows, no remount. A `CreatePanel` receives `onOpen` as a prop from `DesktopShell` (no new IoC seam). See `ARCHITECTURE.md`.

**Major components:**
1. **`VibeThemeProvider` / `VIBE_THEMES`** — named-theme registry; applies vars to `documentElement`; persists to `localStorage`; IDB `settings` store (v3). *(Foundation — everything depends on it.)*
2. **`useWindowManager` + `WindowFrame`** — window state + lifecycle; owns close→`unmountApp` (no root leak).
3. **`DesktopShell`** — desktop surface, wallpaper/blobs, dock, menu bar; the new root shell.
4. **`CreatePanel`** — describe→open, wired to the existing producer/loader.
5. **Produce-prompt contract + post-compile check** — `buildPrompt()` mandates theme vars; static hex/rgb check feeds the self-heal loop.

### Critical Pitfalls

1. **CSS vars don't inherit into separate React roots via context** — set them on `document.documentElement` only. *(Central theming mechanism.)*
2. **Theme FOUC** — sync `localStorage` read in an `index.html` `<script>` applies the theme to `documentElement` before React mounts. (Note: the FOUC script's SHA-256 hash and `csp.test.ts` must update in the **same commit**.)
3. **React root leak on close** — `closeWin` must route through the manager that also calls `unmountApp(instanceId)`; assert `mountedCount()===0` after closing all.
4. **Drag pointer-capture loss** — `setPointerCapture` on the titlebar handle + `user-select:none`; rAF positioning, state only on `pointerup` (avoids 60fps reconciliation thrash).
5. **Generated apps hardcode colors** — prompt contract + post-compile hex/rgb regex check → self-heal; a `:root` CSS alias bridge (`--color-surface: var(--glass)`) keeps **old cached apps** rendering after the new vars land.
6. **backdrop-filter compositing cost** — `display:none` minimized windows, merge blob layers, `prefers-reduced-motion`/degrade blur on weak GPUs.
7. **Hygiene on new surfaces** — extend the CI lexicon gate to all new files **and sanitize model-generated app names** before they hit titlebars/dock (could contain "AI"/"generated").
8. **Z-index stacking-context traps** — dedicated window container with `isolation:isolate`; blobs in a lower-z sibling.

## Implications for Roadmap

Research converges on a **5-phase structure** with strict ordering (theming is the dependency root; the create panel needs the desktop; theme-aware generation needs the var contract live):

### Phase 14: Theme Foundation
**Rationale:** Dependency root — every other phase consumes the theme variables. Ship it first and atomically.
**Delivers:** `VIBE_THEMES` (4 themes) + `VibeThemeProvider` applying vars to `documentElement`; `localStorage` active-theme + FOUC `index.html` script (+ `csp.test.ts` hash update same commit); additive IDB `settings` store (v3); `:root` CSS **alias bridge** so existing cached apps keep their colors.
**Addresses:** theme switcher, live apply, persistence. **Avoids:** pitfalls 1, 2, 5(bridge).

### Phase 15: Window Manager
**Rationale:** The windowing premise; needs the theme vars (P14) for chrome but nothing else.
**Delivers:** `useDrag` (pointer-capture + rAF), `useWindowManager` (z-order/focus/min/close/cascade/clamp), `WindowFrame` wrapping `AppShell` and owning `mountApp`/`unmountApp` lifecycle.
**Uses:** hand-rolled drag, `zTop` counter. **Avoids:** pitfalls 3, 4, 8.

### Phase 16: Desktop Shell (surface + dock + menu bar)
**Rationale:** Composes windows into a desktop; becomes the new root UI.
**Delivers:** `DesktopShell` (wallpaper/blobs, dock with running indicators + hover-scale, menu bar with wordmark/active-app/clock); replaces `Marketplace` as shell; N concurrent windows visible.
**Avoids:** pitfall 6 (backdrop-filter perf), 8.

### Phase 17: Create Panel
**Rationale:** Needs `DesktopShell.onOpen` (P16) to open a window with the produced app.
**Delivers:** `CreatePanel` (idle/working/result states) wired to the real producer/loader; result → opens a window; branded mechanic-free progress copy.
**Avoids:** hygiene leaks in new copy (pitfall 7).

### Phase 18: Theme-Aware Generation
**Rationale:** Last — needs the var contract (P14) live and apps opening in windows (P15–17) to verify re-skin end-to-end. Highest novelty/risk.
**Delivers:** `buildPrompt()` updated (all branches) to mandate the CSS-var contract; post-compile hex/rgb static check feeding the self-heal loop; name-sanitization for titlebars/dock; CI lexicon gate extended to all new surfaces.
**Avoids:** pitfalls 5, 7.

### Phase Ordering Rationale
- **Theme Foundation must precede everything** (var contract + alias bridge are the dependency root; bridge must land before any prompt change or old cached apps lose colors).
- **Window manager before desktop shell before create panel** (consumer chain: `useWindowManager`→`WindowFrame`→`DesktopShell`→`CreatePanel onOpen` prop).
- **Theme-aware generation last** (verifies the whole loop re-skins; isolates the riskiest prompt change after the surfaces exist to test it).

### Research Flags
- **Phase 18 (Theme-Aware Generation):** prompt-engineering + post-compile check is novel — needs a prompt test proving generated apps actually emit the vars (and the self-heal catch works). Plan with a focused design pass.
- **Phase 15 (Window Manager):** pointer-capture/rAF/root-lifecycle has subtle correctness edges — worth careful test design (drag across an app root, close-unmounts-root assertion).
- **Phases 14, 16, 17:** standard patterns (CSS vars, layout/composition, prop wiring) — lighter research need.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified live; react-draggable React 19 breakage confirmed via CHANGELOG; design reference fully read |
| Features | HIGH | Categorized directly against the design reference's implemented behavior |
| Architecture | HIGH | Integration points named against real files; CSS-var-into-separate-root mechanism verified; mount.ts root model confirmed |
| Pitfalls | HIGH (perf MEDIUM-HIGH) | Pointer/CSS-var/root-leak verified against code + specs; backdrop-filter layer counts are estimates needing device measurement |

**Overall confidence:** HIGH

### Gaps to Address
- **backdrop-filter degradation threshold** — needs empirical measurement on target devices; handle as a perf budget in Phase 16 with `prefers-reduced-motion` + blur-radius degrade.
- **`@property` registration for theme vars** — static stylesheet (FOUC-safe, stable var set) vs dynamic injection; decide in Phase 14 planning (lean static).
- **Mid-flight produce cancellation on window close** — scope `AbortController` at the windowing layer vs inside `producer.ts`; decide in Phase 15/17 planning (producer seam cleaner but wider API change).

## Sources

### Primary (HIGH confidence)
- npm registry (live) — react 19.2, react-draggable 4.7, framer-motion, idb 8 versions/sizes
- `design/VibeOS.dc.html` — implemented drag, theming, window/dock logic, THEMES map
- Existing source — `mount.ts` (root model), `ThemeProvider.tsx`, `db.ts`, `delegated.tsx`, `loader.ts`, `AppShell.tsx`
- react-draggable CHANGELOG — React 19 `findDOMNode` status
- CSS custom properties spec / Chrome compositing model — cascade through DOM (not React context); stacking contexts

### Secondary (MEDIUM confidence)
- Pointer Events API docs — `setPointerCapture` drag pattern
- backdrop-filter compositing cost discussions — layer-count guidance

---
*Research completed: 2026-06-26*
*Ready for roadmap: yes*
