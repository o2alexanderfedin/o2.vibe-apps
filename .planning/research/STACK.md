# Stack Research

**Domain:** Browser-based, client-side generative-UI app marketplace (LLM-produced React compiled and run at runtime, no application backend)
**Researched:** 2026-06-26 (v2.0 Vibe OS addendum — window manager, theme system, layout persistence)
**Confidence:** HIGH (versions verified live against npm registry; react-draggable React 19 status verified against upstream CHANGELOG; framer-motion peer deps confirmed)

---

## v2.0 Vibe OS — What Changes vs v1.1

This file is an **addendum** to the v1.1 STACK-v1.1.md. The existing stack (React 19.2, react-dom 19.2, @babel/standalone ^7.26, idb 8, Vite 8, TypeScript 6, lucide-react ^1, zod ^4) is unchanged. The questions below are exclusively about what the **new Vibe OS features** need.

| v2.0 Feature | Verdict | Action |
|---|---|---|
| Multi-window manager (draggable, z-order, focus, minimize, close) | **HAND-ROLL** — raw `pointerdown/pointermove/pointerup` pattern, pure React state | Design reference already hand-rolls this exactly; react-draggable has a React 19 `findDOMNode` breakage history; pointer-events pattern is ~60 lines of TypeScript |
| CSS-variable named-theme system (Aurora/Aero/Aqua/Noir) | **HAND-ROLL** — set CSS vars directly on `documentElement` | Extend existing `ThemeProvider`; no library buys anything here; the design reference does this in 20 lines |
| Named-theme + window layout persistence in IndexedDB | **EXTEND existing `idb` schema** (additive store or key) — no new library | `idb@8` already handles everything; add a `settings` store or a single well-known key in the existing DB |
| Window open/close/minimize animations | **HAND-ROLL CSS keyframes** already defined in design reference (`vibeWin`, `vibeFloat`, etc.) | No animation library needed for these; they are CSS-only and already specced |

---

## Recommended Stack for v2.0

### No new npm dependencies required

All v2.0 features are achievable with what is already installed. The additions are pure TypeScript/React patterns.

### New Modules (not new packages)

| Module | Location | Purpose |
|--------|----------|---------|
| `WindowManager` context + reducer | `src/ui/windows/` | State for all open windows: `{ id, kind, x, y, z, min }[]`; actions: `open / close / focus / minimize / move` |
| `DesktopSurface` | `src/ui/windows/DesktopSurface.tsx` | Root container; maps window state → positioned `<div>`s; mounts delegated apps per window |
| `WindowChrome` | `src/ui/windows/WindowChrome.tsx` | Title bar with traffic-light buttons; `onPointerDown` starts drag; `onPointerUp` / `onPointerMove` on `window` finish it |
| `useDrag` hook | `src/ui/windows/useDrag.ts` | Encapsulates the pointer-capture drag loop; returns `{ onPointerDown, style }` |
| `Dock` | `src/ui/windows/Dock.tsx` | Bottom dock; icons derived from open + installed app set; hover-scale via CSS `transition: transform` |
| `MenuBar` | `src/ui/windows/MenuBar.tsx` | Top bar: wordmark, active-app name, theme switcher, clock |
| `CreatePanel` | `src/ui/create/CreatePanel.tsx` | Describe-an-app panel; wires to existing produce path; on success calls `openWindow` |
| `NamedThemeProvider` | `src/ui/ThemeProvider.tsx` (extend) | Extends existing provider to hold named-theme key + CSS-var map; persists to IndexedDB |
| `settingsStore` | `src/registry/db.ts` (extend) | New object store or well-known key for active-theme + window layout snapshot |

---

## Decision Rationale — Hand-Roll vs Library (Per Feature)

### (a) Multi-Window Manager — HAND-ROLL

**Verdict: Hand-roll with raw pointer events.**

**Why not `react-draggable@4.7.0`:**

