// WCAG 2.1 contrast ratio helper (Phase 22, THEME-10).
//
// Pure function — no browser API, no imports, safe in JSDOM.
// Used by ThemeEditor to show an advisory contrast warning when the
// text-colour / background-colour (--text vs --wall) ratio falls below the
// WCAG AA threshold of 4.5:1. Returns null for non-hex values (gradients,
// rgba), which is the expected result for built-in themes whose --wall is a
// radial-gradient — those themes intentionally suppress the warning.

// Linearize a single sRGB channel value in [0..1] per WCAG 2.1 §1.4.3.
function linearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Relative luminance of an sRGB triplet (each channel 0–255) per WCAG 2.1 §1.4.3.
function relativeLuminance(r255: number, g255: number, b255: number): number {
  const r = linearize(r255 / 255);
  const g = linearize(g255 / 255);
  const b = linearize(b255 / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Parse "#rgb" or "#rrggbb" hex string into [r, g, b] in 0–255.
// Returns null for any other value (rgba, gradient, empty string, etc.).
function parseHex(value: string): [number, number, number] | null {
  const m = value.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  const s = m[1];
  if (!s) return null;
  if (s.length === 3) {
    const c0 = s.charAt(0);
    const c1 = s.charAt(1);
    const c2 = s.charAt(2);
    return [
      parseInt(c0 + c0, 16),
      parseInt(c1 + c1, 16),
      parseInt(c2 + c2, 16),
    ];
  }
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

/**
 * Compute the WCAG 2.1 contrast ratio between two CSS color strings.
 *
 * Both `fg` and `bg` must be parseable hex colors (#rgb or #rrggbb).
 * Returns null if either value is not a hex color (e.g. rgba, gradient).
 *
 * The returned ratio is ≥ 1.0. WCAG AA requires 4.5:1 for normal text.
 */
export function contrastRatio(fg: string, bg: string): number | null {
  const fgRgb = parseHex(fg);
  const bgRgb = parseHex(bg);
  if (!fgRgb || !bgRgb) return null;
  const L1 = relativeLuminance(...fgRgb);
  const L2 = relativeLuminance(...bgRgb);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}
