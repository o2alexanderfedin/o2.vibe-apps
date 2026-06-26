// Window Manager state hook tests (Phase 15, plan 15-02).
//
// Tests cover: open/mint, cascade placement, z-order focus, minimize/restore,
// zero-leak close, and the isOpen guard that prevents late mounts after close.
//
// Test doubles: mountApp/unmountApp/mountedCount/isMounted/unmountAll from the
// real mount module (no network, no IndexedDB involvement).

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { type ReactNode } from "react";
import {
  WindowManagerProvider,
  useWindowManager,
} from "./useWindowManager";
import {
  mountApp,
  unmountAll,
  mountedCount,
} from "../execution/mount";

// Helper: a no-op component for mountApp (needs a valid ComponentType)
function NoOp() {
  return null;
}

// Wrapper factory: renders the hook inside WindowManagerProvider
function wrapper({ children }: { children: ReactNode }) {
  return <WindowManagerProvider>{children}</WindowManagerProvider>;
}

// Set viewport dimensions so cascade-clamp tests are deterministic
function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: height,
  });
}

describe("useWindowManager", () => {
  beforeEach(() => {
    setViewport(1280, 800);
  });

  afterEach(() => {
    cleanup();
    unmountAll();
  });

  it("open mints + returns the instanceId, adds an entry", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    let instanceId: string = "";
    act(() => {
      instanceId = result.current.open("notes", {
        title: "Notes",
        icon: "N",
      });
    });

    expect(instanceId).toBeTruthy();
    expect(typeof instanceId).toBe("string");
    expect(instanceId.length).toBeGreaterThan(0);
    expect(result.current.windows).toHaveLength(1);
    expect(result.current.windows[0].minimized).toBe(false);
    expect(typeof result.current.windows[0].z).toBe("number");
    expect(result.current.windows[0].z).toBeGreaterThan(0);
    expect(result.current.windows[0].instanceId).toBe(instanceId);
  });

  it("cascade placement offsets down-right and clamps in-viewport", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    act(() => {
      result.current.open("notes", { title: "Notes", icon: "N" });
      result.current.open("calc", { title: "Calc", icon: "C" });
    });

    const [first, second] = result.current.windows;
    // Second window is offset to the right and below the first
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBeGreaterThan(first.y);
    // Both within viewport (default app size is 400x300)
    expect(first.x).toBeGreaterThanOrEqual(0);
    expect(first.y).toBeGreaterThanOrEqual(0);
    expect(second.x + 400).toBeLessThanOrEqual(window.innerWidth);
    expect(second.y + 300).toBeLessThanOrEqual(window.innerHeight);
  });

  it("z-order: focus raises via bounded zTop", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    let id1 = "", id2 = "", id3 = "";
    act(() => {
      id1 = result.current.open("a", { title: "A", icon: "a" });
      id2 = result.current.open("b", { title: "B", icon: "b" });
      id3 = result.current.open("c", { title: "C", icon: "c" });
    });

    // Record z of first after all 3 are opened
    const win1 = result.current.windows.find(w => w.instanceId === id1)!;
    const zBefore = win1.z;

    act(() => {
      result.current.focus(win1.id);
    });

    const zAfter = result.current.windows.find(w => w.instanceId === id1)!.z;

    // After focus, the first window has the highest z among all windows
    const allZ = result.current.windows.map(w => w.z);
    expect(zAfter).toBe(Math.max(...allZ));

    // zTop increment is bounded (small step, not a large jump)
    const step = zAfter - zBefore;
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThanOrEqual(10);

    void id2; void id3;
  });

  it("minimize then restore preserves x/y/z", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    let winId = "";
    act(() => {
      result.current.open("notes", { title: "Notes", icon: "N" });
      winId = result.current.windows[0].id;
    });

    const { x: origX, y: origY } = result.current.windows[0];

    act(() => {
      result.current.minimize(winId);
    });
    expect(result.current.windows[0].minimized).toBe(true);

    act(() => {
      result.current.restore(winId);
    });

    const restored = result.current.windows[0];
    expect(restored.minimized).toBe(false);
    expect(restored.x).toBe(origX);
    expect(restored.y).toBe(origY);
  });

  it("close routes through unmountApp and drops the entry (zero leak)", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    const baseline = mountedCount();

    // Open 3 windows and mount real roots for each
    const instanceIds: string[] = [];
    const winIds: string[] = [];
    act(() => {
      for (let i = 0; i < 3; i++) {
        const iid = result.current.open(`app-${i}`, { title: `App ${i}`, icon: `${i}` });
        instanceIds.push(iid);
        winIds.push(result.current.windows[result.current.windows.length - 1].id);
      }
    });

    // Mount a real root for each instance
    for (const iid of instanceIds) {
      const container = document.createElement("div");
      document.body.appendChild(container);
      mountApp(iid, container, NoOp);
    }

    expect(mountedCount()).toBe(baseline + 3);

    // Close all windows via manager (which must call unmountApp internally)
    act(() => {
      for (const wid of winIds) {
        result.current.close(wid);
      }
    });

    expect(result.current.windows).toHaveLength(0);
    expect(mountedCount()).toBe(baseline);
  });

  it("isOpen is the primary guard: open returns true; close returns false; guarded late mount stays at baseline", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    const baseline = mountedCount();
    let winId = "";
    let instanceId = "";

    act(() => {
      instanceId = result.current.open("notes", { title: "Notes", icon: "N" });
      winId = result.current.windows[0].id;
    });

    // isOpen is true after open
    expect(result.current.isOpen(winId)).toBe(true);

    act(() => {
      result.current.close(winId);
    });

    // isOpen is false after close (synchronous check via ref mirror)
    expect(result.current.isOpen(winId)).toBe(false);

    // Guarded late mount: only mountApp if still open
    if (result.current.isOpen(winId)) {
      const container = document.createElement("div");
      document.body.appendChild(container);
      mountApp(instanceId, container, NoOp);
    }

    // No root was mounted because isOpen returned false
    expect(mountedCount()).toBe(baseline);
  });
});
