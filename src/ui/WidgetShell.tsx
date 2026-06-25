// WidgetShell — per-widget chrome wrapper (Phase 4, WIDGET-04; Phase 5, MOD-01).
//
// Each composed widget renders inside its OWN WidgetShell, independent of the
// parent app's AppShell. The shell carries the widget's own `⋮` menu so a widget
// can be targeted for contextual modification WITHOUT touching its parent app.
// Phase 5 wires the SHARED contextual prompt (ContextualPrompt) to that `⋮`:
// opening it shows a popover naming the widget; on Apply the instruction is
// handed up via `onModify` so the wrapper can re-resolve THAT widget in place.
//
// The shell is intentionally lighter than AppShell (no close button — a widget's
// lifecycle is owned by its parent app, not the user) but keeps an independent
// `⋮` control, satisfying "its own menu, independent of the parent app".

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import type { ReactNode } from "react";
import { ContextualPrompt } from "./ContextualPrompt";

export interface WidgetShellProps {
  /** The widget type id (e.g. "line-chart"), used for the accessible label. */
  widgetType: string;
  /**
   * Called with the raw instruction when the user applies a contextual change
   * via the widget's `⋮` prompt (MOD-01). Optional so a shell can render
   * standalone (e.g. in isolation tests) without a modification handler.
   */
  onModify?: (instruction: string) => void;
  /** The rendered widget content. */
  children: ReactNode;
}

export function WidgetShell({
  widgetType,
  onModify,
  children,
}: WidgetShellProps) {
  const [promptOpen, setPromptOpen] = useState(false);

  function handleApply(instruction: string): void {
    setPromptOpen(false);
    onModify?.(instruction);
  }

  return (
    <div className="widget-shell" role="group" aria-label={widgetType}>
      <div className="widget-shell__header">
        <div className="widget-shell__controls">
          {/* Independent ⋮ menu — opens the shared contextual prompt (MOD-01). */}
          <button
            type="button"
            className="app-bar__icon-btn"
            aria-label={`${widgetType} options`}
            aria-haspopup="dialog"
            aria-expanded={promptOpen}
            title="Options"
            onClick={() => setPromptOpen((open) => !open)}
          >
            <MoreVertical size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      {promptOpen && (
        <ContextualPrompt
          targetName={widgetType}
          onApply={handleApply}
          onCancel={() => setPromptOpen(false)}
        />
      )}
      <div className="widget-shell__content">{children}</div>
    </div>
  );
}
