// End-to-end integration tests for the assembled DesktopShell (Phase 16, plan
// 16-03, WIN-08). Renders the REAL DesktopShell with INJECTED dependencies — a
// canned transport (no network) and an in-memory registry (no real IndexedDB) —
// and drives the full desktop flow through the rendered DOM, offline.
//
// The seven behaviors (the WIN-08 acceptance bar):
//   1. the desktop-shell + four blob layers render.
//   2. opening via the launcher (dock magnifier → app) mints a WindowFrame AND
//      a running dock entry (icon + running dot).
//   3. a dock-icon click focuses (raises z); minimize then dock-click restores
//      (completes WIN-04 restore UI).
//   4. closing a window leaves zero leaked app bodies.
//   5. the menu-bar account control opens the KeyDialog (SHELL-03).
//   6. the menu-bar active-app name reflects the front-most window.
//   7. the contextual `⋮` MOD "remove" still closes a window.
//
// Test doubles are named "canned"/"stub" (never the banned hygiene tokens).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { STORAGE_KEY_OS_THEME } from "../lib/storage";
import { VIBE_THEMES } from "./VibeThemeProvider";
import {
  cannedTransport,
  createRecordingSettingsStore,
  createInMemoryRegistry,
} from "../services/testServices";
import { _clearCachesForTesting } from "../execution/loader";
import { unmountAll } from "../execution/mount";
import { waitUntil, WAIT_TIMEOUT_MS } from "../test/waitUntil";
import {
  renderDesktopShell,
  openApp,
  frames,
  frameByTitle,
  appBodyCount,
} from "./desktopShellTestKit";
import { LAYOUT_KEY } from "../host/layoutPersistence";
import { registryKey } from "../registry/cacheKey";
import { REGISTRY_DB_VERSION } from "../registry/db";

// A produced component shipped with `export default` — the canonical produced
// shape, used for cache-miss apps (Calculator) so a window mounts a real body.
const EXPORT_DEFAULT_TSX = `
export default function App() {
  return <div data-testid="produced">Produced Component</div>;
}
`;

/** The dock nav element (bottom-center app bar). */
function dock(): HTMLElement {
  const nav = document.querySelector(".dock") as HTMLElement | null;
  if (!nav) throw new Error("no dock rendered");
  return nav;
}

/** A dock app-icon button (the running-app entries, not the launcher magnifier),
 *  matched by the window title it carries as its aria-label. */
function dockEntry(title: string): HTMLElement {
  return within(dock()).getByRole("button", { name: title });
}

/** The menu-bar active-app name text, or null when no window is front-most. */
function activeAppName(): string | null {
  return (
    document.querySelector(".menu-bar__active-app")?.textContent?.trim() ?? null
  );
}

beforeEach(() => {
  _clearCachesForTesting();
});

afterEach(() => {
  cleanup();
  unmountAll();
  _clearCachesForTesting();
});


// A failed settleUntil gives up after WAIT_TIMEOUT_MS; a test must outlast
// that, or vitest's own timeout fires first and the assertion that was awaited
// is lost.
vi.setConfig({ testTimeout: 4 * WAIT_TIMEOUT_MS });

