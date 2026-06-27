// MenuBar — top OS chrome bar (Phase 16, plan 16-02, WIN-07).
//
// A pure props-injection leaf: the shell injects the active window's title and
// the account-open callback (the KeyDialog gate, SHELL-03). It hosts the
// relocated 4-theme switcher (moved out of the AppBar this phase) and a live
// HH:MM clock. The clock's interval is created in an effect and cleared on
// unmount so no timer leaks.

import { useEffect, useState } from "react";
import { User } from "lucide-react";
import { ThemeSelector } from "./ThemeSelector";

export interface MenuBarProps {
  /** Title of the currently focused window; null when no window is active. */
  activeName: string | null;
  /** Opens the KeyDialog (SHELL-03 — account/key management). */
  onOpenAccount: () => void;
}

// 24-hour HH:MM, locale-aware. Module-local so it is trivially unit-testable
// and carries no neutral-token risk.
function formatClock(d: Date): string {
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function MenuBar({ activeName, onOpenAccount }: MenuBarProps) {
  const [clock, setClock] = useState(() => formatClock(new Date()));

  useEffect(() => {
    const id = setInterval(() => setClock(formatClock(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header role="banner" className="menu-bar">
      <div className="menu-bar__left">
        <span className="menu-bar__wordmark">Vibe OS</span>
        {activeName && (
          <span className="menu-bar__active-app">{activeName}</span>
        )}
      </div>
      <div className="menu-bar__right">
        <ThemeSelector />
        <button
          type="button"
          className="app-bar__icon-btn"
          aria-label="Account"
          title="Account"
          onClick={onOpenAccount}
        >
          <User size={16} aria-hidden="true" />
        </button>
        <span className="menu-bar__clock" aria-live="off">
          {clock}
        </span>
      </div>
    </header>
  );
}
