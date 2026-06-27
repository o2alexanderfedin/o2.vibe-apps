// AppShell — per-app chrome wrapper (Phase 2, SHELL-05; Phase 5, MOD-01).
//
// Each opened app renders inside an AppShell that shows the app's display name,
// a `⋮` menu button, and a close button. Phase 5 wires the SHARED contextual
// prompt (ContextualPrompt) to the `⋮`: opening it shows a popover that names
// the target and accepts a free-form instruction. On Apply the shell hands the
// raw instruction up via `onModify` — the Marketplace routes it client-side
// (remove/clone with no model call, MOD-04; anything else a tweak, MOD-03).
//
// The app content renders into the `app-shell__content` div. The parent
// (Marketplace) passes the component as children so the shell stays decoupled
// from the execution pipeline.

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import type { ReactNode } from "react";
import { ContextualPrompt } from "./ContextualPrompt";

export interface AppShellProps {
  /** Human-readable display name shown in the shell header. */
  displayName: string;
  /** Called when the user requests to close this shell. */
  onClose: () => void;
  /**
   * Called with the raw instruction when the user applies a contextual change
   * via the `⋮` prompt (MOD-01). Optional so a shell can render without a
   * modification handler (the menu still opens; Apply is then a no-op closer).
   */
  onModify?: (instruction: string) => void;
  /**
   * When true, the inner × close button is not rendered — the surrounding
   * chrome's close (e.g. traffic-light) is authoritative.
   */
  hideClose?: boolean;
  /** The rendered app content. */
  children?: ReactNode;
}

export function AppShell({
  displayName,
  onClose,
  onModify,
  hideClose = false,
  children,
}: AppShellProps) {
  const [promptOpen, setPromptOpen] = useState(false);

  function handleApply(instruction: string): void {
    setPromptOpen(false);
    onModify?.(instruction);
  }

  return (
    <div className="app-shell" role="region" aria-label={displayName}>
      <div className="app-shell__header">
        <span className="app-shell__title">{displayName}</span>
        <div className="app-shell__controls">
          {/* ⋮ menu — opens the shared contextual prompt (MOD-01). */}
          <button
            type="button"
            className="app-bar__icon-btn"
            aria-label="App options"
            aria-haspopup="dialog"
            aria-expanded={promptOpen}
            title="Options"
            onClick={() => setPromptOpen((open) => !open)}
          >
            <MoreVertical size={20} aria-hidden="true" />
          </button>
          {!hideClose && (
            <button
              type="button"
              className="app-bar__icon-btn"
              aria-label={`Close ${displayName}`}
              title="Close"
              onClick={onClose}
            >
              ×
            </button>
          )}
        </div>
      </div>
      {promptOpen && (
        <ContextualPrompt
          targetName={displayName}
          onApply={handleApply}
          onCancel={() => setPromptOpen(false)}
        />
      )}
      <div className="app-shell__content">{children}</div>
    </div>
  );
}
