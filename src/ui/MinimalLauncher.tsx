// MinimalLauncher — small app-list overlay (Phase 16, plan 16-02).
//
// A pure props-injection leaf: the shell injects the open + close callbacks.
// This is a deliberately small stub that keeps the desktop usable this phase
// (CONTEXT decision 4); Phase 17 replaces it with the full launcher. It lists
// the pre-installed catalog (APP_REGISTRY) as a grid; clicking an app opens it
// then closes the overlay. The backdrop and the close control both close;
// clicking inside the panel does not (stopPropagation). It also matches
// KeyDialog's keyboard/focus contract: aria-modal, Escape-to-close, an initial
// focus on mount, and a Tab focus trap so keyboard users stay inside the modal.

import { useCallback, useEffect, useRef } from "react";
import { X, Cloud } from "lucide-react";
import { APP_REGISTRY } from "../data/appRegistry";
import { ICONS } from "./iconForApp";

export interface MinimalLauncherProps {
  onOpen: (appType: string, displayName: string) => void;
  onClose: () => void;
}

export function MinimalLauncher({ onOpen, onClose }: MinimalLauncherProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Focus the close control on mount so keyboard focus lands inside the modal
  // (mirrors KeyDialog's initial-focus behavior).
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Escape closes; Tab is trapped within the dialog (mirrors KeyDialog).
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      // Restrict the trap boundaries to genuinely focusable controls: exclude
      // disabled elements and any node removed from the layout (display:none →
      // offsetParent === null), matching KeyDialog's trap.
      const focusable = [
        ...root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  return (
    <div
      className="launcher-overlay"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        className="launcher"
        role="dialog"
        aria-modal="true"
        aria-label="Open an app"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
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