describe("DesktopShell — assembled desktop (WIN-08, injected deps, offline)", () => {
  it("renders the desktop-shell and four blob layers behind the windows", () => {
    renderDesktopShell();

    expect(document.querySelector(".desktop-shell")).toBeInTheDocument();
    const blobs = document.querySelectorAll(".desktop-shell__blob");
    expect(blobs).toHaveLength(4);
    // The blobs are purely decorative — none is exposed to the a11y tree.
    blobs.forEach((b) => expect(b.getAttribute("aria-hidden")).toBe("true"));
    // The dock + menu bar chrome are present over the (empty) window stack.
    expect(dock()).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("opening via the launcher mints a WindowFrame AND a running dock entry", async () => {
    const { user } = renderDesktopShell();

    await openApp(user, "Notes"); // seeded — no transport needed

    // A window-chrome frame appears titled "Notes" and its app body mounts.
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());
    await waitFor(() => expect(appBodyCount()).toBe(1));

    // The dock now lists a running entry for the window (icon + running dot).
    const entry = dockEntry("Notes");
    expect(entry).toBeInTheDocument();
    expect(entry.querySelector(".dock__running-dot")).toBeInTheDocument();
  });

  it("a dock-icon click focuses the window; minimize then dock-click restores it (WIN-04)", async () => {
    const { user } = renderDesktopShell({
      transport: cannedTransport(EXPORT_DEFAULT_TSX),
    });

    await openApp(user, "Notes"); // seeded
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());
    await openApp(user, "Calculator"); // unseeded → canned transport
    await waitFor(() => expect(frameByTitle("Calculator")).toBeInTheDocument());

    // Calculator (opened last) is front-most; clicking the Notes dock icon
    // raises Notes above Calculator.
    fireEvent.click(dockEntry("Notes"));
    await waitFor(() => {
      const notesZ = parseInt(frameByTitle("Notes").style.zIndex, 10);
      const calcZ = parseInt(frameByTitle("Calculator").style.zIndex, 10);
      expect(notesZ).toBeGreaterThan(calcZ);
    });

    // Minimize Notes via its traffic-light, then restore it from the dock.
    const notesFrame = frameByTitle("Notes");
    fireEvent.click(within(notesFrame).getByRole("button", { name: "Minimize" }));
    await waitFor(() =>
      expect(frameByTitle("Notes").className).toContain(
        "window-chrome--minimized",
      ),
    );

    // The dock entry persists while minimized — clicking it restores the window.
    fireEvent.click(dockEntry("Notes"));
    await waitFor(() =>
      expect(frameByTitle("Notes").className).not.toContain(
        "window-chrome--minimized",
      ),
    );
    // Restore raised it back to the front.
    await waitFor(() => {
      const notesZ = parseInt(frameByTitle("Notes").style.zIndex, 10);
      const calcZ = parseInt(frameByTitle("Calculator").style.zIndex, 10);
      expect(notesZ).toBeGreaterThan(calcZ);
    });
  });

  it("closing a window leaves zero leaked app bodies", async () => {
    const { user } = renderDesktopShell({
      transport: cannedTransport(EXPORT_DEFAULT_TSX),
    });

    await openApp(user, "Notes");
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());
    await openApp(user, "Calculator");
    await waitFor(() => expect(frameByTitle("Calculator")).toBeInTheDocument());
    await waitFor(() => expect(appBodyCount()).toBe(2));

    for (const title of ["Notes", "Calculator"]) {
      const frame = frameByTitle(title);
      fireEvent.click(within(frame).getByRole("button", { name: "Close" }));
    }

    await waitFor(() => expect(frames()).toHaveLength(0));
    // Every window's app body is torn down — none leaked (Pitfall 8).
    await waitFor(() => expect(appBodyCount()).toBe(0));
  });

  it("the menu-bar account control opens the KeyDialog (SHELL-03)", async () => {
    const { user } = renderDesktopShell();

    // No dialog yet.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // The account control lives in the menu bar (role banner).
    const banner = screen.getByRole("banner");
    await user.click(within(banner).getByRole("button", { name: "Account" }));

    // The KeyDialog opens (its first view sets a key; the heading names the flow).
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("heading")).toBeInTheDocument();
  });

  it("the menu-bar active-app name reflects the front-most window", async () => {
    const { user } = renderDesktopShell({
      transport: cannedTransport(EXPORT_DEFAULT_TSX),
    });

    // No window → no active-app name.
    expect(activeAppName()).toBeNull();

    await openApp(user, "Notes");
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());
    await waitFor(() => expect(activeAppName()).toBe("Notes"));

    // Opening Calculator brings it to the front → the name updates.
    await openApp(user, "Calculator");
    await waitFor(() => expect(frameByTitle("Calculator")).toBeInTheDocument());
    await waitFor(() => expect(activeAppName()).toBe("Calculator"));

    // Raising Notes (via its dock icon) makes it front-most again.
    fireEvent.click(dockEntry("Notes"));
    await waitFor(() => expect(activeAppName()).toBe("Notes"));
  });

  // Phase 19 (plan 19-03): snap-to-half (CHROME-03). Dragging a window so the
  // committed pointer reaches the left/right edge snaps it to that half of the
  // work area; the geometry mirrors maximize (work area, not the full viewport).

  it("dragging a window to the LEFT edge snaps it to the left half of the work area", async () => {
    const { user } = renderDesktopShell();

    await openApp(user, "Notes"); // seeded
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    const frame = frameByTitle("Notes");
    const handle = frame.querySelector(".titlebar-handle") as HTMLElement;

    // Drag the titlebar far to the left so the committed x clamps to 0 (within
    // the snap threshold of the left edge).
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 10, clientY: 100 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 10, clientY: 100 });

    // The frame snaps to the LEFT half: it fills the left half of the work area
    // (x = 0, width = half the viewport, height = work-area height). The menu
    // bar + dock stay present (work area, NOT the full viewport).
    await waitFor(() => {
      const f = frameByTitle("Notes");
      expect(f.style.width).toBe(`${Math.round(window.innerWidth / 2)}px`);
      expect(f.style.height).toBe(`${window.innerHeight - 40 - 88}px`);
      const m = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/.exec(
        f.style.transform,
      )!;
      expect(parseFloat(m[1]!)).toBe(0);
      expect(parseFloat(m[2]!)).toBe(40);
    });
    expect(document.querySelector(".menu-bar")).toBeInTheDocument();
    expect(document.querySelector(".dock")).toBeInTheDocument();
  });

  it("dragging a window to the RIGHT edge snaps it to the right half of the work area", async () => {
    const { user } = renderDesktopShell();

    await openApp(user, "Notes"); // seeded
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    const frame = frameByTitle("Notes");
    const handle = frame.querySelector(".titlebar-handle") as HTMLElement;

    // Drag the titlebar far to the right so the committed x clamps near the
    // right edge (within the snap threshold).
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientX: window.innerWidth + 500,
      clientY: 100,
    });
    fireEvent.pointerUp(handle, {
      pointerId: 1,
      clientX: window.innerWidth + 500,
      clientY: 100,
    });

    // The frame snaps to the RIGHT half (x = half viewport, width = half).
    await waitFor(() => {
      const f = frameByTitle("Notes");
      expect(f.style.width).toBe(`${Math.round(window.innerWidth / 2)}px`);
      const m = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/.exec(
        f.style.transform,
      )!;
      expect(parseFloat(m[1]!)).toBe(Math.round(window.innerWidth / 2));
    });
  });

  // Phase 19 (WR-02): preview and commit must AGREE. A frame WIDER than the
  // nominal 400px, dragged hard against the right edge, clamps so its top-left
  // x + 400 no longer reaches the right edge — but the POINTER is within the
  // snap threshold, so the during-drag preview showed the right drop-zone. The
  // commit must follow the reported edge side (the preview), not a recomputed
  // x + nominal-width, so the window actually snaps right.

  it("a frame wider than 400px dragged to the right edge snaps right (preview == commit) — WR-02", async () => {
    const { user } = renderDesktopShell();

    await openApp(user, "Notes"); // seeded
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    const frame = frameByTitle("Notes");
    const handle = frame.querySelector(".titlebar-handle") as HTMLElement;

    // Force a WIDE frame: jsdom reports 0×0 rects by default, so stub
    // getBoundingClientRect to a 700px-wide box. With innerWidth 1280 the drag
    // clamps the top-left to x = 1280 − 700 = 580; 580 + 400 = 980 < 1280 − 20,
    // so the OLD x + DEFAULT_FRAME_W commit would NOT snap. The pointer at the
    // right edge still reports "right", so the new commit must snap right.
    const originalRect = frame.getBoundingClientRect.bind(frame);
    frame.getBoundingClientRect = () =>
      ({ width: 700, height: 300, top: 0, left: 0, right: 700, bottom: 300, x: 0, y: 0, toJSON() {} }) as DOMRect;

    try {
      // Drag the pointer to the right edge (within SNAP_THRESHOLD), reporting a
      // right-edge preview, then release.
      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(handle, {
        pointerId: 1,
        clientX: window.innerWidth - 5,
        clientY: 100,
      });
      fireEvent.pointerUp(handle, {
        pointerId: 1,
        clientX: window.innerWidth - 5,
        clientY: 100,
      });

      await waitFor(() => {
        const f = frameByTitle("Notes");
        expect(f.className).toContain("window-chrome--snap-right");
        expect(f.style.width).toBe(`${Math.round(window.innerWidth / 2)}px`);
        const m = /translate\(\s*(-?[\d.]+)px/.exec(f.style.transform)!;
        expect(parseFloat(m[1]!)).toBe(Math.round(window.innerWidth / 2));
      });
    } finally {
      frame.getBoundingClientRect = originalRect;
    }
  });

  // Phase 19 (CR-01): a snapped window must be recoverable — it can be dragged
  // back to a free position (losing window-chrome--snap-*), and snapping then
  // maximizing then un-maximizing must NOT fall back into the snapped half.

  it("dragging a SNAPPED window to a free middle position un-snaps it and lands there (CR-01)", async () => {
    const { user } = renderDesktopShell();

    await openApp(user, "Notes"); // seeded
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    // Snap left first (via Ctrl+ArrowLeft so no drag is needed).
    fireEvent(
      window,
      new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await waitFor(() =>
      expect(frameByTitle("Notes").className).toContain(
        "window-chrome--snap-left",
      ),
    );

    // Now drag the titlebar to a free middle position (well away from either
    // edge). The window must un-snap and land at the dragged position.
    const handle = frameByTitle("Notes").querySelector(
      ".titlebar-handle",
    ) as HTMLElement;
    const midX = Math.round(window.innerWidth / 2);
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: midX, clientY: 300 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: midX, clientY: 300 });

    await waitFor(() => {
      const f = frameByTitle("Notes");
      // The snap marker is gone — the window is free again.
      expect(f.className).not.toContain("window-chrome--snap-left");
      expect(f.className).not.toContain("window-chrome--snap-right");
      // It is no longer pinned to a half-rect (no explicit width override).
      expect(f.style.width).toBe("");
    });
  });

  it("snap → maximize → un-maximize does NOT fall back into the snapped half (CR-01)", async () => {
    const { user } = renderDesktopShell();

    await openApp(user, "Notes"); // seeded
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    // Snap left.
    fireEvent(
      window,
      new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await waitFor(() =>
      expect(frameByTitle("Notes").className).toContain(
        "window-chrome--snap-left",
      ),
    );

    // Maximize (double-click the titlebar) — must clear the snap marker.
    const titlebar = frameByTitle("Notes").querySelector(
      ".window-chrome__titlebar",
    ) as HTMLElement;
    fireEvent.doubleClick(titlebar);
    await waitFor(() => {
      const f = frameByTitle("Notes");
      expect(f.className).toContain("window-chrome--maximized");
      expect(f.className).not.toContain("window-chrome--snap-left");
    });

    // Un-maximize — must return to a FREE window, not the snapped half.
    const titlebar2 = frameByTitle("Notes").querySelector(
      ".window-chrome__titlebar",
    ) as HTMLElement;
    fireEvent.doubleClick(titlebar2);
    await waitFor(() => {
      const f = frameByTitle("Notes");
      expect(f.className).not.toContain("window-chrome--maximized");
      expect(f.className).not.toContain("window-chrome--snap-left");
      expect(f.className).not.toContain("window-chrome--snap-right");
    });
  });

  // Phase 19 (plan 19-03): Ctrl+Left / Ctrl+Right snap the ACTIVE window to the
  // work-area half WITHOUT a drag (CHROME-03). The keydown effect introduced
  // here is the same one Plan 04 (wave 4) will extend with Cmd/Ctrl+W/M.

  it("Ctrl+ArrowLeft snaps the active window to the left half", async () => {
    const { user } = renderDesktopShell();

    await openApp(user, "Notes"); // seeded
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    const event = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(window, event);

    await waitFor(() => {
      const f = frameByTitle("Notes");
      expect(f.className).toContain("window-chrome--snap-left");
      expect(f.style.width).toBe(`${Math.round(window.innerWidth / 2)}px`);
      const m = /translate\(\s*(-?[\d.]+)px/.exec(f.style.transform)!;
      expect(parseFloat(m[1]!)).toBe(0);
    });
    // The active-window snap prevents default (so the key never reaches browser
    // text navigation when a Vibe OS window is front-most).
    expect(event.defaultPrevented).toBe(true);
  });

  it("Ctrl+ArrowRight snaps the active window to the right half", async () => {
    const { user } = renderDesktopShell();

    await openApp(user, "Notes"); // seeded
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    fireEvent(
      window,
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    await waitFor(() => {
      const f = frameByTitle("Notes");
      expect(f.className).toContain("window-chrome--snap-right");
      const m = /translate\(\s*(-?[\d.]+)px/.exec(f.style.transform)!;
      expect(parseFloat(m[1]!)).toBe(Math.round(window.innerWidth / 2));
    });
  });

  it("Ctrl+ArrowLeft with NO window open is a harmless no-op", () => {
    renderDesktopShell();

    // No window is active — the handler must not throw and must not prevent the
    // browser's default (so Ctrl+Arrow text navigation outside a window is free).
    const event = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    expect(() => fireEvent(window, event)).not.toThrow();
    expect(event.defaultPrevented).toBe(false);
    expect(frames()).toHaveLength(0);
  });

  // Phase 19 (plan 19-04): Cmd/Ctrl+W closes and Cmd/Ctrl+M minimizes the ACTIVE
  // window (CHROME-04). Both call preventDefault so the browser tab is never
  // closed and the browser's minimize is never triggered — and both fire ONLY
  // when a Vibe OS window is active. These branches live in the SAME keydown
  // effect plan 19-03 created (no second global listener).

  it("Cmd+W closes the active window and prevents the browser tab-close default", async () => {
    const { user } = renderDesktopShell();

    await openApp(user, "Notes"); // seeded
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());
    await waitFor(() => expect(appBodyCount()).toBe(1));

    // The event MUST be cancelable for defaultPrevented to be observable.
    const event = new KeyboardEvent("keydown", {
      key: "w",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(window, event);

    // preventDefault fired (the browser tab is never closed) AND the active
    // Vibe OS window closes (frame + app body torn down).
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(frames()).toHaveLength(0));
    await waitFor(() => expect(appBodyCount()).toBe(0));
  });

  it("Ctrl+W (non-Cmd path) also closes the active window", async () => {
    const { user } = renderDesktopShell();

    await openApp(user, "Notes"); // seeded
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    const event = new KeyboardEvent("keydown", {
      key: "w",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(window, event);

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(frames()).toHaveLength(0));
  });

  it("Cmd+M minimizes the active window and prevents the browser default", async () => {
    const { user } = renderDesktopShell();

    await openApp(user, "Notes"); // seeded
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    const event = new KeyboardEvent("keydown", {
      key: "m",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(window, event);

    // preventDefault fired AND the active window gains the minimized marker
    // (the frame stays mounted in the dock; the browser window is never
    // minimized).
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() =>
      expect(frameByTitle("Notes").className).toContain(
        "window-chrome--minimized",
      ),
    );
  });

  it("Cmd+W with NO window open is a harmless no-op (the browser tab stays closable)", () => {
    renderDesktopShell();

    // No active Vibe OS window — the handler must not throw and must not prevent
    // the browser's default (so the user can still close the browser tab).
    const event = new KeyboardEvent("keydown", {
      key: "w",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    expect(() => fireEvent(window, event)).not.toThrow();
    expect(event.defaultPrevented).toBe(false);
    expect(frames()).toHaveLength(0);
  });

  // Phase 19 (CR-02): the global window shortcuts must NOT hijack keys the user
  // is typing into an app's OWN input/textarea/contentEditable. Apps render real
  // inputs in-tree (e.g. the seeded Notes "Add a note…" field), and Ctrl+Arrow /
  // Cmd+W are standard text-editing chords there.

  it("Ctrl+ArrowLeft inside an app's own input does NOT snap the window (CR-02)", async () => {
    const { user } = renderDesktopShell();

    await openApp(user, "Notes"); // seeded — renders a real "Add a note…" input
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    // The frame appears at once with a "Preparing…" placeholder; the app body
    // (and its input) arrives only after the app resolves, so wait for it.
    const input = (await within(frameByTitle("Notes")).findByPlaceholderText(
      "Add a note…",
    )) as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    // Fire Ctrl+ArrowLeft FROM the input (bubbles to the window listener with
    // e.target === the input). The handler must bail (it is the user's word-by-
    // word caret move), so the window does NOT snap and default is NOT prevented.
    const event = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(input, event);

    expect(event.defaultPrevented).toBe(false);
    const f = frameByTitle("Notes");
    expect(f.className).not.toContain("window-chrome--snap-left");
    expect(f.className).not.toContain("window-chrome--snap-right");
  });

  it("Cmd+W inside an app's own input does NOT close the window (CR-02)", async () => {
    const { user } = renderDesktopShell();

    await openApp(user, "Notes"); // seeded
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    // The frame appears at once with a "Preparing…" placeholder; the app body
    // (and its input) arrives only after the app resolves, so wait for it.
    const input = (await within(frameByTitle("Notes")).findByPlaceholderText(
      "Add a note…",
    )) as HTMLInputElement;
    input.focus();

    const event = new KeyboardEvent("keydown", {
      key: "w",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(input, event);

    // The window stays open (no destructive close mid-edit) and the browser's
    // own default is left alone (defaultPrevented false) so the editable target
    // governs the key.
    expect(event.defaultPrevented).toBe(false);
    expect(frameByTitle("Notes")).toBeInTheDocument();
  });

  // Phase 19 (WR-04): Cmd+Shift+W (a "close all tabs" chord) and uppercase e.key
  // must NOT match the close/minimize chords — otherwise ALL browser tabs close,
  // the opposite of the "the browser tab is NEVER closed" guarantee (CHROME-04).

  it("Cmd+W with Caps Lock (uppercase 'W', no Shift) STILL closes the active window — WR-04", async () => {
    const { user } = renderDesktopShell();

    await openApp(user, "Notes"); // seeded
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());
    await waitFor(() => expect(appBodyCount()).toBe(1));

    // Caps Lock on → e.key is "W" with NO Shift. The close chord must normalize
    // case so it STILL matches (otherwise the chord falls through and the browser
    // tab closes — the exact failure the guarantee forbids).
    const event = new KeyboardEvent("keydown", {
      key: "W",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(window, event);

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(frames()).toHaveLength(0));
  });

  it("Cmd+Shift+W does NOT close the active window (the chord must not match) — WR-04", async () => {
    const { user } = renderDesktopShell();

    await openApp(user, "Notes"); // seeded
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    // Shift held → e.key is "W". The close chord must exclude Shift, so this is
    // NOT our shortcut — we must NOT preventDefault and must NOT close the window
    // (so Cmd+Shift+W keeps its native browser meaning, never closing OUR window).
    const event = new KeyboardEvent("keydown", {
      key: "W",
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(window, event);

    expect(event.defaultPrevented).toBe(false);
    expect(frameByTitle("Notes")).toBeInTheDocument();
  });

  // Phase 19 (WR-03): a maximized/snapped window's rect is read from the live
  // viewport. After the browser is resized the pinned rect must be recomputed —
  // the shell mirrors the viewport size into state via a resize listener so a
  // resize re-renders pinned windows with a fresh rect.

  it("a maximized window's rect tracks a browser resize (WR-03)", async () => {
    const setInner = (w: number, h: number) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: w,
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        writable: true,
        value: h,
      });
    };
    const origW = window.innerWidth;
    const origH = window.innerHeight;
    setInner(1280, 800);

    try {
      const { user } = renderDesktopShell();

      await openApp(user, "Notes"); // seeded
      await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

      // Maximize via double-click.
      const titlebar = frameByTitle("Notes").querySelector(
        ".window-chrome__titlebar",
      ) as HTMLElement;
      fireEvent.doubleClick(titlebar);
      await waitFor(() =>
        expect(frameByTitle("Notes").style.width).toBe("1280px"),
      );

      // Resize the browser wider/taller and fire the resize event. The pinned
      // rect must recompute from the NEW viewport (stale geometry is the bug).
      setInner(1600, 1000);
      fireEvent(window, new Event("resize"));

      await waitFor(() => {
        const f = frameByTitle("Notes");
        expect(f.style.width).toBe("1600px");
        expect(f.style.height).toBe(`${1000 - 40 - 88}px`);
      });
    } finally {
      setInner(origW, origH);
    }
  });

  it("the contextual `⋮` MOD 'remove' still closes a window", async () => {
    const { user } = renderDesktopShell();

    await openApp(user, "Notes"); // seeded
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    // Phase 19: the ⋮ button is in the WindowFrame titlebar, not in the app region.
    const frame = frameByTitle("Notes");
    const titlebar = frame.querySelector(".window-chrome__titlebar") as HTMLElement;
    await user.click(within(titlebar).getByRole("button", { name: "App options" }));
    const dialog = within(frame).getByRole("dialog");
    await user.type(within(dialog).getByRole("textbox"), "remove");
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));

    // The window closes and its app body is torn down.
    await waitFor(() => expect(frames()).toHaveLength(0));
    await waitFor(() => expect(appBodyCount()).toBe(0));
  });
});

// ====================================================================
// Phase 21 integration tests (plans 21-03/21-04):
//   SC#2: 50 rapid geometry changes → 1 debounced IDB write
//   SC#5: persisted JSON has exactly 7 fields per entry
//   SC#1: restoring a persisted layout reopens windows at saved geometry
//   SC#3: evicted app shows placeholder; transport never called
//   SC#4: 5-window serial restore; DB version still 3
// ====================================================================

// Minimal compiled component used to seed the in-memory registry for tier-3
// hits during the restore test. The function is called via new Function() scope;
// setting exports['default'] mirrors what Babel's CJS transform produces.
const STUB_TRANSPILED_JS =
  `exports['default'] = function App() { return null; };`;
const STUB_SOURCE = `export default function App() { return null; }`;

describe("Desktop persistence — save", () => {
  // Restore real timers after every vi.useFakeTimers() test in this block so the
  // outer afterEach (cleanup/unmountAll/_clearCachesForTesting) runs normally.
  afterEach(() => {
    vi.useRealTimers();
  });

  it("50 rapid geometry changes produce exactly 1 debounced IDB write (SC#2)", async () => {
    vi.useFakeTimers();
    const settingsStore = createRecordingSettingsStore();
    renderDesktopShell({ settingsStore });

    // Use fireEvent + act() to open the launcher and click Notes. This avoids the
    // userEvent / vi.useFakeTimers() deadlock: userEvent's pointer-event delays use
    // setTimeout internally and stall when advanceTimers is not threaded through
    // the full DesktopShell render (which renders its own userEvent instance).
    // fireEvent dispatches DOM events synchronously; act() flushes the React
    // state update (setLauncherOpen / wm.open) before returning.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open launcher" }));
    });
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("dialog", { name: "Open an app" })).getByRole(
          "button",
          { name: "Notes" },
        ),
      );
    });

    // Drain the initial debounce timer (from windowManager.open → setWindows →
    // save effect scheduling) so the baseline write count is stable.
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    const baseline = settingsStore.rawWriteCount(LAYOUT_KEY);

    // Notes frame is in DOM; get its titlebar drag handle.
    const frame = frameByTitle("Notes");
    const handle = frame.querySelector(".titlebar-handle") as HTMLElement;
    expect(handle).not.toBeNull();

    // Trigger 50 geometry changes via fireEvent drag sequences. Each pointerUp
    // commits a position via setGeometry → setWindows → save-effect cleanup
    // (clears the previous pending timer) + reschedule (creates a new 300ms timer).
    // React 18 may batch all 50 setWindows calls into 1 re-render; either way only
    // 1 timer is pending after the loop — the final one.
    for (let i = 0; i < 50; i++) {
      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 120 + i, clientY: 100 });
      fireEvent.pointerUp(handle, { pointerId: 1, clientX: 120 + i, clientY: 100 });
    }

    // No new write has fired — the debounce timer is still pending (SC#2).
    expect(settingsStore.rawWriteCount(LAYOUT_KEY)).toBe(baseline);

    // Advance past the 300ms debounce threshold — exactly 1 more write fires (SC#2).
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(settingsStore.rawWriteCount(LAYOUT_KEY)).toBe(baseline + 1);

    // A second advance produces no additional writes (the timer was consumed).
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(settingsStore.rawWriteCount(LAYOUT_KEY)).toBe(baseline + 1);
  });

  it("persisted 'windowLayout' record contains exactly the 7 required fields (SC#5)", async () => {
    vi.useFakeTimers();
    const settingsStore = createRecordingSettingsStore();
    renderDesktopShell({ settingsStore });

    // Open the launcher then Notes via fireEvent + act() (same approach as SC#2 test
    // above — avoids userEvent / vi.useFakeTimers() stall for this describe block).
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open launcher" }));
    });
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("dialog", { name: "Open an app" })).getByRole(
          "button",
          { name: "Notes" },
        ),
      );
    });

    // Advance past the 300ms debounce so the layout write fires.
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    const writes = settingsStore.rawWrites.get(LAYOUT_KEY) ?? [];
    const raw = writes[writes.length - 1];
    expect(raw).toBeDefined();

    const parsed = JSON.parse(raw!) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);

    // SC#5: the first entry must have EXACTLY the 7 required geometric fields —
    // no instanceId, no transpiledJS, no id, and no other extra keys.
    const entry = parsed[0] as Record<string, unknown>;
    const keys = Object.keys(entry).sort();
    expect(keys).toEqual(["appType", "icon", "minimized", "title", "x", "y", "z"]);
    expect("instanceId" in entry).toBe(false);
    expect("transpiledJS" in entry).toBe(false);
    expect("id" in entry).toBe(false);
  });
});

