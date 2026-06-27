# Phase 19: Window Chrome & Menu Relocation — Pattern Map

**Mapped:** 2026-06-27
**Files analyzed:** 5 source files + 5 test files
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/ui/WindowFrame.tsx` | component | event-driven | `src/ui/AppShell.tsx` (promptOpen state + ContextualPrompt render pattern) | role-match |
| `src/ui/AppShell.tsx` | component | request-response | `src/ui/AppShell.tsx` (self — strip header, keep content wrapper) | self-refactor |
| `src/ui/useWindowManager.tsx` | hook/store | CRUD | `src/ui/useWindowManager.tsx` (self — extend WindowEntry + add maximize/snap operations) | self-refactor |
| `src/ui/DesktopShell.tsx` | component | event-driven | `src/ui/DesktopShell.tsx` (self) + `src/ui/ContextualPrompt.tsx` (Escape keyDown pattern) | self-extend |
| Test files (5) | test | request-response | `src/ui/WindowFrame.test.tsx` + `src/ui/MarketplaceModify.test.tsx` (within pattern) | exact |

---

## Pattern Assignments

### `src/ui/WindowFrame.tsx` — add `⋮` button + ContextualPrompt + promptOpen state + maximize activation

**Role:** component, event-driven

**Primary analog for `⋮`/promptOpen:** `src/ui/AppShell.tsx` (lines 14–92) — the entire pattern being moved here.

**Imports to add** (from AppShell lines 14–17, already import useState):
```typescript
import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { ContextualPrompt } from "./ContextualPrompt";
```
Note: `useRef` and `memo` are already imported. Add `useState` to the existing React import line 15.

**promptOpen state + handleApply** (copy from AppShell lines 46–51, place in WindowFrame function body):
```typescript
const [promptOpen, setPromptOpen] = useState(false);

function handleApply(instruction: string): void {
  setPromptOpen(false);
  onModify?.(instruction);
}
```

**`⋮` button in titlebar** (copy from AppShell lines 58–69, place right-aligned in `window-chrome__titlebar` after the title-group):
```tsx
<button
  type="button"
  className="app-bar__icon-btn"
  aria-label="App options"
  aria-haspopup="dialog"
  aria-expanded={promptOpen}
  title="Options"
  onClick={() => setPromptOpen((open) => !open)}
>
  <MoreVertical size={20} aria-hidden="true" />
</button>
```
Note: The button must be inside the titlebar div but OUTSIDE the `onPointerDown` drag zone — attach `onClick` but also call `e.stopPropagation()` to prevent the click from triggering the drag's `onPointerDown`.

**ContextualPrompt render** (copy from AppShell lines 83–89, place after the titlebar div, NOT inside the body):
```tsx
{promptOpen && (
  <ContextualPrompt
    targetName={title}
    onApply={handleApply}
    onCancel={() => setPromptOpen(false)}
  />
)}
```

**Maximize button activation** (WindowFrame lines 147–151 — remove `disabled` attribute and wire `onMaximize` prop):
```tsx
// Current (disabled):
<button
  type="button"
  className="window-chrome__traffic-light window-chrome__traffic-light--max"
  aria-label="Maximize"
  disabled
/>

// New (enabled, calls new onMaximize prop):
<button
  type="button"
  className="window-chrome__traffic-light window-chrome__traffic-light--max"
  aria-label="Maximize"
  onClick={onMaximize}
/>
```

**WindowFrameProps additions** (extends existing interface at lines 68–84):
```typescript
export interface WindowFrameProps {
  // ... existing props ...
  maximized: boolean;
  onMaximize: () => void;
  onMove: (x: number, y: number) => void;
}
```

**Double-click titlebar for maximize** (add `onDoubleClick` to the titlebar div alongside existing `onPointerDown`, WindowFrame line 128):
```tsx
<div
  className="window-chrome__titlebar titlebar-handle"
  onPointerDown={(e) => {
    onFocus();
    handlePointerDown(e);
  }}
  onDoubleClick={onMaximize}
