# Phase 15: Window Manager - Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 7 (5 new, 2 modified)
**Analogs found:** 6 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/ui/useWindowManager.ts` | hook | event-driven (state machine) | `src/ui/VibeThemeProvider.tsx` | role-match |
| `src/ui/useDrag.ts` | hook | event-driven (pointer events → imperative DOM writes) | `src/ui/ContextualPrompt.tsx` (ref + effect pattern) | partial (no drag analog exists) |
| `src/ui/WindowFrame.tsx` | component | request-response (mount lifecycle) | `src/ui/AppShell.tsx` | exact |
| `src/App.tsx` | component (root shell) | request-response | itself (modify) | n/a — modify |
| `src/ui/Marketplace.tsx` | component (open flow) | CRUD | itself (modify) | n/a — modify |
| `src/execution/mount.ts` | service (lifecycle seam) | CRUD | itself (reference only) | n/a — do not modify |
| `src/index.css` | config (CSS) | n/a | itself + `.key-dialog-overlay` / `.widget-shell` patterns | partial |

---

## Pattern Assignments

### `src/ui/useWindowManager.ts` (hook, event-driven state machine)

**Analog:** `src/ui/VibeThemeProvider.tsx`

This is the closest analog in the codebase for a custom hook/provider that owns module-level mutable state alongside React state, exports a typed context value, and drives side effects (DOM property writes on state change). The window manager follows the same shape: module-level counter (`zTop`), `useState` for the entry list, `useCallback` for all API methods, and a context exported for consumers.

**Module-level state pattern** (`src/ui/VibeThemeProvider.tsx` lines 103–112):
```typescript
const VALID_THEMES: ReadonlyArray<VibeThemeName> = ["aurora", "aero", "aqua", "noir"];
const DEFAULT_THEME: VibeThemeName = "aurora";
```
Copy this pattern for the module-level `zTop` counter:
```typescript
// Module-level — survives React re-renders, resets only on page reload.
let zTop = 200;
```

**Context + typed value pattern** (`src/ui/VibeThemeProvider.tsx` lines 26–35):
```typescript
export interface VibeThemeContextValue {
  theme: VibeThemeName;
  setTheme: (name: VibeThemeName) => void;
}

export const VibeThemeContext = createContext<VibeThemeContextValue | null>(null);
```
Copy for `WindowManagerContext`:
```typescript
export interface WindowEntry {
  id: string;
  instanceId: string;
  appType: string;
  title: string;
  icon: string;
  x: number;
  y: number;
  z: number;
  minimized: boolean;
}

export interface WindowManagerValue {
  windows: WindowEntry[];
  open: (appType: string, meta: { title: string; icon: string }) => string;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
  close: (id: string) => void;
}

