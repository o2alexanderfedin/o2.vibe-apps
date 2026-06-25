// WidgetShell — per-widget chrome wrapper (Phase 4, WIDGET-04).
//
// Each composed widget renders inside its OWN WidgetShell, independent of the
// parent app's AppShell. The shell carries the widget's own `⋮` menu so a widget
// can be targeted for contextual modification (Phase 5) without touching its
// parent app. Like AppShell, the menu button is a stub here; Phase 5 wires the
// shared contextual prompt to it.
//
// The shell is intentionally lighter than AppShell (no close button — a widget's
// lifecycle is owned by its parent app, not the user) but keeps an independent
// `⋮` control, satisfying "its own menu, independent of the parent app".

import { MoreVertical } from "lucide-react";
import type { ReactNode } from "react";

export interface WidgetShellProps {
  /** The widget type id (e.g. "line-chart"), used for the accessible label. */
  widgetType: string;
  /** The rendered widget content. */
  children: ReactNode;
}

export function WidgetShell({ widgetType, children }: WidgetShellProps) {
  return (
    <div className="widget-shell" role="group" aria-label={widgetType}>
      <div className="widget-shell__header">
        <div className="widget-shell__controls">
          {/* Independent ⋮ menu — Phase 5 wires the contextual prompt here. */}
          <button
            type="button"
            className="app-bar__icon-btn"
            aria-label={`${widgetType} options`}
            title="Options"
            onClick={() => {
              /* stub — independent of the parent app's menu */
            }}
          >
            <MoreVertical size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="widget-shell__content">{children}</div>
    </div>
  );
}