>
```

**Disable drag while maximized** — pass `disabled: maximized` option to `useDrag`, or gate `handlePointerDown`:
```typescript
// Simplest guard: block drag when maximized
onPointerDown={(e) => {
  if (maximized) return;
  onFocus();
  handlePointerDown(e);
}}
```

**WindowBody: remove `onModify` and `hideClose` props** — these are no longer needed since the header moves to the titlebar. WindowBody (lines 38–66) becomes:
```tsx
const WindowBody = memo(
  function WindowBody({ title, Component, onClose }: Omit<WindowBodyProps, 'onModify' | 'hideClose'>) {
    if (!Component) {
      return <div className="window-chrome__placeholder">Preparing…</div>;
    }
    return (
      <AppShell displayName={title} onClose={onClose}>
        <ErrorBoundary>
          <Component />
        </ErrorBoundary>
      </AppShell>
    );
  },
  (prev, next) =>
    prev.instanceId === next.instanceId &&
    prev.title === next.title &&
    prev.Component === next.Component,
);
```

---

### `src/ui/AppShell.tsx` — strip header, become content-only wrapper

**Role:** component, request-response (reduced)

**What to remove:** entire `app-shell__header` div (lines 55–82) which contains the title span, controls div, `⋮` button, and the optional `×`. Also remove: `promptOpen` useState (line 46), `handleApply` (lines 48–51), `ContextualPrompt` render (lines 83–89).

**What to remove from imports:** `useState` (line 14), `MoreVertical` (line 15), `ContextualPrompt` (line 17).

**Props to remove:** `displayName`, `onClose`, `onModify`, `hideClose` — all were header-only. The `children` prop and the `app-shell__content` div remain.

**Resulting minimal AppShell** (the shell retains `role="region"` for a11y — keep `displayName` only for the region label, or source it from a different prop):
```tsx
// Keep role="region" labeled by the app — but the label source changes.
// Option A: keep displayName as a prop solely for aria-label (no visible heading).
// Option B: let WindowFrame's title-group provide the accessible name via aria-labelledby.
// CONTEXT.md says "AppShell is reduced to a content-only wrapper" — keep role="region"
// with displayName for aria-label so existing findByRole("region", {name}) tests pass.
export interface AppShellProps {
  displayName: string;
  children?: ReactNode;
}

export function AppShell({ displayName, children }: AppShellProps) {
  return (
    <div className="app-shell" role="region" aria-label={displayName}>
      <div className="app-shell__content">{children}</div>
    </div>
  );
}
```

**Import cleanup** — only `ReactNode` remains:
```typescript
import type { ReactNode } from "react";
```

---

### `src/ui/useWindowManager.tsx` — add maximized + restoreRect + snap geometry to WindowEntry

**Role:** hook/store, CRUD

**WindowEntry extension** (add after `minimized: boolean` at line 46):
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
  // Phase 19 additions:
  maximized: boolean;
  restoreRect: { x: number; y: number; w: number; h: number } | null;
}
```

**WindowManagerValue extension** (add to the interface, lines 48–66):
```typescript
export interface WindowManagerValue {
  // ... existing ...
  maximize: (id: string) => void;
  unmaximize: (id: string) => void;
  snapLeft: (id: string) => void;
  snapRight: (id: string) => void;
  /** Returns the active (topmost non-minimized) window id. */
  activeId: () => string | null;
}
```

**new open() defaults** (add to the entry object in the `open` callback, pattern matches existing minimized: false at line 140):
```typescript
const entry: WindowEntry = {
  // ... existing fields ...
  minimized: false,
  maximized: false,
  restoreRect: null,
};
```

**maximize callback** (pattern matches existing `minimize` at lines 166–170 — mint z outside updater):
```typescript
const maximize = useCallback((id: string) => {
  setWindows(prev =>
    prev.map(w => {
      if (w.id !== id) return w;
      // Store current geometry as restoreRect before maximizing.
      return {
        ...w,
        maximized: true,
        restoreRect: { x: w.x, y: w.y, w: DEFAULT_W, h: DEFAULT_H },
      };
    }),
  );
}, []);
```

