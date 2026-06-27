# Phase 16: Desktop Shell - Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 10 (4 new, 6 modified)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/ui/DesktopShell.tsx` | component (root layout) | event-driven | `src/ui/Marketplace.tsx` | role-match (same root + window-manager wiring) |
| `src/ui/Dock.tsx` | component | event-driven | `src/ui/AppBar.tsx` | role-match (chrome bar with icon buttons) |
| `src/ui/MenuBar.tsx` | component | event-driven | `src/ui/AppBar.tsx` | exact (same role: top OS bar with controls) |
| `src/ui/MinimalLauncher.tsx` | component | request-response | `src/ui/Marketplace.tsx` MarketplaceInner grid section | role-match (app list + open handler) |
| `src/ui/WindowFrame.tsx` (modify) | component | event-driven | self | n/a (modify existing) |
| `src/ui/AppShell.tsx` (modify) | component | event-driven | self | n/a (modify existing) |
| `src/ui/AppBar.tsx` (modify) | component | event-driven | self | n/a (strip ThemeSelector; add KeyDialog trigger) |
| `src/App.tsx` (modify) | config/root | request-response | self | n/a (rewire root) |
| `src/ui/Marketplace.tsx` (modify) | component | event-driven | self | n/a (remove storefront grid) |
| `src/index.css` (modify CSS) | config | n/a | self + `design/VibeOS.dc.html` | design-reference |

---

## Pattern Assignments

### `src/ui/DesktopShell.tsx` (root layout component, event-driven)

**Analog:** `src/ui/Marketplace.tsx` (lines 117–489) and `src/App.tsx` (lines 1–51)

**Imports pattern** (from `src/ui/Marketplace.tsx` lines 1–31 and `src/App.tsx` lines 1–11):
```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { type ComponentType } from "react";
import { WindowFrame } from "./WindowFrame";
import {
  WindowManagerProvider,
  useWindowManager,
  type WindowManagerValue,
} from "./useWindowManager";
import { resolveOpenApp } from "../intent/resolver";
import { resolveComponent, evictLiveComponent } from "../execution/loader";
import { ProduceAuthError } from "../execution/producer";
import { ProduceThrottledError } from "../host/produceGate";
import { useServices } from "../services/ServicesProvider";
import { routeModification } from "../intent/routeModification";
import { registryKey } from "../registry/cacheKey";
import { logger } from "../lib/logger";
import { KeyDialog } from "./KeyDialog";
import { MenuBar } from "./MenuBar";
import { Dock } from "./Dock";
import { MinimalLauncher } from "./MinimalLauncher";
```

**Provider wrapper pattern** (`src/ui/Marketplace.tsx` lines 117–123): DesktopShell wraps its own `WindowManagerProvider` so it remains independently testable, same as `Marketplace`:
```typescript
export function DesktopShell() {
  return (
    <WindowManagerProvider>
      <DesktopShellInner />
    </WindowManagerProvider>
  );
}
```

**Layer order and wallpaper pattern** (from `design/VibeOS.dc.html` lines 15–35):
```tsx
// back→front: wallpaper → blobs → windows → dock + menu bar
<div className="desktop-shell">
  {/* Layer 1: wallpaper — background: var(--wall) via CSS */}
  {/* Layer 2: animated blobs — 4 divs, positions from design ref */}
  <div className="desktop-shell__blob desktop-shell__blob--1" aria-hidden="true" />
  <div className="desktop-shell__blob desktop-shell__blob--2" aria-hidden="true" />
  <div className="desktop-shell__blob desktop-shell__blob--3" aria-hidden="true" />
  <div className="desktop-shell__blob desktop-shell__blob--4" aria-hidden="true" />
  {/* Layer 3: window stack — isolation:isolate */}
  <div className="desktop">
    {windowManager.windows.map((entry) => (
      <WindowFrame key={entry.id} ... />
    ))}
  </div>
  {/* Layer 4: MenuBar on top, Dock on bottom */}
  <MenuBar activeName={activeWindow?.title ?? null} onOpenAccount={() => setKeyDialogOpen(true)} />
  <Dock windows={windowManager.windows} onFocus={windowManager.focus} onRestore={windowManager.restore} onOpenLauncher={() => setLauncherOpen(true)} />
  {launcherOpen && <MinimalLauncher onOpen={handleOpen} onClose={() => setLauncherOpen(false)} />}
  {keyDialogOpen && <KeyDialog onClose={() => setKeyDialogOpen(false)} />}
</div>
```

