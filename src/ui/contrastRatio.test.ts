// WCAG 2.1 contrast ratio utility — pure function tests (Phase 22, THEME-10).
// No browser API used; safe in JSDOM. All test pairs sourced from WCAG 2.1 §1.4.3.

import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrastRatio";

describe("contrastRatio — known WCAG 2.1 pairs", () => {
  it("returns 21 for black on white (#ffffff vs #000000)", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
  });

  it("returns 21 for white on black — symmetric (order of args does not matter)", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("returns ≈4.48 for #777777 on white (just below WCAG AA threshold)", () => {
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });
});

describe("contrastRatio — non-hex inputs return null", () => {
  it("returns null when first arg is rgba(...)", () => {
    expect(contrastRatio("rgba(255,255,255,0.10)", "#000000")).toBeNull();
  });

  it("returns null when second arg is a gradient", () => {
    expect(
      contrastRatio(
        "#ffffff",
        "radial-gradient(130% 110% at 18% 8%, #1b1636 0%, #0c0a18 62%)",
      ),
    ).toBeNull();
  });

  it("returns null for empty string as first arg", () => {
    expect(contrastRatio("", "#ffffff")).toBeNull();
  });
});

describe("contrastRatio — 3-char shorthand hex", () => {
  it("handles #abc and #def (shorthand 3-char hex) and returns a number", () => {
    expect(contrastRatio("#abc", "#def")).not.toBeNull();
    expect(contrastRatio("#abc", "#def")).toBeGreaterThan(1);
  });
});

describe("contrastRatio — hex pair from theme vars", () => {
  it("returns a number > 1.0 for #f3f1ff vs #7c5cff (Aurora --text vs --b1)", () => {
    const ratio = contrastRatio("#f3f1ff", "#7c5cff");
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeGreaterThan(1);
  });
});
