// Delegated thin shell — event delegation as the on-demand-handler mechanism.
//
// The user's refinement: keep ONE permanent container-level handler; the produced
// markup is pure structure (buttons carry `data-action` and have NO per-button
// onClick). A click bubbles to the container delegate, which identifies the action
// and routes to the on-demand handler (runHandler). Because runHandler PRODUCES each
// action's handler once and then CACHES it, a re-click is an O(1) cache hit — the
// React-idiomatic equivalent of "attach the handler to the element forever" (no
// manual DOM attach / stopPropagation needed).
//
// This locks the mechanism with the REAL captured handler fixtures and the REAL
// runHandler (in-memory registry + a canned transport that stands in for the model),
// so it is deterministic and offline. It proves:
//   1. A button with NO onClick is driven purely by the container delegate.
//   2. 1 + 2 = 3 computes through delegation.
//   3. Produce-once: re-clicking a warmed key is a cache hit (transport not re-hit).

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
import { runHandler } from "./handler";
import { createInMemoryRegistry } from "../services/testServices";
import { createTestServices } from "../services/testServices";
import type { TransportFn, MessagesResponse } from "../host/modelClient";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");
const read = (f: string): string => readFileSync(join(FIXTURE_DIR, f), "utf8");
const KEY_HANDLER = read("handler-calc-key.code.txt");
const EQUALS_HANDLER = read("handler-calc-equals.code.txt");

// A delegated calculator shell: ONE container onClick; buttons carry data-action and
// have NO onClick of their own. (Written with React.createElement so the test source
// stays plain; a produced shell would use JSX — transpile handles either.)
const DELEGATED_SHELL = `
function App() {
  const [state, setState] = React.useState({ display: "0", expr: "" });
  const onContainerClick = async (e) => {
    const el = e.target && e.target.closest ? e.target.closest("[data-action]") : null;
    if (!el) return;
    const action = el.getAttribute("data-action");
    const intent = "calculator action '" + action + "': state is { display: string, expr: string }; input { state, payload }; return { data: { state } } with the same shape";
    const res = await runHandler(intent, { state, payload: action });
    if (res && res.data && res.data.state) {
      setState(function (prev) { return Object.assign({}, prev, res.data.state); });
    }
  };
  const keys = ["7","8","9","/","4","5","6","*","1","2","3","-","0",".","=","+"];
  return React.createElement(
    "div",
    { onClick: onContainerClick, "data-testid": "calc" },
    React.createElement("div", { "data-testid": "display" }, state.display),
    React.createElement(
      "div",
      null,
      keys.map(function (k) {
        return React.createElement("button", { key: k, "data-action": k }, k);
      })
    )
  );
}
`;

// A canned transport that returns the matching REAL handler fixture for the produced
// intent, counting how many times each action is actually produced (cache misses).
function countingTransport(): { transport: TransportFn; produces: Record<string, number> } {
  const produces: Record<string, number> = {};
  const transport: TransportFn = (_url, init) => {
    const body = JSON.parse(init.body as string) as { messages: Array<{ content: string }> };
    const content = body.messages[0]?.content ?? "";
    const m = content.match(/action '([^']+)'/);
    const action = m?.[1] ?? "?";
    produces[action] = (produces[action] ?? 0) + 1;
    const text = action === "=" ? EQUALS_HANDLER : KEY_HANDLER;
    return Promise.resolve<MessagesResponse>({
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
    });
  };
  return { transport, produces };
}

function renderDelegatedCalc() {
  const { transport, produces } = countingTransport();
  const services = createTestServices({ transport, registry: createInMemoryRegistry() });
  const bound = (intent: string, input: unknown) => runHandler(intent, input, services);
  const App = instantiate(transpile(DELEGATED_SHELL, { filename: "calc.tsx" }), undefined, bound);
  const result = render(createElement(App));
  return { ...result, produces, user: userEvent.setup() };
}

afterEach(() => cleanup());

describe("delegated shell — one container handler, on-demand per-element behavior", () => {
  it("drives a button that has NO onClick of its own (pure container delegation)", async () => {
    const { user } = renderDelegatedCalc();
    const display = screen.getByTestId("display");
    expect(display).toHaveTextContent("0");

    // The "1" button has no onClick — only data-action. The container delegate
    // produces + runs its handler on demand and updates state.
    await user.click(screen.getByRole("button", { name: "1" }));
    await waitFor(() => expect(display).toHaveTextContent("1"));
  });

  it("computes 1 + 2 = 3 entirely through the container delegate", async () => {
    const { user } = renderDelegatedCalc();
    const display = screen.getByTestId("display");
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

  it("produce-once: re-clicking a warmed key is a cache hit (handler not re-produced)", async () => {
    const { user, produces } = renderDelegatedCalc();
    const display = screen.getByTestId("display");

    await user.click(screen.getByRole("button", { name: "1" }));
    await waitFor(() => expect(display).toHaveTextContent("1"));
    await user.click(screen.getByRole("button", { name: "1" }));
    await waitFor(() => expect(display).toHaveTextContent("11"));

    // The "1" handler was produced exactly once; the second click hit the cache.
    expect(produces["1"]).toBe(1);
  });
});
