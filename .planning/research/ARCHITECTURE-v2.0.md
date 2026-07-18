# Architecture Research: v2.0 Vibe OS Integration

**Domain:** Multi-window desktop OS shell layered over an existing React 19 generative app marketplace
**Researched:** 2026-06-26
**Confidence:** HIGH (based on direct inspection of all named source files)

---

## System Overview — Current vs Target

### Current (v1.1)

```
App.tsx
  ThemeProvider (localStorage: "marketplace.theme")
    AppBar  (wordmark | Account | light/dark/system toggle)
    main
      Marketplace
        .storefront-grid  (app cards)
        .opened-apps      ([AppShell > Component] — vertical list, no z-order)

Data stores: IndexedDB "MarketplaceRegistry"  apps | widgets | handlers
Mount layer: mount.ts  Map<instanceId, Root>  (one createRoot per instance, already supports N)
App open:    Marketplace.handleOpen → resolveComponent → mountApp
```

Current AppShell is a thin chrome wrapper (title + menu + close). Apps render in a vertical
`opened-apps` div — one-at-a-time in practice; the mount layer already supports N concurrent
roots but the UX never leveraged z-order, drag, or minimize.

### Target (v2.0 Vibe OS)

```
App.tsx (MODIFIED)
  VibeThemeProvider  (IndexedDB "settings" → activetheme: string)
    DesktopShell  (NEW — owns window manager state + OS chrome)
      MenuBar  (MODIFIED AppBar — wordmark, active-app, theme pills, clock, account)
      .vibe-desktop
        CreatePanel  (NEW — describe-then-open, wired to real produce)
        WindowFrame  (NEW, × N — macOS-style chrome, drag, z-order, traffic lights)
          AppShell   (KEPT — contextual prompt popover, unchanged)
            Component (mounted via mountApp as before)
      Dock  (NEW — store icon + running-app icons, hover-scale)

Data stores: IndexedDB "MarketplaceRegistry"  apps | widgets | handlers | settings (NEW)
Mount layer: mount.ts UNCHANGED — roots Map already supports N concurrent roots
App open:    DesktopShell.handleOpen → resolveComponent → WindowFrame.mountApp
```

---

## New vs Modified Component Inventory

### NEW Components / Modules

| File | Type | Responsibility |
|------|------|----------------|
| `src/ui/DesktopShell.tsx` | React component | OS chrome root: owns `WindowEntry[]` state, `handleOpen/Close/Modify`, clock tick, dock state, delegates to MenuBar + desktop surface + Dock. Replaces `Marketplace` as the top-level page component. |
| `src/ui/useWindowManager.ts` | Custom hook | Encapsulates `WindowEntry[]` state: `openApp`, `focusWin`, `closeWin`, `minWin`, drag logic (pointer events). Returned from `DesktopShell` to pass down as props. |
| `src/ui/DesktopContext.ts` | React context | `{ openApp, activeWindowName }` — narrow context so Dock and MenuBar can call `openApp` and show the active name without consuming the full window array (avoids re-rendering on drag ticks). |
| `src/ui/WindowFrame.tsx` | React component | Per-window chrome: macOS traffic lights (close/min/placeholder-max), drag handle (pointer events), title + icon. Renders `<div ref={containerRef}>` as app content area; mounts via `mountApp` on effect, unmounts on cleanup. Wraps `AppShell` as its inner content region. |
| `src/ui/Dock.tsx` | React component | Bottom dock bar: store icon always present; per-running-window icons (derived from `windows` array, memoized); running-indicator dot; hover-scale CSS transform; click → focus/restore. |
| `src/ui/CreatePanel.tsx` | React component | Centered describe-then-open panel: text input + "Vibe it" button → vibing state (step text + progress bar, cosmetic timer) → result card (Open / Discard). Calls `DesktopShell.handleOpen` prop. |
| `src/ui/VibeThemeProvider.tsx` | React component | Replaces `ThemeProvider`. Loads active theme name from IDB `settings` on mount; applies the named theme's CSS variable set via `document.documentElement.style.setProperty`; exposes `{ themeName, setTheme }` via context; also writes to `localStorage` on every switch for the FOUC script. |
| `src/ui/VibeThemeContext.ts` | React context | `{ themeName: string; setTheme: (name: string) => void; themes: Record<string, ThemeVars> }` |
| `src/ui/MenuBar.tsx` | React component | Evolved from `AppBar.tsx`: "Vibe OS" wordmark, active-window-name display, Aurora/Aero/Aqua/Noir theme pills, live clock (`setInterval`), Account key icon. Reads from `VibeThemeContext` and `DesktopContext`. |
| `src/registry/settings.ts` | Module | `getActivetheme(): Promise<string>`, `setActivetheme(name: string): Promise<void>`, `DesktopSettings` interface. Uses IDB `settings` store. |

