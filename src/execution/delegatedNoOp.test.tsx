// DelegatedShell no-op paths — RELY-02 coverage.
//
// These tests verify that every path where a handler cannot return a valid
// state update leaves the app in its prior state with no crash and no stuck
// busy indicator. The four paths covered:
//   A — handler returns {error} (no usable handler for the action)
//   B — handler returns {error} with no data field (unhandled/unknown action)
//   C — explicit {error} contract: res.data is undefined → no merge attempted
//   D — handler throws: outer catch swallows the error, state is unchanged
//
// All tests use the real captured delegated-calculator fixture
// (initialState: { display: "0", expr: "" }) to exercise the full mechanism.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { transpile } from "./transpile";
import { instantiateDelegated, makeDelegatedComponent } from "./delegated";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");
const read = (f: string): string => readFileSync(join(FIXTURE_DIR, f), "utf8");
const MODULE = read("delegated-calculator.code.txt");

afterEach(() => cleanup());

describe("DelegatedShell — no-op paths (RELY-02)", () => {
  it("A: handler returns {error} — state is unchanged and app stays responsive", async () => {
    const mod = instantiateDelegated(transpile(MODULE, { filename: "calc.tsx" }));

    // Handler signals no usable result for this action by returning {error}.
    const runHandler = (_intent: string, _input: unknown) =>
      Promise.resolve({ error: "no handler available" });

    const App = makeDelegatedComponent("calculator", mod, runHandler);
    const { container } = render(createElement(App));

    const display = container.querySelector(
      'div[style*="text-align: right"]',
    ) as HTMLElement;
    expect(display).toBeTruthy();
    expect(display.textContent).toBe("0");

    const btn = container.querySelector('[data-action="1"]') as HTMLElement;
    expect(btn).toBeTruthy();
    btn.click();

    // Wait for the action to settle (handler resolves, finally clears busy state).
    await waitFor(() => {
      expect(container.querySelector('[data-busy]')).toBeNull();
    });

    // State is unchanged: display still shows prior value.
    expect(display.textContent).toBe("0");

    // Component is still mounted and responsive.
    expect(container.querySelector('.delegated-shell')).toBeTruthy();
  });

  it("B: handler returns {error} with no data — no merge attempted, state kept", async () => {
    const mod = instantiateDelegated(transpile(MODULE, { filename: "calc.tsx" }));

    // Handler signals an unhandled/unknown action. res.data is absent so next is
    // undefined — the existing guard 'if (next && typeof next === "object")' prevents
    // any merge from occurring.
    const runHandler = (_intent: string, _input: unknown) =>
      Promise.resolve({ error: "unhandled action" });

    const App = makeDelegatedComponent("calculator", mod, runHandler);
    const { container } = render(createElement(App));

    const display = container.querySelector(
      'div[style*="text-align: right"]',
    ) as HTMLElement;
    expect(display).toBeTruthy();
    expect(display.textContent).toBe("0");

    const btn = container.querySelector('[data-action="clear"]') as HTMLElement;
    expect(btn).toBeTruthy();
    btn.click();

    await waitFor(() => {
      expect(container.querySelector('[data-busy]')).toBeNull();
    });

    expect(display.textContent).toBe("0");
    expect(container.querySelector('.delegated-shell')).toBeTruthy();
  });

  it("C: {error} result leaves state at prior value — no throw visible to the app", async () => {
    const mod = instantiateDelegated(transpile(MODULE, { filename: "calc.tsx" }));

    // Explicit {error}-only contract: result has an error field and no data field.
    // res.data?.state is undefined, so next is undefined, and no setState is called.
    const runHandler = (_intent: string, _input: unknown) =>
      Promise.resolve({ error: "operation could not be completed" });

    const App = makeDelegatedComponent("calculator", mod, runHandler);
    const { container } = render(createElement(App));

    const display = container.querySelector(
      'div[style*="text-align: right"]',
    ) as HTMLElement;
    expect(display).toBeTruthy();
    expect(display.textContent).toBe("0");

    const btn = container.querySelector('[data-action="5"]') as HTMLElement;
    expect(btn).toBeTruthy();
    btn.click();

    await waitFor(() => {
      expect(container.querySelector('[data-busy]')).toBeNull();
    });

    // State is kept; no error is surfaced to the user.
    expect(display.textContent).toBe("0");
    expect(container.querySelector('.delegated-shell')).toBeTruthy();
  });

  it("D: handler throws — outer catch swallows the throw, state is unchanged", async () => {
    const mod = instantiateDelegated(transpile(MODULE, { filename: "calc.tsx" }));

    // Handler throws synchronously. DelegatedShell wraps the handler call in a
    // try/catch: the throw is caught, state is left unchanged, and the finally
    // block clears the busy indicator so the button re-enables.
    const runHandler = (_intent: string, _input: unknown): Promise<{ data?: unknown; error?: string }> => {
      throw new Error("handler timed out");
    };

    const App = makeDelegatedComponent("calculator", mod, runHandler);
    const { container } = render(createElement(App));

    const display = container.querySelector(
      'div[style*="text-align: right"]',
    ) as HTMLElement;
    expect(display).toBeTruthy();
    expect(display.textContent).toBe("0");

    const btn = container.querySelector('[data-action="7"]') as HTMLElement;
    expect(btn).toBeTruthy();
    btn.click();

    // The catch block runs; finally clears busy. The component does not unmount.
    await waitFor(() => {
      expect(container.querySelector('[data-busy]')).toBeNull();
    });

    // State is unchanged; no throw propagated to the test.
    expect(display.textContent).toBe("0");
    expect(container.querySelector('.delegated-shell')).toBeTruthy();
  });
});