describe("Desktop persistence — restore", () => {
  it(
    "restoring 5 persisted windows reopens them at saved positions with fresh instanceIds (SC#1 + SC#4)",
    async () => {
      // 5 layout entries exercise SC#4 ("Restoring 5 windows") as flagged by the
      // plan-checker. z-values are ascending so the last entry (z=205) is on top.
      const layout = [
        { appType: "restore-a", title: "App A", icon: "a", x: 100, y: 110, z: 201, minimized: false },
        { appType: "restore-b", title: "App B", icon: "b", x: 200, y: 120, z: 202, minimized: false },
        { appType: "restore-c", title: "App C", icon: "c", x: 300, y: 130, z: 203, minimized: false },
        { appType: "restore-d", title: "App D", icon: "d", x: 400, y: 140, z: 204, minimized: true },
        { appType: "restore-e", title: "App E", icon: "e", x: 500, y: 150, z: 205, minimized: false },
      ];

      // Pre-seed the settings store so readRaw(LAYOUT_KEY) returns the JSON at mount.
      const settingsStore = createRecordingSettingsStore();
      await settingsStore.writeRaw(LAYOUT_KEY, JSON.stringify(layout));

      // Pre-seed the in-memory registry with a valid AppRecord for each appType so
      // services.registry.get("apps", cacheKey) returns non-null in the restore
      // effect's pre-IDB-check → resolveComponent tier-3 hits → no transport call.
      const registry = createInMemoryRegistry();
      for (const entry of layout) {
        const key = await registryKey("app", entry.appType);
        await registry.put(
          "apps",
          {
            cacheKey: key,
            type: entry.appType,
            source: STUB_SOURCE,
            transpiledJS: STUB_TRANSPILED_JS,
          },
          key,
        );
      }

      // unusedTransport (default in createTestServices) throws if the produce path
      // is ever reached — structural proof that the transport is not called.
      renderDesktopShell({ settingsStore, registry });

      // All 5 frames are opened atomically via openAt BEFORE async component
      // resolution; waitFor finds them once React flushes the openAt state updates.
      await waitFor(() => {
        expect(frames()).toHaveLength(5);
      });

      // SC#1a: z-order — App E (z=205) was opened last and has the highest z-index.
      const frameA = frameByTitle("App A");
      const frameE = frameByTitle("App E");
      expect(parseInt(frameE.style.zIndex, 10)).toBeGreaterThan(
        parseInt(frameA.style.zIndex, 10),
      );

      // SC#1b: minimized state is preserved from the layout.
      const frameD = frameByTitle("App D");
      expect(frameD.className).toContain("window-chrome--minimized");
      expect(frameA.className).not.toContain("window-chrome--minimized");

      // SC#1c: all 5 frames are distinct (unique titles), confirming 5 fresh
      // instanceIds were minted — the persisted layout has no instanceId field,
      // so openAt always creates a new session-scoped appType-N id.
      const titles = frames().map(
        (f) => f.querySelector(".window-chrome__title")?.textContent?.trim() ?? "",
      );
      expect(new Set(titles).size).toBe(5);
    },
  );

  it("evicted app on restore shows placeholder without spending API quota (SC#3)", async () => {
    // One layout entry for an appType that has NO corresponding record in the
    // registry — simulates an app that was evicted from IDB since it was last open.
    const layout = [
      {
        appType: "evicted-app",
        title: "Evicted App",
        icon: "x",
        x: 100,
        y: 100,
        z: 201,
        minimized: false,
      },
    ];

    const settingsStore = createRecordingSettingsStore();
    await settingsStore.writeRaw(LAYOUT_KEY, JSON.stringify(layout));

    // Empty registry — services.registry.get("apps", cacheKey) returns null.
    // The restore effect's pre-IDB-check sees null → shows Fallback immediately
    // WITHOUT calling resolveComponent → unusedTransport (the default) is never
    // reached → no quota is spent (PERSIST-03).
    const registry = createInMemoryRegistry();

    renderDesktopShell({ settingsStore, registry });

    // The frame is opened via openAt BEFORE async resolution; wait for it.
    await waitFor(() => {
      expect(frames()).toHaveLength(1);
    });

    // Wait for the Fallback (FailedAppContent) to be stored and rendered.
    // The "Try again" button is the reliable indicator that the placeholder path
    // ran and the transport was NOT called (if transport had been called it would
    // throw "transport was invoked unexpectedly", failing the test).
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });

    // The frame itself is present with the correct title.
    expect(frameByTitle("Evicted App")).toBeInTheDocument();
  });

  it("REGISTRY_DB_VERSION is 3 — no DB migration was introduced (SC#4 gate)", () => {
    // Plan 21 stores the window layout under an existing IDB settings key;
    // it requires NO schema change. This assertion is the final gate.
    expect(REGISTRY_DB_VERSION).toBe(3);
  });
});

