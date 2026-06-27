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
