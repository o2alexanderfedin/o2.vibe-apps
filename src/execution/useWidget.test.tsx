// Unit tests for the synchronous `useWidget` accessor (WIDGET-03).
//
// `useWidget(type)` must be a pure synchronous `Map.get` over the pre-warmed
// widget-component map: it returns the resolved component immediately at render
// time and NEVER triggers async work. These tests assert that contract directly
// (makeUseWidget) and through the instantiation seam (a produced component that
// calls useWidget and renders the result on first paint).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement, type ComponentType } from "react";
import { transpile } from "./transpile";
import { instantiate, makeUseWidget } from "./instantiate";

afterEach(() => {
  cleanup();
});

// A trivial resolved widget component used as the map value.
function StubWidget() {
  return createElement("div", { "data-testid": "stub-widget" }, "stub-widget-content");
}

describe("makeUseWidget — synchronous Map.get accessor (WIDGET-03)", () => {
  it("returns the resolved component synchronously for a declared type", () => {
    const map = new Map<string, ComponentType>([["line-chart", StubWidget]]);
    const useWidget = makeUseWidget(map);
    // Pure synchronous read — the return is the component, not a promise.
    const result = useWidget("line-chart");
    expect(result).toBe(StubWidget);
    expect(typeof (result as unknown as () => unknown)).toBe("function");
  });

  it("returns null for an undeclared/absent type (no throw, no async)", () => {
    const useWidget = makeUseWidget(new Map());
    expect(useWidget("not-declared")).toBeNull();
  });

  it("does NOT call any timer/microtask scheduling at lookup time", () => {
    // Guards "never triggers async work during render": the accessor must not
    // schedule timers or resolve promises — it is a plain map read.
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const map = new Map<string, ComponentType>([["x", StubWidget]]);
    const useWidget = makeUseWidget(map);
    useWidget("x");
    useWidget("missing");
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });
});

describe("instantiate — injects useWidget so produced code resolves widgets synchronously", () => {
  // A host component whose produced source calls useWidget and renders it.
  const HOST_TSX = `
function App() {
  const Chart = useWidget("line-chart");
  return Chart ? <Chart /> : <span data-testid="no-widget">none</span>;
}
`;

  it("a produced component renders the resolved widget on first paint (no pop-in)", () => {
    const map = new Map<string, ComponentType>([["line-chart", StubWidget]]);
    const js = transpile(HOST_TSX, { filename: "host.tsx" });
    const Host = instantiate(js, makeUseWidget(map));
    // First synchronous render already shows the widget content — nothing async.
    render(createElement(Host));
    expect(screen.getByTestId("stub-widget")).toBeInTheDocument();
    expect(screen.getByText("stub-widget-content")).toBeInTheDocument();
  });

  it("a produced component renders its fallback when the widget is absent (useWidget → null)", () => {
    const js = transpile(HOST_TSX, { filename: "host.tsx" });
    // No widget in the map → useWidget("line-chart") returns null synchronously.
    const Host = instantiate(js, makeUseWidget(new Map()));
    render(createElement(Host));
    expect(screen.getByTestId("no-widget")).toBeInTheDocument();
  });

  it("the default (no map) useWidget returns null — apps with no widgets still instantiate", () => {
    const js = transpile(HOST_TSX, { filename: "host.tsx" });
    const Host = instantiate(js); // default NULL accessor
    render(createElement(Host));
    expect(screen.getByTestId("no-widget")).toBeInTheDocument();
  });
});
