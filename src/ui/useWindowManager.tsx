// Window Manager context and hook (Phase 15, plan 15-02).
//
// Owns the ordered list of open windows, z-ordering, minimize/restore, and the
// close path. In the in-tree rendering model each app renders as a normal React
// child of its WindowFrame, so closing simply removes the entry from state and
// React unmounts the window's subtree — there is no separate root to tear down.
// The isOpen ref-mirror provides a synchronous boolean guard usable in async
// flows between the point a window is opened and the point the component
// actually mounts — preventing a body from being stored for a window that has
// already closed before the mount completes.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import { logger } from "../lib/logger";
import { sanitizeDisplayName } from "./sanitizeDisplayName";

// Default window dimensions used for viewport-clamp arithmetic.
const DEFAULT_W = 400;
const DEFAULT_H = 300;

// Cascade step: each new window is offset this many pixels from the previous.
const CASCADE_OFFSET = 28;

// Module-level counters: survive re-renders, reset on page reload.
let zTop = 200;
let counter = 0;

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
  // Phase 19 (plan 19-02): maximize = zoom-to-work-area (NOT OS full-screen).
  // `maximized` flags the window as filling the work area; `restoreRect` carries
  // the pre-maximize geometry so unmaximize can return the window to where it
  // was. The work-area rect itself is resolved in DesktopShell (it owns the
  // menu-bar/dock layout constants); the manager only carries the toggle state.
  maximized: boolean;
  restoreRect: { x: number; y: number; w: number; h: number } | null;
  // Phase 19 (plan 19-03): snap-to-half (CHROME-03). `snapSide` marks the window
  // as snapped to the left or right HALF of the work area (null = not snapped).
  // Like maximize, the half-rect geometry itself is resolved in DesktopShell
  // (it owns the menu-bar/dock layout constants); the manager only carries the
  // side marker so DesktopShell knows to apply a half-rect. A window cannot be
  // both maximized and snapped — snapLeft/snapRight clear `maximized`.
  snapSide: "left" | "right" | null;
}

export interface WindowManagerValue {
  windows: WindowEntry[];
  /** Mint a new window entry and return the minted instanceId. */
  open: (appType: string, meta: { title: string; icon: string }) => string;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
  /** Commit a free (non-pinned) position back to the entry so `x`/`y` are the
   *  authoritative source of truth — used when a drag commits to a free position.
   *  Keeping geometry on the entry lets maximize/snap capture the EFFECTIVE
   *  current position into restoreRect (WR-01) rather than a stale value. */
  setGeometry: (id: string, x: number, y: number) => void;
  /** Maximize: zoom to the work area (NOT OS full-screen). Captures the
   *  EFFECTIVE pre-maximize geometry into restoreRect, clears any snap (a window
   *  cannot be both maximized and snapped — CR-01), and raises the window. */
  maximize: (id: string) => void;
  /** Restore from maximized to the prior (pre-maximize) geometry: READS
   *  restoreRect and writes x/y back so the window lands exactly where it was
   *  (WR-01); raises the window. */
  unmaximize: (id: string) => void;
  /** Snap to the LEFT half of the work area (CHROME-03). Captures the EFFECTIVE
   *  pre-snap geometry into restoreRect, clears `maximized`, and raises the window. */
  snapLeft: (id: string) => void;
  /** Snap to the RIGHT half of the work area (CHROME-03). Same capture + raise. */
  snapRight: (id: string) => void;
  /** Clear a snap: returns a snapped window to a FREE, non-pinned state, READING
   *  restoreRect to restore its prior geometry (CR-01/WR-01); raises the window. */
  unsnap: (id: string) => void;
  /** Close window: removes the entry; React unmounts the in-tree subtree. */
  close: (id: string) => void;
  /** Synchronous guard: returns false immediately after close even inside async flows. */
  isOpen: (id: string) => boolean;
  /**
   * Synchronous guard keyed on the manager-minted instanceId (not the window
   * id). Mirrors open instanceIds the same way isOpen mirrors window ids, so an
   * async open flow can check whether ITS instance is still open without a
   * stale-windows-array round-trip through instanceId → id.
   */
  isOpenByInstance: (instanceId: string) => boolean;
  /** Returns the active (topmost non-minimized) window ENTRY, or null if none.
   *  The SINGLE source of truth for "which window is front-most" — both the
   *  keyboard-shortcut target and the menu-bar active name derive from it so
   *  they can never disagree (WR-05). */
  activeWindow: () => WindowEntry | null;
  /** Returns the active (topmost non-minimized) window id, or null if none.
   *  Convenience wrapper over activeWindow() (same selection logic, WR-05). */
  activeId: () => string | null;
  /**
   * Open a window at explicit geometry, bypassing cascadePlace. Use this for
   * the desktop restore path (Plan 21-03) — call it with the persisted x/y/z
   * and minimized state so the window appears at its saved position without a
   * cascade-flash. Bumps the module-level zTop to Math.max(zTop, position.z)
   * outside the React updater so subsequent open()/focus() calls assign z
   * values strictly above all restored windows (Strict-Mode purity: the
   * updater body remains pure; the zTop mutation happens exactly once in the
   * useCallback body, not inside setWindows). Returns the freshly minted
   * session-scoped instanceId (appType-N).
   */
  openAt: (
    appType: string,
    meta: { title: string; icon: string },
    position: { x: number; y: number; z: number; minimized: boolean },
  ) => string;
}

