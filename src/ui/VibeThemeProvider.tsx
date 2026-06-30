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
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { STORAGE_KEY_OS_THEME } from "../lib/storage";
import { useServices } from "../services/ServicesProvider";
import { broadcastTheme } from "../execution/frameMount";

/** The four named themes the marketplace ships with. */
export type VibeThemeName = "aurora" | "aero" | "aqua" | "noir";

/**
 * A user-created custom theme name. The "custom:" prefix namespaces it away
 * from the four built-in VibeThemeName literals so there is no collision risk.
 * Phase 22 (THEME-07/08).
 */
export type CustomThemeName = `custom:${string}`;

/**
 * Union of built-in and custom theme names. Accepted wherever a theme name is
 * passed: setTheme, theme state, localStorage, readStoredOsTheme().
 * Phase 22 (THEME-07/08).
 */
export type AnyThemeName = VibeThemeName | CustomThemeName;

export interface VibeThemeContextValue {
  /** Currently active theme name — a built-in or "custom:<name>". */
  theme: AnyThemeName;
  /**
   * Resolved CSS custom-property map for the active theme. Always a valid
   * Record<string,string>: falls back to VIBE_THEMES["aurora"] when the active
   * custom theme name is not found in customThemes (edge case: deleted while active).
   * Phase 22 (THEME-08): used by DesktopShell to pass vars to SandboxFrame.
   */
  currentVars: Record<string, string>;
  /** Switch to any theme — built-in or custom. For custom themes, pass the
   *  resolved vars so broadcastTheme receives them immediately without waiting
   *  for the customThemes state to populate. */
  setTheme: (name: AnyThemeName, vars?: Record<string, string>) => void;
  /**
   * Map of saved custom themes keyed by name WITHOUT the "custom:" prefix.
   * Populated on mount by reading customThemeIndex + per-theme keys from IDB.
   * Phase 22 (THEME-07).
   */
  customThemes: ReadonlyMap<string, Record<string, string>>;
  /**
   * Re-reads customThemeIndex and per-theme keys from IDB, updating customThemes
   * in React state. Call after save or delete to keep the UI in sync.
   * Phase 22 (THEME-07).
   */
  refreshCustomThemes: () => Promise<void>;
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

/**
 * Read the persisted theme name from localStorage. Accepts built-in
 * VibeThemeName values AND "custom:*" strings (Phase 22, THEME-07).
 * Falls back to DEFAULT_THEME when nothing is stored or the stored value is
 * neither a valid built-in nor a "custom:" string.
 *
 * Security note (T-22-02): the "custom:*" value is only used as a map lookup
 * key into customThemesState; if absent, VIBE_THEMES["aurora"] is the fallback.
 * No code-injection risk via this path.
 */
function readStoredOsTheme(): AnyThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_OS_THEME);
    if (stored) {
      if ((VALID_THEMES as readonly string[]).includes(stored)) {
        return stored as VibeThemeName;
      }
      // Phase 22: accept "custom:*" values as valid persisted selections.
      if (stored.startsWith("custom:")) {
        return stored as CustomThemeName;
      }
    }
  } catch {
    // localStorage can throw under strict privacy settings — fall through.
  }
  return DEFAULT_THEME;
}

// Apply a built-in theme's variables instantly (no transition) by setting each
// custom property on the document root, where they cascade to every mounted subtree.
function applyVibeTheme(name: VibeThemeName): void {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(VIBE_THEMES[name])) {
    root.style.setProperty(prop, value);
  }
}

// Apply an arbitrary vars map to :root (used for custom themes).
function applyVarsToRoot(vars: Record<string, string>): void {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(vars)) {
    root.style.setProperty(prop, value);
  }
}

