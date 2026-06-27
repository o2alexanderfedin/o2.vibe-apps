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

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { cannedTransport } from "../services/testServices";
import { _clearCachesForTesting } from "../execution/loader";
import { unmountAll } from "../execution/mount";
import {
  renderDesktopShell,
  openApp,
  frames,
  frameByTitle,
  appBodyCount,
} from "./desktopShellTestKit";

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
  // is typing into an app's OWN input/textarea/contentEditable. Generated apps
  // render real inputs in-tree (e.g. the seeded Notes "Add a note…" field), and
  // Ctrl+Arrow / Cmd+W are standard text-editing chords there.

  it("Ctrl+ArrowLeft inside an app's own input does NOT snap the window (CR-02)", async () => {
    const { user } = renderDesktopShell();

    await openApp(user, "Notes"); // seeded — renders a real "Add a note…" input
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    const input = within(frameByTitle("Notes")).getByPlaceholderText(
      "Add a note…",
    ) as HTMLInputElement;
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

    const input = within(frameByTitle("Notes")).getByPlaceholderText(
      "Add a note…",
    ) as HTMLInputElement;
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