export const WindowManagerContext = createContext<WindowManagerValue | null>(null);
```

**useState + useCallback API pattern** (`src/ui/VibeThemeProvider.tsx` lines 136–163):
```typescript
export function VibeThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<VibeThemeName>(readStoredOsTheme);
  const { settingsStore } = useServices();

  useEffect(() => {
    applyVibeTheme(theme);
  }, [theme]);

  const setTheme = useCallback(
    (name: VibeThemeName) => {
      setThemeState(name);
      try {
        localStorage.setItem(STORAGE_KEY_OS_THEME, name);
      } catch {
        // best-effort
      }
      void settingsStore.write(name);
    },
    [settingsStore],
  );

  return (
    <VibeThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </VibeThemeContext.Provider>
  );
}
```
Apply the same `useCallback` wrapping for `open`, `focus`, `minimize`, `restore`, `close` in `useWindowManager`. The hook (not a provider) returns the value directly rather than wrapping in `Context.Provider` — see Decision 3 in CONTEXT.md ("One hook/context — the single source of window truth").

**Consumer guard pattern** (`src/ui/VibeThemeProvider.tsx` lines 173–179):
```typescript
export function useVibeTheme(): VibeThemeContextValue {
  const ctx = useContext(VibeThemeContext);
  if (!ctx) {
    throw new Error("useVibeTheme must be used within a VibeThemeProvider");
  }
  return ctx;
}
```
Copy verbatim for `useWindowManager()` consumer hook with error message updated to reference `WindowManagerProvider`.

**Imports pattern** (`src/ui/VibeThemeProvider.tsx` lines 12–22):
```typescript
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { STORAGE_KEY_OS_THEME } from "../lib/storage";
import { useServices } from "../services/ServicesProvider";
```
For `useWindowManager.ts`: omit `ReactNode` and `ServicesProvider`; add `unmountApp` from `../execution/mount`.

**Close must call unmountApp** (from `src/execution/mount.ts` lines 50–56):
```typescript
export function unmountApp(instanceId: string): void {
  const root = roots.get(instanceId);
  if (root) {
    root.unmount();
    roots.delete(instanceId);
  }
}
```
The `close(id)` method in `useWindowManager` MUST call `unmountApp(entry.instanceId)` before or after filtering state. Never filter state alone.

---

### `src/ui/useDrag.ts` (hook, event-driven — pointer events → imperative DOM writes)

**No exact analog exists in the codebase.** No existing file uses `setPointerCapture`, `requestAnimationFrame`, or imperative style writes. The closest structural analog for the ref + effect pattern is `src/ui/ContextualPrompt.tsx` (uses `useRef` + `useEffect` for DOM imperative call on mount).

**Ref + effect imperative DOM pattern** (`src/ui/ContextualPrompt.tsx` lines 39–44):
```typescript
const textareaRef = useRef<HTMLTextAreaElement>(null);

// Focus the input on open so the user can type immediately.
useEffect(() => {
  textareaRef.current?.focus();
}, []);
```
Scale this pattern to hold the window element ref and the `rafId` ref:
```typescript
const windowRef = useRef<HTMLElement>(null);
const rafId = useRef<number>(0);
```

**rAF + imperative style pattern** (from PITFALLS.md Pitfall 2, lines 46–58 — no codebase analog, use research):
```typescript
const onMove = (e: PointerEvent) => {
  cancelAnimationFrame(rafId.current);
  rafId.current = requestAnimationFrame(() => {
    windowEl.current!.style.transform = `translate(${x}px, ${y}px)`;
  });
};
const onUp = () => {
  // commit final x/y to React state for persistence
  setWindows(prev => prev.map(w => w.id === dragId ? { ...w, x, y } : w));
};
```

**Hook signature to implement:**
```typescript
export interface DragState {
  x: number;
  y: number;
}

export interface UseDragOptions {
  /** Ref to the element to move (the window frame div). */
  elementRef: React.RefObject<HTMLElement>;
  /** Initial position from WindowEntry. */
  initialX: number;
  initialY: number;
  /** Called with final committed position on pointerup. */
  onCommit: (x: number, y: number) => void;
}