// Runtime owner of the named theme. localStorage is the source of truth for
// first paint; the injected settings store is a best-effort durable mirror.
export function VibeThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AnyThemeName>(readStoredOsTheme);
  const { settingsStore } = useServices();

  // Phase 22 (THEME-07): custom themes loaded from IDB on mount.
  const [customThemesState, setCustomThemesState] = useState<
    Map<string, Record<string, string>>
  >(() => new Map());

  /**
   * Re-read the customThemeIndex and per-theme data keys from IDB, then update
   * React state. Called on mount and after save/delete operations.
   *
   * Security (T-22-01): each JSON.parse is wrapped in try/catch; malformed
   * entries are skipped silently so one corrupt key cannot crash the provider.
   */
  const refreshCustomThemes = useCallback(async (): Promise<void> => {
    try {
      const indexRaw = await settingsStore.readRaw("customThemeIndex");
      if (!indexRaw) {
        setCustomThemesState(new Map());
        return;
      }
      let names: string[];
      try {
        names = JSON.parse(indexRaw) as string[];
        if (!Array.isArray(names)) {
          setCustomThemesState(new Map());
          return;
        }
      } catch {
        setCustomThemesState(new Map());
        return;
      }
      const newMap = new Map<string, Record<string, string>>();
      for (const name of names) {
        if (typeof name !== "string") continue;
        try {
          const varsRaw = await settingsStore.readRaw(`custom:${name}`);
          if (!varsRaw) continue;
          const vars: unknown = JSON.parse(varsRaw);
          if (vars && typeof vars === "object" && !Array.isArray(vars)) {
            newMap.set(name, vars as Record<string, string>);
          }
        } catch {
          // Skip malformed theme entry — self-heals on next save.
        }
      }
      setCustomThemesState(newMap);
    } catch {
      // Best-effort — IDB unavailable; keep existing state.
    }
  }, [settingsStore]);

  // Populate custom themes on mount.
  useEffect(() => {
    void refreshCustomThemes();
  }, [refreshCustomThemes]);

  // Apply the theme variables on mount and on every theme change.
  useEffect(() => {
    if ((VALID_THEMES as readonly string[]).includes(theme as string)) {
      applyVibeTheme(theme as VibeThemeName);
    } else {
      // Custom theme: apply vars from state if loaded, else aurora fallback.
      const name = (theme as string).startsWith("custom:")
        ? (theme as string).slice(7)
        : "";
      const vars = customThemesState.get(name) ?? VIBE_THEMES[DEFAULT_THEME];
      applyVarsToRoot(vars);
    }
  }, [theme, customThemesState]);

  /**
   * Resolved CSS custom-property map for the active theme. Built-in themes
   * look up VIBE_THEMES directly; custom themes look up customThemesState by
   * name (without the "custom:" prefix). Falls back to aurora if the custom
   * name is not yet in state (loading race or deleted-while-active edge case).
   */
  const currentVars = useMemo((): Record<string, string> => {
    if ((VALID_THEMES as readonly string[]).includes(theme as string)) {
      return VIBE_THEMES[theme as VibeThemeName];
    }
    // Custom theme.
    const name = (theme as string).startsWith("custom:")
      ? (theme as string).slice(7)
      : "";
    return customThemesState.get(name) ?? VIBE_THEMES[DEFAULT_THEME];
  }, [theme, customThemesState]);

  const setTheme = useCallback(
    (name: AnyThemeName, vars?: Record<string, string>) => {
      // Keep the updater pure — React may invoke it more than once (double
      // render under StrictMode, replays during concurrent/interrupted
      // renders), so side effects must live outside it.
      setThemeState(name);
      // Persist authoritatively to localStorage (best-effort) after the state
      // update is queued.
      try {
        localStorage.setItem(STORAGE_KEY_OS_THEME, name);
      } catch {
        // Persisting is best-effort; the in-memory theme still updates.
      }
      // Fire-and-forget the durable mirror — never block the UI switch on the
      // async IDB write. localStorage already holds the authoritative value.
      void settingsStore.write(name);
      // Resolve vars for broadcastTheme:
      // 1. Explicit vars param (caller-supplied, e.g. from ThemeEditor save path)
      // 2. Custom theme: look up in current state (may be stale on first switch)
      // 3. Built-in theme: look up VIBE_THEMES
      // 4. Ultimate fallback: aurora
      let resolvedVars: Record<string, string>;
      if (vars !== undefined) {
        resolvedVars = vars;
      } else if ((name as string).startsWith("custom:")) {
        const customName = (name as string).slice(7);
        resolvedVars =
          customThemesState.get(customName) ?? VIBE_THEMES[DEFAULT_THEME];
      } else {
        resolvedVars =
          (VIBE_THEMES[name as VibeThemeName] as
            | Record<string, string>
            | undefined) ?? VIBE_THEMES[DEFAULT_THEME];
      }
      // Push the new theme variables to every live frame so opaque-origin app
      // bodies repaint with the switched theme (their :root can't see the host's).
      broadcastTheme(resolvedVars);
    },
    [settingsStore, customThemesState],
  );

  return (
    <VibeThemeContext.Provider
      value={{
        theme,
        currentVars,
        setTheme,
        customThemes: customThemesState as ReadonlyMap<
          string,
          Record<string, string>
        >,
        refreshCustomThemes,
      }}
    >
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
