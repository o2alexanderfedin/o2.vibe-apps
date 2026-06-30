// ThemeEditor — custom color theme editor modal (Phase 22, THEME-06/07/10).
//
// Lets the user create or edit a custom theme by adjusting the 12 CSS custom
// properties. Every keystroke mutates :root live for instant preview without
// touching IDB. Save validates via CSS.supports, sanitizes the name via
// sanitizeDisplayName, writes to IDB + localStorage mirror, activates the
// theme via setTheme (which calls broadcastTheme to re-skin all live frames),
// and refreshes the custom themes list in context.
//
// Delete auto-switches to Aurora BEFORE removing the IDB key (CONTEXT/SC#5).
// Contrast advisory (THEME-10): checks --text vs --b1 WCAG AA ratio; non-blocking.

import {
  useState,
  useEffect,
  useCallback,
  useId,
  useRef,
  useMemo,
} from "react";
import {
  useVibeTheme,
  VIBE_THEMES,
  type AnyThemeName,
} from "./VibeThemeProvider";
import { useServices } from "../services/ServicesProvider";
import { sanitizeDisplayName } from "./sanitizeDisplayName";
import { contrastRatio } from "./contrastRatio";
import { STORAGE_KEY_OS_THEME } from "../lib/storage";

export interface ThemeEditorProps {
  /** Closes the editor. Cancel restores :root to the pre-open state. */
  onClose: () => void;
  /**
   * Pre-fill the editor with an existing theme's vars (duplicate-from-built-in
   * or edit-existing flow). When omitted, the editor defaults to Aurora values.
   */
  initialVars?: Record<string, string>;
  /**
   * When provided, the editor is in "edit existing" mode and shows a Delete
   * button. The value is the theme name WITHOUT the "custom:" prefix.
   */
  editingName?: string;
}

// Human-readable labels for the 12 CSS custom properties (neutral, no banned words).
const VAR_LABELS: Record<string, string> = {
  "--text": "Text",
  "--wall": "Background",
  "--b1": "Accent 1",
  "--b2": "Accent 2",
  "--b3": "Accent 3",
  "--b4": "Accent 4",
  "--glass": "Glass (alpha)",
  "--glass2": "Glass 2 (alpha)",
  "--bord": "Border (alpha)",
  "--hi": "Highlight (alpha)",
  "--accentA": "Accent A",
  "--accentB": "Accent B",
};

// Ordered list of the 12 CSS variable keys (from Aurora, the canonical order).
const VAR_KEYS: readonly string[] = Object.keys(VIBE_THEMES["aurora"]);

// Validate a CSS value using the browser's CSS parser. Safe in test environments
// because CSS is guarded with a typeof check before use.
function isValidValue(value: string): boolean {
  try {
    return typeof CSS !== "undefined" && CSS.supports("background", value);
  } catch {
    return false;
  }
}

