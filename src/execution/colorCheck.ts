// Post-compile saturated color checker (Phase 18, TGEN-02).
//
// After transpile() succeeds, produceComponent calls checkForHardcodedColors()
// on the transpiled output. A violation throws TranspileError so the EXISTING
// self-heal loop (≤3 attempts in producer.ts) automatically feeds the error
// back to the model — no new loop infrastructure needed.
//
// WHAT IS FLAGGED: saturated/branded hardcoded color literals —
//   - Hex #rgb / #rrggbb / #rrggbbaa where R ≠ G or G ≠ B
//   - rgb() / rgba() where R ≠ G or G ≠ B
//
// WHAT IS ALLOWED: grayscale (#000/#fff/#333/…, R===G===B), neutral-alpha
// black rgba(0,0,0,α), neutral-alpha white rgba(255,255,255,α), and any
// rgb/rgba where R===G===B (shadows/overlays/glass).

import { TranspileError } from "./transpile";

/** True when R, G, B are all equal (grayscale — no saturation). */
function isGrayscale(r: number, g: number, b: number): boolean {
  return r === g && g === b;
}

/**
 * Scan `code` for saturated hardcoded color literals.
 *
 * Returns void on clean code.
 * Throws TranspileError on the first violation so the producer's self-heal
 * loop can feed the error back to the model verbatim.
 */
export function checkForHardcodedColors(code: string): void {
  // Scanner A — hex literals: #rgb (3), #rrggbb (6), #rrggbbaa (8).
  const hexPattern = /#([0-9a-fA-F]{3,8})\b/g;
  let hexMatch: RegExpExecArray | null;
  while ((hexMatch = hexPattern.exec(code)) !== null) {
    const hex = hexMatch[1]!;
    let r: number;
    let g: number;
    let b: number;

    if (hex.length === 3) {
      // Expand #rgb → #rrggbb by doubling each nibble.
      r = parseInt(hex[0]! + hex[0]!, 16);
      g = parseInt(hex[1]! + hex[1]!, 16);
      b = parseInt(hex[2]! + hex[2]!, 16);
    } else if (hex.length === 4) {
      // 4-digit #rgba shorthand (CSS Colors Level 4): expand each nibble.
      // Alpha (hex[3]) is irrelevant to the saturation check.
      r = parseInt(hex[0]! + hex[0]!, 16);
      g = parseInt(hex[1]! + hex[1]!, 16);
      b = parseInt(hex[2]! + hex[2]!, 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else if (hex.length === 8) {
      // 8-digit: #rrggbbaa — alpha is irrelevant; check first 6 digits.
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else {
      // 5 or 7-digit: not valid CSS; skip to avoid false positives.
      continue;
    }

    if (!isGrayscale(r, g, b)) {
      // Include the offending literal so two DIFFERENT color violations produce
      // DIFFERENT error messages. The producer's self-heal early-stop fires on
      // an identical consecutive error; a generic message would collapse the
      // effective retry budget from 3 to 2. A specific message also gives the
      // model the exact value to find and replace.
      throw new TranspileError(
        `Produced code contains a hardcoded color (#${hex}) — use the theme CSS variables (var(--accentA), var(--accentB), var(--text), etc.) instead of hardcoded hex or rgb color values.`,
        null,
      );
    }
  }

  // Scanner B — rgb() / rgba() literals.
  const rgbPattern = /\brgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g;
  let rgbMatch: RegExpExecArray | null;
  while ((rgbMatch = rgbPattern.exec(code)) !== null) {
    const r = parseInt(rgbMatch[1]!, 10);
    const g = parseInt(rgbMatch[2]!, 10);
    const b = parseInt(rgbMatch[3]!, 10);
    if (!isGrayscale(r, g, b)) {
      // Include the offending literal — see the hex branch for why a specific
      // (not generic) message protects the self-heal retry budget.
      throw new TranspileError(
        `Produced code contains a hardcoded color (rgb(${r}, ${g}, ${b})) — use the theme CSS variables (var(--accentA), var(--accentB), var(--text), etc.) instead of hardcoded hex or rgb color values.`,
        null,
      );
    }
  }
}
