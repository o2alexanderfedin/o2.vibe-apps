// Widget wrapper factory (Phase 4, WIDGET-04 + WIDGET-05).
//
// `useWidget(type)` must hand the host app a component that is ALREADY isolated:
// each widget renders inside its own WidgetShell (its own `⋮` menu, independent
// of the parent app — WIDGET-04) AND its own error boundary (a render throw shows
// a neutral placeholder without crashing the parent — WIDGET-05). Rather than
// rely on the produced app code to wrap widgets correctly, the pre-warm pass maps
// each resolved RAW widget component through this factory, so the host gets shell
// + isolation for free no matter how it renders the widget.
//
// The wrapper forwards all props (`{ data?, config?, onAction? }`) to the inner
// widget unchanged, so the host's `<W data={...} />` works as written.

import { createElement, type ComponentType } from "react";
import { WidgetShell } from "./WidgetShell";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";

/**
 * Wrap a raw widget component in its own WidgetShell + per-widget ErrorBoundary.
 *
 * @param widgetType  The widget type id (drives the shell label + error logging).
 * @param Inner       The raw produced widget component.
 * @returns A component the host renders directly; isolation is built in.
 */
export function wrapWidget(
  widgetType: string,
  Inner: ComponentType,
): ComponentType {
  function WrappedWidget(props: Record<string, unknown>) {
    return (
      <WidgetShell widgetType={widgetType}>
        <WidgetErrorBoundary widgetType={widgetType}>
          {createElement(Inner, props)}
        </WidgetErrorBoundary>
      </WidgetShell>
    );
  }
  WrappedWidget.displayName = `Widget(${widgetType})`;
  return WrappedWidget as ComponentType;
}