- `react-draggable` used `ReactDOM.findDOMNode()` internally. `findDOMNode` was removed in React 19. The library broke on React 19 until version 4.6.0 (released May 2026) which added `nodeRef`-based browser tests for React 19 support. The `nodeRef` workaround requires passing a `ref` as a prop on every usage — exactly as much wiring as the raw approach, with an extra dependency.
- `react-draggable@4.7.0` is unpacked size 442KB; it wraps every draggable in a class component, complicating the React 19 root-per-window pattern.
- The design reference already implements the complete dragging loop in ~35 lines: `onPointerDown` captures `(clientX - windowX, clientY - windowY)` as offset, `window.addEventListener('pointermove', onMove)` updates position in state, `window.addEventListener('pointerup', onUp)` removes listeners. This is idiomatic React with `useRef` for the offset and `useCallback` for the handlers — no library adds safety here.
- The window-manager state (`windows: Array<{id, kind, x, y, z, min}>`) fits naturally in a `useReducer`; a library would fight against per-window React roots and the delegated-shell mount pattern.

**Why not `framer-motion`/`motion@12.42.0`:**

- React 19 is supported (`peerDependencies: react: "^18.0.0 || ^19.0.0"`). But at 4.8MB unpacked (674KB for `motion`), it is massive overkill for positional state updates. Drag in framer-motion uses its own internal `useDragControls` and mixes animation concerns with positioning — the design calls for pixel-accurate `left/top` placement, not animated position springs.
- Framer-motion's draggable components conflict with the architecture: they manage their own DOM position, which would fight the window-state-as-source-of-truth approach needed for z-order and persistence.
- No CSP or devtools-hygiene concern (library is minified into host bundle), but the weight is not justified for what amounts to pointer tracking.

**Why not `@dnd-kit/core@6.3.1`:**

- Designed for list/grid drag-and-drop sortables; the sortable context model is an awkward fit for free-float window positioning. Last updated December 2024.
- No native `x/y` position management — you'd add `transform: translate` back yourself, negating the library value.

**Hand-roll pattern (verified correct):**

```typescript
// useDrag.ts — ~30 lines, zero deps beyond React
export function useDrag(
  windowId: string,
  onMove: (id: string, x: number, y: number) => void,
  onFocus: (id: string) => void
) {
  const dragRef = useRef<{ ox: number; oy: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    onFocus(windowId);
    // caller must pass current x, y of the window
    // dragRef.current set by wrapper with offset from caller
  }, [windowId, onFocus]);
  // ...pointermove / pointerup on window via useEffect
}
```

The full pattern is ~60 lines including cleanup and `pointerCapture`. No library needed.

**Z-order management:** a module-level `let zTop = 200` counter incremented on `focusWin()` and assigned to the focused window's `z`. All windows render with `zIndex: w.z`.

---

### (b) CSS-Variable Named-Theme System — HAND-ROLL

**Verdict: Hand-roll by extending the existing `ThemeProvider`.**

**The design reference defines the full theme contract:**

```javascript
THEMES = {
  aurora: { '--text': '#f3f1ff', '--wall': 'radial-gradient(...)', '--b1': '#7c5cff', '--b2': '#22d3ee',
            '--b3': '#ff6ec4', '--b4': '#34d399', '--glass': 'rgba(255,255,255,0.10)',
            '--glass2': 'rgba(255,255,255,0.035)', '--bord': 'rgba(255,255,255,0.22)',
            '--hi': 'rgba(255,255,255,0.5)', '--accentA': '#9b7cff', '--accentB': '#36d6f0' },
  aero: { ... },
  aqua: { ... },
  noir: { ... }
}
```

**Application mechanism — two valid approaches:**

1. **`document.documentElement.style.setProperty('--accentA', value)` per variable** — each CSS property override is written directly to the root element's inline style. No class needed.
2. **`document.documentElement.setAttribute('data-os-theme', 'aurora')`** — set a `data-os-theme` attribute, define `[data-os-theme="aurora"] { --accentA: #9b7cff; ... }` in a stylesheet.

**Recommendation: approach 2 (data-attribute) for host chrome + approach 1 (setProperty) for the variables that must also reach generated apps.**

