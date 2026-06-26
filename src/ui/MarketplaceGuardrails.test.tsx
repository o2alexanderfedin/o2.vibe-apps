// UI (RTL) tests for the Phase 7 cost guardrail in the open flow (RESIL-05).
//
// Renders the REAL Marketplace with INJECTED dependencies — a canned transport
// (no network), an in-memory registry (no IndexedDB), and a REAL produce gate
// wired to a STUB clock so the rolling window is driven by virtual time (zero
// real waits). It drives rapid opens through the rendered DOM and asserts:
//   - exceeding the cap surfaces the neutral "give it a moment" copy via the
//     existing failed-open fallback region (not a crash, not a mechanic);
//   - the storefront stays browsable underneath;
//   - after the window advances (stub clock), a new open succeeds.
//
// Doubles are named canned/stub/testTransport (never the banned hygiene tokens).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Marketplace } from "./Marketplace";
import { ServicesProvider } from "../services/ServicesProvider";
import {
  createTestServices,
  cannedTransport,
  type TestServicesOverrides,
} from "../services/testServices";
import { _clearCachesForTesting } from "../execution/loader";
import { createProduceGate } from "../host/produceGate";
import { createStubClock } from "../host/clock";

// A valid, transpilable component the canned transport returns for every produce.
const COMPONENT_TEXT =
  "function App() { return React.createElement('div', null, 'opened'); }";

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

describe("Marketplace — produce-cost cap surfaces neutral fallback on rapid opens (RESIL-05)", () => {
  it("the (N+1)th rapid open shows 'give it a moment' via the failed-open region; storefront stays browsable", async () => {
    const clock = createStubClock();
    // cap 2: the first two unseeded opens produce; the third is soft-capped.
    const produceGate = createProduceGate({ clock, cap: 2, windowMs: 5 * 60 * 1000 });
    const { user } = renderMarketplace({
      transport: cannedTransport(COMPONENT_TEXT),
      produceGate,
    });

    // Two distinct unseeded apps open successfully (each is a produce miss).
    await openApp(user, "Calculator");
    await openApp(user, "Timer");
    await waitFor(() =>
      expect(screen.getAllByText("opened").length).toBeGreaterThanOrEqual(2),
    );

    // The third rapid open exceeds the cap → neutral throttled fallback.
    await openApp(user, "Recipes");
    const region = await screen.findByRole("region", { name: "Recipes" });
    expect(
      within(region).getByText(/give it a moment/i),
    ).toBeInTheDocument();
    // It is NOT the auth path and carries no mechanic copy.
    expect(
      within(region).queryByRole("button", { name: /connect your account/i }),
    ).not.toBeInTheDocument();
    expect(within(region).queryByText(/cap|limit|rate|throttle|quota/i)).toBeNull();

    // The storefront is still browsable — the other cards remain clickable.
    expect(screen.getByRole("button", { name: /^Budget —/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Weather —/ })).toBeInTheDocument();
  });

  it("after the window advances (stub clock), a fresh open succeeds again", async () => {
    const clock = createStubClock();
    const produceGate = createProduceGate({ clock, cap: 1, windowMs: 5 * 60 * 1000 });
    const { user } = renderMarketplace({
      transport: cannedTransport(COMPONENT_TEXT),
      produceGate,
    });

    // First open consumes the single slot.
    await openApp(user, "Calculator");
    await waitFor(() => expect(screen.getByText("opened")).toBeInTheDocument());

    // Second rapid open is throttled.
    await openApp(user, "Timer");
    const blocked = await screen.findByRole("region", { name: "Timer" });
    expect(within(blocked).getByText(/give it a moment/i)).toBeInTheDocument();

    // Advance virtual time past the window — capacity frees up (no real wait).
    clock.sleep(5 * 60 * 1000 + 1);

    // A new open now succeeds (the window slid; the cap recovered).
    await openApp(user, "Budget");
    const region = await screen.findByRole("region", { name: "Budget" });
    await waitFor(() =>
      expect(within(region).getByText("opened")).toBeInTheDocument(),
    );
    expect(within(region).queryByText(/give it a moment/i)).toBeNull();
  });

  it("a seeded app (no model call) is never throttled even when the cap is exhausted", async () => {
    const clock = createStubClock();
    // cap 1, already spent by a produce miss — a seeded open must still work.
    const produceGate = createProduceGate({ clock, cap: 1, windowMs: 5 * 60 * 1000 });
    const { user } = renderMarketplace({
      transport: cannedTransport(COMPONENT_TEXT),
      produceGate,
    });

    // Spend the single slot on an unseeded produce.
    await openApp(user, "Calculator");
    await waitFor(() => expect(screen.getByText("opened")).toBeInTheDocument());

    // Notes is SEEDED → transpiled locally, no model call → never throttled.
    await openApp(user, "Notes");
    const region = await screen.findByRole("region", { name: "Notes" });
    expect(within(region).queryByText(/give it a moment/i)).toBeNull();
    // The seeded app rendered its real content (no fallback region content).
    expect(
      within(region).queryByText(/this app couldn.t load/i),
    ).not.toBeInTheDocument();
  });
});