export const WindowManagerContext =
  createContext<WindowManagerValue | null>(null);

/**
 * Compute a cascade-placed (x, y) for a new window.
 *
 * Starts from (80, 80) for the first window, then offsets each subsequent
 * window by CASCADE_OFFSET pixels in both axes from the last entry.
 * Clamps so the window stays fully within the current viewport.
 */
function cascadePlace(existing: WindowEntry[]): { x: number; y: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  const maxX = Math.max(0, vw - DEFAULT_W);
  const maxY = Math.max(0, vh - DEFAULT_H);

  if (existing.length === 0) {
    return { x: Math.min(80, maxX), y: Math.min(80, maxY) };
  }

  const last = existing[existing.length - 1]!;
  const x = Math.min(last.x + CASCADE_OFFSET, maxX);
  const y = Math.min(last.y + CASCADE_OFFSET, maxY);
  return { x, y };
}

export function WindowManagerProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [windows, setWindows] = useState<WindowEntry[]>([]);

  // Ref mirror of window ids — kept synchronously in-step with state via
  // useEffect. Allows isOpen() to return a reliable boolean without waiting
  // for the next React render cycle.
  const openIdsRef = useRef<Set<string>>(new Set());

  // Parallel ref mirror keyed on instanceId, updated synchronously alongside
  // openIdsRef in open()/close(). Lets isOpenByInstance() guard an async open
  // flow without round-tripping instanceId → id through the (possibly
  // not-yet-flushed) windows array.
  const openInstanceIdsRef = useRef<Set<string>>(new Set());

  // Ref mirror of the full windows array, kept in-step with state. Lets
  // activeId() (and any other live-read accessor) resolve the front-most window
  // synchronously inside an event handler without a stale-closure round-trip.
  const windowsRef = useRef<WindowEntry[]>(windows);
  windowsRef.current = windows;

  useEffect(() => {
    openIdsRef.current = new Set(windows.map(w => w.id));
    openInstanceIdsRef.current = new Set(windows.map(w => w.instanceId));
  }, [windows]);

  const open = useCallback(
    (appType: string, meta: { title: string; icon: string }): string => {
      const n = ++counter;
      const id = `win-${n}`;
      const instanceId = `${appType}-${n}`;
      // Mint the z-value OUTSIDE the state updater. React invokes updaters twice
      // in Strict Mode (dev) to surface impure updaters; incrementing zTop inside
      // one would advance it by 2 per call and create z-order gaps. Compute it
      // once here and close over the constant so the updater stays pure.
      const z = ++zTop;

      setWindows(prev => {
        const { x, y } = cascadePlace(prev);
        const entry: WindowEntry = {
          id,
          instanceId,
          appType,
          title: sanitizeDisplayName(meta.title),
          icon: meta.icon,
          x,
          y,
          z,
          minimized: false,
          maximized: false,
          restoreRect: null,
          snapSide: null,
        };
        // Sync the refs immediately so isOpen()/isOpenByInstance() are accurate
        // before the effect runs.
        openIdsRef.current = new Set([...prev.map(w => w.id), id]);
        openInstanceIdsRef.current = new Set([
          ...prev.map(w => w.instanceId),
          instanceId,
        ]);
        logger.info(`Window opened: ${id} (${appType})`);
        return [...prev, entry];
      });

      return instanceId;
    },
    [],
  );

  const openAt = useCallback(
    (
      appType: string,
      meta: { title: string; icon: string },
      position: { x: number; y: number; z: number; minimized: boolean },
    ): string => {
      const n = ++counter;
      const id = `win-${n}`;
      const instanceId = `${appType}-${n}`;
      // Bump zTop to the restored z value OUTSIDE the updater so future
      // open()/focus() calls assign z values strictly above all restored
      // windows. Strict-Mode purity: React invokes updaters twice in dev —
      // mutating zTop here (in the useCallback body, not inside setWindows)
      // ensures the mutation happens exactly once per openAt call (T-21-06).
      if (position.z > zTop) {
        zTop = position.z;
      }

      setWindows(prev => {
        const entry: WindowEntry = {
          id,
          instanceId,
          appType,
          title: sanitizeDisplayName(meta.title),
          icon: meta.icon,
          x: position.x,
          y: position.y,
          z: position.z,
          minimized: position.minimized,
          maximized: false,
          restoreRect: null,
          snapSide: null,
        };
        // Sync the refs immediately so isOpen()/isOpenByInstance() are accurate
        // before the useEffect mirror fires.
        openIdsRef.current = new Set([...prev.map(w => w.id), id]);
        openInstanceIdsRef.current = new Set([
          ...prev.map(w => w.instanceId),
          instanceId,
        ]);
        logger.info(`Window opened: ${id} (${appType})`);
        return [...prev, entry];
      });

      return instanceId;
    },
    [],
  );

  const focus = useCallback((id: string) => {
    // Mint z OUTSIDE the updater — see open() for the Strict-Mode rationale.
    const z = ++zTop;
    setWindows(prev =>
      prev.map(w => (w.id === id ? { ...w, z } : w)),
    );
  }, []);

  const minimize = useCallback((id: string) => {
    setWindows(prev =>
      prev.map(w => (w.id === id ? { ...w, minimized: true } : w)),
    );
  }, []);

  const restore = useCallback((id: string) => {
    // Mint z OUTSIDE the updater — see open() for the Strict-Mode rationale.
    const z = ++zTop;
    setWindows(prev =>
      prev.map(w =>
        w.id === id ? { ...w, minimized: false, z } : w,
      ),
    );
  }, []);

  const setGeometry = useCallback((id: string, x: number, y: number) => {
    // Write a committed free position back to the entry so `x`/`y` stay the
    // authoritative geometry. A pinned (maximized/snapped) window ignores this
    // (its rect is resolved in DesktopShell), so guard against overwriting the
    // pre-pin geometry that restoreRect/un-pin relies on.
    setWindows(prev =>
      prev.map(w =>
        w.id === id && !w.maximized && w.snapSide === null
          ? { ...w, x, y }
          : w,
      ),
    );
  }, []);

  const maximize = useCallback((id: string) => {
    // Mint z OUTSIDE the updater — see open() for the Strict-Mode rationale.
    // Maximizing raises the window to the front (standard desktop behavior).
    const z = ++zTop;
    setWindows(prev =>
      prev.map(w => {
        if (w.id !== id) return w;
        // Capture the EFFECTIVE current geometry (w.x/w.y are kept authoritative
        // via setGeometry on drag commit, WR-01) so unmaximize returns the
        // window exactly where it was. Clear any snap — a window cannot be both
        // maximized and snapped (CR-01). The maximized rect itself is the work
        // area, resolved in DesktopShell; w/h default to the app size.
        return {
          ...w,
          maximized: true,
          snapSide: null,
          restoreRect: { x: w.x, y: w.y, w: DEFAULT_W, h: DEFAULT_H },
          z,
        };
      }),
    );
  }, []);

  const unmaximize = useCallback((id: string) => {
    // Mint z OUTSIDE the updater — see open() for the Strict-Mode rationale.
    const z = ++zTop;
    setWindows(prev =>
      prev.map(w => {
        if (w.id !== id) return w;
        // READ restoreRect to return the window to its prior geometry (WR-01).
        // Fall back to the current x/y if no rect was captured.
        const rect = w.restoreRect;
        return {
          ...w,
          maximized: false,
          x: rect ? rect.x : w.x,
          y: rect ? rect.y : w.y,
          z,
        };
      }),
    );
  }, []);

  const snapLeft = useCallback((id: string) => {
    // Mint z OUTSIDE the updater — see open() for the Strict-Mode rationale.
    // Snapping raises the window to the front (standard desktop behavior).
    const z = ++zTop;
    setWindows(prev =>
      prev.map(w => {
        if (w.id !== id) return w;
        // Capture the EFFECTIVE pre-snap geometry so unsnap returns the window
        // where it was (WR-01). A window cannot be both maximized and snapped —
        // clear `maximized`. The half-rect itself is resolved in DesktopShell.
        return {
          ...w,
          snapSide: "left",
          maximized: false,
          restoreRect: { x: w.x, y: w.y, w: DEFAULT_W, h: DEFAULT_H },
          z,
        };
      }),
    );
  }, []);

  const snapRight = useCallback((id: string) => {
    // Mint z OUTSIDE the updater — see open() for the Strict-Mode rationale.
    const z = ++zTop;
    setWindows(prev =>
      prev.map(w => {
        if (w.id !== id) return w;
        return {
          ...w,
          snapSide: "right",
          maximized: false,
          restoreRect: { x: w.x, y: w.y, w: DEFAULT_W, h: DEFAULT_H },
          z,
        };
      }),
    );
  }, []);

  const unsnap = useCallback((id: string) => {
    // Mint z OUTSIDE the updater — see open() for the Strict-Mode rationale.
    // Clear the snap and return the window to a FREE, non-pinned state, READING
    // restoreRect to restore its prior geometry (CR-01/WR-01).
    const z = ++zTop;
    setWindows(prev =>
      prev.map(w => {
        if (w.id !== id) return w;
        const rect = w.restoreRect;
        return {
          ...w,
          snapSide: null,
          x: rect ? rect.x : w.x,
          y: rect ? rect.y : w.y,
          z,
        };
      }),
    );
  }, []);

  const close = useCallback((id: string) => {
    setWindows(prev => {
      const entry = prev.find(w => w.id === id);
      if (entry) {
        // No explicit root teardown: the app renders in-tree, so removing the
        // entry below lets React unmount the window's whole subtree.
        logger.info(`Window closed: ${id} (${entry.appType})`);
      }
      // Remove from both ref mirrors synchronously so isOpen()/
      // isOpenByInstance() return false immediately, before the next render.
      openIdsRef.current = new Set(
        [...openIdsRef.current].filter(wid => wid !== id),
      );
      if (entry) {
        openInstanceIdsRef.current = new Set(
          [...openInstanceIdsRef.current].filter(
            iid => iid !== entry.instanceId,
          ),
        );
      }
      return prev.filter(w => w.id !== id);
    });
  }, []);

  const isOpen = useCallback((id: string): boolean => {
    return openIdsRef.current.has(id);
  }, []);

  const isOpenByInstance = useCallback((instanceId: string): boolean => {
    return openInstanceIdsRef.current.has(instanceId);
  }, []);

  const activeWindow = useCallback((): WindowEntry | null => {
    // The active window is the highest-z, non-minimized one (the same z-ordering
    // zTop tracks). Read the live ref mirror so an event-handler caller resolves
    // the current front-most window without a stale-closure round-trip. This is
    // the SINGLE definition both activeId() and DesktopShell's menu-bar name
    // derive from (WR-05).
    const top = [...windowsRef.current]
      .filter(w => !w.minimized)
      .sort((a, b) => b.z - a.z)[0];
    return top ?? null;
  }, []);

  const activeId = useCallback((): string | null => {
    return activeWindow()?.id ?? null;
  }, [activeWindow]);

  const value: WindowManagerValue = {
    windows,
    open,
    openAt,
    focus,
    minimize,
    restore,
    setGeometry,
    maximize,
    unmaximize,
    snapLeft,
    snapRight,
    unsnap,
    close,
    isOpen,
    isOpenByInstance,
    activeWindow,
    activeId,
  };

  return (
    <WindowManagerContext.Provider value={value}>
      {children}
    </WindowManagerContext.Provider>
  );
}

/**
 * Consume the WindowManagerContext.
 * Throws if called outside a WindowManagerProvider.
 */
export function useWindowManager(): WindowManagerValue {
  const ctx = useContext(WindowManagerContext);
  if (!ctx) {
    throw new Error(
      "useWindowManager must be used within a WindowManagerProvider",
    );
  }
  return ctx;
}
