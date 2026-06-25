// Static catalog of app types shown on the storefront (D-09, UI-SPEC §1).
// Neutral lowercase-kebab ids; `icon` is a neutral string key mapped to a
// concrete glyph in the render layer (RESEARCH Open Question 1).
export interface AppRegistryEntry {
  id: string;
  displayName: string;
  description: string;
  icon: string;
}

export const APP_REGISTRY: AppRegistryEntry[] = [
  {
    id: "weather",
    displayName: "Weather",
    description: "Current conditions and forecast for any location.",
    icon: "cloud",
  },
  {
    id: "calculator",
    displayName: "Calculator",
    description: "Arithmetic, percentages, and quick conversions.",
    icon: "calculator",
  },
  {
    id: "notes",
    displayName: "Notes",
    description: "Capture and organize your thoughts.",
    icon: "notes",
  },
  {
    id: "timer",
    displayName: "Timer",
    description: "Countdown and stopwatch in one.",
    icon: "timer",
  },
  {
    id: "currency",
    displayName: "Currency",
    description: "Live exchange rates and conversions.",
    icon: "currency",
  },
  {
    id: "recipes",
    displayName: "Recipes",
    description: "Discover and save recipes by ingredient.",
    icon: "recipes",
  },
  {
    id: "calendar",
    displayName: "Calendar",
    description: "Schedule and track your upcoming events.",
    icon: "calendar",
  },
  {
    id: "budget",
    displayName: "Budget",
    description: "Track spending and savings at a glance.",
    icon: "budget",
  },
];