### MODIFIED Components / Modules

| File | Change | Why |
|------|--------|-----|
| `src/App.tsx` | Replace `ThemeProvider` with `VibeThemeProvider`; replace `AppBar + main > Marketplace` with `DesktopShell`. `ServicesProvider` stays. | New OS layout tree. |
| `src/registry/db.ts` | Add `settings` object store to `RegistrySchema`; add `SettingsRecord` interface; bump `REGISTRY_DB_VERSION` to 3; additive upgrade (create `settings` store if absent — same pattern as v1→v2). | Persist active theme name and future desktop prefs. |
| `src/execution/producer.ts` `buildPrompt()` | Replace `var(--color-surface), var(--color-text), var(--color-accent)` with `var(--accentA), var(--accentB), var(--text), var(--glass), var(--bord)` in ALL 4 branches (`"delegated"`, `"app"`, `"shell"`, `"widget"`). | Theme-aware generation — apps must reference the v2.0 variable contract to re-skin on theme switch. |
| `index.html` FOUC script | Read `localStorage.getItem("vibe.activetheme")`; map the name to the full CSS variable block for that theme; set each via `document.documentElement.style.setProperty` — synchronously before React loads. Update `csp.test.ts` SHA-256 hash after the script changes. | Named themes require the full var block on first paint, not just `data-theme="dark"`. |
| `src/index.css` | Add `:root` alias bridge: `--color-surface: var(--glass); --color-text: var(--text); --color-accent: var(--accentA)`. | Cached apps still reference `--color-*`; the bridge forwards to the new vars so they re-skin correctly until their LRU entry evicts naturally. |

### RETIRED Components

| File | Disposition |
|------|-------------|
| `src/ui/Marketplace.tsx` | Logic moves to `DesktopShell.tsx` (handleOpen/Close/Modify) and `CreatePanel.tsx` (storefront UI). Keep as dead file until tests are ported, then delete. |
| `src/ui/ThemeProvider.tsx` | Superseded by `VibeThemeProvider`. `useTheme` hook becomes `useVibeTheme`. Keep until all imports updated. |
| `src/ui/AppBar.tsx` | Superseded by `MenuBar.tsx`. |

`AppShell.tsx` is KEPT unchanged — `WindowFrame` renders `<AppShell>` as its inner content region. The contextual-prompt wiring (⋮ menu → `ContextualPrompt` → `onModify`) remains in `AppShell`.

---

## Integration Point Detail

### 1. Window Manager — Where State Lives

**Decision: new `useWindowManager` hook owns state. Do NOT extend `mount.ts`.**

`mount.ts` is a pure DOM-layer utility (`Map<instanceId, Root>`). Mixing UI state (x/y/z/min/drag) into it would turn a pure utility into a stateful UI concern. Two parallel Maps is the right model:

```
useWindowManager state:          mount.ts module:
WindowEntry[]                    Map<instanceId, Root>
  id / appType / displayName     (keyed by same instanceId)
  Component / x / y / z / min
  needsAuth / throttled
```

**WindowEntry shape:**

```typescript
interface WindowEntry {
  id: string;                 // "appType-N" — matches instanceId in mount.ts
  appType: string;
  displayName: string;
  Component: ComponentType | null;
  x: number;                  // px from desktop left
  y: number;                  // px from desktop top; min 44 (below MenuBar)
  z: number;                  // z-index; monotonically increasing per focus
  min: boolean;               // minimized to dock
  needsAuth?: boolean;
  throttled?: boolean;
}
```

**z-order rule**: module-level `let ztop = 200` counter in `useWindowManager.ts`; `++ztop` on every `openApp` or `focusWin`. `focusWin(id)` sets `w.z = ztop, w.min = false` for the target only. `openApp(appType, ...)`: if a window for that appType already exists (by `appType` match), focus it instead of opening a second — prevents duplicate windows for the same app type (matches design reference `openApp` behavior).

