// UI resilience tests for the Marketplace open flow (Phase 6, RESIL-01/03/04).
//
// These render the REAL Marketplace with INJECTED dependencies — a canned
// transport (no network), an in-memory registry, and a controllable key getter —
// and drive the degradation paths through the rendered DOM:
//   - 401 on open → neutral inline "Connect your account" path appears, the
//     KeyDialog opens, and the storefront stays browsable (no crash).
//   - 429-exhausted on open → neutral "couldn't load, try again" fallback.
//   - a thrown async (event-handler) error → the injected backstop routes it to
//     neutral handling; no raw error surfaces.
//
// Doubles are named canned/stub/testTransport (never the banned hygiene tokens).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Marketplace } from "./Marketplace";
import { ServicesProvider } from "../services/ServicesProvider";
import {
  createTestServices,
  type TestServicesOverrides,
} from "../services/testServices";
import { _clearCachesForTesting } from "../execution/loader";
import {
  ModelHttpError,
  type MessagesResponse,
  type TransportFn,
} from "../host/modelClient";
import { createResilientTransport, ModelUnavailableError } from "../host/resilientTransport";
import { TokenBucket } from "../host/tokenBucket";
import { createStubClock } from "../host/clock";
import {
  installGlobalErrorBackstop,
  type ErrorReport,
} from "../host/globalErrorBackstop";

const OK: MessagesResponse = {
  content: [{ type: "text", text: "function App() { return React.createElement('div', null, 'x'); }" }],
  stop_reason: "end_turn",
};

function renderMarketplace(overrides: TestServicesOverrides = {}): {
  user: ReturnType<typeof userEvent.setup>;
} {
  const services = createTestServices(overrides);
  const user = userEvent.setup();
  render(
    <ServicesProvider services={services}>
      <Marketplace />
    </ServicesProvider>,
  );
  return { user };
}

/** Click a storefront card by its display name. */
async function openApp(
  user: ReturnType<typeof userEvent.setup>,
  displayName: string,
): Promise<void> {
  const card = screen.getByRole("button", {
    name: new RegExp("^" + displayName + " —"),
  });
  await user.click(card);
}

beforeEach(() => {
  _clearCachesForTesting();
});

afterEach(() => {
  cleanup();
  _clearCachesForTesting();
});

describe("Marketplace — 401 degrades to inline reconfigure (RESIL-03)", () => {
  it("shows a neutral 'Connect your account' prompt and opens the KeyDialog, storefront stays browsable", async () => {
    // Calculator is unseeded → routes through the transport, which returns a 401.
    const transport: TransportFn = () =>
      Promise.reject(new ModelHttpError(401, undefined, "bad key"));
    const { user } = renderMarketplace({ transport });

    await openApp(user, "Calculator");

    // Inline reconfigure prompt appears (neutral copy), NOT a crash.
    const region = await screen.findByRole("region", { name: "Calculator" });
    const connectBtn = await within(region).findByRole("button", {
      name: /connect your account/i,
    });
    expect(connectBtn).toBeInTheDocument();

    // The storefront is still browsable — the other app cards are present.
    expect(
      screen.getByRole("button", { name: /^Notes —/ }),
    ).toBeInTheDocument();

    // Clicking it opens the KeyDialog inline (a dialog with the connect title).
    await user.click(connectBtn);
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: /connect your account/i }),
    ).toBeInTheDocument();
  });

  it("a missing key (no transport call needed) also surfaces the reconfigure path", async () => {
    // No key at all → produceComponent throws ProduceAuthError before any call.
    // Calculator is unseeded → triggers auth check.
    const { user } = renderMarketplace({ apiKey: null });

    await openApp(user, "Calculator");

    const region = await screen.findByRole("region", { name: "Calculator" });
    expect(
      await within(region).findByRole("button", { name: /connect your account/i }),
    ).toBeInTheDocument();
  });
});

