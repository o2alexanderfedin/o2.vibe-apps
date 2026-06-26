// Regression: the DelegatedShell must capture user-entered `[data-field]` input
// values and fold them into the state the handler sees BEFORE running an action.
//
// The gap the unit tests missed: DelegatedShell.onClick only passed
// { state: stateRef.current, payload: action } — it never read the view's
// `data-field` inputs. The seeded Weather view renders its location input with
// `data-field="query"`, so `state.query` was always "" when the handler ran and the
// weather handler (correctly) skipped fetching on an empty query → Search did nothing.
//
// IoC/DI: a canned handler / routing broker, no real network. The first test proves
// the generic field-capture contract; the second proves the real seeded Weather
// module reaches its "ready" state end-to-end through the shell.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { instantiateDelegated, makeDelegatedComponent } from "./delegated";
import { transpile } from "./transpile";
import type { DataFetchBroker } from "../data/dataBroker";

afterEach(() => cleanup());

// A delegated module whose view has a data-field text input + a data-action button.
// React.createElement keeps the source compact and explicit.
const FIELD_MODULE = `
const initialState = { query: "", echoed: "", status: "idle" };
const actionSpec = "State: {query:string, echoed:string, status:string}. submit: copy query into echoed.";
function view(state) {
  return React.createElement(
    "div",
    null,
    React.createElement("input", { "data-field": "query", defaultValue: state.query }),
    React.createElement("button", { "data-action": "submit" }, "Submit"),
    React.createElement("p", { "data-testid": "echoed" }, state.echoed),
  );
}
module.exports = { initialState, view, actionSpec };
`;

describe("DelegatedShell — captures data-field inputs into handler state (regression)", () => {
  it("a typed data-field value reaches the handler as state.<field>", async () => {
    const mod = instantiateDelegated(transpile(FIELD_MODULE, { filename: "field.tsx" }));

    // Canned handler that records what state it received and echoes the captured field.
    let seenQuery: unknown = "__unset__";
    const handler = (_intent: string, input: unknown) => {
      const state = (input as { state?: Record<string, unknown> })?.state ?? {};
      seenQuery = state.query;
      return Promise.resolve({
        data: { state: { ...state, echoed: String(state.query ?? ""), status: "ready" } },
      });
    };

    const App = makeDelegatedComponent("fielder", mod, handler);
    const { container } = render(createElement(App));
    const user = userEvent.setup();

    const input = container.querySelector('[data-field="query"]') as HTMLInputElement;
    await user.type(input, "London");
    (container.querySelector('[data-action="submit"]') as HTMLElement).click();

    // The handler must have seen the typed value (not the empty initialState).
    await waitFor(() => expect(seenQuery).toBe("London"));
    // And the returned state re-renders with the echoed value.
    await waitFor(() =>
      expect(container.querySelector('[data-testid="echoed"]')?.textContent).toBe("London"),
    );
  });

  it("the seeded Weather app reaches 'ready' end-to-end through the shell (type → search → fetch)", async () => {
    vi.resetModules();
    const { SEEDED_SOURCES } = await import("../apps/seeds");
    const { runHandler } = await import("./handler");
    const { createTestServices } = await import("../services/testServices");

    // Real-shape geocode + forecast fixtures routed by sourceId (no real network).
    const routingBroker: DataFetchBroker = {
      fetch: (sourceId: string) => {
        if (sourceId === "weather-geocode") {
          return Promise.resolve({
            data: {
              results: [
                { name: "London", latitude: 51.5, longitude: -0.1, country: "United Kingdom" },
              ],
            },
          });
        }
        if (sourceId === "weather-forecast") {
          return Promise.resolve({
            data: { current: { temperature_2m: 18, weather_code: 2, wind_speed_10m: 15 } },
          });
        }
        return Promise.resolve({ error: "Requested data is not available." });
      },
    };
    const services = createTestServices({ fetchDataBroker: routingBroker });

    // The real seeded Weather module, driven by the REAL seeded weather handler via
    // the services-bound runHandler (the seeded-handler short-circuit fires — no
    // registry entry, no model call).
    const source = SEEDED_SOURCES.get("weather") as string;
    const mod = instantiateDelegated(transpile(source, { filename: "weather.tsx" }));
    const boundRunHandler = (intent: string, input: unknown) =>
      runHandler(intent, input, services);

    const App = makeDelegatedComponent("weather", mod, boundRunHandler);
    const { container } = render(createElement(App));
    const user = userEvent.setup();

    // Idle state: the input + Search button are present.
    const input = container.querySelector('[data-field="query"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(container.textContent).toContain("Enter a location");

    await user.type(input, "London");
    (container.querySelector('[data-action="search"]') as HTMLElement).click();

    // Ready state: the view shows the resolved place + temperature.
    await waitFor(() => expect(container.textContent).toContain("London, United Kingdom"));
    expect(container.textContent).toContain("18°C");
    expect(container.textContent).toContain("Partly cloudy");
  });
});
