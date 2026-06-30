// Unit tests for the layout persistence module (Phase 21, plan 21-01).
//
// Pure tests — no IDB, no React, no services. All functions in layoutPersistence.ts
// are pure (serialize/deserialize are deterministic transforms; isLayoutEntry is a
// type guard). These tests run in any environment, including jsdom.

import { describe, it, expect } from "vitest";
import {
  LAYOUT_KEY,
  isLayoutEntry,
  serializeLayout,
  deserializeLayout,
  type LayoutEntry,
} from "./layoutPersistence";
import type { WindowEntry } from "../ui/useWindowManager";

// A minimal valid WindowEntry fixture with all fields required by WindowEntry.
// serializeLayout must pick only the 7 LayoutEntry fields from this — never
// id, instanceId, maximized, restoreRect, or snapSide.
const sampleWindow: WindowEntry = {
  id: "win-1",
  instanceId: "inst-abc",
  appType: "notes",
  title: "Notes",
  icon: "n",
  x: 100,
  y: 200,
  z: 201,
  minimized: false,
  maximized: false,
  restoreRect: null,
  snapSide: null,
};

describe("LAYOUT_KEY", () => {
  it("is the string 'windowLayout'", () => {
    expect(LAYOUT_KEY).toBe("windowLayout");
  });
});

describe("isLayoutEntry", () => {
  it("returns false for null", () => {
    expect(isLayoutEntry(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isLayoutEntry(undefined)).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isLayoutEntry(42)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isLayoutEntry("hello")).toBe(false);
  });

  it("returns false for an empty object", () => {
    expect(isLayoutEntry({})).toBe(false);
  });

  it("returns false when appType is missing", () => {
    expect(
      isLayoutEntry({ title: "Notes", icon: "n", x: 100, y: 200, z: 201, minimized: false }),
    ).toBe(false);
  });

  it("returns false when minimized is missing", () => {
    expect(
      isLayoutEntry({ appType: "notes", title: "Notes", icon: "n", x: 100, y: 200, z: 201 }),
    ).toBe(false);
  });

  it("returns false when x is not a number", () => {
    expect(
      isLayoutEntry({
        appType: "notes",
        title: "Notes",
        icon: "n",
        x: "100",
        y: 200,
        z: 201,
        minimized: false,
      }),
    ).toBe(false);
  });

  it("returns false when minimized is not a boolean", () => {
    expect(
      isLayoutEntry({
        appType: "notes",
        title: "Notes",
        icon: "n",
        x: 100,
        y: 200,
        z: 201,
        minimized: 0,
      }),
    ).toBe(false);
  });

  it("returns false when appType is not a string", () => {
    expect(
      isLayoutEntry({
        appType: 42,
        title: "Notes",
        icon: "n",
        x: 100,
        y: 200,
        z: 201,
        minimized: false,
      }),
    ).toBe(false);
  });

  it("returns true for a valid 7-field LayoutEntry", () => {
    const valid: LayoutEntry = {
      appType: "notes",
      title: "Notes",
      icon: "n",
      x: 100,
      y: 200,
      z: 201,
      minimized: false,
    };
    expect(isLayoutEntry(valid)).toBe(true);
  });

  it("returns true for a minimized entry", () => {
    expect(
      isLayoutEntry({
        appType: "clock",
        title: "Clock",
        icon: "c",
        x: 50,
        y: 80,
        z: 202,
        minimized: true,
      }),
    ).toBe(true);
  });

  it("returns false when an extra field like instanceId is present", () => {
    expect(
      isLayoutEntry({
        appType: "notes",
        title: "Notes",
        icon: "n",
        x: 100,
        y: 200,
        z: 201,
        minimized: false,
        instanceId: "x",
      }),
    ).toBe(false);
  });
});

