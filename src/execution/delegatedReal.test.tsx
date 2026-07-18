// Delegated mechanism — proven with REAL captured Haiku artifacts (no network).
//
// Renders the REAL produced delegated calculator module (behavior-free: initialState
// + markup-only data-action view + actionSpec) driven by the REAL produced reducer
// handler, through the permanent DelegatedShell runtime. Proves the full mechanism:
// a click on a data-action element → the runtime composes the intent, runs the
// on-demand handler, merges the returned state, and re-renders.
//
// (Produced reducers can have deeper state-machine quirks — this asserts the
// mechanism + actions the captured reducer handles cleanly, not perfect arithmetic.
// Correct arithmetic with correct handlers is covered by delegated.test.tsx.)

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { transpile } from "./transpile";
import { executeHandlerSource } from "./handler";
import { instantiateDelegated, makeDelegatedComponent } from "./delegated";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");
const read = (f: string): string => readFileSync(join(FIXTURE_DIR, f), "utf8");
const MODULE = read("delegated-calculator.code.txt");
const REDUCER = read("delegated-calc-reducer.code.txt");

// One produced reducer handles every action (it switches on payload), so route all
// runHandler calls to it — this runs the REAL produced handler code in the scope.
const runHandler = (_intent: string, input: unknown) => executeHandlerSource(REDUCER, input);

afterEach(() => cleanup());

describe("delegated mechanism with real captured artifacts", () => {
  it("the real module instantiates into initialState + view + a non-empty actionSpec", () => {
    const mod = instantiateDelegated(transpile(MODULE, { filename: "calc.tsx" }));
    expect(mod.initialState).toMatchObject({ display: "0" });
    expect(typeof mod.view).toBe("function");
    expect(mod.actionSpec.length).toBeGreaterThan(50);
  });

  it("a click drives the on-demand reducer and re-renders (1 → display '1', clear → '0')", async () => {
    const mod = instantiateDelegated(transpile(MODULE, { filename: "calc.tsx" }));
    const App = makeDelegatedComponent("calculator", mod, runHandler);
    const { container } = render(createElement(App));
    const user = userEvent.setup();

    // The display is the only right-aligned region (the keypad buttons are a grid).
    const display = container.querySelector(
      'div[style*="text-align: right"]',
    ) as HTMLElement;
    expect(display).toBeTruthy();
    expect(display.textContent).toBe("0");

    // Click the "1" key — its on-demand handler appends to the (empty) expression.
    (container.querySelector('[data-action="1"]') as HTMLElement).click();
    await waitFor(() => expect(display.textContent).toBe("1"));

    // Click "clear" — a different action / different on-demand handler — resets.
    (container.querySelector('[data-action="clear"]') as HTMLElement).click();
    await waitFor(() => expect(display.textContent).toBe("0"));

    void user;
  });
});
