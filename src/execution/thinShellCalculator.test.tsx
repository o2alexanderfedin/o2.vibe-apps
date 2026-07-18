// Thin-shell calculator — the user's "minimal control + on-demand behavior"
// direction, proven end-to-end against REAL captured Haiku output with NO network.
//
// All three pieces are real captured fixtures (committed as .txt so the hygiene
// gate skips them):
//   shell-calculator.code.txt   — a ~2.8 KB control: state + a single dispatch that
//                                 routes every press through runHandler, merges
//                                 res.data.state, and busy-disables the buttons.
//   handler-calc-key.code.txt   — a real on-demand handler: appends a key to expr.
//   handler-calc-equals.code.txt— a real on-demand handler: evaluates expr.
//
// Two locks:
//   (1) The real handler CODE computes correctly in the constrained scope.
//   (2) The real SHELL, driven by those handlers, renders and computes 1 + 2 = 3 —
//       i.e. the dispatch → runHandler → merge → re-render loop works on real output.
//
// This is the regression lock for the architecture; live production of these pieces
// (which is non-deterministic) is validated separately by the gated capture harness.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { instantiate } from "./instantiate";
import { transpile } from "./transpile";
import { executeHandlerSource } from "./handler";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");
const readFixture = (file: string): string =>
  readFileSync(join(FIXTURE_DIR, file), "utf8");

const SHELL = readFixture("shell-calculator.code.txt");
const KEY_HANDLER = readFixture("handler-calc-key.code.txt");
const EQUALS_HANDLER = readFixture("handler-calc-equals.code.txt");

afterEach(() => cleanup());

describe("thin-shell calculator — real handler fixtures compute in the constrained scope", () => {
  it("the key handler appends a key to expr", async () => {
    const res = await executeHandlerSource(KEY_HANDLER, {
      state: { display: "0", expr: "" },
      payload: "1",
    });
    expect(res.error).toBeUndefined();
    expect((res.data as { state: { display: string; expr: string } }).state).toEqual({
      display: "1",
      expr: "1",
    });
  });

  it("the equals handler evaluates expr", async () => {
    const res = await executeHandlerSource(EQUALS_HANDLER, {
      state: { display: "1+2", expr: "1+2" },
      payload: "=",
    });
    expect(res.error).toBeUndefined();
    expect((res.data as { state: { display: string } }).state.display).toBe("3");
  });
});

describe("thin-shell calculator — real shell driven by real on-demand handlers (no network)", () => {
  it("renders the captured shell and computes 1 + 2 = 3 through runHandler", async () => {
    // The on-demand dispatcher: route by the action embedded in the shell's stable
    // intent ("...action '='...") and run the matching REAL handler code. This is
    // exactly what the runtime runHandler does, minus the produce/cache (the
    // behavior is already captured) — so it stays deterministic and offline.
    const runHandler = (intent: string, input: unknown) =>
      executeHandlerSource(/action '='/.test(intent) ? EQUALS_HANDLER : KEY_HANDLER, input);

    const App = instantiate(
      transpile(SHELL, { filename: "calculator.tsx" }),
      undefined, // no widgets
      runHandler,
    );
    const { container } = render(createElement(App));
    const user = userEvent.setup();

    // The display is the only right-aligned region (buttons are a grid); scoping to
    // it avoids colliding with the digit buttons (e.g. a "3" button vs the result).
    const display = container.querySelector(
      'div[style*="text-align: right"]',
    ) as HTMLElement;
    expect(display).toBeTruthy();
    expect(display.textContent).toBe("0");

    const press = (name: string) =>
      user.click(screen.getByRole("button", { name }));

    await press("1");
    await waitFor(() => expect(display).toHaveTextContent("1"));
    await press("+");
    await waitFor(() => expect(display).toHaveTextContent("1+"));
    await press("2");
    await waitFor(() => expect(display).toHaveTextContent("1+2"));
    await press("=");
    await waitFor(() => expect(display.textContent).toBe("3"));
  });
});
