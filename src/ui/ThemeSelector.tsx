import { useVibeTheme, type VibeThemeName } from "./VibeThemeProvider";

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

// A small inline row of pills that switches the active named theme. Temporary
// home in the AppBar for Phase 14; Phase 16 relocates this into the menu bar.
// Clicking a pill drives setTheme, which re-applies the theme's CSS custom
// properties on documentElement (live re-skin).
export function ThemeSelector() {
  const { theme, setTheme } = useVibeTheme();
  return (
    <div className="theme-selector" role="group" aria-label="Color theme">
      {THEME_NAMES.map((name) => (
        <button
          key={name}
          type="button"
          className={`theme-selector__pill${
            theme === name ? " theme-selector__pill--active" : ""
          }`}
          aria-pressed={theme === name}
          onClick={() => setTheme(name)}
        >
          {THEME_LABELS[name]}
        </button>
      ))}
    </div>
  );
}
