// MinimalLauncher — small app-list overlay (Phase 16, plan 16-02).
//
// A pure props-injection leaf: the shell injects the open + close callbacks.
// This is a deliberately small stub that keeps the desktop usable this phase
// (CONTEXT decision 4); Phase 17 replaces it with the full launcher. It lists
// the pre-installed catalog (APP_REGISTRY) as a grid; clicking an app opens it
// then closes the overlay. The backdrop and the close control both close;
// clicking inside the panel does not (stopPropagation), matching KeyDialog.

import { X, Cloud } from "lucide-react";
import { APP_REGISTRY } from "../data/appRegistry";
import { ICONS } from "./iconForApp";

export interface MinimalLauncherProps {
  onOpen: (appType: string, displayName: string) => void;
  onClose: () => void;
}

export function MinimalLauncher({ onOpen, onClose }: MinimalLauncherProps) {
  return (
    <div className="launcher-overlay" onClick={onClose}>
      <div
        className="launcher"
        role="dialog"
        aria-label="Open an app"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="app-bar__icon-btn launcher__close"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>
        <div className="launcher__grid">
          {APP_REGISTRY.map((app) => {
            const Icon = ICONS[app.icon] ?? Cloud;
            return (
              <button
                key={app.id}
                type="button"
                className="launcher__app-btn"
                aria-label={app.displayName}
                onClick={() => {
                  onOpen(app.id, app.displayName);
                  onClose();
                }}
              >
                <Icon size={28} aria-hidden="true" />
                <span>{app.displayName}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