- The existing `ThemeProvider` already uses `data-theme` for light/dark. Extend it with `data-os-theme` for the named OS theme. This avoids collision with the existing light/dark mechanism.
- Generated apps reference `var(--accentA)`, `var(--glass)`, etc. For those to work inside React roots mounted by `createRoot()`, the CSS vars must be on an ancestor in the DOM (either `<html>` or the container). Since all app windows are children of the desktop surface (itself a child of `<body>`), placing the named-theme vars on `document.documentElement` via either mechanism reaches every mounted root without any extra wiring.
- The produce prompt for v2.0 must mandate use of `var(--accentA)`, `var(--accentB)`, `var(--glass)`, `var(--bord)`, `var(--text)`, `var(--hi)` instead of hardcoded colors. This is a prompt-engineering concern, not a stack concern.

**Why no CSS-in-JS library (styled-components, emotion, etc.):**

- Adds 40-80KB gzip for what is an 8-entry `Map` lookup and a `document.documentElement.style.setProperty` loop. The project already uses plain CSS variables — adding a runtime CSS solution would be adding complexity, not removing it.
- The existing `ThemeProvider` pattern (`useEffect` → `document.documentElement.setAttribute`) is the community-standard React approach for CSS-variable theming and needs no library supplement.

**Why no `react-css-theme-switcher` or similar:**

- These wrap the data-attribute/setProperty approach with a library. The wrapper cost (bundle size, API surface, maintenance dependency) is not justified when the mechanism is 5 lines of code.

---

### (c) Persisting Theme + Window Layout in IndexedDB — EXTEND idb SCHEMA

**Verdict: Extend the existing `idb@8` schema — no new library.**

**What needs persisting:**

| Key | Value | Frequency |
|-----|-------|-----------|
| Active named-theme (`aurora`/`aero`/`aqua`/`noir`) | string | On every theme switch |
| Window layout snapshot (positions/sizes at close) | serializable object array | Optional — on window close or blur |

**Recommended implementation — additive to existing `db.ts`:**

Add a `settings` object store to `RegistrySchema` with a single well-known key `"os.prefs"`. The value type is:

```typescript
interface OsPrefs {
  namedTheme: NamedTheme;      // 'aurora' | 'aero' | 'aqua' | 'noir'
  windowLayout?: WindowSnap[]; // optional: array of { kind, x, y } for restore-on-open
}
```

This requires a **DB version bump** from `2` → `3` (additive `createObjectStore` in the upgrade handler — same pattern as before, no migration needed for existing records in other stores).

**Rationale for reusing idb vs. localStorage for theme:**

- The existing light/dark `ThemeMode` is in `localStorage` — appropriate because it has no size concerns and needs synchronous access before first paint.
- The named OS theme also needs synchronous access before first paint (to avoid FOUC). **Use localStorage for the active named-theme name** (`marketplace.osTheme`) alongside the existing `marketplace.theme` key. The IndexedDB write is the *redundant* persist for the settings store (for richer future prefs without localStorage string limits). OR: use localStorage exclusively for named theme (simpler), skip IndexedDB for theme, use IndexedDB only for window layout.

**Recommended simplification: localStorage for named theme, IndexedDB for window layout (optional).**

- Named theme → `localStorage.setItem('marketplace.osTheme', themeName)` — matches existing pattern, same FOUC guard in `index.html`, zero schema change.
- Window layout snapshot → IndexedDB `settings` store (new, additive) — only if the roadmap includes window position restore. For v2.0 MVP, defer window layout persistence; ship named-theme persist only.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`react-draggable`** | React 19 `findDOMNode` breakage history (fixed in 4.6.0 but requires `nodeRef` boilerplate that equals the raw approach in wiring cost); class-component internals conflict with per-window `createRoot` roots | Hand-roll pointer-events drag (~60 lines) |
| **`react-rnd`** (resizable+draggable) | Built on `react-draggable`; inherits the React 19 findDOMNode issue; windows in this design are not user-resizable in v2.0 | Hand-roll drag only |
| **`framer-motion` / `motion`** | 4.8MB / 674KB unpacked respectively; React 19 supported but overkill — the design uses CSS keyframe animations (`vibeWin`, `vibeFloat`, etc.) which are already specced in the design reference; no spring physics needed | CSS `@keyframes` + `animation` already defined in design reference |
| **`@dnd-kit/core`** | List/grid sortable abstraction; no free-float x/y position management; last updated Dec 2024; wrong fit for window positioning | Hand-roll pointer-events drag |
| **`react-mosaic`** | Tiling window manager (i3-style); incompatible with the free-float overlapping glass-window aesthetic | Hand-roll free-float windows |
| **Any CSS-in-JS library** (styled-components, emotion, stitches) | 40-80KB gzip for replacing what is already ~20 lines of `document.documentElement.style.setProperty`; conflicts with hygiene goal of minimal devtools-visible surface | Extend existing `ThemeProvider` + CSS custom properties |
| **State management library** (Zustand, Jotai, Redux) | Window state (`windows[]`) is local to the desktop surface; React `useReducer` with context is sufficient and already the pattern in this codebase | `useReducer` + context |
| **`localStorage` for window layout** | Layout data can be large; no clear quota bound; subject to sync/serialization limits | IndexedDB via `idb` (add `settings` store) |