export function useDrag(options: UseDragOptions): {
  handlePointerDown: (e: React.PointerEvent) => void;
};
```

**Pointer capture pattern** (from PITFALLS.md Pitfall 1, lines 22–25 — no codebase analog):
- Call `e.currentTarget.setPointerCapture(e.pointerId)` in `onPointerDown` on the drag handle.
- Add `user-select: none` on the desktop container root while dragging (toggle a class on pointerdown, remove on pointerup).
- Listen for `onPointerMove` and `onPointerUp` on the drag handle element (not on `window`).
- Do NOT call `e.preventDefault()` on the window body container — only on the titlebar handle — per CONTEXT Decision 8 (Pitfall 12).

---

### `src/ui/WindowFrame.tsx` (component, request-response / mount lifecycle)

**Analog:** `src/ui/AppShell.tsx`

`WindowFrame` is the outer draggable chrome that wraps `AppShell` (which remains the inner app content frame with its contextual prompt wiring). `WindowFrame` follows the same props-interface pattern as `AppShell`.

**Props interface pattern** (`src/ui/AppShell.tsx` lines 19–32):
```typescript
export interface AppShellProps {
  displayName: string;
  onClose: () => void;
  onModify?: (instruction: string) => void;
  children: ReactNode;
}
```
Copy for `WindowFrame`:
```typescript
export interface WindowFrameProps {
  /** Unique window id (from WindowEntry). */
  id: string;
  /** Instance id used with mountApp/unmountApp. */
  instanceId: string;
  /** App display name for the titlebar. */
  title: string;
  /** Lucide icon key (maps to an icon component in the parent). */
  icon: string;
  /** Current position (committed, from WindowEntry). */
  x: number;
  y: number;
  /** z-index from WindowEntry. */
  z: number;
  /** Minimized state. */
  minimized: boolean;
  /** The resolved Component to mount into the body. */
  Component: ComponentType | null;
  /** Called when the close traffic-light is clicked. */
  onClose: () => void;
  /** Called when the minimize traffic-light is clicked. */
  onMinimize: () => void;
  /** Called when the window receives a pointerdown (raise to front). */
  onFocus: () => void;
  /** Called by useDrag with final committed position. */
  onMove: (x: number, y: number) => void;
}
```

**State + handler pattern** (`src/ui/AppShell.tsx` lines 34–45):
```typescript
export function AppShell({ displayName, onClose, onModify, children }: AppShellProps) {
  const [promptOpen, setPromptOpen] = useState(false);

  function handleApply(instruction: string): void {
    setPromptOpen(false);
    onModify?.(instruction);
  }
  ...
```
`WindowFrame` will use `useRef` for the body container (where `mountApp` renders) instead of `useState`. Follow the same function-per-handler naming convention (`handleClose`, `handleMinimize`, etc.).

**Content container div pattern** (`src/ui/AppShell.tsx` lines 47–84):
```typescript
return (
  <div className="app-shell" role="region" aria-label={displayName}>
    <div className="app-shell__header">
      <span className="app-shell__title">{displayName}</span>
      <div className="app-shell__controls">
        <button type="button" className="app-bar__icon-btn" ... >
          ...
        </button>
        <button type="button" className="app-bar__icon-btn" aria-label={`Close ${displayName}`} onClick={onClose}>×</button>
      </div>
    </div>
    ...
    <div className="app-shell__content">{children}</div>
  </div>
);
```
`WindowFrame` replaces `app-shell` with `window-chrome`, `app-shell__header` with `window-chrome__titlebar`, and `app-shell__content` with `window-chrome__body`. The body div receives a `ref` that is passed to `mountApp` in `useEffect`.

**mountApp in useEffect pattern** (mirror of `src/execution/mount.ts` lines 32–43):
```typescript
// Inside WindowFrame:
const bodyRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!bodyRef.current || !Component) return;
  mountApp(instanceId, bodyRef.current, Component);
  return () => {
    unmountApp(instanceId);
  };
}, [instanceId, Component]);
```
This is the mount seam. The cleanup function calls `unmountApp` so React unmount (e.g., when the window entry is removed from state) also tears down the React root.

**WidgetShell as secondary analog** (`src/ui/WidgetShell.tsx` lines 44–72): use for the lighter chrome header structure (controls-only row at the top, content below) as a secondary reference when the titlebar layout differs from AppShell.

**Imports pattern** (combine from `AppShell.tsx` + `mount.ts`):
```typescript
import { useEffect, useRef } from "react";
import type { ComponentType, ReactNode } from "react";
import { mountApp, unmountApp } from "../execution/mount";
import { useDrag } from "./useDrag";
import { AppShell } from "./AppShell";
```

---

### `src/App.tsx` — modify: add desktop container div, wire `useWindowManager`

**Self-analog** (`src/App.tsx` full file):
```typescript
export default function App() {
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);

  useEffect(() => {
    void dbReady.then(() => { logger.info("Registry initialized"); });
  }, []);

  return (
    <ThemeProvider>
      <VibeThemeProvider>
        <ErrorBoundary>
          <AppBar onOpenAccount={() => setKeyDialogOpen(true)} />
          <main>
            <Marketplace />
          </main>
          {keyDialogOpen && <KeyDialog onClose={() => setKeyDialogOpen(false)} />}
        </ErrorBoundary>
      </VibeThemeProvider>
    </ThemeProvider>
  );
}
```
**Modification target:** Add a `WindowManagerProvider` wrapper (or pass the manager down) and render a `<div className="desktop">` alongside `<main>`. The `<main>` stays for the storefront; the `.desktop` container is the absolutely-positioned surface where `WindowFrame` elements live.

**Provider nesting pattern** (lines 29–43 of `src/App.tsx`): Add `WindowManagerProvider` as the innermost wrapper just inside `ErrorBoundary`, following the established nesting order (ThemeProvider → VibeThemeProvider → ErrorBoundary → WindowManagerProvider → content).

---

### `src/ui/Marketplace.tsx` — modify: rewire card click to open a window

**Self-analog** (`src/ui/Marketplace.tsx` — the `handleOpen` callback, lines 148–194):
```typescript
const handleOpen = useCallback(
  async (appType: string, displayName: string) => {
    logger.info("Opening " + appType);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpeningId(appType);

    try {
      const intent = await resolveOpenApp(appType);
      const instanceId = nextInstanceId(appType);
      const Component = await resolveComponent(
        instanceId, appType, intent.cacheKey, services,
      );

      setOpenedApps((prev) => [
        ...prev,
        { instanceId, appType, displayName, Component },
      ]);
    } catch (err) {
      ...
      setOpenedApps((prev) => [
        ...prev,
        { instanceId, appType, displayName, Component: null, needsAuth, throttled },
      ]);
    } finally {
      timeoutRef.current = setTimeout(() => { setOpeningId(null); ... }, 300);
    }
  },
  [services],
);
```
**Rewire target:** Replace `setOpenedApps(...)` calls with `windowManager.open(appType, { title: displayName, icon: ... })`. The resolve/produce logic (`resolveOpenApp`, `resolveComponent`) stays intact — only the *mount target* changes (WindowFrame body instead of inline AppShell children). `setOpenedApps` and the `openedApps` render block at lines 361–393 are REMOVED; the WindowManager owns that state now.

**handleClose analog** (`src/ui/Marketplace.tsx` lines 196–199):
```typescript
const handleClose = useCallback((instanceId: string) => {
  evictLiveComponent(instanceId);
  setOpenedApps((prev) => prev.filter((a) => a.instanceId !== instanceId));
}, []);
```
`evictLiveComponent` call must be preserved when close routes through `windowManager.close(id)`.

**Error handling pattern** (`src/ui/Marketplace.tsx` lines 168–186):
```typescript
const needsAuth = err instanceof ProduceAuthError;
const throttled = err instanceof ProduceThrottledError;
logger.error("Failed to open " + appType + ": " + String(err));
const instanceId = nextInstanceId(appType);
setOpenedApps((prev) => [
  ...prev,
  { instanceId, appType, displayName, Component: null, needsAuth, throttled },
]);
```
Preserve this pattern — failed windows still open as `WindowFrame` entries with `Component: null`, which `WindowFrame` renders as its neutral fallback.

---

### `src/execution/mount.ts` — reference seam (do not modify)

**Full API** (lines 32–81):
```typescript
export function mountApp(instanceId: string, container: HTMLElement, Component: ComponentType): void
export function unmountApp(instanceId: string): void
export function isMounted(instanceId: string): boolean
export function mountedCount(): number
export function unmountAll(): void
```

**Contract for WindowFrame:**
- `mountApp(instanceId, bodyRef.current, Component)` in `useEffect` body when `Component` is non-null.
- `unmountApp(instanceId)` in `useEffect` cleanup AND in `close(id)` in the window manager.
- `mountedCount()` is the test assertion for zero-leak verification.
- Guard: call `mountApp` only if `document.contains(bodyRef.current)` to protect against the mid-flight close race (CONTEXT Decision 6 / PITFALLS Pitfall 9).

---

### `src/index.css` — CSS for `.window-chrome`, `.desktop`, `.titlebar-handle`, `.traffic-light`

**Analog: `.key-dialog-overlay` and `.key-dialog`** (lines 239–265):
```css
.key-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
  z-index: 100;
}

