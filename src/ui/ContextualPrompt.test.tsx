// Unit tests for the shared contextual prompt popover (Phase 5, MOD-01).
//
// The popover is a thin, reusable input surface — it names the target, takes a
// free-form instruction, and emits Cancel/Apply. These RTL (jsdom) tests pin that
// contract independent of either shell. No model, no services — pure UI.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextualPrompt } from "./ContextualPrompt";

afterEach(cleanup);

describe("ContextualPrompt (MOD-01)", () => {
  it("names the target it will modify", () => {
    render(
      <ContextualPrompt targetName="Notes" onApply={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByText("Modify: Notes")).toBeInTheDocument();
  });

  it("Apply is disabled until the instruction is non-empty, then emits the trimmed text", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(
      <ContextualPrompt targetName="Notes" onApply={onApply} onCancel={() => {}} />,
    );

    const apply = screen.getByRole("button", { name: "Apply" });
    expect(apply).toBeDisabled();

    await user.type(screen.getByRole("textbox"), "  make it bigger  ");
    expect(apply).toBeEnabled();
    await user.click(apply);
    expect(onApply).toHaveBeenCalledWith("make it bigger");
  });

  it("Cancel emits onCancel and never onApply", async () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ContextualPrompt targetName="Timer" onApply={onApply} onCancel={onCancel} />,
    );

    await user.type(screen.getByRole("textbox"), "remove");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("copy stays neutral (no mechanic-revealing tokens in the rendered popover)", () => {
    const { container } = render(
      <ContextualPrompt targetName="Budget" onApply={() => {}} onCancel={() => {}} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/synthesi[sz]/i);
    expect(text).not.toMatch(new RegExp("\\bgenerat(e|ed|ing)\\b", "i"));
    expect(text).not.toMatch(/\bAI\b/);
  });
});
