// @vitest-environment node
// Node environment: Babel runs fine in Node; avoids jsdom interference.
import { describe, expect, it } from "vitest";
import { transpile, transpileHandler, TranspileError } from "./transpile";

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

// --- transpileHandler (Phase 8): TS-strip only, NO react preset / NO JSX --------

// A plain TS handler with a type annotation — exercises type stripping.
const TYPED_HANDLER = `
async function handler(input: { n: number }): Promise<{ data: number }> {
  return { data: input.n + 1 };
}
`;

describe("transpileHandler — Phase 8 handler transpile (TS-strip, no react preset)", () => {
  it("strips TS type annotations from a plain handler", () => {
    const out = transpileHandler(TYPED_HANDLER);
    expect(out).not.toMatch(/:\s*number/);
    expect(out).not.toMatch(/Promise<\{/);
    expect(out).toContain("async function handler");
  });

  it("does NOT emit any React/JSX runtime references (no react preset)", () => {
    const out = transpileHandler(TYPED_HANDLER);
    expect(out).not.toContain("react/jsx-runtime");
    expect(out).not.toContain("React.createElement");
    expect(out).not.toContain("_jsx");
  });

  it("rewrites ESM export into CommonJS so it does not survive as raw ESM", () => {
    const out = transpileHandler(
      "export async function handler(input) { return { data: 1 }; }",
    );
    // The CommonJS transform must turn `export` into exports.*, never leave a bare
    // `export` keyword that would SyntaxError inside the new Function evaluator.
    expect(out).toContain("exports");
    expect(out).not.toMatch(/^\s*export\s/m);
  });

  it("plain JS (no types) passes through runnable", () => {
    const out = transpileHandler(
      "async function handler(input) { return { data: input }; }",
    );
    expect(out).toContain("async function handler");
  });

  it("throws TranspileError on a genuine syntax error", () => {
    expect(() => transpileHandler("async function handler( { return")).toThrow(
      TranspileError,
    );
  });
});
