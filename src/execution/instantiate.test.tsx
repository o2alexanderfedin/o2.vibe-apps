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
});
