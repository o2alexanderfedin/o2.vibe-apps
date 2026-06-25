// Transpilation-layer coverage (jsdom): run the REAL captured fixtures plus a
// matrix of edge code shapes through transpile() and assert:
//   1. the output leaks NO bare `export` / `import` keyword (those survive into
//      the new Function() evaluator and throw a SyntaxError — the silent-render bug);
//   2. the output instantiates to a working, interactive React component.
//
// The real fixtures are the regression anchor: weather/calculator/budget are
// complete real responses (weather even uses JSX fragments + `export default`).
// All test doubles are named "canned"/"stub" (never the banned hygiene tokens).

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { transpile } from "./transpile";
import { instantiate } from "./instantiate";
import { extractCode } from "./producer";
import { codeFixture, rawFixture, type FixtureName } from "../test/fixtures/load";

afterEach(() => {
  cleanup();
});

/** No bare module keyword should survive the ESM→CommonJS transform. */
function assertNoModuleLeak(out: string): void {
  // A surviving top-level `export ...` / `import ...` statement is the failure
  // mode that throws inside new Function(). Babel rewrites them to
  // exports.* / require(...), so neither keyword should remain as a statement.
  expect(out).not.toMatch(/^\s*export\s/m);
  expect(out).not.toMatch(/^\s*import\s/m);
}

// ---------------------------------------------------------------------------
// Real captured fixtures
// ---------------------------------------------------------------------------

describe("transpile — real captured fixtures compile and instantiate", () => {
  const COMPLETE: FixtureName[] = ["weather", "calculator", "budget"];

  for (const name of COMPLETE) {
    it(`"${name}" fixture transpiles with no module-keyword leak`, () => {
      const out = transpile(codeFixture(name), { filename: `${name}.tsx` });
      assertNoModuleLeak(out);
      expect(out).toContain("React.createElement");
    });

    it(`"${name}" fixture instantiates to a function component`, () => {
      const out = transpile(codeFixture(name), { filename: `${name}.tsx` });
      const Component = instantiate(out);
      expect(typeof Component).toBe("function");
      // It mounts without throwing (renders real DOM into the container).
      const { container } = render(<Component />);
      expect(container.firstChild).not.toBeNull();
    });
  }

  it("the raw weather response (fences + prose) extracts then transpiles cleanly", () => {
    // Proves the extract→transpile pipeline on a full raw response, not just the
    // pre-extracted code: this is the exact path the producer runs.
    const code = extractCode(rawFixture("weather"));
    const out = transpile(code, { filename: "weather.tsx" });
    assertNoModuleLeak(out);
    const Component = instantiate(out);
    expect(typeof Component).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Edge code shapes — the variety of real component output
// ---------------------------------------------------------------------------

const EDGE_SHAPES: { label: string; src: string; expectText: string }[] = [
  {
    label: "export default function App()",
    src: `export default function App() {
      return <div data-testid="probe">default-fn</div>;
    }`,
    expectText: "default-fn",
  },
  {
    label: "export default Ident (const App = ...; export default App)",
    src: `const App = () => <div data-testid="probe">default-ident</div>;
      export default App;`,
    expectText: "default-ident",
  },
  {
    label: "export { App as default }",
    src: `function App() { return <div data-testid="probe">as-default</div>; }
      export { App as default };`,
    expectText: "as-default",
  },
  {
    label: "named export { App }",
    src: `const App = () => <div data-testid="probe">named-export</div>;
      export { App };`,
    expectText: "named-export",
  },
  {
    label: "JSX fragment <>…</>",
    src: `export default function App() {
      return (<><span data-testid="probe">frag-a</span><span>frag-b</span></>);
    }`,
    expectText: "frag-a",
  },
  {
    label: "TS types / interface / generics",
    src: `interface Item { id: number; label: string; }
      function pick<T>(xs: T[]): T { return xs[0]; }
      export default function App() {
        const items: Item[] = [{ id: 1, label: "typed" }];
        const first = pick<Item>(items);
        const label: string = first.label;
        return <div data-testid="probe">{label}</div>;
      }`,
    expectText: "typed",
  },
];

describe("transpile — edge code shapes leak no module keyword and render", () => {
  for (const { label, src, expectText } of EDGE_SHAPES) {
    it(`handles: ${label}`, () => {
      const out = transpile(src, { filename: "edge.tsx" });
      assertNoModuleLeak(out);
      const Component = instantiate(out);
      render(<Component />);
      expect(screen.getByTestId("probe")).toHaveTextContent(expectText);
    });
  }
});

// ---------------------------------------------------------------------------
// Named React import — require-shim interop (the subtle one)
// ---------------------------------------------------------------------------

const NAMED_REACT_IMPORT = `import React, { useState } from "react";
export default function App() {
  const [n, setN] = useState(5);
  return <button onClick={() => setN(n + 1)}>{n}</button>;
}`;

describe("transpile — named React import resolves through the require shim", () => {
  it("emits the interop wildcard require for a named import", () => {
    const out = transpile(NAMED_REACT_IMPORT, { filename: "named.tsx" });
    // Babel rewrites `import React, { useState }` to a wildcard require so the
    // named binding (useState) is read off the required module object.
    expect(out).toContain('require("react")');
    // The named hook is accessed as a member of the required module, NOT a bare
    // `useState` — so the shim's return value must expose `.useState`.
    expect(out).toMatch(/_react\.useState|\(0, _react\.useState\)/);
  });

  it("instantiates and `useState` is interactive (shim member access resolves, not undefined)", () => {
    const out = transpile(NAMED_REACT_IMPORT, { filename: "named.tsx" });
    const Component = instantiate(out);
    const { getByRole } = render(<Component />);
    const button = getByRole("button");
    // If `_react.useState` had resolved to undefined, render would have thrown
    // ("useState is not a function") before reaching here — and clicking proves
    // the resolved hook is the real, working React.useState.
    expect(button).toHaveTextContent("5");
    fireEvent.click(button);
    expect(button).toHaveTextContent("6");
  });
});
