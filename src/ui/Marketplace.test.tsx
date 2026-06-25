// UI integration tests for the Marketplace open flow.
//
// These render the REAL Marketplace with INJECTED dependencies — a canned
// transport (no network) and an in-memory registry (no real IndexedDB) — and
// drive the full user flow through the rendered DOM. Test doubles are named
// "canned"/"stub"/"testTransport" (never the banned hygiene tokens).
//
// Coverage:
//   1. Open a seeded app (Notes) → its UI appears in the open region.
//   2. Open an unseeded app whose transport returns TSX using `export default`
//      → the produced component's UI renders (the exact shipped regression).
//   3. Switch: open app A, then app B → both regions are present, showing B.
//   4. Close then re-open a cached app → it renders again (silent-failure guard).

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
import type { Services } from "../services/services";

// A produced component mirroring real output: ships with `export default`,
// uses a hook, and is interactive. Before the transpile fix this rendered
// nothing (silent failure) — here it must mount and show "Open Weather".
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

beforeEach(() => {
  _clearCachesForTesting();
});

afterEach(() => {
  cleanup();
  _clearCachesForTesting();
});

describe("Marketplace open flow (UI integration, injected deps)", () => {
  it("opens a seeded app (Notes) → its UI appears in the open region", async () => {
    const { user } = renderMarketplace();

    await openApp(user, "Notes");

    // The opened app renders inside a region labeled by its display name.
    const region = await screen.findByRole("region", { name: "Notes" });
    // The seeded Notes UI has an "Add a note…" input and an "Add" button.
    expect(within(region).getByPlaceholderText("Add a note…")).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("opens an unseeded app whose transport returns `export default` TSX → its UI renders", async () => {
    // Weather is NOT seeded — it routes through the transport. The canned
    // transport returns a component shipped with `export default` (the shape
    // that silently failed to render before the transpile fix).
    const { user } = renderMarketplace({
      transport: cannedTransport(EXPORT_DEFAULT_TSX),
    });

    await openApp(user, "Weather");

    const region = await screen.findByRole("region", { name: "Weather" });
    expect(within(region).getByText("Produced Component")).toBeInTheDocument();
    // The produced component is interactive end-to-end.
    const button = within(region).getByRole("button", { name: "Open Now" });
    await user.click(button);
    expect(within(region).getByRole("button", { name: "Opened" })).toBeInTheDocument();
  });

  it("switch: open app A (Notes, seeded), then app B (Calculator, via canned transport) → B is shown", async () => {
    // A = Notes (seeded, no transport). B = Calculator (unseeded → routes
    // through the canned transport). The open region shows B alongside A.
    const { user } = renderMarketplace({
      transport: cannedTransport(EXPORT_DEFAULT_TSX),
    });

    await openApp(user, "Notes");
    await screen.findByRole("region", { name: "Notes" });

    await openApp(user, "Calculator");
    await screen.findByRole("region", { name: "Calculator" });

    // The open region now shows B (Calculator) — both A and B regions co-exist.
    const calcRegion = screen.getByRole("region", { name: "Calculator" });
    expect(within(calcRegion).getByText("Produced Component")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Notes" })).toBeInTheDocument();
  });

  it("close then re-open a cached app → it renders again (silent-failure guard)", async () => {
    const { user } = renderMarketplace({
      transport: cannedTransport(EXPORT_DEFAULT_TSX),
    });

    // First open: produces + caches the unseeded Weather app.
    await openApp(user, "Weather");
    const region1 = await screen.findByRole("region", { name: "Weather" });
    expect(within(region1).getByText("Produced Component")).toBeInTheDocument();

    // Close it.
    const closeButton = within(region1).getByRole("button", { name: "Close Weather" });
    await user.click(closeButton);
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Weather" })).not.toBeInTheDocument(),
    );

    // Re-open: served from the registry (tier-3 cache) — must render again.
    await openApp(user, "Weather");
    const region2 = await screen.findByRole("region", { name: "Weather" });
    expect(within(region2).getByText("Produced Component")).toBeInTheDocument();
  });
});