**Drag**: `onPointerDown` on the title bar records `drag = { id, ox, oy }` in a `useRef` (NOT `useState` — avoids re-rendering on every pointer move). `window.addEventListener("pointermove"/"pointerup")` added on drag start, removed on end. Only `pointerup` commits the final x/y to `setState`. Y-floor = 44px so windows cannot drag behind MenuBar.

**React root lifecycle in WindowFrame:**

```typescript
// WindowFrame.tsx (simplified)
const containerRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  if (containerRef.current && entry.Component) {
    mountApp(entry.id, containerRef.current, entry.Component);
  }
  return () => unmountApp(entry.id);  // cleanup on window close
}, [entry.Component]);
```

On `closeWin(id)` in `DesktopShell.handleClose`:
1. `evictLiveComponent(id)` — clears `liveComponents` Map in `loader.ts`
2. `closeWin(id)` — removes `WindowEntry` from React state, unmounting `WindowFrame`
3. `WindowFrame` cleanup effect — calls `unmountApp(id)`, clears `roots` Map in `mount.ts`

This three-step teardown matches the existing `Marketplace.handleClose` exactly. No new leak surface.

### 2. Theming — CSS Variable Inheritance Through `new Function`-Mounted Subtrees

**Does CSS inheritance reach generated app windows? YES — unconditionally.**

CSS custom properties are inherited through the DOM tree regardless of React root boundaries. They flow from `document.documentElement` (where `VibeThemeProvider` sets them via `style.setProperty`) through all descendants, including `<div>` containers that host independent React roots created by `createRoot()`. The `new Function` scope is a JavaScript execution boundary, not a CSS one. As long as the container `<div>` is a DOM descendant of `<html>`, all custom properties propagate.

**VibeThemeProvider applies themes by setting properties directly on `document.documentElement`:**

```typescript
function applyNamedTheme(vars: ThemeVars): void {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(vars)) {
    root.style.setProperty(prop, value);
  }
}
```

This replaces the `data-theme` attribute + CSS rule approach. No CSS file needed for the named-theme vars — they are all set inline on `:root` via JS, which overrides any stylesheet rule (inline styles win the cascade on the element where they are set).

**Named theme registry** (from design reference `THEMES` object):

```typescript
export const VIBE_THEMES: Record<string, ThemeVars> = {
  aurora: {
    "--text": "#f3f1ff", "--accentA": "#9b7cff", "--accentB": "#36d6f0",
    "--glass": "rgba(255,255,255,0.10)", "--glass2": "rgba(255,255,255,0.035)",
    "--bord": "rgba(255,255,255,0.22)", "--hi": "rgba(255,255,255,0.5)",
    "--wall": "radial-gradient(130% 110% at 18% 8%, #1b1636 0%, #0c0a18 62%)",
    "--b1": "#7c5cff", "--b2": "#22d3ee", "--b3": "#ff6ec4", "--b4": "#34d399",
  },
  aero: { "--text": "#eef6ff", "--accentA": "#4aa3ff", "--accentB": "#67e8f9",
    "--glass": "rgba(180,220,255,0.16)", "--glass2": "rgba(120,180,255,0.05)",
    "--bord": "rgba(180,220,255,0.34)", "--hi": "rgba(255,255,255,0.6)",
    "--wall": "radial-gradient(130% 120% at 50% -20%, #15406e 0%, #0a1f3a 55%, #06101f 100%)",
    "--b1": "#4aa3ff", "--b2": "#6ad0ff", "--b3": "#67e8f9", "--b4": "#3b82f6" },
  aqua: { /* ... */ },
  noir: { /* ... */ },
};
```

**Live update on theme switch**: `style.setProperty` on `document.documentElement` instantly updates the CSS cascade for every element in the page — MenuBar, WindowFrame chrome, Dock, and every generated app's inline styles that reference `var(--accentA)` etc. No component remounting, no React re-render triggered by the theme switch itself.

**Coexistence with legacy `--color-*` variables**: The old `ThemeProvider` set `data-theme` and the CSS file had `[data-theme="dark"]` rules for `--color-surface`, `--color-text`, `--color-accent`. Generated apps cached before this milestone reference those vars. The `:root` alias bridge in `index.css` forwards them to the new vars:

```css
:root {
  --color-surface: var(--glass);
  --color-text: var(--text);
  --color-accent: var(--accentA);
}
```