// ====================================================================
// Phase 22 integration tests (plan 22-04):
//   THEME-08: custom theme vars are correctly resolved from VibeThemeContext
//             (the DesktopShell:842 currentVars fix guards SandboxFrame)
//   THEME-06: ThemeEditor mounts when onOpenThemeEditor is triggered
// ====================================================================

describe("Phase 22 — ThemeEditor wiring + currentVars SandboxFrame coupling", () => {
  afterEach(() => {
    cleanup();
    unmountAll();
    _clearCachesForTesting();
    document.documentElement.style.cssText = "";
    localStorage.clear();
    vi.useRealTimers();
  });

  it("custom theme vars are applied to :root when a custom:* theme is the active selection (THEME-08 regression guard)", async () => {
    // Pre-seed the settings store with a custom theme whose --text value is
    // unique so the assertion is unambiguous.
    const customVars = { ...VIBE_THEMES["aurora"], "--text": "#deadbe" };
    const settingsStore = createRecordingSettingsStore();
    await settingsStore.writeRaw(
      "customThemeIndex",
      JSON.stringify(["myCustom"]),
    );
    await settingsStore.writeRaw("custom:myCustom", JSON.stringify(customVars));

    // Pre-select the custom theme via localStorage so VibeThemeProvider starts
    // with it on mount — this exercises the currentVars path that DesktopShell
    // reads for SandboxFrame.
    localStorage.setItem(STORAGE_KEY_OS_THEME, "custom:myCustom");

    renderDesktopShell({ settingsStore });

    // Wait for VibeThemeProvider to load the custom theme index from IDB and
    // apply the vars to :root. The --text value must match the custom theme,
    // not the aurora default, confirming currentVars is correct.
    await waitFor(() => {
      expect(
        document.documentElement.style.getPropertyValue("--text"),
      ).toBe("#deadbe");
    });
  });

  it("clicking 'New Theme' in the menu bar opens the ThemeEditor dialog (THEME-06)", async () => {
    // Stub window.CSS.supports so ThemeEditor validation does not throw in jsdom.
    Object.defineProperty(window, "CSS", {
      value: { supports: vi.fn().mockReturnValue(true) },
      writable: true,
      configurable: true,
    });

    const { user } = renderDesktopShell();

    // No dialog before clicking.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Click "New Theme" in the menu bar's theme switcher.
    const banner = screen.getByRole("banner");
    await user.click(within(banner).getByRole("button", { name: /new theme/i }));

    // ThemeEditor dialog appears with the "new" state heading.
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.getByText("New color theme")).toBeInTheDocument();

    // Closing the dialog (Cancel button) removes it from the DOM.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});

// ====================================================================
// Described apps across a reload. An app opened from a free-text description
// is cached under registryKey("app", slug, description) — the description is
// part of its identity. The saved layout has to carry it, or after a reload the
// window looks the app up under the slug alone, misses, and shows "couldn't
// load" although the app sits in the cache.
// ====================================================================

const DESCRIPTION = "a pomodoro timer with a gentle chime";
const DESCRIBED_SLUG = "pomodoro-timer-with-a-gentle-chime";
// The cached body of that app: renders a text the test can look for.
const CHIME_TRANSPILED_JS = `exports['default'] = function App() { return React.createElement("div", null, "Chime Timer"); };`;

/** Advance the stubbed clock (50 ms a step, at most 10 s in one wait) until
 *  `check` stops throwing. Each step also yields 10 ms of real time, so async
 *  work that is not timer-driven (the SHA-256 digest) completes between steps;
 *  the layout debounce only fires when the clock is advanced. It waits as long
 *  as a slow machine needs, up to vitest's default test timeout, then fails
 *  with the check's last assertion. A plain loop rather than vi.waitFor: when
 *  it gives up, no step is still running, so a failing test cannot leak an
 *  open act() into the next. */
async function settleUntil(check: () => void): Promise<void> {
  await waitUntil("this test's check to pass", check, {
    fakeStepMs: 50,
    fakeBudgetMs: 10_000,
    realYieldMs: 10,
  });
}

/** The last layout the desktop saved, parsed. */
function lastSavedLayout(
  settingsStore: ReturnType<typeof createRecordingSettingsStore>,
): Array<Record<string, unknown>> {
  const writes = settingsStore.rawWrites.get(LAYOUT_KEY) ?? [];
  const raw = writes[writes.length - 1];
  if (raw === undefined) throw new Error("no layout saved yet");
  return JSON.parse(raw) as Array<Record<string, unknown>>;
}

/** The restored window's "Try again" button. Testing-library's own wait
 *  gives up after 1 s, which a slow machine can miss; this one waits as long
 *  as the other waits in this file. */
function findTryAgain(): Promise<HTMLElement> {
  return screen.findByRole(
    "button",
    { name: "Try again" },
    { timeout: WAIT_TIMEOUT_MS },
  );
}

describe("Desktop persistence — described apps survive a reload", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("describing an app saves its description with the window", async () => {
    vi.useFakeTimers();
    const settingsStore = createRecordingSettingsStore();
    renderDesktopShell({
      settingsStore,
      transport: cannedTransport(EXPORT_DEFAULT_TSX),
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open launcher" }));
    });
    const dialog = screen.getByRole("dialog", { name: "Open an app" });
    await act(async () => {
      fireEvent.change(within(dialog).getByRole("textbox"), {
        target: { value: DESCRIPTION },
      });
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Open" }));
    });

    await settleUntil(() => {
      expect(lastSavedLayout(settingsStore)[0]!["description"]).toBe(
        DESCRIPTION,
      );
    });
  });

  it("a restored described app opens from the cache and keeps its description on the next save", async () => {
    vi.useFakeTimers();
    const settingsStore = createRecordingSettingsStore();
    await settingsStore.writeRaw(
      LAYOUT_KEY,
      JSON.stringify([
        {
          appType: DESCRIBED_SLUG,
          title: "Pomodoro Timer",
          icon: DESCRIBED_SLUG,
          x: 120,
          y: 90,
          z: 201,
          minimized: false,
          description: DESCRIPTION,
        },
      ]),
    );
    // The app is cached ONLY under the key the describe path wrote. The default
    // transport throws if called, so a miss cannot be papered over by a produce.
    const registry = createInMemoryRegistry();
    const key = await registryKey("app", DESCRIBED_SLUG, DESCRIPTION);
    await registry.put(
      "apps",
      {
        cacheKey: key,
        type: DESCRIBED_SLUG,
        source: STUB_SOURCE,
        transpiledJS: CHIME_TRANSPILED_JS,
      },
      key,
    );

    renderDesktopShell({ settingsStore, registry });

    await settleUntil(() => {
      expect(frames()).toHaveLength(1);
    });
    await settleUntil(() => {
      expect(screen.getByText("Chime Timer")).toBeInTheDocument();
    });

    // Any change after the restore triggers a save; it must still carry the
    // description, or the SECOND reload loses the app. Cloning the window is
    // such a change, and the clone is the same described app, so both saved
    // entries must carry it.
    const frame = frameByTitle("Pomodoro Timer");
    await act(async () => {
      fireEvent.click(
        within(frame).getByRole("button", { name: "App options" }),
      );
    });
    const prompt = within(frame).getByRole("dialog");
    await act(async () => {
      fireEvent.change(within(prompt).getByRole("textbox"), {
        target: { value: "clone" },
      });
    });
    await act(async () => {
      fireEvent.click(within(prompt).getByRole("button", { name: "Apply" }));
    });
    await settleUntil(() => {
      expect(lastSavedLayout(settingsStore).map((e) => e["description"])).toEqual([
        DESCRIPTION,
        DESCRIPTION,
      ]);
    });
  });

  it("'Try again' on an evicted described app asks for the described app, not the bare slug", async () => {
    const settingsStore = createRecordingSettingsStore();
    await settingsStore.writeRaw(
      LAYOUT_KEY,
      JSON.stringify([
        {
          appType: DESCRIBED_SLUG,
          title: "Pomodoro Timer",
          icon: DESCRIBED_SLUG,
          x: 120,
          y: 90,
          z: 201,
          minimized: false,
          description: DESCRIPTION,
        },
      ]),
    );
    const requestBodies: string[] = [];
    const canned = cannedTransport(EXPORT_DEFAULT_TSX);
    const recordingTransport: typeof canned = (url, init) => {
      requestBodies.push(String(init?.body ?? ""));
      return canned(url, init);
    };

    const { user } = renderDesktopShell({
      settingsStore,
      transport: recordingTransport,
    });

    await user.click(await findTryAgain());

    await waitFor(() => expect(requestBodies).toHaveLength(1), { timeout: WAIT_TIMEOUT_MS });
    expect(requestBodies[0]).toContain(DESCRIPTION);
  });

  // The saved spot (120, 90) is not where a new window would go: the first
  // window on an empty desktop opens at (80, 80).
  const SAVED_SPOT = { x: 120, y: 90 };

  /** The window's on-screen position, read from its transform. */
  function windowSpot(frame: HTMLElement): { x: number; y: number } {
    const m = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/.exec(
      frame.style.transform,
    );
    if (!m) throw new Error("window has no position: " + frame.style.transform);
    return { x: parseFloat(m[1]!), y: parseFloat(m[2]!) };
  }

  it("'Try again' on an evicted described app opens it where it was saved, and saves it there", async () => {
    const settingsStore = createRecordingSettingsStore();
    await settingsStore.writeRaw(
      LAYOUT_KEY,
      JSON.stringify([
        {
          appType: DESCRIBED_SLUG,
          title: "Pomodoro Timer",
          icon: DESCRIBED_SLUG,
          ...SAVED_SPOT,
          z: 201,
          minimized: false,
          description: DESCRIPTION,
        },
      ]),
    );
    const { user } = renderDesktopShell({
      settingsStore,
      transport: cannedTransport(EXPORT_DEFAULT_TSX),
    });

    await user.click(await findTryAgain());

    // Wait until the retried app is in its window, then check where it is.
    await waitFor(
      () => expect(screen.queryByRole("button", { name: "Try again" })).toBeNull(),
      { timeout: WAIT_TIMEOUT_MS },
    );
    expect(frames()).toHaveLength(1);
    expect(windowSpot(frames()[0]!)).toEqual(SAVED_SPOT);
    await waitFor(
      () => {
        const saved = lastSavedLayout(settingsStore);
        expect(saved).toHaveLength(1);
        expect({ x: saved[0]!["x"], y: saved[0]!["y"] }).toEqual(SAVED_SPOT);
      },
      { timeout: WAIT_TIMEOUT_MS },
    );
  });

  it("'Try again' on an evicted catalogue app opens it where it was saved", async () => {
    const settingsStore = createRecordingSettingsStore();
    await settingsStore.writeRaw(
      LAYOUT_KEY,
      JSON.stringify([
        {
          appType: "notes",
          title: "Notes",
          icon: "notes",
          ...SAVED_SPOT,
          z: 201,
          minimized: false,
        },
      ]),
    );
    // Notes is a built-in app, so the retry needs no model call; the registry
    // is empty, so the restore offers "Try again".
    const { user } = renderDesktopShell({ settingsStore });

    await user.click(await findTryAgain());

    await waitFor(
      () => expect(screen.queryByRole("button", { name: "Try again" })).toBeNull(),
      { timeout: WAIT_TIMEOUT_MS },
    );
    expect(frames()).toHaveLength(1);
    expect(windowSpot(frameByTitle("Notes"))).toEqual(SAVED_SPOT);
  });

  it("'Try again' on a maximized window keeps it maximized, and un-maximizing returns it to its spot", async () => {
    const settingsStore = createRecordingSettingsStore();
    await settingsStore.writeRaw(
      LAYOUT_KEY,
      JSON.stringify([
        {
          appType: DESCRIBED_SLUG,
          title: "Pomodoro Timer",
          icon: DESCRIBED_SLUG,
          ...SAVED_SPOT,
          z: 201,
          minimized: false,
          description: DESCRIPTION,
        },
      ]),
    );
    const { user } = renderDesktopShell({
      settingsStore,
      transport: cannedTransport(EXPORT_DEFAULT_TSX),
    });
    const tryAgain = await findTryAgain();
    const titlebar = (): HTMLElement =>
      frames()[0]!.querySelector(".window-chrome__titlebar") as HTMLElement;

    fireEvent.doubleClick(titlebar());
    await waitFor(() =>
      expect(frames()[0]!.className).toContain("window-chrome--maximized"),
    );
    await user.click(tryAgain);
    await waitFor(
      () => expect(screen.queryByRole("button", { name: "Try again" })).toBeNull(),
      { timeout: WAIT_TIMEOUT_MS },
    );

    expect(frames()).toHaveLength(1);
    expect(frames()[0]!.className).toContain("window-chrome--maximized");
    fireEvent.doubleClick(titlebar());
    await waitFor(() =>
      expect(frames()[0]!.className).not.toContain("window-chrome--maximized"),
    );
    expect(windowSpot(frames()[0]!)).toEqual(SAVED_SPOT);
  });

  it("'Try again' on a window snapped to half the screen keeps it snapped", async () => {
    const settingsStore = createRecordingSettingsStore();
    await settingsStore.writeRaw(
      LAYOUT_KEY,
      JSON.stringify([
        {
          appType: "notes",
          title: "Notes",
          icon: "notes",
          ...SAVED_SPOT,
          z: 201,
          minimized: false,
        },
      ]),
    );
    const { user } = renderDesktopShell({ settingsStore });
    const tryAgain = await findTryAgain();

    fireEvent(
      window,
      new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await waitFor(() =>
      expect(frameByTitle("Notes").className).toContain("window-chrome--snap-left"),
    );
    await user.click(tryAgain);
    await waitFor(
      () => expect(screen.queryByRole("button", { name: "Try again" })).toBeNull(),
      { timeout: WAIT_TIMEOUT_MS },
    );

    expect(frames()).toHaveLength(1);
    expect(frameByTitle("Notes").className).toContain("window-chrome--snap-left");
  });

  it("a window saved outside the current screen comes back on it", async () => {
    // A layout saved on a larger screen: one window far to the right and
    // below, one above and to the left of this 1024x768 screen. Opened where
    // they were saved, neither titlebar can be reached to drag it back.
    const settingsStore = createRecordingSettingsStore();
    const saved = (title: string, x: number, y: number, z: number) => ({
      appType: "notes",
      title,
      icon: "notes",
      x,
      y,
      z,
      minimized: false,
    });
    await settingsStore.writeRaw(
      LAYOUT_KEY,
      JSON.stringify([
        saved("Far Notes", 5000, 5000, 201),
        saved("High Notes", -400, -250, 202),
        saved("Near Notes", SAVED_SPOT.x, SAVED_SPOT.y, 203),
      ]),
    );
    renderDesktopShell({ settingsStore });

    await waitFor(() => expect(frames()).toHaveLength(3), {
      timeout: WAIT_TIMEOUT_MS,
    });
    // A new window is 400x300; these are the furthest spots where all of it
    // is still on the screen.
    expect(windowSpot(frameByTitle("Far Notes"))).toEqual({
      x: window.innerWidth - 400,
      y: window.innerHeight - 300,
    });
    expect(windowSpot(frameByTitle("High Notes"))).toEqual({ x: 0, y: 0 });
    // A window that fits stays exactly where it was saved.
    expect(windowSpot(frameByTitle("Near Notes"))).toEqual(SAVED_SPOT);
  });
});

// ====================================================================
// Tweaked apps across a reload. A tweak re-builds a window's app from its base
// (the catalogue app, or the described app) plus the instruction, and caches it
// under a key that folds both in. The saved layout has to carry the tweak, or
// after a reload the window shows the un-tweaked app again.
// ====================================================================

const TWEAK = "make the whole thing blue";
// These tests wait in several steps, each allowed up to WAIT_TIMEOUT_MS. Their
// timeout is above that, so a failing step reports its own assertion instead of
// the test timing out and running on into the next test.
const TWEAK_TEST_TIMEOUT_MS = 20_000;
const ORIGINAL_TSX = `
export default function App() {
  return <div>Original Result</div>;
}
`;
const TWEAKED_TSX = `
export default function App() {
  return <div>Tweaked Result</div>;
}
`;

/** Answers a tweak request with TWEAKED_TSX and anything else with
 *  ORIGINAL_TSX, recording every request body. */
function tweakAwareTransport(bodies: string[]): ReturnType<typeof cannedTransport> {
  const original = cannedTransport(ORIGINAL_TSX);
  const tweaked = cannedTransport(TWEAKED_TSX);
  return (url, init) => {
    const body = String(init?.body ?? "");
    bodies.push(body);
    return body.includes(TWEAK) ? tweaked(url, init) : original(url, init);
  };
}

/** Type `instruction` into the `⋮` prompt of `frame` and apply it. */
async function modifyWindow(frame: HTMLElement, instruction: string): Promise<void> {
  await act(async () => {
    fireEvent.click(within(frame).getByRole("button", { name: "App options" }));
  });
  const prompt = within(frame).getByRole("dialog");
  await act(async () => {
    fireEvent.change(within(prompt).getByRole("textbox"), {
      target: { value: instruction },
    });
  });
  await act(async () => {
    fireEvent.click(within(prompt).getByRole("button", { name: "Apply" }));
  });
}

/** Unmount the desktop and drop every in-memory cache, then render it again
 *  over the same registry with the layout the first desktop saved last. The
 *  default transport throws, so the reloaded app must come from the registry. */
async function reload(
  settingsStore: ReturnType<typeof createRecordingSettingsStore>,
  registry: ReturnType<typeof createInMemoryRegistry>,
): Promise<ReturnType<typeof createRecordingSettingsStore>> {
  const saved = JSON.stringify(lastSavedLayout(settingsStore));
  cleanup();
  unmountAll();
  _clearCachesForTesting();
  const nextStore = createRecordingSettingsStore();
  await nextStore.writeRaw(LAYOUT_KEY, saved);
  renderDesktopShell({ settingsStore: nextStore, registry });
  return nextStore;
}

describe("Desktop persistence — tweaked apps survive a reload", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Open Notes from the launcher and tweak it; resolves once the tweaked
   *  app is on screen. */
  async function openAndTweakNotes(): Promise<void> {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open launcher" }));
    });
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("dialog", { name: "Open an app" })).getByRole(
          "button",
          { name: "Notes" },
        ),
      );
    });
    await settleUntil(() => {
      expect(frames()).toHaveLength(1);
    });
    await modifyWindow(frameByTitle("Notes"), TWEAK);
    await settleUntil(() => {
      expect(screen.getByText("Tweaked Result")).toBeInTheDocument();
    });
  }

  it("a tweaked catalogue app comes back tweaked after a reload", async () => {
    vi.useFakeTimers();
    const settingsStore = createRecordingSettingsStore();
    const registry = createInMemoryRegistry();
    renderDesktopShell({
      settingsStore,
      registry,
      transport: tweakAwareTransport([]),
    });
    await openAndTweakNotes();
    await settleUntil(() => {
      expect(lastSavedLayout(settingsStore)[0]!["tweak"]).toBe(TWEAK);
    });

    const reloadedStore = await reload(settingsStore, registry);
    await settleUntil(() => {
      expect(screen.getByText("Tweaked Result")).toBeInTheDocument();
    });
    // The restored window still carries the tweak, so the save after the
    // reload keeps it and a second reload still shows the tweaked app.
    await settleUntil(() => {
      // More than the one write that seeded the reload: the desktop saved.
      expect(reloadedStore.rawWrites.get(LAYOUT_KEY)!.length).toBeGreaterThan(1);
      expect(lastSavedLayout(reloadedStore)[0]!["tweak"]).toBe(TWEAK);
    });
  }, TWEAK_TEST_TIMEOUT_MS);

  // A tweak that failed must stay out of the saved layout: after a reload the
  // window would ask for a tweaked app that was never built, show "couldn't
  // load", and its "Try again" would pay for the failed tweak once more.
  it("a tweak that failed is not saved in the layout", async () => {
    vi.useFakeTimers();
    const settingsStore = createRecordingSettingsStore();
    renderDesktopShell({ settingsStore, transport: tweakFailsOnceTransport([]) });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open launcher" }));
    });
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("dialog", { name: "Open an app" })).getByRole(
          "button",
          { name: "Notes" },
        ),
      );
    });
    await settleUntil(() => {
      expect(frames()).toHaveLength(1);
    });
    await modifyWindow(frameByTitle("Notes"), TWEAK);
    await settleUntil(() => {
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });
    // Let any pending layout save run.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(lastSavedLayout(settingsStore).map((e) => e["tweak"])).toEqual([undefined]);
  }, TWEAK_TEST_TIMEOUT_MS);

  it("cloning a tweaked window saves the tweak for both windows", async () => {
    vi.useFakeTimers();
    const settingsStore = createRecordingSettingsStore();
    renderDesktopShell({
      settingsStore,
      transport: tweakAwareTransport([]),
    });
    await openAndTweakNotes();
    await modifyWindow(frameByTitle("Notes"), "clone");
    await settleUntil(() => {
      expect(lastSavedLayout(settingsStore).map((e) => e["tweak"])).toEqual([
        TWEAK,
        TWEAK,
      ]);
    });
  }, TWEAK_TEST_TIMEOUT_MS);

  it("tweaking a described app keeps the description, and the result comes back after a reload", async () => {
    vi.useFakeTimers();
    const settingsStore = createRecordingSettingsStore();
    const registry = createInMemoryRegistry();
    const bodies: string[] = [];
    renderDesktopShell({
      settingsStore,
      registry,
      transport: tweakAwareTransport(bodies),
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open launcher" }));
    });
    const dialog = screen.getByRole("dialog", { name: "Open an app" });
    await act(async () => {
      fireEvent.change(within(dialog).getByRole("textbox"), {
        target: { value: DESCRIPTION },
      });
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Open" }));
    });
    await settleUntil(() => {
      expect(screen.getByText("Original Result")).toBeInTheDocument();
    });

    await modifyWindow(frames()[0]!, TWEAK);
    await settleUntil(() => {
      expect(screen.getByText("Tweaked Result")).toBeInTheDocument();
    });
    // The tweak request asks for the described app, changed — not for an app
    // built from the slug and the instruction alone.
    const tweakRequest = bodies.find((b) => b.includes(TWEAK));
    expect(tweakRequest).toContain(DESCRIPTION);

    await settleUntil(() => {
      expect(lastSavedLayout(settingsStore)[0]).toMatchObject({
        description: DESCRIPTION,
        tweak: TWEAK,
      });
    });

    await reload(settingsStore, registry);
    await settleUntil(() => {
      expect(screen.getByText("Tweaked Result")).toBeInTheDocument();
    });
  }, TWEAK_TEST_TIMEOUT_MS);
});