**unmaximize callback** (pattern matches `restore` at lines 172–180 — mint z outside updater):
```typescript
const unmaximize = useCallback((id: string) => {
  const z = ++zTop;
  setWindows(prev =>
    prev.map(w =>
      w.id === id
        ? { ...w, maximized: false, z }
        : w,
    ),
  );
}, []);
```

**snapLeft / snapRight** (same updater pattern — no z bump needed for snaps per CONTEXT.md):
```typescript
const snapLeft = useCallback((id: string) => {
  setWindows(prev =>
    prev.map(w => {
      if (w.id !== id) return w;
      return {
        ...w,
        restoreRect: { x: w.x, y: w.y, w: DEFAULT_W, h: DEFAULT_H },
        // Geometry is resolved in DesktopShell using work-area constants.
        // Store a sentinel; DesktopShell reads it to apply CSS/position.
      };
    }),
  );
}, []);
```
Note: The work-area geometry (menubar height, dock height) is computed in DesktopShell where layout constants are available. The manager stores `snapSide: "left" | "right" | null` or the caller computes snapped x/y/w/h and calls a generic `setRect` on the entry.

---

### `src/ui/DesktopShell.tsx` — keyboard listener (Cmd/Ctrl+W/M) + snap drop-zone overlay

**Role:** component, event-driven

**Keyboard useEffect pattern** — the existing `useEffect` for `matchMedia` at lines 426–438 is the direct template:
```typescript
// Existing matchMedia pattern (lines 426–438):
useEffect(() => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return;
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  setReducedMotion(mql.matches);
  const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }
  mql.addListener(onChange);
  return () => mql.removeListener(onChange);
}, []);
```

**New keyboard shortcut useEffect** (copy the shape above, replace body):
```typescript
useEffect(() => {
  if (typeof window === "undefined") return;

  function handleKeyDown(e: KeyboardEvent): void {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;

    // Only act when a Vibe OS window is active (not when focus is in browser chrome).
    // "active" = document has focus AND at least one window exists.
    if (!document.hasFocus()) return;

    if (e.key === "w") {
      e.preventDefault();
      const active = windowManagerRef.current.windows
        .filter(w => !w.minimized)
        .sort((a, b) => b.z - a.z)[0];
      if (active) handleClose(active.id, active.instanceId);
    } else if (e.key === "m") {
      e.preventDefault();
      const active = windowManagerRef.current.windows
        .filter(w => !w.minimized)
        .sort((a, b) => b.z - a.z)[0];
      if (active) windowManagerRef.current.minimize(active.id);
    }
  }

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [handleClose]);
```
Note: `windowManagerRef` is already defined at line 159. `handleClose` is defined at lines 164–181 with `useCallback`. The effect dependency on `handleClose` is safe because `handleClose` is memoized.

**Snap drop-zone overlay** (rendered conditionally in DesktopShell JSX — pattern matches the existing conditional `launcherOpen` panel at lines 519–528):
```tsx
{/* Snap drop-zone preview — shown while a drag reaches a screen edge.
    Translucent overlay indicates the snapped half before pointer release. */}
{snapPreview !== null && (
  <div
    className={`desktop-snap-preview desktop-snap-preview--${snapPreview}`}
    aria-hidden="true"
  />
)}
```
Where `snapPreview: "left" | "right" | null` is a `useState` in `DesktopShellInner`.

**Work-area geometry constants** (add near top of DesktopShellInner, alongside existing `DEFAULT_W`/`DEFAULT_H`):
```typescript
// Work area = viewport minus menu bar (top) minus dock (bottom).
// These mirror the CSS layout heights for the menu bar and dock chrome.
const MENU_BAR_H = 28;  // matches .menu-bar height in CSS
const DOCK_H = 72;       // matches .dock height in CSS (including padding)

function workArea() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: 0,
    y: MENU_BAR_H,
    w: vw,
    h: vh - MENU_BAR_H - DOCK_H,
  };
}
```

