// AppShell unit tests (Phase 16, plan 16-01).
//
// Coverage:
//   1. Without hideClose → inner × close button renders (default/standalone behavior).
//   2. With hideClose={true} → inner × close button is suppressed.
//   3. With hideClose={true} → ⋮ "App options" button still renders.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { createElement } from "react";
import { AppShell } from "./AppShell";

afterEach(() => {
  cleanup();
});

describe("AppShell", () => {
  it("renders the inner × close button by default (no hideClose)", () => {
    render(
      createElement(
        AppShell,
        {
          displayName: "Notes",
          onClose: vi.fn(),
        },
        createElement("div", null, "content"),
      ),
    );

    // The inner × close button should be present with aria-label "Close Notes"
    expect(
      screen.getByRole("button", { name: "Close Notes" }),
    ).toBeInTheDocument();
  });

  it("suppresses the inner × close button when hideClose={true}", () => {
    render(
      createElement(
        AppShell,
        {
          displayName: "Notes",
          onClose: vi.fn(),
          hideClose: true,
        },
        createElement("div", null, "content"),
      ),
    );

    // The inner × close button must NOT be present when framed
    const closeBtn = screen.queryByRole("button", { name: "Close Notes" });
    expect(closeBtn).toBeNull();
  });

  it("still renders the ⋮ App options button when hideClose={true}", () => {
    render(
      createElement(
        AppShell,
        {
          displayName: "Notes",
          onClose: vi.fn(),
          hideClose: true,
        },
        createElement("div", null, "content"),
      ),
    );

    // The ⋮ options button must remain even when hideClose suppresses the ×
    expect(
      screen.getByRole("button", { name: "App options" }),
    ).toBeInTheDocument();
  });
});