describe("serializeLayout", () => {
  it("produces a JSON string from a single window", () => {
    const result = serializeLayout([sampleWindow]);
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed: unknown = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it("serialized object has exactly the 7 LayoutEntry keys", () => {
    const result = serializeLayout([sampleWindow]);
    const parsed = JSON.parse(result) as unknown[];
    const keys = Object.keys(parsed[0] as object).sort();
    expect(keys).toEqual(
      ["appType", "icon", "minimized", "title", "x", "y", "z"].sort(),
    );
  });

  it("never includes instanceId in serialized output", () => {
    const result = serializeLayout([sampleWindow]);
    expect(result).not.toContain("instanceId");
  });

  it("never includes id in serialized output", () => {
    const result = serializeLayout([sampleWindow]);
    const parsed = JSON.parse(result) as Record<string, unknown>[];
    expect(Object.keys(parsed[0])).not.toContain("id");
  });

  it("never includes maximized in serialized output", () => {
    const result = serializeLayout([sampleWindow]);
    expect(result).not.toContain("maximized");
  });

  it("never includes restoreRect in serialized output", () => {
    const result = serializeLayout([sampleWindow]);
    expect(result).not.toContain("restoreRect");
  });

  it("never includes snapSide in serialized output", () => {
    const result = serializeLayout([sampleWindow]);
    expect(result).not.toContain("snapSide");
  });

  it("serializes correct field values", () => {
    const result = serializeLayout([sampleWindow]);
    const parsed = JSON.parse(result) as LayoutEntry[];
    expect(parsed[0]).toMatchObject({
      appType: "notes",
      title: "Notes",
      icon: "n",
      x: 100,
      y: 200,
      z: 201,
      minimized: false,
    });
  });

  it("returns an empty JSON array for an empty windows array", () => {
    const result = serializeLayout([]);
    expect(JSON.parse(result)).toEqual([]);
  });

  it("handles multiple windows", () => {
    const second: WindowEntry = { ...sampleWindow, id: "win-2", instanceId: "inst-def", appType: "clock", title: "Clock", icon: "c", x: 300, y: 400, z: 202 };
    const result = serializeLayout([sampleWindow, second]);
    const parsed = JSON.parse(result) as LayoutEntry[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0].appType).toBe("notes");
    expect(parsed[1].appType).toBe("clock");
  });
});

describe("deserializeLayout", () => {
  it("returns [] for invalid JSON", () => {
    expect(deserializeLayout("not json")).toEqual([]);
  });

  it("returns [] for an empty string", () => {
    expect(deserializeLayout("")).toEqual([]);
  });

  it("returns [] for the string 'null'", () => {
    expect(deserializeLayout("null")).toEqual([]);
  });

  it("returns [] for a JSON object (not array)", () => {
    expect(deserializeLayout('{"appType":"notes"}')).toEqual([]);
  });

  it("returns [] for a valid array of non-LayoutEntry objects", () => {
    expect(deserializeLayout('[{"garbage":true}]')).toEqual([]);
  });

  it("returns 1 LayoutEntry for valid input", () => {
    const raw = JSON.stringify([
      { appType: "notes", title: "Notes", icon: "n", x: 100, y: 200, z: 201, minimized: false },
    ]);
    const result = deserializeLayout(raw);
    expect(result).toHaveLength(1);
    expect(result[0].appType).toBe("notes");
  });

  it("filters out invalid entries mixed with valid ones", () => {
    const raw = JSON.stringify([
      { appType: "notes", title: "Notes", icon: "n", x: 100, y: 200, z: 201, minimized: false },
      { garbage: true },
    ]);
    const result = deserializeLayout(raw);
    expect(result).toHaveLength(1);
    expect(result[0].appType).toBe("notes");
  });

  it("returns typed LayoutEntry objects (isLayoutEntry is true for each)", () => {
    const raw = JSON.stringify([
      { appType: "notes", title: "Notes", icon: "n", x: 100, y: 200, z: 201, minimized: false },
    ]);
    const result = deserializeLayout(raw);
    expect(result.every(isLayoutEntry)).toBe(true);
  });

  it("does not throw for any malformed input", () => {
    const badInputs = [
      "",
      "null",
      "undefined",
      "{",
      "[",
      "true",
      "42",
      '[{"appType":1}]',
    ];
    for (const input of badInputs) {
      expect(() => deserializeLayout(input)).not.toThrow();
    }
  });
});

describe("round-trip: serializeLayout → deserializeLayout", () => {
  it("recovers the 7 LayoutEntry fields from a serialized window", () => {
    const result = deserializeLayout(serializeLayout([sampleWindow]));
    expect(result).toHaveLength(1);
    const entry = result[0];
    expect(entry.appType).toBe(sampleWindow.appType);
    expect(entry.title).toBe(sampleWindow.title);
    expect(entry.icon).toBe(sampleWindow.icon);
    expect(entry.x).toBe(sampleWindow.x);
    expect(entry.y).toBe(sampleWindow.y);
    expect(entry.z).toBe(sampleWindow.z);
    expect(entry.minimized).toBe(sampleWindow.minimized);
  });

  it("round-trip result passes isLayoutEntry", () => {
    const result = deserializeLayout(serializeLayout([sampleWindow]));
    expect(result.every(isLayoutEntry)).toBe(true);
  });

  it("round-trip drops transient WindowEntry fields", () => {
    const result = deserializeLayout(serializeLayout([sampleWindow]));
    const entry = result[0] as Record<string, unknown>;
    expect(entry["instanceId"]).toBeUndefined();
    expect(entry["id"]).toBeUndefined();
    expect(entry["maximized"]).toBeUndefined();
    expect(entry["restoreRect"]).toBeUndefined();
    expect(entry["snapSide"]).toBeUndefined();
  });
});
