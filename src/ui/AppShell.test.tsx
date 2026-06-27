// AppShell unit tests (Phase 16, plan 16-01; updated Phase 19, plan 19-01).
//
// Coverage:
//   1. AppShell renders children inside a labeled region (role="region") with
//      aria-label equal to displayName. No header, no buttons — content-only.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { AppShell } from "./AppShell";

afterEach(() => {
  cleanup();
});

describe("AppShell", () => {
  it("renders children inside a labeled region", () => {
    render(
      createElement(
        AppShell,
        { displayName: "Notes" },
        createElement("div", { "data-testid": "child" }, "content"),
      ),
    );

    const region = screen.getByRole("region", { name: "Notes" });
    expect(within(region).getByTestId("child")).toBeInTheDocument();
    // AppShell is content-only: no buttons (⋮ and × are in WindowFrame titlebar)
    expect(screen.queryByRole("button")).toBeNull();
  });
});
