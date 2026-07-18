// AppShell — per-app content wrapper (Phase 2, SHELL-05; Phase 19, plan 19-01).
//
// Phase 19: the app-shell header (duplicate title + ⋮ + close button) has been
// moved to WindowFrame's titlebar, making the app body a chrome-free zone ready
// for Phase 20 (iframe isolation). AppShell is now a minimal content wrapper:
// role="region" labeled by displayName so a11y queries still work, and a
// app-shell__content div for the rendered app component.

import type { ReactNode } from "react";

export interface AppShellProps {
  /** Human-readable display name used as the region aria-label. */
  displayName: string;
  /** The rendered app content. */
  children?: ReactNode;
}

export function AppShell({ displayName, children }: AppShellProps) {
  return (
    <div className="app-shell" role="region" aria-label={displayName}>
      <div className="app-shell__content">{children}</div>
    </div>
  );
}