This must be in place BEFORE `buildPrompt()` is updated. New produces use `--accentA/--text/--glass`; old cached apps use `--color-*` which cascade through the alias. Seamless during the transition period.

### 3. Theme Persistence and No-FOUC

**Persistence: new `settings` object store in the existing `MarketplaceRegistry` IDB (version 3).**

```typescript
// db.ts additions
export interface SettingsRecord {
  key: string;    // e.g. "activetheme"
  value: unknown;
}
// RegistrySchema:
settings: { key: string; value: SettingsRecord };
// REGISTRY_DB_VERSION = 3
// upgrade: if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
```

**No-FOUC strategy**: IDB reads are async; `VibeThemeProvider.useEffect` fires after first paint. Solution (same pattern as the existing FOUC fix):

1. `VibeThemeProvider` writes `localStorage.setItem("vibe.activetheme", name)` on every theme switch.
2. The inline FOUC script in `index.html` reads `localStorage.getItem("vibe.activetheme")`, maps the name to the full CSS variable block (all vars for that theme inlined in the script), and sets them via `document.documentElement.style.setProperty(...)` — synchronously, before the React module loads.
3. `VibeThemeProvider` reads from IDB on mount (async), confirms / corrects any discrepancy.

The FOUC script in `index.html` must be updated to embed all 4 theme variable maps (as a plain JS object literal — no imports). The SHA-256 hash in the CSP `meta` tag and `csp.test.ts` must be recomputed after the script changes.

**Cold start default**: `"aurora"`. Both the FOUC script and `VibeThemeProvider` fall back to `"aurora"` when `localStorage` has no `vibe.activetheme` entry.

### 4. Theme-Aware Generation — Produce Prompt Change

**Location**: `src/execution/producer.ts` → `buildPrompt()` — 4 branches.

**Current** (all 4 branches contain a variant of):
```
- Uses CSS variables for theming: var(--color-surface), var(--color-text), var(--color-accent)
```
or (delegated branch):
```
Theme using the host's EXISTING variables var(--color-surface), var(--color-text), var(--color-accent) inside the inline styles
```

**Replace with** (same in all 4 branches):
```
- STYLING: style EVERYTHING with inline style={{ ... }}. Theme using the host's EXISTING CSS
  variables: var(--accentA) for primary/accent elements, var(--accentB) for secondary accents
  and highlights, var(--text) for all body text, var(--glass) for panel/card backgrounds,
  var(--bord) for borders. These are always defined — do NOT hardcode colors.
```

**Why `buildPrompt()` and not a wrapper**: the prompt string is the single place that establishes the CSS variable contract visible to the model. No runtime mechanism can retroactively change what a cached compiled string references. The prompt is the only lever.

**Impact on cached records**: existing cached `AppRecord.transpiledJS` entries reference `--color-*`. With the alias bridge in place they still render correctly. New produces reference `--accentA/--text/--glass`. Mixed state is acceptable — apps look correct on either variable set because the alias forwards `--color-*` → `--accentA/--glass`. Remove the alias bridge only after a milestone that invalidates cached entries (e.g. forced re-generation), or after LRU natural eviction.

**WindowFrame palette**: `WindowFrame` chrome uses the same vars in its own inline styles (`--glass`, `--glass2`, `--bord`, `--hi`, `--accentA`) — matching the design reference window style exactly. App content inside `WindowFrame` inherits these via CSS cascade. No prop-passing needed.

### 5. Create Panel — Wiring Describe→Open to the Real Produce Path

**`CreatePanel` calls `DesktopShell.handleOpen(appType, displayName)` via a prop. No new IoC seam.**

```typescript
// CreatePanel props
interface CreatePanelProps {
  onOpen: (appType: string, displayName: string) => Promise<void>;
  // onOpen is DesktopShell.handleOpen — same signature as Marketplace.handleOpen
}
```

**`appType` from free-form text** (`src/ui/createPanelUtils.ts`):
1. Keyword match table: "pomodoro/timer/focus/countdown" → `"pomodoro"`, "calc/math/bill/split/tip" → `"calculator"`, "weather/forecast/temp" → `"weather"`, "note/todo/write/jot/memo" → `"notes"`, "music/song/radio/lofi/audio" → `"music"`.
2. Fallback: sanitize the raw query to `[a-z0-9-]` and truncate to 30 chars. This becomes the `appType` slug, cached under `registryKey("app", slug)`. Re-describing with slightly different words produces a different slug → new cache entry; exact-same description → instant cache hit. Acceptable for v2.0.

