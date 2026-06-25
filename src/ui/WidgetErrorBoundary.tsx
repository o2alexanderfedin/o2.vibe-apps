// Per-widget error boundary (Phase 4, WIDGET-05).
//
// A widget that throws at render is caught HERE — independently of the parent
// app's boundary — and replaced with a neutral, widget-sized placeholder. The
// parent app and the widget's siblings keep working: one bad widget never
// crashes or blanks the app (per-widget isolation).
//
// The fallback copy is neutral and mechanic-free (HYGIENE): it does not reveal
// that the widget is produced on demand, and the technical error is swallowed
// (diagnostics go only to the gated logger via componentDidCatch).

import { Component, type ErrorInfo, type ReactNode } from "react";
import { logger } from "../lib/logger";

interface WidgetErrorBoundaryProps {
  /** The widget type id — used only for gated diagnostics, never shown to the user. */
  widgetType: string;
  children: ReactNode;
}

interface WidgetErrorBoundaryState {
  hasError: boolean;
}

export class WidgetErrorBoundary extends Component<
  WidgetErrorBoundaryProps,
  WidgetErrorBoundaryState
> {
  state: WidgetErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): WidgetErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    // Swallow the technical detail from the UI; log it behind the gated logger.
    logger.error(
      "Widget render error in " + this.props.widgetType + ": " + error.message,
    );
  }

  // Neutral retry (RESIL-01): clears the error so the widget's children re-render
  // on the next pass. If the underlying cause was transient (a flaky effect, a
  // resolved tweak), the widget recovers in place without taking down its parent.
  handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Neutral, widget-sized placeholder with a retry — no mechanic-revealing
      // language. The retry actually re-renders the widget's children.
      return (
        <div className="widget-placeholder" role="note">
          <span className="widget-placeholder__body">Unavailable right now.</span>
          <button
            type="button"
            className="widget-placeholder__retry"
            onClick={this.handleRetry}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