**Active window derivation** (from `src/ui/useWindowManager.tsx` line 130+):
```typescript
// Highest z-index non-minimized window = active; same pattern as manager's zTop tracking
const activeWindow = [...windowManager.windows]
  .filter(w => !w.minimized)
  .sort((a, b) => b.z - a.z)[0] ?? null;
```

**Open + storeComponent pattern** — copy verbatim from `src/ui/Marketplace.tsx` lines 185–263 (`handleOpen`), lines 156–183 (`handleClose`, `storeComponent`). The `handleModify` pattern lives at lines 279–337.

**State pattern** (`src/ui/Marketplace.tsx` lines 128–147):
```typescript
const [openingId, setOpeningId] = useState<string | null>(null);
const [components, setComponents] = useState<Map<string, ComponentType | null>>(new Map());
const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
const [keyDialogOpen, setKeyDialogOpen] = useState(false);
const [launcherOpen, setLauncherOpen] = useState(false);
```

---

### `src/ui/MenuBar.tsx` (component, event-driven)

**Analog:** `src/ui/AppBar.tsx` (lines 1–54) — same role (top OS chrome bar with controls)

**Design reference** (`design/VibeOS.dc.html` line 34):
```
height:40px; display:flex; align-items:center; justify-content:space-between; padding:0 16px;
background:linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.03));
backdrop-filter:blur(26px) saturate(180%); border-bottom:1px solid rgba(255,255,255,0.14);
box-shadow:inset 0 1px 0 rgba(255,255,255,0.35);
```

**Imports pattern** (from `src/ui/AppBar.tsx` lines 1–4):
```typescript
import { User } from "lucide-react";
import { ThemeSelector } from "./ThemeSelector";
```

**Props interface pattern** (from `src/ui/AppBar.tsx` lines 16–18):
```typescript
export interface MenuBarProps {
  /** Title of the currently focused window; null when no window is active. */
  activeName: string | null;
  /** Opens the KeyDialog (SHELL-03 — account/key management). */
  onOpenAccount: () => void;
}
```

**Live clock pattern** — `setInterval` in `useEffect`, same as `design/VibeOS.dc.html` line 193 pomodoro timer pattern; clean up on unmount:
```typescript
const [clock, setClock] = useState(() => formatClock(new Date()));
useEffect(() => {
  const id = setInterval(() => setClock(formatClock(new Date())), 1000);
  return () => clearInterval(id);
}, []);
function formatClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}
```

**JSX structure** (mirroring `src/ui/AppBar.tsx` lines 27–54 layout pattern):
```tsx
<header role="banner" className="menu-bar">
  {/* Left: wordmark + active app name */}
  <div className="menu-bar__left">
    <span className="menu-bar__wordmark">Vibe OS</span>
    {activeName && <span className="menu-bar__active-app">{activeName}</span>}
  </div>
  {/* Right: ThemeSelector + key/account + clock */}
  <div className="menu-bar__right">
    <ThemeSelector />
    <button type="button" className="app-bar__icon-btn" aria-label="Account" onClick={onOpenAccount}>
      <User size={16} aria-hidden="true" />
    </button>
    <span className="menu-bar__clock" aria-live="off">{clock}</span>
  </div>
</header>
```

---

### `src/ui/Dock.tsx` (component, event-driven)

**Analog:** `src/ui/AppBar.tsx` (lines 1–54) for glass-chrome icon-button bar; dock-specific patterns from `design/VibeOS.dc.html` lines 134–142.

**Design reference — dock container** (`design/VibeOS.dc.html` line 134):
```
position:absolute; bottom:16px; left:50%; transform:translateX(-50%);
display:flex; align-items:flex-end; gap:6px; padding:9px 13px;
border-radius:22px;
background:linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.05));
backdrop-filter:blur(30px) saturate(190%);
border:1px solid rgba(255,255,255,0.2);
box-shadow:0 18px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.45);
```

**Design reference — dock icon button** (`design/VibeOS.dc.html` line 136):
```
width:52px; height:52px; border-radius:15px; border:none; background:transparent; cursor:pointer;
display:flex; flex-direction:column; align-items:center; justify-content:flex-end; position:relative;
transition:transform .2s cubic-bezier(.2,.8,.2,1); transform-origin:bottom;
hover: transform:scale(1.22) translateY(-7px)
```

**Design reference — running indicator dot** (`design/VibeOS.dc.html` line 138):
```
position:absolute; bottom:-5px; width:4px; height:4px; border-radius:50%;
background:var(--text); opacity:0.7;
```

