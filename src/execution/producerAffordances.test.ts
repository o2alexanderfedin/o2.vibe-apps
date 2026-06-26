// Unit tests for the APP prompt's optional widget + data-helper affordances.
//
// Earlier the runtime injected `useWidget` and `runHandler` into every produced
// app's scope, but the app prompt never told the model they existed — so real
// apps never composed sub-widgets or ran backend-style data operations. These
// tests pin the activation: the app prompt now surfaces both helpers, with the
// `// @widget <type>` declaration convention, exact call templates, and explicit
// NO-OP / negative constraints that keep simple apps self-contained — and it all
// stays hygiene-safe (HYGIENE-03) and preserves the routing substring.
//
// Test doubles are named "canned"/"stub" elsewhere; this file is pure-function
// assertions over buildPrompt, so it needs none.

import { describe, expect, it } from "vitest";
import { buildPrompt } from "./producer";

// The banned lexicon (mirrors src/hygiene.test.ts). The prompt is authored source
// AND is sent over the wire (devtools-visible), so it must carry none of these.
function expectHygieneSafe(prompt: string): void {
  expect(prompt).not.toMatch(/synthesi[sz]/i);
  expect(prompt).not.toMatch(/\bfake\b/i);
  expect(prompt).not.toMatch(/\bmock\b/i);
  expect(prompt).not.toMatch(/\bAI\b/); // case-sensitive exact word
  expect(prompt).not.toMatch(/\bllm\b/i);
  expect(prompt).not.toMatch(new RegExp("\\bgenerat(e|ed|ing)\\b", "i"));
}

describe("app prompt — widget composition affordance (WIDGET-01 activation)", () => {
  it("declares the `@widget <type>` convention and the useWidget accessor", () => {
    const prompt = buildPrompt("dashboard");
    // The declaration convention parseWidgetDeps() actually pre-warms.
    expect(prompt).toContain("// @widget");
    // The synchronous accessor injected into the component scope.
    expect(prompt).toContain("useWidget");
    // The props a sub-widget accepts (mirrors the widget-kind contract).
    expect(prompt).toContain("data?");
    expect(prompt).toContain("onAction?");
  });

  it("caps sub-widgets and frames the helpers as optional (NO-OP guidance)", () => {
    const prompt = buildPrompt("dashboard");
    // Conservative blast radius: at most two declared widgets (each is an eager
    // pre-warm produce on a miss).
    expect(prompt.toLowerCase()).toContain("at most two");
    // Optional + a stay-simple signal so single-purpose apps don't over-compose.
    expect(prompt).toMatch(/optional|reach for them when/);
    expect(prompt.toLowerCase()).toMatch(/single-purpose|self-contained/);
  });
});

describe("app prompt — backend-style data helper affordance (HANDLER-01 activation)", () => {
  it("surfaces runHandler(intent, input) → { data } / { error }", () => {
    const prompt = buildPrompt("expenses");
    expect(prompt).toContain("runHandler(");
    expect(prompt).toMatch(/\{ data \}/);
    expect(prompt).toMatch(/\{ error \}/);
    // Tells the model how to call it (async, inside an effect/handler).
    expect(prompt.toLowerCase()).toContain("await");
  });
});

describe("app prompt — preserved contract + hygiene", () => {
  it("keeps the base app contract (App(), no imports, the type, routing substring)", () => {
    const prompt = buildPrompt("weather");
    expect(prompt).toContain("function App()"); // the app itself takes no props
    expect(prompt.toLowerCase()).toContain("import"); // still forbids imports
    expect(prompt).toContain('"weather" app'); // load-bearing routing substring
  });

  it("never contains the widget-only `of type \"…\"` routing substring", () => {
    // The app/widget routing seam matches `of type "<type>"` for widgets FIRST; an
    // app prompt that leaked it would misroute. Guard that it never does.
    expect(buildPrompt("weather")).not.toMatch(/of type "/);
  });

  it("stays hygiene-safe with the affordances added", () => {
    expectHygieneSafe(buildPrompt("weather"));
    // Also safe when a tweak instruction is woven in (the affordances persist).
    expectHygieneSafe(buildPrompt("weather", "app", "add a small chart"));
  });
});

describe("affordances are scoped to the app prompt only", () => {
  it("the widget prompt does NOT tell widgets to call runHandler (no binding in widget scope)", () => {
    // Widgets are instantiated by widgetPrewarm WITHOUT a runHandler binding, so
    // the widget prompt must not advertise it (it would resolve to the neutral
    // no-op). Guard against accidental leakage.
    expect(buildPrompt("line-chart", "widget")).not.toContain("runHandler");
  });

  it("the handler prompt does NOT leak the React/widget affordance text", () => {
    const prompt = buildPrompt("filter a list", "handler");
    expect(prompt).not.toContain("useWidget");
    expect(prompt).not.toContain("// @widget");
  });
});
