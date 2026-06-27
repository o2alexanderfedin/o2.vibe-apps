// launcherUtils — shared utilities for the SearchLauncherPanel (Phase 17, CREATE-01/02/03).

/**
 * Convert free-form user text to a normalized type slug.
 *
 * Algorithm:
 * 1. Trim and lowercase
 * 2. Strip a leading article ("a ", "an ", or "the ") at a word boundary
 * 3. Replace any character that is NOT a-z, 0-9, or hyphen with a hyphen
 * 4. Collapse consecutive hyphens to one
 * 5. Strip leading and trailing hyphens
 *
 * Examples:
 *   "a pomodoro timer"   → "pomodoro-timer"
 *   "an alarm clock"     → "alarm-clock"
 *   "the weather dashboard" → "weather-dashboard"
 *   "  Notes App  "      → "notes-app"
 *   "a/b + c"            → "a-b-c"
 */
export function slugFromText(text: string): string {
  let s = text.trim().toLowerCase();
  // Strip leading article at word boundary
  s = s.replace(/^(a|an|the)\s+/, "");
  // Replace non-alphanumeric (excluding hyphen) with hyphen
  s = s.replace(/[^a-z0-9-]/g, "-");
  // Collapse consecutive hyphens
  s = s.replace(/-+/g, "-");
  // Strip leading/trailing hyphens
  s = s.replace(/^-+|-+$/g, "");
  return s;
}

/**
 * Example chips shown in the search panel — exactly 3 neutral descriptions.
 * None of these strings contains banned tokens.
 */
export const EXAMPLE_CHIPS: string[] = [
  "a pomodoro timer",
  "a weather dashboard",
  "a notes app",
];