**Props interface pattern** (IoC/DI — inject callbacks, no direct window manager access in Dock):
```typescript
import type { WindowEntry } from "./useWindowManager";

export interface DockProps {
  windows: WindowEntry[];
  onFocus: (id: string) => void;
  onRestore: (id: string) => void;
  /** Opens the launcher (Phase 17 will replace stub). */
  onOpenLauncher: () => void;
}
```

**Icon mapping** — reuse the `ICONS` map pattern from `src/ui/Marketplace.tsx` lines 35–44:
```typescript
// In Dock.tsx: render the icon glyph from the window's appType/icon key
// Same ICONS Record<string, LucideIcon> lookup as Marketplace
```

**Dock icon click → focus or restore** (from `src/ui/useWindowManager.tsx` lines 164–172):
```typescript
// If minimized → restore(id), else → focus(id)
onClick={() => entry.minimized ? onRestore(entry.id) : onFocus(entry.id)}
```

---

### `src/ui/MinimalLauncher.tsx` (component, request-response)

**Analog:** `MarketplaceInner` grid section in `src/ui/Marketplace.tsx` (lines 367–428) — same data (APP_REGISTRY), same open callback pattern.

**Imports pattern**:
```typescript
import { APP_REGISTRY } from "../data/appRegistry";
import { Cloud, Calculator, NotebookPen, Timer, ArrowLeftRight, ChefHat, CalendarDays, Wallet, type LucideIcon } from "lucide-react";
```

**ICONS map** — copy verbatim from `src/ui/Marketplace.tsx` lines 35–44:
```typescript
const ICONS: Record<string, LucideIcon> = {
  cloud: Cloud, calculator: Calculator, notes: NotebookPen,
  timer: Timer, currency: ArrowLeftRight, recipes: ChefHat,
  calendar: CalendarDays, budget: Wallet,
};
```

**Props interface** (inject open + close callbacks):
```typescript
export interface MinimalLauncherProps {
  onOpen: (appType: string, displayName: string) => void;
  onClose: () => void;
}
```

**JSX structure** — simplified card list (no popular row, no pagination):
```tsx
// Glass panel overlay — same glass pattern as window chrome
<div className="launcher" role="dialog" aria-label="Open an app">
  <button type="button" className="launcher__close" onClick={onClose} aria-label="Close">×</button>
  <div className="launcher__grid">
    {APP_REGISTRY.map((app) => {
      const Icon = ICONS[app.icon] ?? Cloud;
      return (
        <button key={app.id} type="button" className="launcher__app-btn"
          onClick={() => { onOpen(app.id, app.displayName); onClose(); }}
          aria-label={app.displayName}>
          <Icon size={28} aria-hidden="true" />
          <span>{app.displayName}</span>
        </button>
      );
    })}
  </div>
</div>
```

**Overlay/dialog pattern** — from `src/ui/KeyDialog.tsx` lines 124–131: overlay div with click-to-close, inner div with `e.stopPropagation()`:
```typescript
<div className="launcher-overlay" onClick={onClose}>
  <div className="launcher" role="dialog" onClick={(e) => e.stopPropagation()}>
    ...
  </div>
</div>
```

---

### `src/ui/WindowFrame.tsx` (modify — titlebar centering, hideClose prop)

**Current titlebar markup** (lines 119–149): order is `traffic-lights → title → icon`; icon floats right, title uses `flex:1`. Fix: group `icon + title` in a centered container, CSS `position:absolute` trick or `flex:1` centering.

**hideClose/chromeless prop addition** — follows `AppShellProps` optional-prop pattern (`src/ui/AppShell.tsx` lines 19–32):
```typescript
export interface WindowFrameProps {
  // ... existing props ...
  /** When true, suppresses AppShell's inner × close button (use when WindowFrame's traffic-light is the authoritative close). */
  hideClose?: boolean;
}
```

**Pass-through to WindowBody** — add `hideClose` to `WindowBodyProps` and pass into `<AppShell>`:
```tsx
// WindowBody (lines 36–63): pass hideClose into AppShell
<AppShell displayName={title} onClose={hideClose ? undefined : onClose} onModify={onModify}>
```
Note: passing `onClose={undefined}` while keeping the `×` button is incomplete — see AppShell modification below for how to suppress the button entirely.

**Titlebar CSS fix** — in `src/index.css` (lines 720–780), change `.window-chrome__titlebar` layout so icon+title center:
```css
/* New layout: traffic-lights left, [icon + title] center, spacer right */
.window-chrome__titlebar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
}
.window-chrome__title-group {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  overflow: hidden;
}
```

---

### `src/ui/AppShell.tsx` (modify — hideClose/chromeless prop)

