// Dock — bottom-center app bar (Phase 16, plan 16-02, WIN-06).
//
// A pure props-injection (IoC/DI) leaf, mirroring WindowFrame: it consumes no
// window-manager hook directly (only the WindowEntry type, for the injected
// array). The shell injects the open windows plus the focus/restore/open-launcher
// callbacks, so the Dock is independently testable offline with substituted
// callbacks. It renders a magnifier (launcher) button
// followed by one icon button per open window, each with a running-indicator dot.

import { Search } from "lucide-react";
import { iconForAppType } from "./iconForApp";
import type { WindowEntry } from "./useWindowManager";

export interface DockProps {
  windows: WindowEntry[];
  onFocus: (id: string) => void;
  onRestore: (id: string) => void;
  /** Opens the launcher (Phase 17 will replace the stub). */
  onOpenLauncher: () => void;
}

export function Dock({
  windows,
  onFocus,
  onRestore,
  onOpenLauncher,
}: DockProps) {
  return (
    <nav className="dock" aria-label="Open apps">
      <button
        type="button"
        className="dock__icon dock__launch"
        aria-label="Open launcher"
        onClick={onOpenLauncher}
      >
        <Search size={26} aria-hidden="true" />
      </button>
      {windows.map((entry) => {
        const Icon = iconForAppType(entry.appType);
        return (
          <button
            key={entry.id}
            type="button"
            className="dock__icon"
            aria-label={entry.title}
            onClick={() =>
              entry.minimized ? onRestore(entry.id) : onFocus(entry.id)
            }
          >
            <Icon size={26} aria-hidden="true" />
            <span className="dock__running-dot" aria-hidden="true" />
          </button>
        );
      })}
    </nav>
  );
}
