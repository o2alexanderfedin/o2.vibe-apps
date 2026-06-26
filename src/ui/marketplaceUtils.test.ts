import { describe, expect, it } from "vitest";
import { rankPopular } from "./marketplaceUtils";

describe("rankPopular", () => {
  it("ranks by useCount descending", () => {
    const records = [
      { cacheKey: "b", useCount: 1, updatedAt: 100 },
      { cacheKey: "a", useCount: 5, updatedAt: 100 },
      { cacheKey: "c", useCount: 3, updatedAt: 100 },
    ];
    const ranked = rankPopular(records);
    expect(ranked[0].cacheKey).toBe("a");
    expect(ranked[1].cacheKey).toBe("c");
    expect(ranked[2].cacheKey).toBe("b");
  });

  it("breaks useCount tie by updatedAt descending", () => {
    const records = [
      { cacheKey: "old", useCount: 3, updatedAt: 100 },
      { cacheKey: "new", useCount: 3, updatedAt: 500 },
    ];
    const ranked = rankPopular(records);
    expect(ranked[0].cacheKey).toBe("new");
  });

  it("breaks updatedAt tie by cacheKey ascending (fully deterministic)", () => {
    const records = [
      { cacheKey: "z", useCount: 2, updatedAt: 200 },
      { cacheKey: "a", useCount: 2, updatedAt: 200 },
    ];
    const ranked = rankPopular(records);
    expect(ranked[0].cacheKey).toBe("a");
  });

  it("owns the membership filter — drops records with useCount < 1 (cold-start guard)", () => {
    const records = [
      { cacheKey: "x", useCount: 0, updatedAt: 100 },
      { cacheKey: "y", useCount: 1, updatedAt: 200 },
    ];
    const result = rankPopular(records);
    expect(result.length).toBe(1);
    expect(result[0].cacheKey).toBe("y");

    // All-zero input returns empty array (cold-start: nothing shown until first open)
    const allCold = [{ cacheKey: "x", useCount: 0, updatedAt: 100 }];
    expect(rankPopular(allCold)).toHaveLength(0);
  });

  it("caps output at topN", () => {
    const records = [
      { cacheKey: "r1", useCount: 7, updatedAt: 700 },
      { cacheKey: "r2", useCount: 6, updatedAt: 600 },
      { cacheKey: "r3", useCount: 5, updatedAt: 500 },
      { cacheKey: "r4", useCount: 4, updatedAt: 400 },
      { cacheKey: "r5", useCount: 3, updatedAt: 300 },
      { cacheKey: "r6", useCount: 2, updatedAt: 200 },
      { cacheKey: "r7", useCount: 1, updatedAt: 100 },
    ];
    expect(rankPopular(records, 3)).toHaveLength(3);
  });
});
