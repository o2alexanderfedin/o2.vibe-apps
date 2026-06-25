// Tests for instantiate — ensure hooks work and App function is extracted.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { transpile } from "./transpile";
import { instantiate, InstantiateError } from "./instantiate";

afterEach(() => {
  cleanup();
});

const COUNTER_TSX = `
function App() {
  const [count, setCount] = React.useState(0);
  return (
    <div>
      <span data-testid="count">{count}</span>
      <button onClick={() => setCount(c => c + 1)}>increment</button>
    </div>
  );
}
`;

const TYPED_TSX = `
function App() {
  const label: string = "typed";
  return <span>{label}</span>;
}
`;

// Mirrors real Haiku output: components ship with `export default`.
// Before the ESM→CommonJS transform was added to transpile.ts, this `export`
// statement survived into the transpiled string and threw a SyntaxError when
// passed to `new Function(...)` — the silent-render regression this guards.
const EXPORT_DEFAULT_TSX = `
export default function App() {
  const [n, setN] = React.useState(0);
  return <button onClick={() => setN(n + 1)}>{n}</button>;
}
`;

// Named-export variant: `const App = ...; export { App };`
const EXPORT_NAMED_TSX = `
const App = () => {
  const [n, setN] = React.useState(7);
  return <span data-testid="named">{n}</span>;
};
export { App };
`;

// A component that uses an explicit `import React from "react"` — the require
// shim in instantiate must resolve this to the shared React instance.
const IMPORT_REACT_TSX = `
import React from "react";
export default function App() {
  const [n, setN] = React.useState(3);
  return <button onClick={() => setN(n + 1)}>{n}</button>;
}
`;

describe("instantiate — component factory", () => {
  it("returns a React component (function) from transpiled TSX", () => {
    const js = transpile(COUNTER_TSX);
    const Component = instantiate(js);
    expect(typeof Component).toBe("function");
  });

  it("the instantiated component renders without crashing (hooks work)", () => {
    const js = transpile(COUNTER_TSX);
    const Component = instantiate(js);
    render(<Component />);
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });

  it("useState hook is interactive — clicking increments count", () => {
    const js = transpile(COUNTER_TSX);
    const Component = instantiate(js);
    const { getByRole, getByTestId } = render(<Component />);
    const button = getByRole("button", { name: "increment" });
    fireEvent.click(button);
    expect(getByTestId("count")).toHaveTextContent("1");
  });

  it("TypeScript typed component instantiates and renders correctly", () => {
    const js = transpile(TYPED_TSX);
    const Component = instantiate(js);
    render(<Component />);
    expect(screen.getByText("typed")).toBeInTheDocument();
  });

  it("InstantiateError is thrown when transpiled code has no App function", () => {
    // Code that defines no App — should fail extraction.
    const badJs = `"use strict"; var x = 1;`;
    expect(() => instantiate(badJs)).toThrow(InstantiateError);
  });

  // --- Regression: `export default` from real Haiku-style output (the shipped bug) ---

  it("instantiates a component that uses `export default function App` and renders", () => {
    const js = transpile(EXPORT_DEFAULT_TSX);
    const Component = instantiate(js);
    expect(typeof Component).toBe("function");
    render(<Component />);
    expect(screen.getByRole("button")).toHaveTextContent("0");
  });

  it("the `export default` component is interactive (useState works after transpile+instantiate)", () => {
    const js = transpile(EXPORT_DEFAULT_TSX);
    const Component = instantiate(js);
    const { getByRole } = render(<Component />);
    const button = getByRole("button");
    fireEvent.click(button);
    expect(button).toHaveTextContent("1");
  });

  it("instantiates a component that uses a named `export { App }`", () => {
    const js = transpile(EXPORT_NAMED_TSX);
    const Component = instantiate(js);
    render(<Component />);
    expect(screen.getByTestId("named")).toHaveTextContent("7");
  });

  it("resolves `import React from \"react\"` via the require shim", () => {
    const js = transpile(IMPORT_REACT_TSX);
    const Component = instantiate(js);
    const { getByRole } = render(<Component />);
    const button = getByRole("button");
    expect(button).toHaveTextContent("3");
    fireEvent.click(button);
    expect(button).toHaveTextContent("4");
  });
});