**Snap integration in useDrag** — the drag hook's `onCommit` callback already fires on pointer-up (useDrag line 100). The DesktopShell `onMove` callback (lines 488–492) is the place to intercept: check pointer position at commit time and, if within a snap threshold of the left/right edge, call `snapLeft`/`snapRight` instead of the normal `setPositions`:
```typescript
onMove={(nx, ny) => {
  // Check snap: if the last pointer position was within SNAP_THRESHOLD of an edge.
  // (Pass the pointer x from useDrag, or check the committed x directly.)
  if (nx <= SNAP_THRESHOLD) {
    windowManager.snapLeft(entry.id);
  } else if (nx + DEFAULT_W >= window.innerWidth - SNAP_THRESHOLD) {
    windowManager.snapRight(entry.id);
  } else {
    setPositions(prev => new Map(prev).set(entry.instanceId, { x: nx, y: ny }));
  }
}}
```

---

## Test Update Patterns

### All 5 test files: relocate `⋮` query from `within(region)` to the titlebar

**Current pattern** (MarketplaceModify.test.tsx line 53, MarketplaceWindows.test.tsx line 315, DesktopShell.test.tsx line 208, WindowFrame.test.tsx line 98):
```typescript
// BEFORE: ⋮ button is inside the app-shell region
const region = await screen.findByRole("region", { name: "Notes" });
await user.click(within(region).getByRole("button", { name: "App options" }));
```

**New pattern** (after relocation to titlebar):
```typescript
// AFTER: ⋮ button is in the titlebar of the window-chrome; dialog may be
// outside the region (rendered in titlebar or via portal).
// The frame is findable by its title text or by a data-testid on the chrome.
const frame = screen.getByText("Notes").closest(".window-chrome") as HTMLElement;
const titlebar = frame.querySelector(".window-chrome__titlebar") as HTMLElement;
await user.click(within(titlebar).getByRole("button", { name: "App options" }));
// The ContextualPrompt dialog now renders inside the window-chrome (not inside the region).
const dialog = within(frame).getByRole("dialog");
```
Note: If `ContextualPrompt` is portalled to `document.body`, query without `within(frame)`:
```typescript
const dialog = screen.getByRole("dialog");
```

### AppShell.test.tsx — tests for removed header (lines 18–71)

The three existing tests check: `Close Notes` button default/hideClose, `App options` button with hideClose. After the refactor:
- Test 1 (`renders the inner × close button by default`) — **delete**: `AppShell` no longer has any close button or header.
- Test 2 (`suppresses the inner × close button when hideClose={true}`) — **delete**: prop removed.
- Test 3 (`still renders the ⋮ App options button when hideClose={true}`) — **delete**: button moved to `WindowFrame`.

Replace with a single test that `AppShell` renders children inside `role="region"` with `aria-label`:
```typescript
it("renders children inside a labeled region", () => {
  render(createElement(AppShell, { displayName: "Notes" },
    createElement("div", { "data-testid": "child" }, "content")));
  const region = screen.getByRole("region", { name: "Notes" });
  expect(within(region).getByTestId("child")).toBeInTheDocument();
});
```

### WindowFrame.test.tsx line 92 — update `⋮` location assertion

Current test (line 84–99) asserts `within(body).getByLabelText("App options")`. After relocation:
```typescript
// BEFORE (line 98):
expect(within(body).getByLabelText("App options")).not.toBeNull();

// AFTER — ⋮ button is in the titlebar, not the body:
const titlebar = container.querySelector(".window-chrome__titlebar") as HTMLElement;
expect(within(titlebar).getByRole("button", { name: "App options" })).not.toBeNull();
// body no longer contains App options button
expect(body.querySelector('[aria-label="App options"]')).toBeNull();
```

### New tests to add

