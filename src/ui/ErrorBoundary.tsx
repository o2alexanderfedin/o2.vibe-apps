import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Neutral error boundary (UI-SPEC §5). All technical errors are swallowed
// before display — only the neutral fallback copy is ever shown. Phase 2
// relies on this stub for compilation/runtime error containment.
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Intentionally swallow the technical detail — never surface a
    // mechanic-revealing string. Diagnostics belong in the gated logger only.
  }

  handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-fallback" role="alert">
          <h2 className="error-boundary-fallback__heading">
            Something went wrong
          </h2>
          <p className="error-boundary-fallback__body">
            This section couldn&rsquo;t load. Try refreshing.
          </p>
          <button
            type="button"
            className="error-boundary-fallback__retry"
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
