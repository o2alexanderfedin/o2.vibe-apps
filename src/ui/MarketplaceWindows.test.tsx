// UI integration tests for the WINDOWED open flow (Phase 15, plan 15-04;
// migrated to DesktopShell in Phase 16, plan 16-03).
//
// These render the REAL DesktopShell with INJECTED dependencies — a canned
// transport (no network) and an in-memory registry (no real IndexedDB) — and
// drive the full user flow through the rendered DOM. Apps are opened via the
// launcher (dock magnifier → app button) since the flat storefront grid is gone;
// every assertion below is on the WINDOW/frame behavior, which is identical
// under DesktopShell. Test doubles are named "canned"/"stub"/"deferred" (never
// the banned hygiene tokens).
//
// Coverage (the WIN acceptance bar):
//   1. opening an app mints a window on the desktop (one managed root).
//   2. multiple concurrent independent windows coexist (independent roots).
//   3. close routes through the manager and leaves zero leaked roots.
//   4. a mid-produce close leaks no root (the manager.isOpen guard).
//   5. cascade placement + click-to-raise z-order.
//   6. drag via the titlebar uses pointer capture and clamps to the viewport.
//   7. a titlebar pointerdown raises the window without stealing input focus.
//   8. minimize then restore preserves the app's root (never unmounts).
//   9. the contextual `⋮` MOD still works inside a window (remove closes it).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { cannedTransport } from "../services/testServices";
import { _clearCachesForTesting } from "../execution/loader";
import { unmountAll } from "../execution/mount";
import type { TransportFn, MessagesResponse } from "../host/modelClient";
import {
  renderDesktopShell as renderMarketplace,
  openApp,
  frames,
  frameByTitle,
  appBodyCount,
} from "./desktopShellTestKit";

// A produced component shipped with `export default` — the canonical produced
// shape. Used for cache-miss apps (Calculator/Timer) so a window mounts a
// concrete body we can assert.
const EXPORT_DEFAULT_TSX = `
export default function App() {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <h2 data-testid="produced-heading">Produced Component</h2>
      <button onClick={() => setOpen(true)}>{open ? "Opened" : "Open Now"}</button>
    </div>
  );
}
`;

// A produced component that renders a focusable input — used to prove a
// titlebar pointerdown raises the window without stealing keyboard focus.
const INPUT_TSX = `
export default function App() {
  return <input data-testid="app-input" aria-label="field" />;
}
`;

/**
 * Parse the {x, y} out of a frame's `transform: translate(Xpx, Ypx)`. The frame
 * is positioned purely via transform (box origin pinned at 0,0), so this is the
 * single rendered-position source — there is no left/top to add on top of it.
 */
function frameTranslate(frame: HTMLElement): { x: number; y: number } {
  const m = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/.exec(
    frame.style.transform,
  );
  if (!m) throw new Error(`frame has no translate(): "${frame.style.transform}"`);
  return { x: parseFloat(m[1]!), y: parseFloat(m[2]!) };
}

beforeEach(() => {
  _clearCachesForTesting();
});

afterEach(() => {
  cleanup();
  unmountAll();
  _clearCachesForTesting();
});

