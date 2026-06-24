import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { STORAGE_KEY_THEME } from "../lib/storage";

// Theme mode selected by the user. Default is "system" (D-15).
export type ThemeMode = "light" | "dark" | "system";

export interface ThemeContextValue {
  mode: ThemeMode;
  cycleTheme: () => void;
}

// Exported so consumers (AppBar, tests) can read the current mode + cycle action.
export const ThemeContext = createContext<ThemeContextValue | null>(null);

const VALID_MODES: ReadonlyArray<ThemeMode> = ["light", "dark", "system"];

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_THEME);
    if (stored && (VALID_MODES as readonly string[]).includes(stored)) {
      return stored as ThemeMode;
    }
  } catch {
    // localStorage can throw under strict privacy settings — fall through.
  }
  return "system";
}

// Resolve a concrete light/dark value, consulting prefers-color-scheme for "system".
function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return mode;
}

function applyTheme(mode: ThemeMode): void {
  document.documentElement.setAttribute("data-theme", resolveTheme(mode));
}

// Advance light -> dark -> system -> light (D-19).
function nextMode(mode: ThemeMode): ThemeMode {
  switch (mode) {
    case "light":
      return "dark";
    case "dark":
      return "system";
    default:
      return "light";
  }
}

// Runtime theme owner (D-16/D-18/D-19). The inline FOUC script in index.html
// owns first paint; this provider owns every runtime switch thereafter.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readStoredMode);

  // Apply the resolved theme on mount and on every mode change.
  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  // Subscribe to OS scheme changes ONLY while in "system" mode, and key this
  // effect on whether we are in system mode so toggling light <-> dark does not
  // churn add/removeEventListener pairs. Re-subscription happens only when
  // entering or leaving "system" (WR-05). Uses addEventListener('change') —
  // NOT the deprecated addListener.
  const isSystem = mode === "system";
  useEffect(() => {
    if (!isSystem) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [isSystem]);

  const cycleTheme = useCallback(() => {
    setMode((prev) => {
      const next = nextMode(prev);
      try {
        localStorage.setItem(STORAGE_KEY_THEME, next);
      } catch {
        // Persisting is best-effort; the in-memory mode still updates.
      }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Consumer hook for the AppBar theme toggle.
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
