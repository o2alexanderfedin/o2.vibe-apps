// Integration test: `runHandler` is wired into the produced-app `new Function`
// scope alongside `useWidget` (Phase 8, HANDLER-01 wiring decision).
//
// This proves the END-TO-END capability an app actually uses: the loader binds
// `runHandler` to the injected services and injects it into the component scope,
// so a produced app can call `runHandler(intent, input)` (2-arg) at render time,
// receive `{ data }`, and render it — with NO network/storage in test scope
// (canned transport + in-memory registry). The handler ITSELF runs in the
// constrained denylist scope, so this also exercises the full app→handler→exec
// path against a small canned handler.

import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import {
  createTestServices,
  cannedTransport,
} from "../services/testServices";
import { instantiate } from "./instantiate";
import { transpile } from "./transpile";

// A small app whose source CALLS the injected runHandler in an effect and renders
// the returned data. It uses React from the global (classic runtime) and the
// injected `runHandler(intent, input)` — exactly the 2-arg binding the loader
// provides. No imports (React + runHandler are injected).
const APP_THAT_USES_HANDLER = `
function App() {
  const [text, setText] = React.useState('loading');
  React.useEffect(() => {
    let alive = true;
    runHandler('compute a greeting', { name: 'World' }).then((res) => {
      if (!alive) return;
      setText(res && res.data ? res.data.greeting : ('err:' + (res && res.error)));
    });
    return () => { alive = false; };
  }, []);
  return React.createElement('div', { 'data-testid': 'out' }, text);
}
`;

// The canned handler the transport returns when the app's runHandler produces.
const GREETING_HANDLER = `
async function handler(input) {
  return { data: { greeting: 'Hello ' + (input && input.name) } };
}
`;

// Unmount + clear the jsdom DOM between tests so renders don't accumulate (each
// test gets a fresh in-memory registry via createTestServices defaults).
afterEach(() => {
  cleanup();
});

describe("runHandler wired into produced-app scope (HANDLER-01)", () => {
  it("a produced app calls the injected runHandler and renders { data }", async () => {
    const services = createTestServices({
      transport: cannedTransport(GREETING_HANDLER),
    });

    // Bind runHandler to services exactly as the loader's instantiateWithWidgets
    // does, then instantiate the app with it injected into the scope.
    const { runHandler } = await import("./handler");
    const bound = (intent: string, input: unknown) =>
      runHandler(intent, input, services);

    const App = instantiate(
      transpile(APP_THAT_USES_HANDLER, { filename: "app.tsx" }),
      undefined, // no widgets
      bound,
    );

    render(createElement(App));

    // The effect runs runHandler → produces the canned handler → executes it in the
    // constrained scope → returns { data } → the app renders the greeting.
    await waitFor(() =>
      expect(screen.getByTestId("out")).toHaveTextContent("Hello World"),
    );
  });

  it("an app instantiated WITHOUT a runHandler binding gets a neutral no-op (stable signature)", async () => {
    // Direct unit-style instantiation (no binding) — the default no-op resolves to
    // a neutral { error }, so the app renders the error branch without crashing.
    const App = instantiate(transpile(APP_THAT_USES_HANDLER, { filename: "app.tsx" }));
    render(createElement(App));
    await waitFor(() =>
      expect(screen.getByTestId("out")).toHaveTextContent("err:"),
    );
  });
});
