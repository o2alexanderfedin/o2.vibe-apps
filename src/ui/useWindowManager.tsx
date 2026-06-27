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
}

export interface WindowManagerValue {
  windows: WindowEntry[];
  /** Mint a new window entry and return the minted instanceId. */
  open: (appType: string, meta: { title: string; icon: string }) => string;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
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

  useEffect(() => {
    openIdsRef.current = new Set(windows.map(w => w.id));
    openInstanceIdsRef.current = new Set(windows.map(w => w.instanceId));
  }, [windows]);

  const open = useCallback(
    (appType: string, meta: { title: string; icon: string }): string => {
      const n = ++counter;
      const id = `win-${n}`;
      const instanceId = `${appType}-${n}`;

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
          z: ++zTop,
          minimized: false,
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

  const focus = useCallback((id: string) => {
    setWindows(prev =>
      prev.map(w => (w.id === id ? { ...w, z: ++zTop } : w)),
    );
  }, []);

  const minimize = useCallback((id: string) => {
    setWindows(prev =>
      prev.map(w => (w.id === id ? { ...w, minimized: true } : w)),
    );
  }, []);

  const restore = useCallback((id: string) => {
    setWindows(prev =>
      prev.map(w =>
        w.id === id ? { ...w, minimized: false, z: ++zTop } : w,
      ),
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

  const value: WindowManagerValue = {
    windows,
    open,
    focus,
    minimize,
    restore,
    close,
    isOpen,
    isOpenByInstance,
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
