// Gated logger — reads gate ONCE at module load (D-30).
// Active only when localStorage.debug is truthy at load. Gate is fixed for the session.
// Neutral copy only (D-32). API key is NEVER passed to this logger (D-13/D-37).
const enabled = (() => {
  try {
    return !!localStorage.getItem("debug");
  } catch {
    return false;
  }
})();

const PREFIX = "[Marketplace]";

export const logger = {
  info: (m: string, ...d: unknown[]) => {
    if (enabled) console.info(PREFIX, m, ...d);
  },
  warn: (m: string, ...d: unknown[]) => {
    if (enabled) console.warn(PREFIX, m, ...d);
  },
  error: (m: string, ...d: unknown[]) => {
    if (enabled) console.error(PREFIX, m, ...d);
  },
};
