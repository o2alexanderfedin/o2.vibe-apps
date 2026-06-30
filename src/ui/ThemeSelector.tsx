import {
  useVibeTheme,
  VIBE_THEMES,
  type VibeThemeName,
  type AnyThemeName,
} from "./VibeThemeProvider";

// Human-readable pill labels for each named theme. Neutral, display-only.
const THEME_LABELS: Record<VibeThemeName, string> = {
  aurora: "Aurora",
  aero: "Aero",
  aqua: "Aqua",
  noir: "Noir",
};

// Render order for the pills (mirrors the theme contract order).
const THEME_NAMES: ReadonlyArray<VibeThemeName> = [
  "aurora",
  "aero",
  "aqua",
  "noir",
];

/**
 * Callback shape for opening the ThemeEditor. Called without arguments to open
 * a blank editor (New Theme); called with initialVars to duplicate a built-in;
 * called with initialVars + editingName to edit an existing custom theme.
 * Phase 22 (THEME-07/08).
 */
export interface ThemeSelectorProps {
  onOpenThemeEditor: (opts?: {
    initialVars?: Record<string, string>;
    editingName?: string;
  }) => void;
}

// A small inline row of pills that switches the active named theme. Custom
// theme pills are added after the four built-in pills when the VibeThemeContext
// has saved custom themes (Phase 22, THEME-07/08). A "New Theme" button opens
// the ThemeEditor blank; "Duplicate" on a built-in opens it pre-filled with
// that theme's vars; "Edit" on a custom theme opens it for editing.
export function ThemeSelector({ onOpenThemeEditor }: ThemeSelectorProps) {
  const { theme, setTheme, customThemes } = useVibeTheme();
  return (
    <div className="theme-selector" role="group" aria-label="Color theme">
      {/* Four built-in theme pills — each with an adjacent Duplicate button. */}
      {THEME_NAMES.map((name) => (
        <div key={name} className="theme-selector__pill-wrapper">
          <button
            type="button"
            className={`theme-selector__pill${
              theme === name ? " theme-selector__pill--active" : ""
            }`}
            aria-pressed={theme === name}
            onClick={() => setTheme(name)}
          >
            {THEME_LABELS[name]}
          </button>
          <button
            type="button"
            className="theme-selector__duplicate"
            aria-label={`Duplicate ${THEME_LABELS[name]}`}
            onClick={() => onOpenThemeEditor({ initialVars: VIBE_THEMES[name] })}
          >
            Duplicate
          </button>
        </div>
      ))}

      {/* Custom theme pills — loaded from VibeThemeContext.customThemes (IDB). */}
      {[...customThemes.entries()].map(([name, vars]) => (
        <div key={`custom:${name}`} className="theme-selector__pill-wrapper">
          <button
            type="button"
            className={`theme-selector__pill${
              theme === (`custom:${name}` as AnyThemeName)
                ? " theme-selector__pill--active"
                : ""
            }`}
            aria-pressed={theme === (`custom:${name}` as AnyThemeName)}
            onClick={() =>
              setTheme(`custom:${name}` as AnyThemeName, vars)
            }
          >
            {name}
          </button>
          <button
            type="button"
            className="theme-selector__edit"
            aria-label={`Edit ${name}`}
            onClick={() =>
              onOpenThemeEditor({ initialVars: vars, editingName: name })
            }
          >
            Edit
          </button>
        </div>
      ))}

      {/* New Theme entry point — opens the ThemeEditor with blank defaults. */}
      <button
        type="button"
        className="theme-selector__new-theme"
        onClick={() => onOpenThemeEditor()}
      >
        New Theme
      </button>
    </div>
  );
}
