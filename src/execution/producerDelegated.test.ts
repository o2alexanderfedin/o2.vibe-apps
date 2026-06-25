// Unit tests for the DELEGATED produce mode (kind: "delegated").
//
// The delegated module is behavior-free: it exports the state SSOT (initialState), a
// markup-only view whose interactive elements carry data-action and no handlers, and
// a precise actionSpec contract. These tests pin that contract and the hygiene.

import { describe, expect, it } from "vitest";
import { buildPrompt, buildRepairPrompt, buildLengthPrompt } from "./producer";

function expectHygieneSafe(prompt: string): void {
  expect(prompt).not.toMatch(/synthesi[sz]/i);
  expect(prompt).not.toMatch(/\bfake\b/i);
  expect(prompt).not.toMatch(/\bmock\b/i);
  expect(prompt).not.toMatch(/\bAI\b/);
  expect(prompt).not.toMatch(/\bllm\b/i);
  expect(prompt).not.toMatch(new RegExp("\\bgenerat(e|ed|ing)\\b", "i"));
}

describe("delegated prompt — behavior-free view module", () => {
  const prompt = buildPrompt("calculator", "delegated");

  it("asks for the three exports: initialState, view, actionSpec", () => {
    expect(prompt).toContain("initialState");
    expect(prompt).toContain("view(state)");
    expect(prompt).toContain("actionSpec");
    expect(prompt).toContain("export { initialState, view, actionSpec }");
  });

  it("requires data-action markup with NO handlers (behavior-free)", () => {
    expect(prompt).toContain("data-action");
    expect(prompt.toLowerCase()).toContain("no onclick");
    expect(prompt.toLowerCase()).toMatch(/behavior-free|no behavior|no event handlers/);
  });

  it("requires INLINE styles for layout (no stylesheet / no CSS framework)", () => {
    // The app ships no stylesheet, so className/Tailwind classes silently no-op and
    // the layout collapses. The view must inline-style its layout (grid keypad, etc.).
    expect(prompt).toContain("inline style");
    expect(prompt.toLowerCase()).toMatch(/no external stylesheet|no css framework/);
    expect(prompt).toContain("gridTemplateColumns");
  });

  it("forbids imports and is hygiene-safe + preserves the routing substring", () => {
    expect(prompt.toLowerCase()).toContain("import");
    expect(prompt).toContain('"calculator" app');
    expect(prompt).not.toMatch(/of type "/);
    expectHygieneSafe(prompt);
  });

  it("repair + length prompts keep the delegated export contract and stay hygiene-safe", () => {
    const repair = buildRepairPrompt("calculator", "const x=1", "some error", "delegated");
    expect(repair).toContain("export { initialState, view, actionSpec }");
    expect(repair).toContain("data-action");
    expectHygieneSafe(repair);

    const length = buildLengthPrompt("calculator", "delegated");
    expect(length).toContain("export { initialState, view, actionSpec }");
    expect(length).toContain("data-action");
    expectHygieneSafe(length);
  });
});
