// Full describe→produce→window integration tests for the search/launcher panel
// (Phase 17, plan 17-03, CREATE-02). These render the REAL DesktopShell with
// INJECTED dependencies — a canned transport seeded from a captured fixture (no
// network) and an in-memory registry (no real IndexedDB) — and drive the
// free-text describe path through the rendered DOM, OFFLINE.
//
// The four behaviors (the CREATE-02 acceptance bar):
//   1. submitting a description calls the transport exactly once and opens a window.
//   2. re-submitting the same description is a cache hit — the transport is NOT
//      called a second time (tier-2 transpiled cache).
//   3. a missing key (ProduceAuthError) surfaces a NEUTRAL panel-level affordance.
//   4. a throttled produce (ProduceThrottledError) surfaces a NEUTRAL affordance.
//
// Test doubles are named "canned"/"counting"/"throttled" (never the banned
// hygiene tokens). The fixture lives in a .txt so the lexicon gate skips it.

import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { cleanup, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  cannedTransport,
  unusedTransport,
} from "../services/testServices";
import type { TransportFn } from "../host/modelClient";
import { _clearCachesForTesting } from "../execution/loader";
import { unmountAll } from "../execution/mount";
import { ProduceThrottledError } from "../host/produceGate";
import type { ProduceGate } from "../host/produceGate";
import { renderDesktopShell, frames, appBodyCount } from "./desktopShellTestKit";
import { rawFixture } from "../test/fixtures/load";

/** Open the launcher, type text in the describe input, and click Open. */
async function describeApp(
  user: ReturnType<typeof userEvent.setup>,
  text: string,
): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Open launcher" }));
  const dialog = screen.getByRole("dialog", { name: "Open an app" });
  await user.type(within(dialog).getByRole("textbox"), text);
  await user.click(within(dialog).getByRole("button", { name: "Open" }));
}

/** The single open window frame's body element (its `.window-chrome__body`). */
function singleFrameBody(): HTMLElement {
  const all = frames();
  if (all.length !== 1) {
    throw new Error(`expected exactly one window frame, found ${all.length}`);
  }
  const body = all[0]!.querySelector<HTMLElement>(".window-chrome__body");
  if (!body) throw new Error("window frame has no body");
  return body;
}

beforeEach(() => {
  _clearCachesForTesting();
});

afterEach(() => {
  cleanup();
  unmountAll();
  _clearCachesForTesting();
});

describe("SearchLauncherPanel — describe→produce→window (CREATE-02, offline)", () => {
  it("describe→produce calls the transport exactly once and opens a window", async () => {
    let callCount = 0;
    const canned = cannedTransport(rawFixture("pomodoro-timer"));
    const countingTransport: TransportFn = (url, init) => {
      callCount++;
      return canned(url, init);
    };

    const { user } = renderDesktopShell({ transport: countingTransport });

    await describeApp(user, "a pomodoro timer");

    // A single window frame appears and its produced body mounts (not just the
    // neutral "Preparing…" placeholder) — appBodyCount counts mounted AppShells.
    await waitFor(() => expect(frames()).toHaveLength(1));
    await waitFor(() => expect(appBodyCount()).toBe(1));

    // The describe path made exactly one model call (a full miss → produce once).
    expect(callCount).toBe(1);
  });

  it("cache hit: re-describing the same text does not call the transport again", async () => {
    let callCount = 0;
    const canned = cannedTransport(rawFixture("pomodoro-timer"));
    const countingTransport: TransportFn = (url, init) => {
      callCount++;
      return canned(url, init);
    };

    const { user } = renderDesktopShell({ transport: countingTransport });

    // First describe → one produce call, window opens.
    await describeApp(user, "a pomodoro timer");
    await waitFor(() => expect(frames()).toHaveLength(1));
    await waitFor(() => expect(appBodyCount()).toBe(1));
    expect(callCount).toBe(1);

    // Close the open window so the second describe is observed cleanly.
    const frame = frames()[0]!;
    await user.click(within(frame).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(frames()).toHaveLength(0));

    // Second describe with the SAME text → tier-2 transpiled cache hit (same
    // cacheKey, since registryKey folds the identical prompt) → NO model call.
    await describeApp(user, "a pomodoro timer");
    await waitFor(() => expect(frames()).toHaveLength(1));
    await waitFor(() => expect(appBodyCount()).toBe(1));

    // The transport total is STILL one — the second open reused the cached pieces.
    expect(callCount).toBe(1);
  });

  it("account error: a missing key surfaces a neutral panel affordance", async () => {
    // No API key → produceComponent throws ProduceAuthError synchronously, and
    // handleDescribe's catch stores the NeedsAuthContent fallback. The KeyDialog
    // does NOT auto-open (it only opens when the user clicks "Connect your
    // account"), so the deterministic outcome is the fallback copy in the window.
    const { user } = renderDesktopShell({
      transport: cannedTransport(rawFixture("pomodoro-timer")),
      apiKey: null,
    });

    await describeApp(user, "my custom app");

    // The panel closes (the finally block) and a window opens carrying the
    // neutral auth fallback body.
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Open an app" }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(frames()).toHaveLength(1));
    await waitFor(() => expect(appBodyCount()).toBe(1));

    // The window body shows the exact neutral NeedsAuthContent copy — no mechanic.
    expect(
      within(singleFrameBody()).getByText(
        "Connect your account to open this app.",
      ),
    ).toBeInTheDocument();
  });

  it("throttle error: a soft-capped produce surfaces a neutral 'give it a moment' affordance", async () => {
    // A gate that throttles on the first acquire → produceComponent never runs
    // (the gate is checked immediately before the model call), so the transport
    // is never invoked. handleDescribe's catch stores the throttle fallback.
    const throttledGate: ProduceGate = {
      tryAcquire() {
        throw new ProduceThrottledError();
      },
    };

    const { user } = renderDesktopShell({
      produceGate: throttledGate,
      transport: unusedTransport,
    });

    await describeApp(user, "my throttled app");

    await waitFor(() => expect(frames()).toHaveLength(1));
    await waitFor(() => expect(appBodyCount()).toBe(1));

    // The window body shows the neutral throttle fallback — reassuring, never a
    // failure or a mechanic ("give it a moment" + a "Try again" retry).
    const body = singleFrameBody();
    expect(
      within(body).getByText(/give it a moment/i),
    ).toBeInTheDocument();
    expect(
      within(body).getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});
