// DelegatedShell runtime — instantiate a behavior-free module and drive it.
//
// Proves the PERMANENT runtime (container delegate + state SSOT + intent composition
// + merge) turns a produced "view + initialState + actionSpec" module into a working
// app, using the REAL captured handler fixtures (no network).

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { transpile } from "./transpile";
import { executeHandlerSource } from "./handler";
import {
  instantiateDelegated,
  buildActionIntent,
  makeDelegatedComponent,
} from "./delegated";
import { InstantiateError } from "./instantiate";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");
const read = (f: string): string => readFileSync(join(FIXTURE_DIR, f), "utf8");
const KEY_HANDLER = read("handler-calc-key.code.txt");
const EQUALS_HANDLER = read("handler-calc-equals.code.txt");

// A behavior-free delegated module: initialState + a markup-only view (buttons carry
// data-action, no handlers) + an actionSpec. React.createElement keeps the source
// plain; a produced module would use JSX (transpile handles either).
const MODULE = `
const initialState = { display: "0", expr: "" };
function view(state) {
  return React.createElement(
    "div",
    null,
    React.createElement("div", { "data-testid": "display" }, state.display),
    React.createElement(
      "div",
      null,
      ["1", "2", "+", "="].map(function (k) {
        return React.createElement("button", { key: k, "data-action": k }, k);
      })
    )
  );
}
const actionSpec = "state is { display: string, expr: string } where expr is the running expression; for a digit or operator append the action to expr and set display to expr; for '=' evaluate expr and set display and expr to the result";
export { initialState, view, actionSpec };
`;

// Route the on-demand handler by the action embedded in the composed intent.
const routedRunHandler = (intent: string, input: unknown) =>
  executeHandlerSource(/action '='/.test(intent) ? EQUALS_HANDLER : KEY_HANDLER, input);

afterEach(() => cleanup());

describe("instantiateDelegated", () => {
  it("extracts initialState, view, and actionSpec from a produced module", () => {
    const mod = instantiateDelegated(transpile(MODULE, { filename: "m.tsx" }));
    expect(mod.initialState).toEqual({ display: "0", expr: "" });
    expect(typeof mod.view).toBe("function");
    expect(mod.actionSpec).toContain("evaluate expr");
  });

  it("throws when the module exports no view", () => {
    const bad = transpile(`const initialState = {}; export { initialState };`, { filename: "m.tsx" });
    expect(() => instantiateDelegated(bad)).toThrow(InstantiateError);
  });
});

describe("buildActionIntent", () => {
  it("composes a stable, precise intent carrying the actionSpec and action", () => {
    const intent = buildActionIntent("calculator", "state is { display }", "=");
    expect(intent).toContain("calculator action '='");
    expect(intent).toContain("state is { display }");
    expect(intent).toContain("{ data: { state } }");
    // No live state values embedded → stable cache key per (app, action).
    expect(intent).not.toMatch(/display":/);
  });
});

describe("DelegatedShell — runtime drives a behavior-free view", () => {
  it("computes 1 + 2 = 3 via the container delegate (markup-only view + real handlers)", async () => {
    const mod = instantiateDelegated(transpile(MODULE, { filename: "m.tsx" }));
    const App = makeDelegatedComponent("calculator", mod, routedRunHandler);
    render(createElement(App));
    const user = userEvent.setup();
    const display = screen.getByTestId("display");
    expect(display).toHaveTextContent("0");

    const press = (name: string) => user.click(screen.getByRole("button", { name }));
    await press("1");
    await waitFor(() => expect(display).toHaveTextContent("1"));
    await press("+");
    await waitFor(() => expect(display).toHaveTextContent("1+"));
    await press("2");
    await waitFor(() => expect(display).toHaveTextContent("1+2"));
    await press("=");
    await waitFor(() => expect(display).toHaveTextContent("3"));
  });
});
