// Unit tests for the THIN-SHELL produce mode (kind: "shell").
//
// A shell is structure + state only: every interaction is routed through the
// in-scope runHandler, which produces the real behavior on demand and caches it.
// These tests pin the contract that makes that reliable (per the recorded consult,
// .planning/research/CONSULT-thin-shell-on-demand-handlers.md): the shell is the
// single source of truth — it owns the state shape, embeds it into a STABLE intent,
// returns { data: { state } }, merges/keeps-prior, and carries no business logic —
// and the prompt stays hygiene-safe.

import { describe, expect, it } from "vitest";
import { buildPrompt } from "./producer";

function expectHygieneSafe(prompt: string): void {
  expect(prompt).not.toMatch(/synthesi[sz]/i);
  expect(prompt).not.toMatch(/\bfake\b/i);
  expect(prompt).not.toMatch(/\bmock\b/i);
  expect(prompt).not.toMatch(/\bAI\b/);
  expect(prompt).not.toMatch(/\bllm\b/i);
  expect(prompt).not.toMatch(new RegExp("\\bgenerat(e|ed|ing)\\b", "i"));
}

describe("shell prompt — thin control + on-demand behavior", () => {
  const prompt = buildPrompt("calculator", "shell");

  it("asks for a MINIMAL control with ZERO business logic", () => {
    expect(prompt.toLowerCase()).toContain("minimal");
    expect(prompt.toLowerCase()).toMatch(/no business logic|zero arithmetic|business logic/);
    expect(prompt).toContain("function App()"); // the shell itself takes no props
  });

  it("routes every interaction through one async dispatch → runHandler", () => {
    expect(prompt).toContain("dispatch(action, payload)");
    expect(prompt).toContain("runHandler(");
    expect(prompt).toContain("{ state, payload }");
  });

  it("makes the shell the single source of truth (state shape owned + a busy flag)", () => {
    expect(prompt).toContain("React.useState");
    expect(prompt.toLowerCase()).toContain("busy");
    // It owns the full state shape (named, explicit initial shape).
    expect(prompt.toLowerCase()).toMatch(/state shape|initial shape/);
  });

  it("embeds the state shape in a STABLE intent and demands { data: { state } } back", () => {
    expect(prompt).toContain("STABLE");
    expect(prompt).toContain("{ data: { state } }");
    // The intent must carry the exact shape (context injection) so handlers don't drift.
    expect(prompt).toMatch(/\{ display: string/);
  });

  it("merges the returned state (delta isolation / keep-prior on miss)", () => {
    expect(prompt).toContain("setState(prev => ({ ...prev, ...res.data.state }))");
  });

  it("stays hygiene-safe and preserves the routing substring", () => {
    expectHygieneSafe(prompt);
    expect(prompt).toContain('"calculator" app');
    expect(prompt).not.toMatch(/of type "/); // never the widget-only routing token
  });
});
