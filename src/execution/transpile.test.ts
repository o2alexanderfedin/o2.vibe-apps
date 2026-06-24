// @vitest-environment node
// Node environment: Babel runs fine in Node; avoids jsdom interference.
import { describe, expect, it } from "vitest";
import { transpile, TranspileError } from "./transpile";

// Minimal TSX with a TS type annotation — exercises both presets.
const COUNTER_TSX = `
function App() {
  const [count, setCount] = React.useState<number>(0);
  return React.createElement("div", null, count);
}
`;

const JSX_TSX = `
function App() {
  const label: string = "hello";
  return <div>{label}</div>;
}
`;

describe("transpile — Babel classic+TS output assertions", () => {
  it("output contains React.createElement (classic runtime)", () => {
    const out = transpile(JSX_TSX);
    expect(out).toContain("React.createElement");
  });

  it("output does NOT contain react/jsx-runtime import", () => {
    const out = transpile(JSX_TSX);
    expect(out).not.toContain("react/jsx-runtime");
    expect(out).not.toContain("_jsx");
  });

  it("TypeScript type annotations are stripped from the output", () => {
    const out = transpile(COUNTER_TSX);
    // The `: number` type annotation must not appear in output
    expect(out).not.toMatch(/:\s*number/);
    // The `: string` annotation in JSX_TSX must also be stripped
    const out2 = transpile(JSX_TSX);
    expect(out2).not.toMatch(/:\s*string/);
  });

  it("output contains React.createElement for explicit React.createElement call", () => {
    const out = transpile(COUNTER_TSX);
    expect(out).toContain("React.createElement");
  });

  it("TranspileError is thrown on invalid syntax", () => {
    expect(() => transpile("function App( { return <div> }")).toThrow(TranspileError);
  });

  it("output is a non-empty string", () => {
    const out = transpile(JSX_TSX);
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});