**Progress affordance vs real produce latency**:
- `CreatePanel` has local state: `phase: "idle" | "vibing" | "result"`.
- "Vibe it" clicked: `phase = "vibing"`, start cosmetic `setInterval` cycling step text.
- `onOpen(appType, displayName)` called concurrently (returns a Promise).
- On Promise resolve: stop interval, `phase = "result"` (show result card with Open/Discard).
- On Promise reject: stop interval, surface the same auth/throttled/generic fallback copy as `Marketplace`.
- "Open app" in result card: `phase = "idle"`, window is already in `DesktopShell` state (was added on resolve), so it is visible. "Discard": `phase = "idle"`, call `closeWin` on the just-opened instance.

The key insight: `handleOpen` in `DesktopShell` adds the window to state when the component resolves — before the user clicks "Open app." The window is in `min: true` state until the user explicitly opens it, OR it opens immediately (UX decision — the design reference shows an "Open app" confirmation step which is recommended for v2.0).

---

## Data Flows

### Window Open (from CreatePanel or Dock click)

```
CreatePanel: user types → "Vibe it"
  → createPanelUtils.deriveAppType(query)  → appType slug
  → props.onOpen(appType, displayName)     → DesktopShell.handleOpen
      → resolveOpenApp(appType)            [intent/resolver.ts — UNCHANGED]
      → resolveComponent(instanceId, ...)  [execution/loader.ts — UNCHANGED]
          → tier 1/2/3 hit → Component
          → full miss → produceComponent   [producer.ts — prompt MODIFIED]
      → useWindowManager.addWindow({ ..., Component })
          → WindowEntry pushed, ztop++, x/y positioned
  → Promise resolves → CreatePanel: phase = "result"
  → User clicks "Open app" → window visible (or already visible with min:false)
  → WindowFrame mounts: useEffect → mountApp(instanceId, containerRef, Component)
```

### Theme Switch

```
User clicks theme pill in MenuBar ("Aero")
  → VibeThemeContext.setTheme("aero")
  → VibeThemeProvider: applyNamedTheme(VIBE_THEMES["aero"])
      → document.documentElement.style.setProperty("--accentA", "#4aa3ff")
      → ... (all vars for "aero")
  → localStorage.setItem("vibe.activetheme", "aero")   ← FOUC guard
  → await settings.setActivetheme("aero")              ← IDB persist
  → CSS cascade updates instantly across ALL elements:
      MenuBar chrome (--accentA/--glass/--bord)
      WindowFrame chrome (--glass/--glass2/--bord/--hi)
      Generated app inline styles (var(--accentA)/var(--text)/var(--glass))
      Dock (--accentA running dots)
      Desktop background (--wall gradient applied to .vibe-desktop)
  → No component remount, no React re-render triggered by CSS cascade
```

### Window Close (three-step teardown)

```
User clicks traffic-light close in WindowFrame → DesktopShell.handleClose(instanceId)
  1. evictLiveComponent(instanceId)   [loader.ts liveComponents Map]
  2. closeWin(id) in useWindowManager → removes WindowEntry from React state
  3. WindowFrame unmounts → cleanup effect: unmountApp(instanceId) [mount.ts roots Map]
  → Dock running indicator disappears (appType no longer in windows array)
```

### IDB Settings Boot

```
App boots → VibeThemeProvider mounts
  → settings.getActivetheme()    → IDB get("settings", "activetheme")
  → if found: applyNamedTheme(VIBE_THEMES[name])
  → if not: applyNamedTheme(VIBE_THEMES["aurora"])  (cold-start default)
  [FOUC already applied synchronously before React loaded — IDB call is correction only]
```

---

## Architectural Patterns

### Pattern 1: CSS Custom Property Inheritance as the Theme Bridge

**What:** `document.documentElement.style.setProperty(prop, val)` at `VibeThemeProvider` mount/switch. Every DOM descendant inherits these values — including independent React roots inside window frame `<div>` containers. Generated app inline styles referencing `var(--accentA)` etc. re-skin for free with zero React work on theme switch.

**Why it works for `new Function` roots:** CSS custom property inheritance is a DOM property, not a React property. The `new Function` boundary is a JS execution scope; the mounted DOM subtree is a CSS descendant of `<html>` regardless.

**Implication:** theme switching is O(1) — CSS cascade, no component unmount/remount.