describe("DesktopShell windowed open flow (WIN, injected deps)", () => {
  it("opens an app as a window on the desktop (one app body)", async () => {
    const { user } = renderMarketplace();

    await openApp(user, "Notes"); // seeded — no transport needed

    // A window-chrome frame appears titled "Notes" and its app body mounts.
    await waitFor(() => {
      expect(frameByTitle("Notes")).toBeInTheDocument();
    });
    // The seeded Notes UI mounts inside exactly one window body.
    await waitFor(() => {
      expect(appBodyCount()).toBe(1);
    });
    const region = await screen.findByRole("region", { name: "Notes" });
    expect(within(region).getByPlaceholderText("Add a note…")).toBeInTheDocument();
  });

  it("opens multiple concurrent independent windows (independent app bodies)", async () => {
    const { user } = renderMarketplace({
      transport: cannedTransport(EXPORT_DEFAULT_TSX),
    });

    await openApp(user, "Notes"); // seeded
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    await openApp(user, "Calculator"); // unseeded → canned transport
    await waitFor(() => expect(frameByTitle("Calculator")).toBeInTheDocument());

    // Two distinct frames, two independent app bodies.
    expect(frames()).toHaveLength(2);
    await waitFor(() => expect(appBodyCount()).toBe(2));
  });

  it("close routes through the manager and leaks no app body", async () => {
    const { user } = renderMarketplace({
      transport: cannedTransport(EXPORT_DEFAULT_TSX),
    });

    await openApp(user, "Notes");
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());
    await openApp(user, "Calculator");
    await waitFor(() => expect(frameByTitle("Calculator")).toBeInTheDocument());
    await openApp(user, "Timer");
    await waitFor(() => expect(frameByTitle("Timer")).toBeInTheDocument());

    await waitFor(() => expect(appBodyCount()).toBe(3));

    // Click each window's red close traffic-light (aria-label "Close").
    for (const title of ["Notes", "Calculator", "Timer"]) {
      const frame = frameByTitle(title);
      const closeLight = within(frame).getByRole("button", { name: "Close" });
      fireEvent.click(closeLight);
    }

    await waitFor(() => expect(frames()).toHaveLength(0));
    // Every window's app body is torn down — none leaked.
    await waitFor(() => expect(appBodyCount()).toBe(0));
  });

  it("a mid-produce close leaks no app body (manager.isOpen guard)", async () => {
    // A deferred transport keeps produce in flight until we resolve it by hand.
    let resolveProduce!: (r: MessagesResponse) => void;
    const deferredTransport: TransportFn = () =>
      new Promise<MessagesResponse>((resolve) => {
        resolveProduce = resolve;
      });

    const { user } = renderMarketplace({ transport: deferredTransport });

    // Calculator is unseeded → routes through the deferred transport (in flight).
    await openApp(user, "Calculator");
    // The window appears immediately (Component still null → "Preparing…").
    await waitFor(() => expect(frameByTitle("Calculator")).toBeInTheDocument());

    // Close the window BEFORE produce resolves.
    const frame = frameByTitle("Calculator");
    fireEvent.click(within(frame).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(frames()).toHaveLength(0));

    // Now let produce finish — the isOpen guard must drop the result so no
    // window reappears and no app body is mounted for the closed window.
    resolveProduce({
      content: [{ type: "text", text: EXPORT_DEFAULT_TSX }],
      stop_reason: "end_turn",
    });

    // Allow any microtasks to flush, then assert no orphan frame/app body.
    await waitFor(() => expect(appBodyCount()).toBe(0));
    expect(frames()).toHaveLength(0);
  });

  it("cascade-places new windows and raises the clicked window to the top", async () => {
    const { user } = renderMarketplace({
      transport: cannedTransport(EXPORT_DEFAULT_TSX),
    });

    await openApp(user, "Notes");
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());
    await openApp(user, "Calculator");
    await waitFor(() => expect(frameByTitle("Calculator")).toBeInTheDocument());

    const first = frameByTitle("Notes");
    const second = frameByTitle("Calculator");

    // The second window is cascade-offset down-and-right from the first.
    const firstPos = frameTranslate(first);
    const secondPos = frameTranslate(second);
    expect(secondPos.x).toBeGreaterThan(firstPos.x);
    expect(secondPos.y).toBeGreaterThan(firstPos.y);

    // The second (most recently opened) window is on top initially.
    expect(parseInt(second.style.zIndex, 10)).toBeGreaterThan(
      parseInt(first.style.zIndex, 10),
    );

    // Clicking the first window's body raises it above the second.
    const firstBody = first.querySelector(".window-chrome__body") as HTMLElement;
    fireEvent.pointerDown(firstBody);

    await waitFor(() => {
      const f1 = frameByTitle("Notes");
      const f2 = frameByTitle("Calculator");
      expect(parseInt(f1.style.zIndex, 10)).toBeGreaterThan(
        parseInt(f2.style.zIndex, 10),
      );
    });
  });

  it("drags via the titlebar with pointer capture and clamps within the viewport", async () => {
    const captureSpy = vi.spyOn(Element.prototype, "setPointerCapture");
    const { user } = renderMarketplace();

    await openApp(user, "Notes");
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    const frame = frameByTitle("Notes");
    const handle = frame.querySelector(".titlebar-handle") as HTMLElement;
    expect(handle).not.toBeNull();

    // Record the pre-drag rendered position (cascade-placed, transform-driven).
    const startPos = frameTranslate(frame);

    // pointerdown with NO move must NOT shift the rendered position. This is the
    // CR-01 regression guard: previously the frame had left/top from props AND
    // useDrag wrote an absolute translate() on top, so a bare grab jumped the
    // element to roughly double its coordinates. With position driven purely by
    // transform (box origin at 0,0), the imperative translate equals the
    // committed value — a grab with no move is a visual no-op.
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
    const afterGrab = frameTranslate(frame);
    expect(afterGrab.x).toBeCloseTo(startPos.x, 5);
    expect(afterGrab.y).toBeCloseTo(startPos.y, 5);

    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 160, clientY: 140 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 160, clientY: 140 });

    // Pointer capture was requested on pointerdown.
    expect(captureSpy).toHaveBeenCalled();

    // The committed RENDERED position (the single transform-driven source —
    // there is no left/top to add on top) stays within the viewport bounds, and
    // reflects the +60/+40 drag delta applied exactly ONCE (not doubled).
    await waitFor(() => {
      const f = frameByTitle("Notes");
      const pos = frameTranslate(f);
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeGreaterThanOrEqual(0);
      expect(pos.x).toBeLessThanOrEqual(window.innerWidth);
      expect(pos.y).toBeLessThanOrEqual(window.innerHeight);
      // Applied once: final == start + delta, not start + 2*delta.
      expect(pos.x).toBeCloseTo(startPos.x + 60, 5);
      expect(pos.y).toBeCloseTo(startPos.y + 40, 5);
    });

    captureSpy.mockRestore();
  });

  it("a titlebar pointerdown raises the window without stealing input focus", async () => {
    const { user } = renderMarketplace({
      transport: cannedTransport(INPUT_TSX),
    });

    await openApp(user, "Calculator"); // unseeded → renders an <input>
    await waitFor(() => expect(frameByTitle("Calculator")).toBeInTheDocument());

    const input = (await screen.findByTestId("app-input")) as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    const frame = frameByTitle("Calculator");
    const handle = frame.querySelector(".titlebar-handle") as HTMLElement;
    fireEvent.pointerDown(handle);

    // Focus must remain on the app input — the titlebar must not steal it.
    expect(document.activeElement).toBe(input);
  });

  it("minimize then restore preserves the app's mounted body (never unmounts)", async () => {
    const { user } = renderMarketplace();

    await openApp(user, "Notes");
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());
    await waitFor(() => expect(appBodyCount()).toBe(1));

    const frame = frameByTitle("Notes");
    const minBtn = within(frame).getByRole("button", { name: "Minimize" });

    fireEvent.click(minBtn);

    // The frame gains the minimized class; its body subtree is never torn down
    // (minimize hides via CSS, it does NOT unmount the app).
    await waitFor(() => {
      expect(frameByTitle("Notes").className).toContain(
        "window-chrome--minimized",
      );
    });
    expect(appBodyCount()).toBe(1);
    // The app's own state-bearing subtree is still mounted in the document.
    expect(
      within(frameByTitle("Notes")).getByPlaceholderText("Add a note…"),
    ).toBeInTheDocument();
  });

  it("double-click titlebar maximizes to the work area (dock + menu bar stay); double-click restores", async () => {
    const { user } = renderMarketplace();

    await openApp(user, "Notes"); // seeded
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    const frame = frameByTitle("Notes");
    const titlebar = frame.querySelector(
      ".window-chrome__titlebar",
    ) as HTMLElement;

    // Capture the pre-maximize rendered position so we can assert restore.
    const startPos = frameTranslate(frame);

    // Double-click the titlebar → maximize to the work area.
    fireEvent.doubleClick(titlebar);

    // The frame fills the work area = viewport minus the menu bar (top, 40px)
    // minus the dock reserve (bottom, 88px). This is NOT OS full-screen — the
    // menu bar + dock remain in the document.
    await waitFor(() => {
      const f = frameByTitle("Notes");
      expect(f.className).toContain("window-chrome--maximized");
      expect(f.style.width).toBe(`${window.innerWidth}px`);
      expect(f.style.height).toBe(`${window.innerHeight - 40 - 88}px`);
    });

    // The maximized frame sits at the top of the work area (y = menu bar height).
    {
      const f = frameByTitle("Notes");
      const pos = frameTranslate(f);
      expect(pos.x).toBe(0);
      expect(pos.y).toBe(40);
    }

    // The menu bar + dock are STILL present — maximize is zoom-to-work-area,
    // never the OS Fullscreen API.
    expect(document.querySelector(".menu-bar")).toBeInTheDocument();
    expect(document.querySelector(".dock")).toBeInTheDocument();

    // Second double-click → restore to the prior geometry (no explicit size).
    fireEvent.doubleClick(
      frameByTitle("Notes").querySelector(
        ".window-chrome__titlebar",
      ) as HTMLElement,
    );

    await waitFor(() => {
      const f = frameByTitle("Notes");
      expect(f.className).not.toContain("window-chrome--maximized");
      // The explicit maximized width/height is gone → back to CSS-min sizing.
      expect(f.style.width).toBe("");
      expect(f.style.height).toBe("");
      // Position returns to the pre-maximize cascade placement.
      const pos = frameTranslate(f);
      expect(pos.x).toBeCloseTo(startPos.x, 5);
      expect(pos.y).toBeCloseTo(startPos.y, 5);
    });
  });

  it("the contextual `⋮` MOD still works inside a window (remove closes it)", async () => {
    const { user } = renderMarketplace();

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