// ====================================================================
// "Try again" rebuilds what the window was asked to show. After a failed
// tweak that is the window's app with the tweak; after a reload whose tweaked
// app is no longer cached it is the saved app with its saved tweak. Both go
// through the same key and prompt as the tweak itself (appIdentity).
// ====================================================================

/** Like tweakAwareTransport, but the first tweak request fails. */
function tweakFailsOnceTransport(
  bodies: string[],
): ReturnType<typeof cannedTransport> {
  const inner = tweakAwareTransport(bodies);
  let failed = false;
  return (url, init) => {
    const body = String(init?.body ?? "");
    if (!failed && body.includes(TWEAK)) {
      failed = true;
      bodies.push(body);
      return Promise.reject(new Error("connection dropped"));
    }
    return inner(url, init);
  };
}

/** Click the "Try again" button currently on screen. */
async function clickTryAgain(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  });
}

describe("'Try again' rebuilds the window's app with its description and tweak", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("after a failed tweak of a described app, it retries the tweak of the described app", async () => {
    vi.useFakeTimers();
    const bodies: string[] = [];
    renderDesktopShell({ transport: tweakFailsOnceTransport(bodies) });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open launcher" }));
    });
    const dialog = screen.getByRole("dialog", { name: "Open an app" });
    await act(async () => {
      fireEvent.change(within(dialog).getByRole("textbox"), {
        target: { value: DESCRIPTION },
      });
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Open" }));
    });
    await settleUntil(() => {
      expect(screen.getByText("Original Result")).toBeInTheDocument();
    });

    await modifyWindow(frames()[0]!, TWEAK);
    await settleUntil(() => {
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });
    const before = bodies.length;

    await clickTryAgain();
    await settleUntil(() => {
      expect(screen.getByText("Tweaked Result")).toBeInTheDocument();
    });
    // One request, for the described app changed by the tweak — not for the
    // app built from the hyphenated slug. (The transport answers "Tweaked
    // Result" only to a request that carries the tweak.)
    const retried = bodies.slice(before);
    expect(retried).toHaveLength(1);
    expect(retried[0]).toContain(DESCRIPTION);
  }, TWEAK_TEST_TIMEOUT_MS);

  it("after a reload whose tweaked app was evicted, it rebuilds the app with the saved tweak", async () => {
    vi.useFakeTimers();
    const settingsStore = createRecordingSettingsStore();
    await settingsStore.writeRaw(
      LAYOUT_KEY,
      JSON.stringify([
        {
          appType: DESCRIBED_SLUG,
          title: "Pomodoro Timer",
          icon: DESCRIBED_SLUG,
          x: 120,
          y: 90,
          z: 201,
          minimized: false,
          description: DESCRIPTION,
          tweak: TWEAK,
        },
      ]),
    );
    const bodies: string[] = [];
    // Empty registry: nothing is cached, so the restore offers "Try again".
    renderDesktopShell({ settingsStore, transport: tweakAwareTransport(bodies) });
    await settleUntil(() => {
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });
    expect(bodies).toHaveLength(0);

    await clickTryAgain();
    await settleUntil(() => {
      expect(screen.getByText("Tweaked Result")).toBeInTheDocument();
    });
    // One model call, for the described app with the saved tweak. (The
    // transport answers "Tweaked Result" only to a request with the tweak.)
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain(DESCRIPTION);
  }, TWEAK_TEST_TIMEOUT_MS);
});