export function ThemeEditor({
  onClose,
  initialVars,
  editingName,
}: ThemeEditorProps) {
  const { setTheme, refreshCustomThemes } = useVibeTheme();
  const { settingsStore } = useServices();
  const titleId = useId();
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // Theme name (without "custom:" prefix).
  const [nameInput, setNameInput] = useState<string>(editingName ?? "");

  // CSS var values — initialized from initialVars or the Aurora defaults.
  const [vars, setVars] = useState<Record<string, string>>(
    () => (initialVars ? { ...initialVars } : { ...VIBE_THEMES["aurora"] }),
  );

  // Validation error (name empty or CSS.supports rejection).
  const [error, setError] = useState<string | null>(null);

  // Separate error for IDB write failures.
  const [saveError, setSaveError] = useState<string | null>(null);

  // Snapshot of :root values at open time so Cancel can restore them.
  const originalVarsRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const root = document.documentElement;
    const snapshot: Record<string, string> = {};
    for (const key of VAR_KEYS) {
      snapshot[key] = root.style.getPropertyValue(key);
    }
    originalVarsRef.current = snapshot;
    // Intentionally runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus the name input on open.
  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  // Restore original :root vars, then call onClose (Cancel / Escape).
  const handleClose = useCallback(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(originalVarsRef.current)) {
      if (value) {
        root.style.setProperty(key, value);
      } else {
        root.style.removeProperty(key);
      }
    }
    onClose();
  }, [onClose]);

  // Live preview: update vars state and immediately mutate :root (no IDB write).
  const handleVarChange = useCallback((cssVar: string, newValue: string) => {
    setVars((prev) => ({ ...prev, [cssVar]: newValue }));
    document.documentElement.style.setProperty(cssVar, newValue);
  }, []);

  // Escape key closes (restoring :root).
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleClose();
      }
    },
    [handleClose],
  );

  // Save handler: sanitize → validate → write IDB + localStorage → activate → close.
  const handleSave = useCallback(async () => {
    setError(null);
    setSaveError(null);

    // Reject empty names before sanitization.
    if (!nameInput.trim()) {
      setError("Enter a theme name");
      return;
    }

    // Sanitize: strips banned tokens, collapses whitespace.
    const sanitized = sanitizeDisplayName(nameInput.trim());

    // CSS.supports gate: reject any invalid CSS value before any IDB write.
    for (const key of VAR_KEYS) {
      const value = vars[key] ?? "";
      if (!isValidValue(value)) {
        setError(`Invalid color value for ${VAR_LABELS[key] ?? key}`);
        return;
      }
    }

    // "custom:" prefix namespaces the key away from built-in names — even a
    // name equal to a built-in (e.g. "aurora") becomes "custom:aurora".
    const idbKey = `custom:${sanitized}` as AnyThemeName;
    const serialized = JSON.stringify(vars);

    try {
      // Write theme vars.
      await settingsStore.writeRaw(idbKey, serialized);

      // Update the enumeration index (add sanitized name if new).
      const indexRaw = await settingsStore.readRaw("customThemeIndex");
      const names: string[] = indexRaw
        ? (JSON.parse(indexRaw) as string[])
        : [];
      if (!names.includes(sanitized)) {
        names.push(sanitized);
      }
      await settingsStore.writeRaw("customThemeIndex", JSON.stringify(names));

      // Mirror to localStorage for FOUC prevention on reload (best-effort).
      try {
        localStorage.setItem(`vibe.customTheme.${sanitized}`, serialized);
        localStorage.setItem(STORAGE_KEY_OS_THEME, idbKey);
      } catch {
        // localStorage unavailable — FOUC mitigation degrades gracefully.
      }

      // Activate the new theme (updates React state, calls broadcastTheme).
      setTheme(idbKey, vars);

      // Refresh context so the switcher shows the new theme pill immediately.
      await refreshCustomThemes();

      onClose();
    } catch {
      setSaveError("Could not save the theme. Please try again.");
    }
  }, [nameInput, vars, settingsStore, setTheme, refreshCustomThemes, onClose]);

  // Delete handler: switch away FIRST, then remove from IDB + index (SC#5 ordering).
  const handleDelete = useCallback(async () => {
    if (!editingName) return;
    const idbKey = `custom:${editingName}`;

    // Auto-switch to Aurora BEFORE delete (requirement SC#5).
    setTheme("aurora");

    // Remove theme data from IDB.
    await settingsStore.deleteRaw(idbKey);

    // Remove localStorage mirror (best-effort).
    try {
      localStorage.removeItem(`vibe.customTheme.${editingName}`);
    } catch {
      // Best-effort.
    }

    // Remove from the enumeration index.
    try {
      const indexRaw = await settingsStore.readRaw("customThemeIndex");
      const names: string[] = indexRaw
        ? (JSON.parse(indexRaw) as string[])
        : [];
      const updated = names.filter((n) => n !== editingName);
      await settingsStore.writeRaw("customThemeIndex", JSON.stringify(updated));
    } catch {
      // Best-effort index cleanup.
    }

    await refreshCustomThemes();
    onClose();
  }, [editingName, setTheme, settingsStore, refreshCustomThemes, onClose]);

  // Advisory contrast warning: --text vs --b1 pair (WCAG AA threshold 4.5:1).
  // Non-blocking — Save remains enabled; warning is informational only.
  const showContrastWarning = useMemo((): boolean => {
    const ratio = contrastRatio(vars["--text"] ?? "", vars["--b1"] ?? "");
    return ratio !== null && ratio < 4.5;
  }, [vars]);

  return (
    <div
      className="theme-editor-overlay"
      onClick={handleClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="theme-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="theme-editor__title">
          {editingName ? "Edit color theme" : "New color theme"}
        </h2>

        {/* Theme name input */}
        <div className="theme-editor__field">
          <label
            className="theme-editor__label"
            htmlFor={`${titleId}-name`}
          >
            Theme name
          </label>
          <input
            ref={nameInputRef}
            id={`${titleId}-name`}
            type="text"
            className="theme-editor__input"
            value={nameInput}
            placeholder="My theme"
            onChange={(e) => {
              setNameInput(e.target.value);
              if (error) setError(null);
            }}
          />
        </div>

        {/* 12 CSS custom property inputs (one per var) */}
        <div className="theme-editor__vars">
          {VAR_KEYS.map((cssVar) => (
            <div key={cssVar} className="theme-editor__var-row">
              <label
                className="theme-editor__var-label"
                htmlFor={`${titleId}-${cssVar}`}
              >
                {VAR_LABELS[cssVar] ?? cssVar}
              </label>
              <input
                id={`${titleId}-${cssVar}`}
                type="text"
                className="theme-editor__var-input"
                value={vars[cssVar] ?? ""}
                placeholder={VIBE_THEMES["aurora"][cssVar] ?? ""}
                onChange={(e) => handleVarChange(cssVar, e.target.value)}
              />
            </div>
          ))}
        </div>

        {/* WCAG AA contrast advisory (non-blocking) */}
        {showContrastWarning && (
          <p role="alert" className="theme-editor__contrast-warning">
            Low contrast between text and accent — may be hard to read
          </p>
        )}

        {/* Validation / save error messages */}
        {error && <p className="theme-editor__error">{error}</p>}
        {saveError && <p className="theme-editor__save-error">{saveError}</p>}

        {/* Primary actions */}
        <div className="theme-editor__actions">
          <button
            type="button"
            className="theme-editor__btn theme-editor__btn--primary"
            onClick={() => void handleSave()}
          >
            Save theme
          </button>
          <button
            type="button"
            className="theme-editor__btn theme-editor__btn--text"
            onClick={handleClose}
          >
            Cancel
          </button>
        </div>

        {/* Delete button — edit mode only */}
        {editingName && (
          <div className="theme-editor__danger-zone">
            <button
              type="button"
              className="theme-editor__btn theme-editor__btn--danger"
              onClick={() => void handleDelete()}
            >
              Delete theme
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