**Keyboard shortcuts (Cmd/Ctrl+W closes, Cmd/Ctrl+M minimizes)**:
```typescript
it("Cmd+W closes the active (front-most non-minimized) window", async () => {
  const { user } = renderDesktopShell();
  await openApp(user, "Notes");
  await waitFor(() => expect(frames()).toHaveLength(1));

  await user.keyboard("{Meta>}w{/Meta}");
  // Test that event.defaultPrevented is true — use fireEvent for assertion:
  const event = new KeyboardEvent("keydown", { key: "w", metaKey: true, bubbles: true, cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);

  await waitFor(() => expect(frames()).toHaveLength(0));
});
```

**Maximize — double-click restores**:
```typescript
it("double-click titlebar maximizes; second double-click restores", async () => {
  const { container } = render(createElement(WindowFrame, makeProps()));
  const titlebar = container.querySelector(".window-chrome__titlebar") as HTMLElement;
  fireEvent.doubleClick(titlebar);
  expect(onMaximizeSpy).toHaveBeenCalledTimes(1);
});
```

---

## Shared Patterns

### useState for toggle (promptOpen)
**Source:** `src/ui/AppShell.tsx` lines 46–51
**Apply to:** `WindowFrame.tsx`
```typescript
const [promptOpen, setPromptOpen] = useState(false);
function handleApply(instruction: string): void {
  setPromptOpen(false);
  onModify?.(instruction);
}
```

### Global keydown listener with useEffect + cleanup
**Source:** `src/ui/DesktopShell.tsx` lines 426–438 (matchMedia useEffect — same shape)
**Apply to:** new keyboard shortcut listener in `DesktopShellInner`
```typescript
useEffect(() => {
  if (typeof window === "undefined") return;
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [handleClose]);
```

### Conditional overlay/panel render
**Source:** `src/ui/DesktopShell.tsx` lines 519–528 (launcherOpen panel)
**Apply to:** snap drop-zone preview overlay in `DesktopShell.tsx`
```tsx
{condition && <div className="overlay-class" aria-hidden="true" />}
```

### Callback minted OUTSIDE setState updater (z-order pattern)
**Source:** `src/ui/useWindowManager.tsx` lines 158–164 (focus), 172–180 (restore)
**Apply to:** `maximize` and `unmaximize` in `useWindowManager.tsx`
```typescript
// Mint z OUTSIDE the updater — see open() for Strict-Mode rationale.
const z = ++zTop;
setWindows(prev => prev.map(w => w.id === id ? { ...w, z } : w));
```

### windowManagerRef.current access pattern (stale-closure guard)
**Source:** `src/ui/DesktopShell.tsx` lines 159–160, 200–201, 356
**Apply to:** keyboard shortcut handler in `DesktopShellInner`
```typescript
const windowManagerRef = useRef<WindowManagerValue>(windowManager);
windowManagerRef.current = windowManager;
// Read inside event handler: windowManagerRef.current.windows
```

### `within(container)` test query pattern
**Source:** `src/ui/WindowFrame.test.tsx` lines 1–2, `src/ui/MarketplaceModify.test.tsx` lines 53–56
**Apply to:** all 5 test files needing the `⋮` button re-targeted to the titlebar
```typescript
import { within } from "@testing-library/dom";
const titlebar = frame.querySelector(".window-chrome__titlebar") as HTMLElement;
within(titlebar).getByRole("button", { name: "App options" })
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Snap drop-zone CSS | style | N/A | No existing translucent drop-zone overlay style; new `.desktop-snap-preview` class needed |
| Work-area geometry helper | utility | N/A | No existing work-area abstraction; MENU_BAR_H / DOCK_H constants not yet defined in JS (only in CSS variables) |

---

## Metadata

**Analog search scope:** `src/ui/` (all `.tsx` and `.ts` files, 17 files read)
**Files scanned:** WindowFrame.tsx, AppShell.tsx, useWindowManager.tsx, DesktopShell.tsx, ContextualPrompt.tsx, useDrag.ts, KeyDialog.tsx, AppShell.test.tsx, WindowFrame.test.tsx, DesktopShell.test.tsx, MarketplaceModify.test.tsx, MarketplaceWindows.test.tsx
**Pattern extraction date:** 2026-06-27
