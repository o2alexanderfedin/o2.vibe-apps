import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { X, CheckCircle2 } from "lucide-react";
import { STORAGE_KEY_API } from "../lib/storage";

// Exact neutral format-error literal (UI-SPEC §Copywriting). The entered value
// is NEVER interpolated into this string (Pitfall 7 / T-01-07).
const FORMAT_ERROR = "Invalid access key format. Please check and try again.";

// Distinct neutral error for the persistence path: the key was well-formed but
// localStorage.setItem failed (quota / strict privacy). Reporting FORMAT_ERROR
// here would misdirect the user into re-editing a valid key forever. Like
// FORMAT_ERROR, this never interpolates the entered value (D-13/T-01-08).
const SAVE_ERROR = "Couldn't save your access key. Please try again.";

// Basic format validation (D-14): must start with sk-ant- and be non-empty.
function isValidKeyFormat(value: string): boolean {
  return /^sk-ant-/.test(value.trim());
}

function readStoredKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_API);
  } catch {
    return null;
  }
}

type View = "set" | "status" | "confirm-clear";

export interface KeyDialogProps {
  onClose: () => void;
}

// Set / change / clear key flows (SHELL-03, D-11..D-14). The key is never
// passed to logger.* and never echoed in any error string (D-13/T-01-08).
export function KeyDialog({ onClose }: KeyDialogProps) {
  const hasKey = readStoredKey() !== null;
  const [view, setView] = useState<View>(hasKey ? "status" : "set");
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const firstButtonRef = useRef<HTMLButtonElement | null>(null);

  // Focus the first interactive element on open / view change.
  useEffect(() => {
    if (view === "set") {
      firstFieldRef.current?.focus();
    } else {
      firstButtonRef.current?.focus();
    }
  }, [view]);

  // Escape closes; Tab is trapped within the dialog.
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
      const focusable = root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
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

  const handleConnect = useCallback(() => {
    if (!isValidKeyFormat(keyInput)) {
      // Never echo the entered value in the error (Pitfall 7).
      setError(FORMAT_ERROR);
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY_API, keyInput.trim());
    } catch {
      // Persisting can fail under strict privacy / quota; the key itself was
      // valid, so surface the save-specific error rather than the format one.
      setError(SAVE_ERROR);
      return;
    }
    onClose();
  }, [keyInput, onClose]);

  const handleDisconnect = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY_API);
    } catch {
      // ignore — best-effort clear
    }
    onClose();
  }, [onClose]);

  return (
    <div
      className="key-dialog-overlay"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        className="key-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="app-bar__icon-btn key-dialog__close"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>

        {view === "set" && (
          <>
            <div className="key-dialog__header">
              <h2 id={titleId} className="key-dialog__title">
                Connect your account
              </h2>
            </div>
            <div className="key-dialog__body">
              <p className="key-dialog__text">
                To open apps, connect your account.
              </p>
              <div className="key-dialog__input-row">
                <label className="key-dialog__label" htmlFor={`${titleId}-key`}>
                  Access key
                </label>
                <input
                  ref={firstFieldRef}
                  id={`${titleId}-key`}
                  className="key-dialog__input"
                  type="password"
                  placeholder="Paste your access key"
                  value={keyInput}
                  onChange={(e) => {
                    setKeyInput(e.target.value);
                    if (error) setError(null);
                  }}
                />
                {error && <p className="key-dialog__error">{error}</p>}
              </div>
            </div>
            <div className="key-dialog__footer">
              <button
                type="button"
                className="key-dialog__btn key-dialog__btn--text"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="key-dialog__btn key-dialog__btn--primary"
                onClick={handleConnect}
              >
                Connect
              </button>
            </div>
          </>
        )}

        {view === "status" && (
          <>
            <div className="key-dialog__header">
              <h2 id={titleId} className="key-dialog__title">
                Account
              </h2>
            </div>
            <div className="key-dialog__body">
              <p className="key-dialog__status">
                <CheckCircle2
                  size={16}
                  aria-hidden="true"
                  className="key-dialog__status-icon"
                />
                Account connected
              </p>
              <div className="key-dialog__actions">
                <button
                  ref={firstButtonRef}
                  type="button"
                  className="key-dialog__btn key-dialog__btn--text"
                  onClick={() => {
                    setKeyInput("");
                    setError(null);
                    setView("set");
                  }}
                >
                  Change key
                </button>
                <button
                  type="button"
                  className="key-dialog__btn key-dialog__btn--danger-text"
                  onClick={() => setView("confirm-clear")}
                >
                  Disconnect
                </button>
              </div>
            </div>
          </>
        )}

        {view === "confirm-clear" && (
          <>
            <div className="key-dialog__header">
              <h2 id={titleId} className="key-dialog__title">
                Account
              </h2>
            </div>
            <div className="key-dialog__body">
              <p className="key-dialog__text">
                Remove your account connection? You can reconnect at any time.
              </p>
              <div className="key-dialog__actions">
                <button
                  ref={firstButtonRef}
                  type="button"
                  className="key-dialog__btn key-dialog__btn--danger-text"
                  onClick={handleDisconnect}
                >
                  Disconnect
                </button>
                <button
                  type="button"
                  className="key-dialog__btn key-dialog__btn--text"
                  onClick={() => setView("status")}
                >
                  Keep connected
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