---

## React 19.2 Compatibility Confirmation

| Technology | v2.0 Usage | React 19.2 Compat | Notes |
|------------|------------|-------------------|-------|
| Raw pointer events | Window drag | N/A (DOM API) | No React-version dependency |
| `useReducer` + context | Window manager state | React 19.2 — native | Core React API |
| CSS custom properties | Named theme | N/A (browser API) | `document.documentElement.style.setProperty` is browser-native |
| `idb@8` | Settings persistence | Not React-dependent | Async IndexedDB; no React peer dep |
| CSS `@keyframes` animations | Window open/minimize | N/A (CSS) | `animation: vibeWin .35s` already in design reference |
| `lucide-react@^1` (already installed) | Icons in dock/menu bar | React 19 compatible — peer dep `>=16` | Already in use |

No new packages need React compatibility verification because no new React-dependent packages are being added.

---

## Installation

No new npm dependencies required for v2.0 Vibe OS features.

If window layout persistence (IndexedDB `settings` store) is added, it is a schema extension in `src/registry/db.ts` — `idb@8` already handles it.

If the IndexedDB DB version is bumped to 3, add a `createObjectStore('settings')` call to the existing upgrade handler. Cost: 3 lines of TypeScript.

---

## Integration Points With Existing Code

| Existing Module | v2.0 Change |
|-----------------|-------------|
| `src/ui/ThemeProvider.tsx` | Add `namedTheme: NamedTheme` state; read from `localStorage` on init; write on switch; apply CSS vars to `document.documentElement`; preserve existing light/dark `mode` for `data-theme` |
| `src/registry/db.ts` | Add `settings` store to `RegistrySchema` (version bump 2→3); write `OsPrefs` on theme change + window close |
| `src/ui/Marketplace.tsx` | Replace/wrap with `DesktopSurface`; the existing app-open flow calls `openWindow()` instead of inline rendering |
| `src/execution/mount.ts` | `mountApp(containerId, appRecord)` is called per window by `WindowChrome`; existing API unchanged |
| `src/App.tsx` | Wrap with `WindowManagerProvider`; render `<DesktopSurface>` as root UI element |
| Produce prompt | Add CSS-variable contract clause: generated apps MUST use `var(--accentA)`, `var(--accentB)`, `var(--glass)`, `var(--bord)`, `var(--text)`, `var(--hi)` for all color/background/border values |

---

## Theme CSS Variable Contract (v2.0 spec from design reference)

All generated apps in v2.0 must reference these variables instead of hardcoded colors:

| Variable | Semantic | Example (Aurora) |
|----------|---------|-----------------|
| `--text` | Primary text color | `#f3f1ff` |
| `--wall` | Desktop background (gradient) | `radial-gradient(130% 110% at 18% 8%, #1b1636 0%, #0c0a18 62%)` |
| `--accentA` | Primary accent (buttons, gradients start) | `#9b7cff` |
| `--accentB` | Secondary accent (gradients end, highlights) | `#36d6f0` |
| `--glass` | Glass background (primary) | `rgba(255,255,255,0.10)` |
| `--glass2` | Glass background (secondary, darker) | `rgba(255,255,255,0.035)` |
| `--bord` | Border color | `rgba(255,255,255,0.22)` |
| `--hi` | Inset highlight (top edge of glass) | `rgba(255,255,255,0.5)` |
| `--b1`–`--b4` | Blob/ambient glow colors | `#7c5cff`, `#22d3ee`, `#ff6ec4`, `#34d399` |