**Existing props interface** (lines 19–32). Add optional `hideClose`:
```typescript
export interface AppShellProps {
  displayName: string;
  onClose: () => void;
  onModify?: (instruction: string) => void;
  children: ReactNode;
  /** When true, the inner × close button is not rendered (traffic-light is authoritative). */
  hideClose?: boolean;
}
```

**Button suppression** (lines 64–72): guard the × button render with `!hideClose`:
```tsx
{!hideClose && (
  <button type="button" className="app-bar__icon-btn"
    aria-label={`Close ${displayName}`} title="Close" onClick={onClose}>
    ×
  </button>
)}
```

---

### `src/ui/AppBar.tsx` (modify — strip ThemeSelector, preserve KeyDialog trigger)

**Current structure** (lines 22–54): renders `ThemeSelector` + `User` (account) icon + theme cycle toggle. Phase 16 strips `ThemeSelector` (relocated to `MenuBar`). The `User`/account button and theme-cycle toggle either stay or migrate to `MenuBar` depending on final design; preserve `onOpenAccount` callback which is the `KeyDialog` gate.

**Minimal AppBar after relocation** — if AppBar is effectively replaced by MenuBar as OS root, `App.tsx` can stop rendering AppBar. If AppBar is retained (e.g. for the storefront context), remove only `<ThemeSelector />` import and JSX element.

---

### `src/App.tsx` (modify — wire DesktopShell as new root)

**Current root pattern** (lines 25–51): `ThemeProvider → VibeThemeProvider → ErrorBoundary → WindowManagerProvider → AppBar + main[Marketplace] + KeyDialog`.

**New root pattern**: replace `AppBar + main[Marketplace]` with `DesktopShell`. `DesktopShell` owns its own `WindowManagerProvider` (same self-contained pattern as `Marketplace`). `App.tsx` stops owning the outer `WindowManagerProvider` since `DesktopShell` owns it:
```tsx
export default function App() {
  useEffect(() => {
    void dbReady.then(() => { logger.info("Registry initialized"); });
  }, []);

  return (
    <ThemeProvider>
      <VibeThemeProvider>
        <ErrorBoundary>
          <ServicesProvider services={createServices()}>
            <DesktopShell />
          </ServicesProvider>
        </ErrorBoundary>
      </VibeThemeProvider>
    </ThemeProvider>
  );
}
```

---

### `src/ui/Marketplace.tsx` (modify — remove storefront grid)

**Grid section to remove** (lines 367–428): the `<div className="storefront-grid">` blocks (both the main grid and the "Your most-opened" section). The `handleOpen`, `handleModify`, `handleClose` logic and the `<div className="desktop">` window rendering (lines 432–464) are the parts that MOVE to `DesktopShell`. After this phase, `Marketplace` is either an empty component, a thin re-export, or removed entirely — the planner decides. The `keyDialogOpen` state moves to `DesktopShell`.

---

### `src/index.css` (modify CSS — wallpaper layer, blob animations, dock + menu bar glass styles)

**Existing glass pattern for window chrome** (lines 697–779): `background: var(--glass, ...)`, `backdrop-filter: blur(32px) saturate(195%)`, `border: 1px solid var(--bord, ...)`. New elements use the same glass formula.

**Wallpaper layer** — body and `.desktop-shell` get `background: var(--wall)` (the radial-gradient set by `VibeThemeProvider`):
```css
.desktop-shell {
  position: fixed;
  inset: 0;
  background: var(--wall);
  overflow: hidden;
}
```

**Blob keyframe animation** (from `design/VibeOS.dc.html` line 19):
```css
@keyframes vibeFloat {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%       { transform: translate(7%, -9%) scale(1.14); }
  66%       { transform: translate(-8%, 6%) scale(0.92); }
}

@media (prefers-reduced-motion: reduce) {
  .desktop-shell__blob { animation: none !important; filter: blur(80px); }
}
```

**Blob base styles** (from `design/VibeOS.dc.html` line 423):
```css
/* 4 blobs, positions from design ref blobPos array */
.desktop-shell__blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.6;
  mix-blend-mode: screen;
  pointer-events: none;
}
/* Blob sizes/positions and per-blob color var */
.desktop-shell__blob--1 { top: -12%; left: -8%;  width: 46vw; height: 46vw; background: radial-gradient(circle, var(--b1) 0%, transparent 68%); animation: vibeFloat 16s ease-in-out infinite 0s; }
.desktop-shell__blob--2 { top:  6%;  left: 58%;  width: 50vw; height: 50vw; background: radial-gradient(circle, var(--b2) 0%, transparent 68%); animation: vibeFloat 20s ease-in-out infinite -3s; }
.desktop-shell__blob--3 { top: 52%;  left:  4%;  width: 44vw; height: 44vw; background: radial-gradient(circle, var(--b3) 0%, transparent 68%); animation: vibeFloat 24s ease-in-out infinite -6s; }
.desktop-shell__blob--4 { top: 46%;  left: 62%;  width: 48vw; height: 48vw; background: radial-gradient(circle, var(--b4) 0%, transparent 68%); animation: vibeFloat 28s ease-in-out infinite -9s; }
```

