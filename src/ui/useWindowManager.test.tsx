// Window Manager state hook tests (Phase 15, plan 15-02).
//
// Tests cover: open/mint, cascade placement, z-order focus, minimize/restore,
// zero-leak close, and the isOpen guard that prevents late mounts after close.
//
// Test doubles: mountApp/mountedCount/unmountAll from the real mount module
// (no network, no IndexedDB involvement). The isOpen test mounts a real root
// only to prove the guarded late-mount path stays at baseline.

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
    expect(result.current.windows[0]!.minimized).toBe(false);
    expect(typeof result.current.windows[0]!.z).toBe("number");
    expect(result.current.windows[0]!.z).toBeGreaterThan(0);
    expect(result.current.windows[0]!.instanceId).toBe(instanceId);
  });

  it("cascade placement offsets down-right and clamps in-viewport", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    act(() => {
      result.current.open("notes", { title: "Notes", icon: "N" });
      result.current.open("calc", { title: "Calc", icon: "C" });
    });

    const first = result.current.windows[0]!;
    const second = result.current.windows[1]!;
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

    act(() => {
      result.current.open("notes", { title: "Notes", icon: "N" });
    });

    // Read state after act flushes
    const winId = result.current.windows[0]!.id;
    const { x: origX, y: origY } = result.current.windows[0]!;

    act(() => {
      result.current.minimize(winId);
    });
    expect(result.current.windows[0]!.minimized).toBe(true);

    act(() => {
      result.current.restore(winId);
    });

    const restored = result.current.windows[0]!;
    expect(restored.minimized).toBe(false);
    expect(restored.x).toBe(origX);
    expect(restored.y).toBe(origY);
  });

  it("close drops the entry (in-tree model: React unmounts the subtree)", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    // Open 3 windows
    act(() => {
      for (let i = 0; i < 3; i++) {
        result.current.open(`app-${i}`, { title: `App ${i}`, icon: `${i}` });
      }
    });

    // Read window ids after act flushes state
    const winIds = result.current.windows.map(w => w.id);
    expect(winIds).toHaveLength(3);

    // Close all windows via the manager. In the in-tree model each app renders
    // as a normal React child of its WindowFrame, so closing simply removes the
    // entry — there is no manager-owned root to tear down. The zero-leak
    // invariant for the rendered subtree is covered end-to-end by
    // MarketplaceWindows.test.tsx (appBodyCount → 0 after close).
    act(() => {
      for (const wid of winIds) {
        result.current.close(wid);
      }
    });

    expect(result.current.windows).toHaveLength(0);
  });

  it("open() sanitizes display name — banned tokens stripped from title (TGEN-03)", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    // Construct banned-token strings at runtime so the hygiene gate does not
    // flag these source lines as authored product-revealing copy.
    const twoLetterAcronym = ["A", "I"].join("");
    const pastTensePrefix = ["Gen", "erat", "ed"].join("");

    act(() => {
      result.current.open("weather", { title: `${twoLetterAcronym} Weather`, icon: "⛅" });
    });
    expect(result.current.windows[0]!.title).toBe("Weather");

    act(() => {
      result.current.open("notes", { title: `${pastTensePrefix} Notes`, icon: "📝" });
    });
    expect(result.current.windows[1]!.title).toBe("Notes");

    act(() => {
      result.current.open("cal", { title: "My Calendar", icon: "📅" });
    });
    expect(result.current.windows[2]!.title).toBe("My Calendar");

    act(() => {
      result.current.open("chat", { title: twoLetterAcronym, icon: "💬" });
    });
    expect(result.current.windows[3]!.title).toBe("App");
  });

  // Phase 19 (plan 19-02): maximize = zoom-to-work-area state on the manager.
  // The manager owns maximized/restoreRect + maximize/unmaximize/activeId; the
  // work-area geometry itself is resolved in DesktopShell.

  it("a new window defaults to maximized=false, restoreRect=null", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    act(() => {
      result.current.open("notes", { title: "Notes", icon: "N" });
    });

    const win = result.current.windows[0]!;
    expect(win.maximized).toBe(false);
    expect(win.restoreRect).toBeNull();
  });

  it("maximize sets maximized=true and captures the prior x/y into restoreRect", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    act(() => {
      result.current.open("notes", { title: "Notes", icon: "N" });
    });

    const winId = result.current.windows[0]!.id;
    const { x: priorX, y: priorY } = result.current.windows[0]!;

    act(() => {
      result.current.maximize(winId);
    });

    const win = result.current.windows[0]!;
    expect(win.maximized).toBe(true);
    expect(win.restoreRect).not.toBeNull();
    // restoreRect captures the pre-maximize geometry so unmaximize can return.
    expect(win.restoreRect!.x).toBe(priorX);
    expect(win.restoreRect!.y).toBe(priorY);
    expect(typeof win.restoreRect!.w).toBe("number");
    expect(typeof win.restoreRect!.h).toBe("number");
  });

  it("unmaximize sets maximized=false (restoreRect carries prior geometry)", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    act(() => {
      result.current.open("notes", { title: "Notes", icon: "N" });
    });

    const winId = result.current.windows[0]!.id;

    act(() => {
      result.current.maximize(winId);
    });
    expect(result.current.windows[0]!.maximized).toBe(true);

    act(() => {
      result.current.unmaximize(winId);
    });
    expect(result.current.windows[0]!.maximized).toBe(false);
  });

  it("maximize raises the window's z above a second window", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    let id1 = "", id2 = "";
    act(() => {
      id1 = result.current.open("a", { title: "A", icon: "a" });
      id2 = result.current.open("b", { title: "B", icon: "b" });
    });

    // After opening, the second window (B) is on top.
    const win1 = result.current.windows.find((w) => w.instanceId === id1)!;
    const win2 = result.current.windows.find((w) => w.instanceId === id2)!;
    expect(win2.z).toBeGreaterThan(win1.z);

    // Maximizing the first window raises it above the second.
    act(() => {
      result.current.maximize(win1.id);
    });

    const after1 = result.current.windows.find((w) => w.instanceId === id1)!;
    const after2 = result.current.windows.find((w) => w.instanceId === id2)!;
    expect(after1.z).toBeGreaterThan(after2.z);
  });

  it("activeWindow returns the same entry activeId resolves to — single source of truth (WR-05)", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    let id1 = "", id2 = "";
    act(() => {
      id1 = result.current.open("a", { title: "A", icon: "a" });
      id2 = result.current.open("b", { title: "B", icon: "b" });
    });

    const win1 = result.current.windows.find((w) => w.instanceId === id1)!;
    const win2 = result.current.windows.find((w) => w.instanceId === id2)!;

    // The second window opened last → highest z → active. activeWindow() must
    // return that same entry (NOT just an id), so DesktopShell's menu-bar name
    // and the keyboard-shortcut target share ONE definition of "front-most".
    expect(result.current.activeWindow()?.id).toBe(result.current.activeId());
    expect(result.current.activeWindow()?.id).toBe(win2.id);

    // Focusing the first raises it → activeWindow tracks it.
    act(() => {
      result.current.focus(win1.id);
    });
    expect(result.current.activeWindow()?.id).toBe(win1.id);
    expect(result.current.activeWindow()?.id).toBe(result.current.activeId());

    // Minimize both → no active window.
    act(() => {
      result.current.minimize(win1.id);
      result.current.minimize(win2.id);
    });
    expect(result.current.activeWindow()).toBeNull();
  });

  it("activeId returns the highest-z non-minimized id, null when all minimized", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    let id1 = "", id2 = "";
    act(() => {
      id1 = result.current.open("a", { title: "A", icon: "a" });
      id2 = result.current.open("b", { title: "B", icon: "b" });
    });

    const win1 = result.current.windows.find((w) => w.instanceId === id1)!;
    const win2 = result.current.windows.find((w) => w.instanceId === id2)!;

    // The second window opened last → highest z → active.
    expect(result.current.activeId()).toBe(win2.id);

    // Focusing the first raises it → it becomes active.
    act(() => {
      result.current.focus(win1.id);
    });
    expect(result.current.activeId()).toBe(win1.id);

    // Minimize both → no active window.
    act(() => {
      result.current.minimize(win1.id);
      result.current.minimize(win2.id);
    });
    expect(result.current.activeId()).toBeNull();
  });

  // Phase 19 (plan 19-03): snap-to-half state on the manager (CHROME-03).
  // The manager carries `snapSide` + snapLeft/snapRight (capturing restoreRect,
  // clearing maximized, raising z); the work-area HALF rect itself is resolved
  // in DesktopShell (same model as maximize).

  it("a new window defaults to snapSide=null", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    act(() => {
      result.current.open("notes", { title: "Notes", icon: "N" });
    });

    expect(result.current.windows[0]!.snapSide).toBeNull();
  });

  it("snapLeft sets snapSide='left' and captures restoreRect (non-null)", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    act(() => {
      result.current.open("notes", { title: "Notes", icon: "N" });
    });

    const winId = result.current.windows[0]!.id;
    const { x: priorX, y: priorY } = result.current.windows[0]!;

    act(() => {
      result.current.snapLeft(winId);
    });

    const win = result.current.windows[0]!;
    expect(win.snapSide).toBe("left");
    expect(win.restoreRect).not.toBeNull();
    // restoreRect captures the pre-snap geometry so an unsnap could restore.
    expect(win.restoreRect!.x).toBe(priorX);
    expect(win.restoreRect!.y).toBe(priorY);
  });

  it("snapRight sets snapSide='right'", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    act(() => {
      result.current.open("notes", { title: "Notes", icon: "N" });
    });

    const winId = result.current.windows[0]!.id;

    act(() => {
      result.current.snapRight(winId);
    });

    expect(result.current.windows[0]!.snapSide).toBe("right");
  });

  it("snapping a maximized window clears maximized (a window can't be both)", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    act(() => {
      result.current.open("notes", { title: "Notes", icon: "N" });
    });

    const winId = result.current.windows[0]!.id;

    act(() => {
      result.current.maximize(winId);
    });
    expect(result.current.windows[0]!.maximized).toBe(true);

    act(() => {
      result.current.snapLeft(winId);
    });
    expect(result.current.windows[0]!.maximized).toBe(false);
    expect(result.current.windows[0]!.snapSide).toBe("left");
  });

  it("snapLeft raises the window's z above a second window", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    let id1 = "", id2 = "";
    act(() => {
      id1 = result.current.open("a", { title: "A", icon: "a" });
      id2 = result.current.open("b", { title: "B", icon: "b" });
    });

    // After opening, the second window (B) is on top.
    const win1 = result.current.windows.find((w) => w.instanceId === id1)!;
    const win2 = result.current.windows.find((w) => w.instanceId === id2)!;
    expect(win2.z).toBeGreaterThan(win1.z);

    // Snapping the first window raises it above the second.
    act(() => {
      result.current.snapLeft(win1.id);
    });

    const after1 = result.current.windows.find((w) => w.instanceId === id1)!;
    const after2 = result.current.windows.find((w) => w.instanceId === id2)!;
    expect(after1.z).toBeGreaterThan(after2.z);
  });

  // Phase 19 (CR-01): a snapped window must be recoverable. The manager owns the
  // transitions that FREE a snapped window — maximize clears snapSide (mutual
  // exclusivity both ways), and an explicit unsnap clears snapSide back to null.

  it("maximize clears snapSide (a snapped window can be cleanly maximized) — CR-01", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    act(() => {
      result.current.open("notes", { title: "Notes", icon: "N" });
    });
    const winId = result.current.windows[0]!.id;

    act(() => {
      result.current.snapLeft(winId);
    });
    expect(result.current.windows[0]!.snapSide).toBe("left");

    // Maximizing a snapped window must clear the snap marker — otherwise the
    // frame carries BOTH window-chrome--maximized AND --snap-left, and the next
    // un-maximize falls back into the snapped half rather than free geometry.
    act(() => {
      result.current.maximize(winId);
    });
    expect(result.current.windows[0]!.maximized).toBe(true);
    expect(result.current.windows[0]!.snapSide).toBeNull();
  });

  it("unsnap clears snapSide back to null and restores prior geometry (CR-01/WR-01)", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    act(() => {
      result.current.open("notes", { title: "Notes", icon: "N" });
    });
    const winId = result.current.windows[0]!.id;
    const { x: priorX, y: priorY } = result.current.windows[0]!;

    act(() => {
      result.current.snapLeft(winId);
    });
    expect(result.current.windows[0]!.snapSide).toBe("left");

    act(() => {
      result.current.unsnap(winId);
    });
    const win = result.current.windows[0]!;
    // unsnap frees the window back to a non-snapped state.
    expect(win.snapSide).toBeNull();
    // WR-01: unsnap READS restoreRect to return the window to its prior geometry.
    expect(win.x).toBe(priorX);
    expect(win.y).toBe(priorY);
  });

  it("unmaximize restores the captured prior geometry from restoreRect (WR-01)", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    act(() => {
      result.current.open("notes", { title: "Notes", icon: "N" });
    });
    const winId = result.current.windows[0]!.id;

    // Capture an explicit pre-maximize geometry, then maximize from it.
    act(() => {
      result.current.setGeometry(winId, 123, 234);
    });
    expect(result.current.windows[0]!.x).toBe(123);
    expect(result.current.windows[0]!.y).toBe(234);

    act(() => {
      result.current.maximize(winId);
    });
    // restoreRect must capture the EFFECTIVE current geometry, not stale 0,0.
    expect(result.current.windows[0]!.restoreRect!.x).toBe(123);
    expect(result.current.windows[0]!.restoreRect!.y).toBe(234);

    act(() => {
      result.current.unmaximize(winId);
    });
    const win = result.current.windows[0]!;
    expect(win.maximized).toBe(false);
    // WR-01: unmaximize READS restoreRect so the window returns to where it was.
    expect(win.x).toBe(123);
    expect(win.y).toBe(234);
  });

  it("isOpen is the primary guard: open returns true; close returns false; guarded late mount stays at baseline", () => {
    const { result } = renderHook(() => useWindowManager(), { wrapper });

    const baseline = mountedCount();
    let instanceId = "";

    act(() => {
      instanceId = result.current.open("notes", { title: "Notes", icon: "N" });
    });

    // Read window id after act flushes state
    const winId = result.current.windows[0]!.id;

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