.key-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 400px;
  max-width: calc(100vw - 32px);
  padding: 24px;
  background: var(--color-background-secondary);
  border: 1px solid var(--color-border-secondary);
  border-radius: 16px;
}
```
Copy the `position: fixed` + `inset: 0` pattern for the `.desktop` container. Copy the `border-radius` + `border` + `background` idiom for `.window-chrome`, but use Phase 14 glass vars (`--glass`, `--bord`) instead of `--color-*` vars.

**Analog: `.widget-shell`** (lines 549–569):
```css
.widget-shell {
  position: relative;
  border: 1px solid var(--color-border-tertiary);
  border-radius: 10px;
  overflow: hidden;
}

.widget-shell__header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 4px 4px 0;
}
```
Copy the `position: relative` + `border` + `overflow: hidden` header pattern for `.window-chrome` and `.window-chrome__titlebar`.

**Button pattern from `.app-bar__icon-btn`** (lines 80–109):
```css
.app-bar__icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}
```
Use this for traffic-light buttons but reduce to circular dots (~12px diameter each) with colored `background` (red/amber/green), no icon child.

**New CSS rules to add** (no analog — use research-grounded values):
```css
/* Desktop surface — window host container. Stacking context isolated from blobs. */
.desktop {
  position: fixed;
  inset: 0;
  z-index: 100;
  isolation: isolate;
  pointer-events: none; /* pass clicks through to storefront by default */
}

