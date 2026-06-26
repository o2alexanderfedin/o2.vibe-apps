// Named-theme engine (Phase 14, THEME-01) — owns the four-theme CSS custom
// property contract on `document.documentElement`. This layers ON TOP of the
// existing ThemeProvider (light/dark/system via `data-theme`); the two are
// independent and both stay live. The inline FOUC script in index.html owns
// first paint; this provider owns every runtime theme switch thereafter.
//
// Why CSS variables on :root (not data-theme): the named themes set custom
// properties via `style.setProperty` on the document root so they cascade into
// every separately-`createRoot`'d app/widget subtree. A `data-theme` attribute
// selector would not reach those independently-mounted roots.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { STORAGE_KEY_OS_THEME } from "../lib/storage";
import { useServices } from "../services/ServicesProvider";

/** The four named themes the marketplace ships with. */
export type VibeThemeName = "aurora" | "aero" | "aqua" | "noir";

export interface VibeThemeContextValue {
  theme: VibeThemeName;
  setTheme: (name: VibeThemeName) => void;
}

// Exported so consumers (the theme selector, tests) can read the current theme
// and the setter.
export const VibeThemeContext = createContext<VibeThemeContextValue | null>(
  null,
);

// The 4 named themes — CSS custom-property values verbatim from the design's
// THEMES map. Each theme defines the same 12 variables (text, wallpaper, four
// brand stops, two glass tints, border, highlight, and two accents).
export const VIBE_THEMES: Record<VibeThemeName, Record<string, string>> = {
  aurora: {
    "--text": "#f3f1ff",
    "--wall":
      "radial-gradient(130% 110% at 18% 8%, #1b1636 0%, #0c0a18 62%)",
    "--b1": "#7c5cff",
    "--b2": "#22d3ee",
    "--b3": "#ff6ec4",
    "--b4": "#34d399",
    "--glass": "rgba(255,255,255,0.10)",
    "--glass2": "rgba(255,255,255,0.035)",
    "--bord": "rgba(255,255,255,0.22)",
    "--hi": "rgba(255,255,255,0.5)",
    "--accentA": "#9b7cff",
    "--accentB": "#36d6f0",
  },
  aero: {
    "--text": "#eef6ff",
    "--wall":
      "radial-gradient(130% 120% at 50% -20%, #15406e 0%, #0a1f3a 55%, #06101f 100%)",
    "--b1": "#4aa3ff",
    "--b2": "#6ad0ff",
    "--b3": "#67e8f9",
    "--b4": "#3b82f6",
    "--glass": "rgba(180,220,255,0.16)",
    "--glass2": "rgba(120,180,255,0.05)",
    "--bord": "rgba(180,220,255,0.34)",
    "--hi": "rgba(255,255,255,0.6)",
    "--accentA": "#4aa3ff",
    "--accentB": "#67e8f9",
  },
  aqua: {
    "--text": "#f4f8ff",
    "--wall":
      "radial-gradient(120% 110% at 30% 0%, #2a6fd6 0%, #1855b0 45%, #0e3a86 100%)",
    "--b1": "#5ea9ff",
    "--b2": "#8fd0ff",
    "--b3": "#c9e6ff",
    "--b4": "#3b82f6",
    "--glass": "rgba(255,255,255,0.22)",
    "--glass2": "rgba(255,255,255,0.08)",
    "--bord": "rgba(255,255,255,0.45)",
    "--hi": "rgba(255,255,255,0.75)",
    "--accentA": "#2a7fff",
    "--accentB": "#5ec8ff",
  },
  noir: {
    "--text": "#f5eeff",
    "--wall":
      "radial-gradient(120% 110% at 70% 10%, #160a1f 0%, #07060b 60%)",
    "--b1": "#e040fb",
    "--b2": "#18ffe0",
    "--b3": "#7c4dff",
    "--b4": "#ff2d78",
    "--glass": "rgba(255,255,255,0.055)",
    "--glass2": "rgba(255,255,255,0.02)",
    "--bord": "rgba(255,255,255,0.16)",
    "--hi": "rgba(255,255,255,0.28)",
    "--accentA": "#c451ff",
    "--accentB": "#18ffe0",
  },
};

const VALID_THEMES: ReadonlyArray<VibeThemeName> = [
  "aurora",
  "aero",
  "aqua",
  "noir",
];

// Default theme when nothing valid is persisted (CONTEXT Decision 7).
const DEFAULT_THEME: VibeThemeName = "aurora";

function readStoredOsTheme(): VibeThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_OS_THEME);
    if (stored && (VALID_THEMES as readonly string[]).includes(stored)) {
      return stored as VibeThemeName;
    }
  } catch {
    // localStorage can throw under strict privacy settings — fall through.
  }
  return DEFAULT_THEME;
}

// Apply a theme's variables instantly (no transition) by setting each custom
// property on the document root, where they cascade to every mounted subtree.
function applyVibeTheme(name: VibeThemeName): void {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(VIBE_THEMES[name])) {
    root.style.setProperty(prop, value);
  }
}

// Runtime owner of the named theme. localStorage is the source of truth for
// first paint; the injected settings store is a best-effort durable mirror.
export function VibeThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<VibeThemeName>(readStoredOsTheme);
  const { settingsStore } = useServices();

  // Apply the theme variables on mount and on every theme change.
  useEffect(() => {
    applyVibeTheme(theme);
  }, [theme]);

  const setTheme = useCallback(
    (name: VibeThemeName) => {
      setThemeState(() => {
        try {
          localStorage.setItem(STORAGE_KEY_OS_THEME, name);
        } catch {
          // Persisting is best-effort; the in-memory theme still updates.
        }
        return name;
      });
      // Fire-and-forget the durable mirror — never block the UI switch on the
      // async IDB write. localStorage already holds the authoritative value.
      void settingsStore.write(name);
    },
    [settingsStore],
  );

  return (
    <VibeThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </VibeThemeContext.Provider>
  );
}

// Consumer hook for the theme selector and any code reading the current theme.
export function useVibeTheme(): VibeThemeContextValue {
  const ctx = useContext(VibeThemeContext);
  if (!ctx) {
    throw new Error("useVibeTheme must be used within a VibeThemeProvider");
  }
  return ctx;
}
