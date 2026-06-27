// UI integration tests for the WINDOWED open flow (Phase 15, plan 15-04).
//
// These render the REAL Marketplace with INJECTED dependencies — a canned
// transport (no network) and an in-memory registry (no real IndexedDB) — and
// drive the full user flow through the rendered DOM, now that opening an app
// mints a draggable WindowFrame on the desktop instead of an inline opened-app
// region. Test doubles are named "canned"/"stub"/"deferred" (never the banned
// hygiene tokens).
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
import {
  cleanup,
  render,
  screen,
  within,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Marketplace } from "./Marketplace";
import { ServicesProvider } from "../services/ServicesProvider";
import {
  createTestServices,
  cannedTransport,
  type TestServicesOverrides,
} from "../services/testServices";
import { _clearCachesForTesting } from "../execution/loader";
import { unmountAll } from "../execution/mount";
import type { Services } from "../services/services";
import type { TransportFn, MessagesResponse } from "../host/modelClient";

// jsdom does not implement the pointer-capture APIs the drag hook relies on —
// install module-level stubs so handlePointerDown does not throw (mirrors the
// Wave 1/2 test files).
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => undefined;
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

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

function renderMarketplace(overrides: TestServicesOverrides = {}): {
  services: Services;
  user: ReturnType<typeof userEvent.setup>;
} {
  const services = createTestServices(overrides);
  const user = userEvent.setup();
  render(
    <ServicesProvider services={services}>
      <Marketplace />
    </ServicesProvider>,
  );
  return { services, user };
}

/** Click a storefront card by its display name (aria-label starts with it). */
async function openApp(
  user: ReturnType<typeof userEvent.setup>,
  displayName: string,
): Promise<void> {
  const card = screen.getByRole("button", {
    name: new RegExp("^" + displayName + " —"),
  });
  await user.click(card);
}

/** All window-chrome frames currently in the document. */
function frames(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(".window-chrome"),
  );
}

/** The single frame whose titlebar title text matches `title`. */
function frameByTitle(title: string): HTMLElement {
  const frame = frames().find((f) =>
    f.querySelector(".window-chrome__title")?.textContent?.trim() === title,
  );
  if (!frame) throw new Error(`no window frame titled "${title}"`);
  return frame;
}

/**
 * Count mounted app bodies — each open window renders exactly one AppShell
 * (role="region") inside its body once the app resolves. Apps render in the
 * host React tree (not a detached root), so a leaked window leaves a stray
 * `.app-shell`; this count is the zero-leak invariant the close path must keep.
 */
function appBodyCount(): number {
  return document.querySelectorAll(".window-chrome__body .app-shell").length;
}

beforeEach(() => {
  _clearCachesForTesting();
});

afterEach(() => {
  cleanup();
  unmountAll();
  _clearCachesForTesting();
});

describe("Marketplace windowed open flow (WIN, injected deps)", () => {
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
    expect(parseFloat(second.style.left)).toBeGreaterThan(
      parseFloat(first.style.left),
    );
    expect(parseFloat(second.style.top)).toBeGreaterThan(
      parseFloat(first.style.top),
    );

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

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 160, clientY: 140 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 160, clientY: 140 });

    // Pointer capture was requested on pointerdown.
    expect(captureSpy).toHaveBeenCalled();

    // The committed position stays within the viewport bounds.
    await waitFor(() => {
      const f = frameByTitle("Notes");
      const left = parseFloat(f.style.left);
      const top = parseFloat(f.style.top);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThanOrEqual(window.innerWidth);
      expect(top).toBeLessThanOrEqual(window.innerHeight);
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

  it("the contextual `⋮` MOD still works inside a window (remove closes it)", async () => {
    const { user } = renderMarketplace();

    await openApp(user, "Notes"); // seeded
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    const region = await screen.findByRole("region", { name: "Notes" });
    // Open the mounted AppShell's ⋮ "App options" prompt and apply "remove".
    await user.click(within(region).getByRole("button", { name: "App options" }));
    const dialog = within(region).getByRole("dialog");
    await user.type(within(dialog).getByRole("textbox"), "remove");
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));

    // The window closes and its app body is torn down.
    await waitFor(() => expect(frames()).toHaveLength(0));
    await waitFor(() => expect(appBodyCount()).toBe(0));
  });
});