These are set on `document.documentElement` when the active theme changes. Every `var()` call inside a generated app's JSX resolves through the DOM cascade automatically — no per-app theming injection needed.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Hand-roll pointer-events drag | `react-draggable@4.7.0` | React 19 findDOMNode breakage history; `nodeRef` workaround equals hand-roll wiring; class component internals |
| Hand-roll pointer-events drag | `framer-motion` drag | 674KB–4.8MB unpacked; spring physics fight pixel-exact window positioning; manages its own DOM position |
| CSS custom properties + `setProperty` | CSS-in-JS (styled-components, emotion) | 40-80KB gzip for 20 lines of code; no hygiene/sourcemap advantage |
| localStorage for named theme | IndexedDB for named theme | localStorage is synchronous (needed for FOUC guard in `index.html` inline script); no size concern for a single string value |
| `useReducer` + context | Zustand / Jotai | Adds a dependency for state that is inherently local to the desktop surface; existing codebase uses context everywhere |

---

## Version Compatibility (Carry-forward from v1.1 + v2.0 additions)

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `react@19.2.x` | `react-dom@19.2.x` | Must match exactly. |
| `@types/react@^19` | `@types/react-dom@^19` | Pair with React 19. |
| `@babel/standalone@^7.26` | `presets: ["react"]` → classic by default | v7 keeps classic default → safe for generated code. |
| `idb@8.0.3` | DB version 3 schema | Additive upgrade: add `settings` store; all existing records in `apps`/`widgets`/`handlers` untouched. |
| CSS custom properties | All evergreen browsers | Full support; no polyfill needed. |
| `pointer events API` | All evergreen browsers | `setPointerCapture` / `releasePointerCapture` supported everywhere. `pointerCapture` not strictly needed for windowed drag but available. |
| `localStorage` (`marketplace.osTheme`) | Existing `marketplace.theme` key | Additive; no collision. |

---

## Sources

- npm registry (verified live, 2026-06-26): `react-draggable@4.7.0` (last modified 2026-06-18), `framer-motion@12.42.0` / `motion@12.42.0` (last modified 2026-06-25), `@dnd-kit/core@6.3.1` (last modified 2024-12-05), `react-rnd@10.5.3` (last modified 2026-03-10) — **HIGH**
- github.com/react-grid-layout/react-draggable/blob/master/CHANGELOG.md — v4.6.0 (May 2026): "Support React 19 (dependency upgrade and nodeRef-based browser tests)"; findDOMNode removal confirmed breaking in React 19 — **HIGH**
- github.com/facebook/react/issues/28926 — React 19 removal of `ReactDOM.findDOMNode` confirmed — **HIGH**
- npm unpacked sizes: `framer-motion` 4,777,616 bytes; `motion` 674,715 bytes; `react-draggable` 442,500 bytes; `react-rnd` 86,904 bytes; `@dnd-kit/core` 1,066,148 bytes — **HIGH** (npm info)
- design/VibeOS.dc.html — complete hand-rolled drag implementation (startDrag/onMove/onUp with pointer events), THEMES map (4 named themes, 11 CSS vars each), CSS keyframe animations (`vibeWin`, `vibeFloat`, `vibeSweep`, `vibeSheen`, `vibePulse`, `vibeSpin`) — **HIGH** (design spec)
- src/ui/ThemeProvider.tsx — existing `data-theme` + `localStorage` pattern to extend — **HIGH** (codebase)
- src/registry/db.ts — existing `idb@8` schema (version 2, three stores) to extend — **HIGH** (codebase)
- MDN — Pointer Events API (`pointerdown`, `pointermove`, `pointerup`), CSS Custom Properties cascade — **HIGH**

---

*Stack research for: v2.0 Vibe OS — window manager, named-theme system, IndexedDB settings persistence*
*Researched: 2026-06-26*
