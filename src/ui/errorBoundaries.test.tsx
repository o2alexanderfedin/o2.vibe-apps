// Error-boundary retry tests (Phase 6, RESIL-01).
//
// RESIL-01 requires that BOTH an app render error and a widget render error are
// caught by their own boundary with a NEUTRAL retry that ACTUALLY re-renders. We
// test each boundary with a component that throws on its first render, then
// succeeds — so clicking "Try again" must clear the error and show the recovered
// content. No mechanic-revealing copy is ever shown.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "./ErrorBoundary";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";

afterEach(cleanup);

/**
 * A component that throws on its first render and renders `recovered` text on
 * every render after a module-level flag is flipped. The flag is reset per test
 * via the factory so tests don't share state.
 */
function makeFlakyComponent(recoveredText: string) {
  let shouldThrow = true;
  function Flaky() {
    if (shouldThrow) {
      throw new Error("render-mechanic-detail-should-be-swallowed");
    }
    return <span>{recoveredText}</span>;
  }
  const stopThrowing = () => {
    shouldThrow = false;
  };
  return { Flaky, stopThrowing };
}

describe("ErrorBoundary (app) — RESIL-01 catch + neutral retry re-renders", () => {
  it("catches a render error, shows neutral copy, and the retry re-renders", async () => {
    const user = userEvent.setup();
    const { Flaky, stopThrowing } = makeFlakyComponent("App recovered");

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );

    // Neutral fallback — no mechanic-revealing detail leaked.
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText(/something went wrong/i)).toBeInTheDocument();
    expect(alert.textContent ?? "").not.toContain("mechanic-detail");

    // Stop throwing, then click Try again → the children re-render successfully.
    stopThrowing();
    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("App recovered")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("WidgetErrorBoundary — RESIL-01 catch + neutral retry re-renders", () => {
  it("catches a widget render error, shows a neutral placeholder, and the retry re-renders", async () => {
    const user = userEvent.setup();
    const { Flaky, stopThrowing } = makeFlakyComponent("Widget recovered");

    render(
      <WidgetErrorBoundary widgetType="line-chart">
        <Flaky />
      </WidgetErrorBoundary>,
    );

    // Neutral, widget-sized placeholder — no mechanic-revealing detail.
    const note = screen.getByRole("note");
    expect(within(note).getByText(/unavailable right now/i)).toBeInTheDocument();
    expect(note.textContent ?? "").not.toContain("mechanic-detail");

    // Retry actually re-renders the widget children once they stop throwing.
    stopThrowing();
    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("Widget recovered")).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("a throwing widget does not propagate to a parent boundary (isolation)", () => {
    const { Flaky } = makeFlakyComponent("never shown");

    // The widget boundary contains the throw; the OUTER app boundary stays clean.
    render(
      <ErrorBoundary>
        <div>
          <span>sibling stays</span>
          <WidgetErrorBoundary widgetType="line-chart">
            <Flaky />
          </WidgetErrorBoundary>
        </div>
      </ErrorBoundary>,
    );

    // The widget shows its own placeholder; the sibling content survives and the
    // app-level "Something went wrong" fallback never fires.
    expect(screen.getByText("sibling stays")).toBeInTheDocument();
    expect(screen.getByText(/unavailable right now/i)).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });
});
