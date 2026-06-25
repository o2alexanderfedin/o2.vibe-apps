// UI render-layer coverage (the shipped regression + the new failure UX).
//
// Renders the REAL Marketplace through ServicesProvider with a canned transport
// returning a REAL captured fixture, then drives the full open flow through the
// rendered DOM. Adds the cases the existing Marketplace.test.tsx does not:
//   1. Open Weather via the canned transport returning the REAL weather fixture
//      → the produced component's actual DOM renders in the region (regression
//      guard for the shipped silent-drop bug) and is interactive.
//   2. A render-time ERROR path: a canned component that throws on mount → the
//      neutral ErrorBoundary fallback shows; the app region does not vanish.
//   3. The produce-FAILURE path: a canned transport returns a TRUNCATED response
//      (and, separately, garbage) → the NEW neutral "couldn't load" fallback
//      appears, no crash, and crucially it is NOT silent (a region is present).
//
// Test doubles are named "canned"/"stub"/"testTransport" (never banned tokens).

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
import type { TransportFn, MessagesResponse } from "../host/modelClient";
import { rawFixture } from "../test/fixtures/load";

function renderMarketplace(overrides: TestServicesOverrides = {}) {
  const services = createTestServices(overrides);
  const user = userEvent.setup();
  render(
    <ServicesProvider services={services}>
      <Marketplace />
    </ServicesProvider>,
  );
  return { services, user };
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

// ---------------------------------------------------------------------------
// 1. The shipped regression: the REAL weather fixture renders in the region.
// ---------------------------------------------------------------------------

describe("Marketplace — real weather fixture renders in the open region", () => {
  it("opens Weather (canned transport → REAL weather fixture) and its DOM appears", async () => {
    // Weather is unseeded → routes through the transport. The canned transport
    // returns the full real raw response (fences + `export default` + JSX
    // fragments). Before the token-budget fix this was truncated and the app
    // was silently dropped; here the component must actually mount.
    const { user } = renderMarketplace({
      transport: cannedTransport(rawFixture("weather")),
    });

    await openApp(user, "Weather");

    const region = await screen.findByRole("region", { name: "Weather" });
    // The real weather component renders an interactive control surface — assert
    // *something* from the produced component is present and the region is not
    // the failure fallback.
    expect(
      within(region).queryByText("This app couldn’t load. Try again."),
    ).not.toBeInTheDocument();
    // The region has real, non-empty produced content.
    const content = region.querySelector(".app-shell__content");
    expect(content?.textContent?.length ?? 0).toBeGreaterThan(0);
  });

  it("the produced weather component is interactive (has working inputs/buttons)", async () => {
    const { user } = renderMarketplace({
      transport: cannedTransport(rawFixture("weather")),
    });
    await openApp(user, "Weather");
    const region = await screen.findByRole("region", { name: "Weather" });
    // The real weather app exposes interactive elements (buttons/inputs). At
    // least one interactive control exists inside the produced region.
    const interactive = within(region).queryAllByRole("button");
    const inputs = region.querySelectorAll("input, select, button");
    expect(interactive.length + inputs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Render-time error → neutral ErrorBoundary fallback, region stays.
// ---------------------------------------------------------------------------

const THROWS_ON_MOUNT_TSX = `
export default function App() {
  throw new Error("boom-at-render");
}
`;

describe("Marketplace — render-time error is contained by the ErrorBoundary", () => {
  it("a component that throws on mount shows the neutral fallback, app does not vanish", async () => {
    const { user } = renderMarketplace({
      transport: cannedTransport(THROWS_ON_MOUNT_TSX),
    });

    await openApp(user, "Weather");

    // The neutral ErrorBoundary fallback appears (mechanic-free copy).
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Something went wrong/i);
    expect(alert).toHaveTextContent(/couldn’t load/i);
    // It offers a retry and never reveals the technical error string.
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("boom-at-render");
  });
});

// ---------------------------------------------------------------------------
// 3. Produce-FAILURE path → NEW neutral "couldn't load" fallback, NOT silent.
// ---------------------------------------------------------------------------

/** A canned transport that returns a TRUNCATED (max_tokens) half-component. */
const truncatedTransport: TransportFn = (_url, _init) =>
  Promise.resolve<MessagesResponse>({
    content: [{ type: "text", text: "```tsx\nfunction App() { const [s,setS]=React.useState('un" }],
    stop_reason: "max_tokens",
  });

/** A canned transport that returns garbage that cannot transpile. */
const garbageTransport: TransportFn = (_url, _init) =>
  Promise.resolve<MessagesResponse>({
    content: [{ type: "text", text: "function App( { return <div>broken</div" }],
    stop_reason: "end_turn",
  });

describe("Marketplace — produce failure shows a neutral fallback (not silent)", () => {
  it("a TRUNCATED response surfaces the neutral 'couldn’t load' fallback in a region", async () => {
    const { user } = renderMarketplace({ transport: truncatedTransport });

    await openApp(user, "Weather");

    // The failure is VISIBLE (a region appears) — the regression was that it
    // was silent. The neutral copy shows; nothing crashed.
    const region = await screen.findByRole("region", { name: "Weather" });
    expect(
      within(region).getByText("This app couldn’t load. Try again."),
    ).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    // Hygiene: the user-facing failure copy reveals no mechanic and no raw error.
    expect(region.textContent).not.toMatch(/token|transpile|babel|fence|truncat/i);
  });

  it("a GARBAGE response (cannot transpile) also surfaces the neutral fallback, no crash", async () => {
    const { user } = renderMarketplace({ transport: garbageTransport });

    await openApp(user, "Calculator");

    const region = await screen.findByRole("region", { name: "Calculator" });
    expect(
      within(region).getByText("This app couldn’t load. Try again."),
    ).toBeInTheDocument();
  });

  it("the failure fallback offers a retry that re-runs the open (recovers when the transport then succeeds)", async () => {
    // The FIRST open fails for the whole produce loop (self-heal can't fix it →
    // identical error early-stops), so the neutral fallback shows. The user's
    // retry triggers a SECOND open, which the transport now satisfies — proving
    // the fallback is not a dead end. We flip on the first open's INITIAL prompt
    // (buildPrompt text), not on raw call count, so the self-heal retries inside
    // the first open all stay on the failing branch.
    let opens = 0;
    const flakyTransport: TransportFn = (_url, init) => {
      const body = JSON.parse(init.body as string) as {
        messages: Array<{ content: string }>;
      };
      const content = body.messages[0]?.content ?? "";
      const isInitialPrompt = content.includes("Build a self-contained");
      if (isInitialPrompt) opens += 1;
      const text =
        opens === 1
          ? "function App( { return <div>broken</div" // identical → early-stop
          : `function App() { return React.createElement("div", { "data-testid": "recovered" }, "ok"); }`;
      return Promise.resolve<MessagesResponse>({
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
      });
    };

    const { user } = renderMarketplace({ transport: flakyTransport });

    await openApp(user, "Weather");
    const region = await screen.findByRole("region", { name: "Weather" });
    const retry = within(region).getByRole("button", { name: "Try again" });

    await user.click(retry);

    // After retry, a fresh region renders the recovered, real component.
    await waitFor(() => {
      expect(screen.getByTestId("recovered")).toBeInTheDocument();
    });
  });
});