describe("Marketplace — 429 exhausted degrades to neutral fallback (RESIL-04)", () => {
  it("shows the neutral 'couldn't load, try again' fallback when retries exhaust", async () => {
    // A canned inner transport that ALWAYS 429s, wrapped in the resilient
    // transport with a STUB clock so retries exhaust INSTANTLY (no real waits).
    const inner: TransportFn = () =>
      Promise.reject(new ModelHttpError(429, undefined, "rate"));
    const clock = createStubClock();
    const limiter = new TokenBucket({
      capacity: 100,
      refillPerSec: 100,
      maxConcurrent: 10,
      clock,
    });
    const transport = createResilientTransport({
      inner,
      limiter,
      clock,
      maxRetries: 3,
      backoff: { baseMs: 500, maxDelayMs: 30_000, rng: () => 0.5 },
    });

    const { user } = renderMarketplace({ transport });
    await openApp(user, "Calculator");

    // Generic neutral fallback (NOT the auth path — a 429 is not auth).
    const region = await screen.findByRole("region", { name: "Calculator" });
    expect(
      within(region).getByText(/this app couldn.t load\. try again\./i),
    ).toBeInTheDocument();
    expect(
      within(region).queryByRole("button", { name: /connect your account/i }),
    ).not.toBeInTheDocument();
    // Retries actually exhausted (used virtual time, not real).
    expect(clock.slept.length).toBe(3);
  });

  it("a 429 then success recovers transparently with no fallback (RESIL-04 happy path)", async () => {
    let calls = 0;
    const inner: TransportFn = () => {
      calls += 1;
      if (calls === 1) return Promise.reject(new ModelHttpError(429, undefined, "rate"));
      return Promise.resolve(OK);
    };
    const clock = createStubClock();
    const limiter = new TokenBucket({
      capacity: 100,
      refillPerSec: 100,
      maxConcurrent: 10,
      clock,
    });
    const transport = createResilientTransport({
      inner,
      limiter,
      clock,
      maxRetries: 4,
      backoff: { baseMs: 500, maxDelayMs: 30_000, rng: () => 0.5 },
    });

    const { user } = renderMarketplace({ transport });
    await openApp(user, "Calculator");

    // The produced component rendered — no fallback shown.
    const region = await screen.findByRole("region", { name: "Calculator" });
    await waitFor(() =>
      expect(
        within(region).queryByText(/this app couldn.t load/i),
      ).not.toBeInTheDocument(),
    );
    expect(within(region).getByText("x")).toBeInTheDocument();
    // It backed off exactly once before succeeding.
    expect(clock.slept).toHaveLength(1);
  });
});

describe("Global backstop routes a thrown async error to neutral handling (RESIL-02)", () => {
  it("a throwing event-handler error reaches the backstop, not a user-visible surface", async () => {
    // Wire the REAL backstop to a stub sink over the jsdom window, then dispatch
    // a synthetic 'error' event the way a throwing onClick/timer would surface.
    const reports: ErrorReport[] = [];
    const uninstall = installGlobalErrorBackstop({
      target: window,
      onReport: (r) => reports.push(r),
      suppressDefault: true,
    });

    try {
      const secret = new Error("on-demand mechanic detail");
      const event = new ErrorEvent("error", { error: secret, message: secret.message });
      window.dispatchEvent(event);

      // The backstop captured it NEUTRALLY (name only) — the raw message never
      // reached a user-visible DOM surface.
      expect(reports).toHaveLength(1);
      expect(reports[0]!.source).toBe("error");
      expect(reports[0]!.summary).toBe("Error");
      expect(document.body.textContent ?? "").not.toContain("mechanic detail");
    } finally {
      uninstall();
    }
  });
});

describe("ModelUnavailableError neutrality (RESIL-04)", () => {
  it("the user-surfaceable error carries no status / mechanic in its message", () => {
    const err = new ModelUnavailableError(new ModelHttpError(429));
    expect(err.message).not.toMatch(/429|rate|status|retry/i);
    expect(err.message).toMatch(/try again/i);
  });
});