**Menu bar glass** (from `design/VibeOS.dc.html` line 34):
```css
.menu-bar {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  z-index: 9000;
  background: linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.03));
  backdrop-filter: blur(26px) saturate(180%);
  -webkit-backdrop-filter: blur(26px) saturate(180%);
  border-bottom: 1px solid rgba(255,255,255,0.14);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.35);
  color: var(--text);
}
```

**Dock glass** (from `design/VibeOS.dc.html` line 134):
```css
.dock {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9000;
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 9px 13px;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05));
  backdrop-filter: blur(30px) saturate(190%);
  -webkit-backdrop-filter: blur(30px) saturate(190%);
  border: 1px solid rgba(255,255,255,0.2);
  box-shadow: 0 18px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.45);
}

.dock__icon {
  width: 52px; height: 52px;
  border-radius: 15px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex; flex-direction: column;
  align-items: center; justify-content: flex-end;
  position: relative;
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
  transform-origin: bottom;
  color: var(--text);
}
.dock__icon:hover { transform: scale(1.22) translateY(-7px); }

.dock__running-dot {
  position: absolute;
  bottom: -5px;
  width: 4px; height: 4px;
  border-radius: 50%;
  background: var(--text);
  opacity: 0.7;
}
```

**Desktop z-layering update** — existing `.desktop` (line 688–695) gets `z-index` coordinated so it sits below dock/menu-bar (`z-index: 100`) but above wallpaper/blobs (`z-index: 0`). Dock and MenuBar use `z-index: 9000` per design.

---

## Shared Patterns

### Glass Chrome
**Source:** `src/index.css` lines 697–714 (`.window-chrome`), `design/VibeOS.dc.html` line 52
**Apply to:** `.desktop-shell` (wallpaper base), `.menu-bar`, `.dock`, `.launcher`
```css
/* glass formula used in window chrome — applied to all new bars/panels */
background: var(--glass, rgba(255,255,255,0.10));
border: 1px solid var(--bord, rgba(255,255,255,0.22));
backdrop-filter: blur(32px) saturate(195%);
-webkit-backdrop-filter: blur(32px) saturate(195%);
```

### Context Provider pattern (testability)
**Source:** `src/ui/Marketplace.tsx` lines 117–123 (self-contained `WindowManagerProvider` wrapper)
**Apply to:** `DesktopShell.tsx` — wrap its own `WindowManagerProvider` so tests can render `<DesktopShell/>` directly without an App wrapper.

### IoC/DI — Inject callbacks, not contexts
**Source:** `src/ui/WindowFrame.tsx` lines 65–81 (all actions injected as props)
**Apply to:** `Dock.tsx`, `MenuBar.tsx`, `MinimalLauncher.tsx` — no direct `useWindowManager()` inside these leaf components; inject `windows`, `onFocus`, `onRestore`, `onOpenLauncher` from the shell.

### Error handling — logger + neutral fallback
**Source:** `src/ui/Marketplace.tsx` lines 231–254 (`handleOpen` catch block)
**Apply to:** `DesktopShell.tsx` `handleOpen` — copy the full `try/catch` with `ProduceAuthError`/`ProduceThrottledError` discrimination and `makeFallback` pattern verbatim.

### Button + focus-visible pattern
**Source:** `src/index.css` lines 80–109 (`.app-bar__icon-btn`)
**Apply to:** dock icon buttons, menu-bar control buttons — reuse `.app-bar__icon-btn` class where icon sizes match; add new classes for dock-specific sizing.

### useCallback + stable ref pattern
**Source:** `src/ui/Marketplace.tsx` lines 267–268 (`handleOpenRef`)
**Apply to:** `DesktopShell.tsx` — same stable ref for `handleOpen` so the launcher's retry handler doesn't need it in its own dependency list.

---

## No Analog Found

All files have close codebase analogs. No files require falling back to RESEARCH.md patterns only.

---

## Metadata

**Analog search scope:** `src/ui/`, `src/App.tsx`, `src/data/appRegistry.ts`, `design/VibeOS.dc.html`
**Files scanned:** 18 source files + design reference
**Pattern extraction date:** 2026-06-26
