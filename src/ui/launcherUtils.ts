// launcherUtils — shared utilities for the SearchLauncherPanel (Phase 17, CREATE-01/02/03).

/**
 * Convert free-form user text to a normalized type slug.
 *
 * Algorithm:
 * 1. NFC-normalize, trim and lowercase
 * 2. Strip a leading article ("a ", "an ", or "the ") at a word boundary
 * 3. Replace any character that is NOT a letter, a combining mark, or a digit
 *    (in any script), or a hyphen, with a hyphen
 * 4. Collapse consecutive hyphens to one
 * 5. Strip leading and trailing hyphens
 *
 * Examples:
 *   "a pomodoro timer"   → "pomodoro-timer"
 *   "an alarm clock"     → "alarm-clock"
 *   "the weather dashboard" → "weather-dashboard"
 *   "  Notes App  "      → "notes-app"
 *   "a/b + c"            → "a-b-c"
 *   "таймер помодоро"    → "таймер-помодоро"
 *   "Café Timer"         → "café-timer"
 *
 * Letters are kept in every script, not just a-z: an ASCII-only class turned a
 * description written in Cyrillic, CJK, or Devanagari into an empty slug, and
 * the launcher then refused to open the app at all.
 */
export function slugFromText(text: string): string {
  let s = text.normalize("NFC").trim().toLowerCase();
  // Strip leading article at word boundary
  s = s.replace(/^(a|an|the)\s+/, "");
  // Replace anything that is not a letter, mark, digit, or hyphen with a hyphen
  s = s.replace(/[^\p{L}\p{M}\p{N}-]/gu, "-");
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
