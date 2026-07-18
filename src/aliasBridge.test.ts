import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("alias bridge (src/index.css)", () => {
  const cssPath = resolve(__dirname, "index.css");
  const css = readFileSync(cssPath, "utf8");

  it("contains --color-surface: var(--glass) mapping", () => {
    expect(css).toMatch(/--color-surface\s*:\s*var\(--glass\)/);
  });

  it("contains --color-text: var(--text) mapping", () => {
    expect(css).toMatch(/--color-text\s*:\s*var\(--text\)/);
  });

  it("contains --color-accent: var(--accentA) mapping", () => {
    expect(css).toMatch(/--color-accent\s*:\s*var\(--accentA\)/);
  });
});
