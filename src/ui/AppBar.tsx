import { Sun, Moon, Monitor, User } from "lucide-react";
import { useTheme, type ThemeMode } from "./ThemeProvider";
import { ThemeSelector } from "./ThemeSelector";

// Icon + next-action label for each theme mode. aria-label communicates the
// NEXT action, not the current state (UI-SPEC §2).
const THEME_META: Record<
  ThemeMode,
  { Icon: typeof Sun; nextLabel: string }
> = {
  light: { Icon: Sun, nextLabel: "Switch to dark theme" },
  dark: { Icon: Moon, nextLabel: "Switch to system theme" },
  system: { Icon: Monitor, nextLabel: "Switch to light theme" },
};

export interface AppBarProps {
  onOpenAccount: () => void;
}

// Marketplace top bar: wordmark + Account button (opens KeyDialog) + 3-way
// theme toggle (SHELL-03/SHELL-04, UI-SPEC §2).
export function AppBar({ onOpenAccount }: AppBarProps) {
  const { mode, cycleTheme } = useTheme();
  const { Icon: ThemeIcon, nextLabel } = THEME_META[mode];

  return (
    <header role="banner" className="app-bar">
      <span className="app-bar__wordmark">Marketplace</span>
      <div className="app-bar__controls">
        {/* Named-theme switcher — temporary home; Phase 16 relocates it to the
            menu bar. The existing light/dark/system toggle below stays intact. */}
        <ThemeSelector />
        <button
          type="button"
          className="app-bar__icon-btn"
          aria-label="Account"
          title="Account"
          onClick={onOpenAccount}
        >
          <User size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="app-bar__icon-btn app-bar__icon-btn--active"
          aria-label={nextLabel}
          title={nextLabel}
          onClick={cycleTheme}
        >
          <ThemeIcon size={20} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
