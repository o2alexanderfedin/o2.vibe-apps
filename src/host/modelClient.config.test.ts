// Config guard (regression): the token budget must be large enough to fit a
// real component response. Real components are ~6–12 KB of TSX (fences included);
// at the old budget of 2048 the response was truncated mid-code, the closing
// fence never arrived, and the open flow dropped the app silently.
//
// This test FAILS before the fix (MAX_TOKENS=2048) and PASSES after (>=4096).
import { describe, expect, it } from "vitest";
import { MAX_TOKENS } from "./modelClient";

describe("modelClient — token budget guard", () => {
  it("MAX_TOKENS is at least 4096 so real components are not truncated", () => {
    expect(MAX_TOKENS).toBeGreaterThanOrEqual(4096);
  });

  it("MAX_TOKENS comfortably fits the largest observed component (~12 KB ≈ ~4K tokens)", () => {
    // 12 KB of code is roughly 3–4 K tokens; 8192 leaves real headroom.
    expect(MAX_TOKENS).toBeGreaterThanOrEqual(8192);
  });
});
