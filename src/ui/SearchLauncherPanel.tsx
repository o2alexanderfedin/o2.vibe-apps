// SearchLauncherPanel — full search/launcher overlay (Phase 17, CREATE-01/02/03).

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Cloud } from "lucide-react";
import { APP_REGISTRY } from "../data/appRegistry";
import { ICONS } from "./iconForApp";
import { EXAMPLE_CHIPS, slugFromText } from "./launcherUtils";

export interface SearchLauncherPanelProps {
  onOpen: (appType: string, displayName: string) => void;
  onDescribe: (text: string) => Promise<void>;
  onClose: () => void;
  isWorking?: boolean;
}

export function SearchLauncherPanel({
  onOpen,
  onDescribe,
  onClose,
  isWorking = false,
}: SearchLauncherPanelProps) {
  const [inputText, setInputText] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Focus the close button on mount — NOT the input (Pitfall 12: stealing focus
  // from the input avoids the on-screen keyboard appearing on mobile and keeps
  // the focus contract consistent with KeyDialog).
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
      // disabled elements and any node removed from the layout (offsetParent === null).
      const focusable = [
        ...root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
      );
      if (focusable.length === 0) return;
      // With a single focusable control (common while working — the input, every
      // chip, and the whole app grid go disabled together, leaving only the close
      // button), trap unconditionally: on any Tab, keep focus on the sole control.
      // The first/last wrap branches below both reference the same node and would
      // not fire if focus had drifted to the dialog container, letting native Tab
      // escape the modal.
      if (focusable.length === 1) {
        e.preventDefault();
        focusable[0]!.focus();
        return;
      }
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

  const handleSubmit = useCallback(async () => {
    const trimmed = inputText.trim();
    // Reject input that reduces to an empty slug (pure punctuation / a bare
    // article like "the "), not just whitespace-only input. Such input passes a
    // plain length check but produces an empty type slug — a blank-titled window
    // built from a degenerate empty-type prompt. Validating the slug keeps the
    // produce path coherent.
    if (slugFromText(trimmed).length === 0) return;
    await onDescribe(trimmed);
  }, [inputText, onDescribe]);

  const handleChipClick = useCallback((text: string) => {
    setInputText(text);
  }, []);

  const handleAppClick = useCallback(
    (appType: string, displayName: string) => {
      onOpen(appType, displayName);
      onClose();
    },
    [onOpen, onClose],
  );

  return (
    <div className="launcher-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
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

        <div className="launcher__search">
          <input
            type="text"
            className="launcher__input"
            placeholder="Describe an app…"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isWorking}
            aria-label="Describe an app"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                void handleSubmit();
              }
            }}
          />
          <button
            type="button"
            className="launcher__open-btn"
            onClick={() => void handleSubmit()}
            disabled={isWorking || slugFromText(inputText.trim()).length === 0}
            aria-label={isWorking ? "Working…" : "Open"}
          >
            {isWorking ? "Working…" : "Open"}
          </button>
        </div>

        {isWorking && (
          <div className="launcher__working" aria-live="polite">
            Working…
          </div>
        )}

        <div className="launcher__chips" role="group" aria-label="Example apps">
          {EXAMPLE_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="launcher__chip"
              onClick={() => handleChipClick(chip)}
              disabled={isWorking}
            >
              {chip}
            </button>
          ))}
        </div>

        <div className="launcher__grid">
          {APP_REGISTRY.map((app) => {
            const Icon = ICONS[app.icon] ?? Cloud;
            return (
              <button
                key={app.id}
                type="button"
                className="launcher__app-btn"
                aria-label={app.displayName}
                disabled={isWorking}
                onClick={() => handleAppClick(app.id, app.displayName)}
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