### Pattern 2: Two Parallel Maps — React State + DOM Roots

**What:** `useWindowManager` owns `WindowEntry[]` (React state, drives UI re-renders). `mount.ts` `roots` Map (module-level, not React) owns `Map<instanceId, Root>` for safe `unmount()`. Same `instanceId` key; different concerns.

**Why separate:** mixing x/y/z/min/title into `mount.ts` would turn a pure utility into a stateful UI concern. Module-level React state creates stale closure bugs. The split is clean and already established by the v1.1 codebase.

**Invariant:** `handleClose(id)` calls all three cleanup steps in order. Never split them across call sites.

### Pattern 3: AppShell as Inner Contextual-Prompt Region

**What:** `WindowFrame` adds the OS window chrome (traffic lights, drag handle, title). It renders `<AppShell>` as its content region. `AppShell` retains the ⋮ menu → `ContextualPrompt` → `onModify` wiring, unchanged.

**Why keep AppShell:** avoids duplicating the contextual-prompt wiring inside `WindowFrame`. `WindowFrame` knows only about window-manager concerns; `AppShell` knows about app modification. Layered chrome.

### Pattern 4: CreatePanel Progress as Cosmetic, Produce as Parallel

**What:** `setInterval` in `CreatePanel` cycles step text cosmetically. `handleOpen` (real produce) runs in parallel. `CreatePanel` just awaits the Promise; the interval stops on resolution.

**Why:** the real produce loop is a single POST to Haiku returning a complete response. The step text ("Reading your vibe…", "Sketching the layout…") is UX theater. Never wire the UI steps to actual model/compile phases — that would require threading callbacks through the produce loop, adding complexity and leaking the mechanic.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Window x/y State in App-Root Context

**What people do:** lift `WindowEntry[]` into a context at `App.tsx` so any component can call `openApp`.

**Why wrong:** every drag move is `setState` → context re-render → all consumers re-render. At N open windows + a running drag, this is O(N) re-renders per pointer move.

**Do this instead:** `useWindowManager` lives in `DesktopShell` (not App root). Drag deltas go to `useRef` (not state); only `pointerup` commits to state. `DesktopContext` exposes only `openApp` and `activeWindowName` — never the full `windows` array — so Dock and MenuBar don't re-render on drag ticks.

### Anti-Pattern 2: Remounting App Components on Theme Switch

**What people do:** pass `themeName` as a prop to `WindowFrame` or as a key, causing `Component` to unmount/remount when theme changes.

**Why wrong:** remounting destroys component state — a running pomodoro timer, unsaved notes, mid-edit calculator state.

**Do this instead:** CSS custom property cascade (Pattern 1). Generated app state is untouched because the React tree inside the generated root never changes on theme switch — only the inherited CSS vars change.

### Anti-Pattern 3: Updating `buildPrompt()` Without the CSS Alias Bridge

**What people do:** change the prompt vars first, assume old cached apps still look fine.

**Why wrong:** old cached `transpiledJS` references `--color-surface/text/accent`. With the new theme providing only `--accentA/--text/--glass`, old apps render with browser-default colors (black on white) until their cache entry evicts.

**Do this instead:** add the `:root` alias bridge in `index.css` before updating `buildPrompt()`. The alias makes old and new variable names resolve to the same runtime value simultaneously.

### Anti-Pattern 4: Blocking First Paint on IDB Theme Read

**What people do:** `await settings.getActivetheme()` in a `useLayoutEffect` before rendering children.

**Why wrong:** IDB is async; blocking first paint causes a visible unstyled flash longer than the current FOUC fix.

**Do this instead:** the inline FOUC script reads `localStorage` synchronously before React loads. `VibeThemeProvider` reads from IDB asynchronously and corrects any discrepancy — but first paint is always styled.

### Anti-Pattern 5: Opening Multiple Windows for the Same App Type

**What people do:** every "Vibe it" call creates a new window even if one is already open for that app type.

**Why wrong:** duplicate windows for the same component share a `liveComponents` Tier-1 entry by appType but have different instanceIds, creating confusion and unnecessary produce calls.

**Do this instead:** `useWindowManager.openApp` checks `windows.find(w => w.appType === appType)`. If found: `focusWin(existing.id)` instead of opening a new window. The `CreatePanel` result card shows an "Open" button only once; re-clicking "Vibe it" for the same type just focuses the existing window.

---

