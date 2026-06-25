// Unit tests for the `@widget` dependency parser (WIDGET-01).
//
// Pure-function tests: no IO, no doubles needed. They cover the declared-form
// grammar, de-duplication, order stability, and the negative cases (block
// comments, mid-line occurrences, malformed tokens) so the pre-warm pass can
// trust the parser's output.

import { describe, expect, it } from "vitest";
import { parseWidgetDeps } from "./widgetParse";

describe("parseWidgetDeps — `@widget <type>` extraction (WIDGET-01)", () => {
  it("extracts a single declared widget", () => {
    const src = `// @widget line-chart\nfunction App() { return null; }`;
    expect(parseWidgetDeps(src)).toEqual(["line-chart"]);
  });

  it("extracts multiple declared widgets in first-seen order", () => {
    const src = [
      "// @widget stat-card",
      "// @widget line-chart",
      "// @widget data-table",
      "function App() { return useWidget('stat-card'); }",
    ].join("\n");
    expect(parseWidgetDeps(src)).toEqual([
      "stat-card",
      "line-chart",
      "data-table",
    ]);
  });

  it("de-duplicates a type declared more than once", () => {
    const src = `// @widget chart\n// @widget chart\n// @widget table`;
    expect(parseWidgetDeps(src)).toEqual(["chart", "table"]);
  });

  it("tolerates extra whitespace around the directive", () => {
    const src = "   //   @widget   spark-line   ";
    expect(parseWidgetDeps(src)).toEqual(["spark-line"]);
  });

  it("returns [] for source with no declarations", () => {
    const src = `function App() { return React.createElement("div"); }`;
    expect(parseWidgetDeps(src)).toEqual([]);
  });

  it("ignores a `@widget` token appearing mid-line (not a line comment)", () => {
    // Inside a string literal mid-line: must NOT be treated as a declaration.
    const src = `const note = "see // @widget chart for details";`;
    expect(parseWidgetDeps(src)).toEqual([]);
  });

  it("ignores a block-comment form (only the // line form is a declaration)", () => {
    const src = `/* @widget chart */\nfunction App() { return null; }`;
    expect(parseWidgetDeps(src)).toEqual([]);
  });

  it("ignores a malformed type token (uppercase / spaces / symbols)", () => {
    const src = [
      "// @widget Line_Chart", // underscore + uppercase → rejected
      "// @widget two words", // second word makes the line invalid
      "// @widgetnospace", // no separating space → not a directive
    ].join("\n");
    expect(parseWidgetDeps(src)).toEqual([]);
  });

  it("accepts digits within the kebab type id", () => {
    const src = "// @widget chart-v2";
    expect(parseWidgetDeps(src)).toEqual(["chart-v2"]);
  });

  it("is order-stable across repeated calls (no leaked regex state)", () => {
    const src = `// @widget a\n// @widget b`;
    expect(parseWidgetDeps(src)).toEqual(["a", "b"]);
    // A second call must yield the SAME result (guards the module-level regex
    // `lastIndex` from leaking between invocations).
    expect(parseWidgetDeps(src)).toEqual(["a", "b"]);
  });
});
