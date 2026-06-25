// Widget wrapper factory (Phase 4, WIDGET-04 + WIDGET-05; Phase 5, MOD-03).
//
// `useWidget(type)` must hand the host app a component that is ALREADY isolated:
// each widget renders inside its own WidgetShell (its own `⋮` menu, independent
// of the parent app — WIDGET-04) AND its own error boundary (a render throw shows
// a neutral placeholder without crashing the parent — WIDGET-05). Rather than
// rely on the produced app code to wrap widgets correctly, the pre-warm pass maps
// each resolved RAW widget component through this factory, so the host gets shell
// + isolation for free no matter how it renders the widget.
//
// Phase 5 (MOD-03, widget path): the wrapper is now STATEFUL so a widget can be
// tweaked IN PLACE. It holds the current inner component in state; when `services`
// is supplied, the WidgetShell's `⋮` Apply re-resolves THAT widget (via
// resolveWidgetTweak) and swaps the inner component — independent of the parent
// app, with no re-mount of the shell. A failed tweak keeps the current widget
// (resolveWidgetTweak returns null) so the widget never blanks on a bad tweak.
//
// The wrapper forwards all props (`{ data?, config?, onAction? }`) to the inner
// widget unchanged, so the host's `<W data={...} />` works as written.

import { createElement, useState, type ComponentType } from "react";
import { WidgetShell } from "./WidgetShell";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";
import { routeModification } from "../intent/routeModification";
import { resolveWidgetTweak } from "../execution/widgetPrewarm";
import type { Services } from "../services/services";
import { logger } from "../lib/logger";

/**
 * Wrap a raw widget component in its own WidgetShell + per-widget ErrorBoundary,
 * with optional in-place tweak (MOD-03).
 *
 * @param widgetType  The widget type id (drives the shell label + error logging).
 * @param Inner       The raw produced widget component.
 * @param services    When supplied, enables the widget `⋮` tweak: Apply
 *                    re-resolves this widget and swaps it in place. Omitted in
 *                    pure-render contexts (the menu still opens; remove/clone for
 *                    widgets is deferred — see Phase 5 notes).
 * @returns A component the host renders directly; isolation is built in.
 */
export function wrapWidget(
  widgetType: string,
  Inner: ComponentType,
  services?: Services,
): ComponentType {
  function WrappedWidget(props: Record<string, unknown>) {
    // The currently rendered inner component — swapped in place on a tweak.
    const [Current, setCurrent] = useState<ComponentType>(() => Inner);

    function handleModify(instruction: string): void {
      const routed = routeModification(instruction);
      // Widget remove/clone is deferred (KISS): only tweak re-resolves the
      // widget. A remove/clone instruction is a no-op here — the important
      // widget operation is the in-place tweak.
      if (routed.kind !== "tweak" || !services) return;
      void resolveWidgetTweak(widgetType, routed.instruction, services).then(
        (Next) => {
          // null → produce/instantiate failed; keep the current widget so it
          // never blanks on a bad tweak (the failure went to the gated logger).
          if (Next) {
            // Wrap in a thunk so React stores the component, not calls it.
            setCurrent(() => Next);
          } else {
            logger.info("Widget tweak: kept current widget for " + widgetType);
          }
        },
      );
    }

    return (
      <WidgetShell widgetType={widgetType} onModify={handleModify}>
        <WidgetErrorBoundary widgetType={widgetType}>
          {createElement(Current, props)}
        </WidgetErrorBoundary>
      </WidgetShell>
    );
  }
  WrappedWidget.displayName = `Widget(${widgetType})`;
  return WrappedWidget as ComponentType;
}
