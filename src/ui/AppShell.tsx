// AppShell — per-app chrome wrapper (Phase 2, SHELL-05).
//
// Each opened app renders inside an AppShell that shows the app's display
// name and a ⋮ menu button. The menu button is a stub in Phase 2; the full
// contextual prompt wiring arrives in Phase 5.
//
// The app content renders into the `app-shell__content` div. The parent
// (Marketplace) passes the component as children so the shell stays decoupled
// from the execution pipeline.

import { MoreVertical } from "lucide-react";
import type { ReactNode } from "react";

export interface AppShellProps {
  /** Human-readable display name shown in the shell header. */
  displayName: string;
  /** Called when the user requests to close this shell. */
  onClose: () => void;
  /** The rendered app content. */
  children: ReactNode;
}

export function AppShell({ displayName, onClose, children }: AppShellProps) {
  return (
    <div className="app-shell" role="region" aria-label={displayName}>
      <div className="app-shell__header">
        <span className="app-shell__title">{displayName}</span>
        <div className="app-shell__controls">
          {/* ⋮ menu stub — Phase 5 will wire contextual prompt here. */}
          <button
            type="button"
            className="app-bar__icon-btn"
            aria-label="App options"
            title="Options"
            onClick={() => {/* stub */}}
          >
            <MoreVertical size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="app-bar__icon-btn"
            aria-label={`Close ${displayName}`}
            title="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </div>
      <div className="app-shell__content">{children}</div>
    </div>
  );
}
