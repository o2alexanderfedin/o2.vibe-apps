// Unit tests for the contextual-modification router (Phase 5, MOD-02).
//
// The router is pure and deterministic — no model call, no services. These tests
// pin the exact regex contract: remove (remove|delete|close), clone
// (clone|duplicate|copy), everything else → tweak (carrying the instruction).

import { describe, expect, it } from "vitest";
import { routeModification } from "./routeModification";

describe("routeModification — remove (MOD-02)", () => {
  it.each(["remove", "delete", "close", "Remove this", "please DELETE it", "close the app"])(
    "routes %j to remove",
    (text) => {
      expect(routeModification(text)).toEqual({ kind: "remove" });
    },
  );

  it("matches the word boundary, not a substring (e.g. 'closet' is not 'close')", () => {
    // "closet" should NOT route to remove — it falls through to tweak.
    expect(routeModification("add a closet organizer view").kind).toBe("tweak");
  });
});

describe("routeModification — clone (MOD-02)", () => {
  it.each(["clone", "duplicate", "copy", "Clone it", "make a DUPLICATE", "copy this one"])(
    "routes %j to clone",
    (text) => {
      expect(routeModification(text)).toEqual({ kind: "clone" });
    },
  );
});

describe("routeModification — tweak catch-all (MOD-02)", () => {
  it("routes a free-form instruction to tweak and preserves the (trimmed) text", () => {
    const routed = routeModification("  make the buttons larger  ");
    expect(routed).toEqual({ kind: "tweak", instruction: "make the buttons larger" });
  });

  it("an instruction with no keyword is a tweak", () => {
    expect(routeModification("change the accent color to green")).toEqual({
      kind: "tweak",
      instruction: "change the accent color to green",
    });
  });

  it("remove wins over clone when both appear (destructive + cheaper first)", () => {
    // Order is documented: remove is checked before clone.
    expect(routeModification("remove the duplicate").kind).toBe("remove");
  });
});