## Build Order with Hard Ordering Constraints

### Constraints

- **[C1] Theme contract before theme-aware generation**: `VIBE_THEMES` vars must be defined, applied by `VibeThemeProvider`, and proven working in the host before `buildPrompt()` is updated to reference them. Otherwise newly-produced apps reference vars that aren't set until `VibeThemeProvider` mounts — a race condition on cold start or IDB-miss.
- **[C2] IDB schema before VibeThemeProvider**: `settings` store must exist before `settings.ts` can read/write. IDB version bump goes in the same phase as `settings.ts`.
- **[C3] CSS alias bridge before prompt update**: `:root { --color-surface: var(--glass); ... }` must be in `index.css` before any `buildPrompt()` change, so old cached apps keep rendering correctly during the transition.
- **[C4] `useWindowManager` before `WindowFrame`**: `WindowFrame` consumes `WindowEntry`; the shape must be final.
- **[C5] `WindowFrame` before `DesktopShell`**: `DesktopShell` renders `WindowFrame` components.
- **[C6] `DesktopShell` before `CreatePanel`**: `CreatePanel` receives `onOpen` from `DesktopShell`.
- **[C7] FOUC script update in same phase as `VibeThemeProvider`**: shipping the new provider without updating the FOUC script causes a flash between the old `data-theme` application and the new CSS var application on first load.
- **[C8] `csp.test.ts` hash update in same commit as FOUC script**: the test guards the exact hash; a stale hash causes CI failure.

### Recommended Phase Order

**Phase 1 — Theme Foundation** (satisfies C2, C3, C7, C8; unblocks all remaining phases)

- `src/registry/db.ts`: add `SettingsRecord`, add `settings` store, bump `REGISTRY_DB_VERSION` to 3
- `src/registry/settings.ts`: `getActivetheme` / `setActivetheme`
- `src/ui/VibeThemeContext.ts` + `src/ui/VibeThemeProvider.tsx`: `VIBE_THEMES` constant, `applyNamedTheme`, IDB load, `style.setProperty` on switch, `localStorage` write on switch
- `src/index.css`: add `:root` alias bridge (`--color-surface: var(--glass)` etc.)
- `index.html`: update FOUC script (read `vibe.activetheme`, inline theme var maps, `style.setProperty` loop)
- `src/csp.test.ts`: recompute SHA-256 hash for updated FOUC script
- `src/App.tsx`: wrap with `VibeThemeProvider` (can coexist with old `ThemeProvider` briefly)
- Gate: all 552 existing tests still green. `VibeThemeProvider` is additive. New `settings` store is additive (IDB upgrade is non-destructive). Verify theme switching re-skins host chrome visually.

**Phase 2 — Window Manager** (requires Phase 1 for CSS vars on WindowFrame chrome; satisfies C4)

- `src/ui/useWindowManager.ts`: `WindowEntry` type, `openApp`, `focusWin`, `closeWin`, `minWin`, `startDrag/onMove/onUp` (pointer event wiring), `ztop` counter
- `src/ui/DesktopContext.ts`: narrow context (`openApp`, `activeWindowName`)
- `src/ui/WindowFrame.tsx`: traffic lights, drag handle, `containerRef`, `mountApp`/`unmountApp` effects, renders `<AppShell>` as content wrapper
- Unit tests: `useWindowManager` state transitions (open/close/focus/min/drag); `WindowFrame` mount/unmount (verify `mountApp`/`unmountApp` called correctly, no root leaks); `isMounted`/`mountedCount` invariants
- Gate: `mount.ts` root-lifecycle tests still pass; no roots leaked after close

**Phase 3 — Desktop Shell + Dock + MenuBar** (requires Phase 2; satisfies C5)

- `src/ui/MenuBar.tsx`: evolved from `AppBar.tsx` (OS wordmark, active-window name, theme pills reading `VibeThemeContext`, clock, account icon)
- `src/ui/Dock.tsx`: store icon + running-app icons (memoized from `windows` array), hover-scale, click → `focusWin`
- `src/ui/DesktopShell.tsx`: replaces `Marketplace` as top-level page; owns `handleOpen`/`handleClose`/`handleModify` (ported from `Marketplace.tsx`); renders `MenuBar` + desktop surface + `WindowFrame` per entry + `Dock`
- `src/App.tsx`: swap `main > Marketplace` → `DesktopShell`; retire `AppBar`
- Port `Marketplace.test.tsx` → `DesktopShell.test.tsx` (open flow, close flow, auth/throttled/generic fallback, modify routing — same logic, new component home)
- Gate: all ported tests pass; manual verify multiple windows open concurrently with correct z-order and drag