/* Each window activates pointer-events. */
.window-chrome {
  pointer-events: auto;
  position: absolute;           /* positioned inside .desktop */
  min-width: 320px;
  min-height: 240px;
  background: var(--glass);
  border: 1px solid var(--bord);
  border-radius: 12px;
  backdrop-filter: blur(32px) saturate(195%);
  overflow: hidden;
  will-change: transform;       /* GPU-composite the window for drag */
}

.window-chrome--minimized {
  display: none;                /* Pitfall 4: no compositor layer when hidden */
}

.window-chrome__titlebar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: grab;                 /* signals draggable */
  user-select: none;
  -webkit-user-select: none;
}

.window-chrome__titlebar:active {
  cursor: grabbing;
}

.window-chrome__traffic-lights {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.window-chrome__traffic-light {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
}

.window-chrome__traffic-light--close  { background: #ff5f57; }
.window-chrome__traffic-light--min    { background: #ffbd2e; }
.window-chrome__traffic-light--max    { background: #28c840; } /* decorative — no op in Phase 15 */

.window-chrome__title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text, var(--color-text-primary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.window-chrome__body {
  /* AppShell mounts here via mountApp */
  height: calc(100% - 36px); /* titlebar height subtracted */
  overflow: auto;
}

/* Desktop drag-active state: suppress text selection across the entire surface. */
.desktop--dragging {
  user-select: none;
  -webkit-user-select: none;
}
```

---

## Shared Patterns

### Hook consumer guard
**Source:** `src/ui/VibeThemeProvider.tsx` lines 173–179  
**Apply to:** `useWindowManager.ts` consumer hook, `useDrag.ts` (if it reads context)
```typescript
export function useWindowManager(): WindowManagerValue {
  const ctx = useContext(WindowManagerContext);
  if (!ctx) {
    throw new Error("useWindowManager must be used within a WindowManagerProvider");
  }
  return ctx;
}
```

### useCallback for all event handlers
**Source:** `src/ui/Marketplace.tsx` lines 148, 196, 210 and `src/ui/VibeThemeProvider.tsx` line 145  
**Apply to:** `useWindowManager.ts` (`open`, `focus`, `minimize`, `restore`, `close`), `useDrag.ts` (`handlePointerDown`)
```typescript
const open = useCallback((appType: string, meta: { title: string; icon: string }): string => {
  ...
}, [/* stable deps only */]);
```

### useRef for imperative DOM + cleanup pattern
**Source:** `src/ui/Marketplace.tsx` lines 141–142 (timeoutRef) and `src/ui/ContextualPrompt.tsx` lines 39–44  
**Apply to:** `useDrag.ts` (rafId ref, drag state refs), `WindowFrame.tsx` (bodyRef for mountApp container)
```typescript
const rafId = useRef<number>(0);
const bodyRef = useRef<HTMLDivElement>(null);
```

### logger.info / logger.error pattern
**Source:** `src/ui/Marketplace.tsx` lines 150, 180, 241, 258  
**Apply to:** `useWindowManager.ts` (log open/close), `WindowFrame.tsx` (log mount failures)
```typescript
import { logger } from "../lib/logger";
logger.info("Opening " + appType);
logger.error("Failed to open " + appType + ": " + String(err));
```

### Error boundary wrapping
**Source:** `src/ui/Marketplace.tsx` lines 362–364 and `src/execution/mount.ts` lines 42–43  
**Apply to:** `WindowFrame.tsx` — `mountApp` already wraps in `ErrorBoundary`; the `WindowFrame` itself should also be wrapped at its call site in `WindowManagerProvider`'s render.
```typescript
// In mount.ts (already implemented — reference only):
root.render(createElement(ErrorBoundary, null, createElement(Component)));
```

### CSS var reference pattern
**Source:** `src/index.css` lines 29–33, `src/ui/VibeThemeProvider.tsx` lines 127–132  
**Apply to:** All new CSS rules in `.window-chrome`, `.window-chrome__title`, `.window-chrome__titlebar`  
Use Phase 14 OS vars (`--glass`, `--glass2`, `--bord`, `--hi`, `--text`, `--accentA`, `--accentB`) with fallbacks to `--color-*` where the Phase 14 var may be absent.
```css
background: var(--glass, var(--color-background-secondary));
border-color: var(--bord, var(--color-border-secondary));
color: var(--text, var(--color-text-primary));
```

### Hygiene: CSS class + identifier naming
**Source:** PITFALLS.md Pitfall 11, `src/index.css` (`.widget-shell`, `.app-shell`, `.theme-selector`)  
**Apply to:** All new CSS classes, TypeScript identifiers, IndexedDB key names  
Naming must use neutral OS-UX vocabulary: `.window-chrome`, `.window-chrome__titlebar`, `.window-chrome__traffic-light`, `.desktop`, `useWindowManager`, `WindowEntry`, `WindowFrame`. Never: `.ai-window`, `.generated-chrome`, `.synthetic-frame`, `synthesize*`, `generate*`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/ui/useDrag.ts` | hook | event-driven (pointer capture + rAF) | No drag/pointer-capture pattern exists anywhere in the codebase. Use PITFALLS.md Pitfall 1 (lines 13–34) and Pitfall 2 (lines 39–67) as the authoritative implementation reference. |

---

## Metadata

**Analog search scope:** `/Volumes/Unitek-B/Projects/o2.vibe-apps/src/` (all `.ts`, `.tsx`, `.css`)  
**Files scanned:** 14 source files read in full  
**Pattern extraction date:** 2026-06-26