**Phase 4 — Create Panel** (requires Phase 3; satisfies C6)

- `src/ui/createPanelUtils.ts`: `deriveAppType(query: string): string` (keyword map + sanitized-slug fallback)
- `src/ui/CreatePanel.tsx`: idle / vibing / result state machine, cosmetic step-text timer, `props.onOpen` call, result card (Open / Discard)
- Render `CreatePanel` in `DesktopShell` desktop surface (centered, above desktop blobs, below windows at `z-index: 120`)
- `src/ui/CreatePanel.test.tsx`: state transitions (idle→vibing→result→idle), `deriveAppType` unit tests, hygiene check (no banned tokens in copy), integration test (describe → `onOpen` called with correct appType)
- Gate: `hygiene.test.ts` still green (CreatePanel copy must not contain `synthesi*` / `AI` / `llm` / `generate` / `fake` / `mock`)

**Phase 5 — Theme-Aware Generation** (requires Phase 1 for var contract, Phase 3 for windows being visible; satisfies C1)

- `src/execution/producer.ts` `buildPrompt()`: update 4 branches (`"delegated"`, `"app"`, `"shell"`, `"widget"`) — replace `--color-surface/text/accent` with `--accentA/--accentB/--text/--glass/--bord`
- Update/replace any `producer.test.ts` prompt-content fixture assertions to expect new var names
- Verify: produce a new app, open in a window, switch theme → inline styles re-skin correctly
- Gate: `buildPrompt()` unit test that output contains `--accentA` and does NOT contain `--color-surface`; existing instantiation tests still pass (prompt change doesn't affect compile/mount path)

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Window manager state design | HIGH | Direct inspection of `mount.ts`, `Marketplace.tsx`, design reference `openApp/focusWin/closeWin/minWin` |
| CSS var inheritance through `new Function` roots | HIGH | CSS custom property inheritance is a DOM spec property; `new Function` is a JS boundary only |
| Theme persistence + no-FOUC | HIGH | Existing FOUC script pattern confirmed in `index.html`; IDB additive-upgrade pattern confirmed in `db.ts` |
| IDB schema extension | HIGH | v1→v2 additive-upgrade precedent in `db.ts` is directly reusable |
| Produce prompt change | HIGH | `buildPrompt()` source read; change is a string substitution in 4 named branches |
| CreatePanel wiring | HIGH | `handleOpen` signature in `Marketplace.tsx` is directly reusable as a prop; no new seam needed |
| DelegatedShell inside WindowFrame | HIGH | `makeDelegatedComponent` returns a plain `ComponentType`; `WindowFrame` is type-agnostic |
| AppShell reuse inside WindowFrame | HIGH | `AppShell` props (`displayName`, `onClose`, `onModify`, `children`) map directly to WindowFrame needs |

---

## Sources

- Direct source inspection (all files read): `src/execution/mount.ts`, `src/execution/delegated.tsx`, `src/execution/loader.ts`, `src/execution/producer.ts` (full `buildPrompt()` source), `src/ui/AppShell.tsx`, `src/ui/Marketplace.tsx`, `src/ui/ThemeProvider.tsx`, `src/ui/AppBar.tsx`, `src/App.tsx`, `src/registry/db.ts`, `src/services/services.ts`, `src/lib/storage.ts`, `index.html` — HIGH confidence, current codebase state as of 2026-06-26.
- `design/VibeOS.dc.html` — window chrome spec, `THEMES` map (all 4 themes with exact CSS var names and values), `openApp`/`focusWin`/`closeWin`/`minWin` logic, dock, create panel UX, `renderVals` CSS var usage in inline styles — HIGH.
- `.planning/PROJECT.md` — v2.0 milestone feature spec, active constraints, deferred items — HIGH.
- CSS Custom Properties MDN spec: properties are inherited by default through all elements including those with independent formatting contexts — HIGH.
- React 19 `createRoot` multiple-roots-per-page: each `createRoot` call is independent; React does not coordinate across roots; CSS inheritance flows through the DOM regardless — HIGH.

---

*Architecture research for: v2.0 Vibe OS desktop integration*
*Researched: 2026-06-26*
