// Tests for TtlCache — in-memory TTL cache with Clock DI.
// Uses createStubClock for deterministic hit/miss behavior without real timers.

import { describe, it, expect } from "vitest";
import { TtlCache } from "./ttlCache";
import type { TtlCacheOptions } from "./ttlCache";
import { createStubClock } from "./clock";

describe("TtlCache — in-memory TTL cache with Clock DI (DATA-04)", () => {
  describe("cold miss", () => {
    it("returns undefined for a key never set", () => {
      const clock = createStubClock(0);
      const cache = new TtlCache({ clock });
      expect(cache.get("nonexistent")).toBeUndefined();
    });
  });

  describe("TTL hit", () => {
    it("returns data when clock is at the set time (same instant)", () => {
      const clock = createStubClock(0);
      const cache = new TtlCache({ clock });
      cache.set("k", { value: 42 }, 60_000);
      expect(cache.get("k")).toEqual({ value: 42 });
    });

    it("returns data when clock is before expiry", () => {
      const clock = createStubClock(0);
      const cache = new TtlCache({ clock });
      cache.set("k", "hello", 60_000);
      // advance 30 seconds — still within TTL
      clock.sleep(30_000);
      expect(cache.get("k")).toBe("hello");
    });

    it("returns data exactly at the expiry boundary (clock.now() === expiresAt)", () => {
      const clock = createStubClock(0);
      const cache = new TtlCache({ clock });
      cache.set("k", "boundary", 60_000);
      // advance exactly to expiry
      clock.sleep(60_000);
      // clock.now() === expiresAt (60_000) — should still be a hit per: now() <= expiresAt
      expect(cache.get("k")).toBe("boundary");
    });
  });

  describe("TTL miss / expiry", () => {
    it("returns undefined after TTL expires", () => {
      const clock = createStubClock(0);
      const cache = new TtlCache({ clock });
      cache.set("k", { data: 99 }, 60_000);
      // advance past TTL
      clock.sleep(70_000);
      expect(cache.get("k")).toBeUndefined();
    });

    it("deletes the entry on expiry (subsequent get also misses)", () => {
      const clock = createStubClock(0);
      const cache = new TtlCache({ clock });
      cache.set("k", "gone", 60_000);
      clock.sleep(70_000);
      // first get triggers eviction
      expect(cache.get("k")).toBeUndefined();
      // second get also misses (not reinstated)
      expect(cache.get("k")).toBeUndefined();
    });

    it("returns undefined after exactly one ms past expiry", () => {
      const clock = createStubClock(0);
      const cache = new TtlCache({ clock });
      cache.set("k", "data", 60_000);
      clock.sleep(60_001);
      expect(cache.get("k")).toBeUndefined();
    });
  });

  describe("set overwrites", () => {
    it("latest write wins when same key is set twice", () => {
      const clock = createStubClock(0);
      const cache = new TtlCache({ clock });
      cache.set("k", "first", 60_000);
      cache.set("k", "second", 60_000);
      expect(cache.get("k")).toBe("second");
    });

    it("can reset TTL by overwriting with a new set", () => {
      const clock = createStubClock(0);
      const cache = new TtlCache({ clock });
      cache.set("k", "original", 60_000);
      // advance 50 seconds (still live)
      clock.sleep(50_000);
      // refresh with a new 60-second TTL from now (now=50_000, expires=110_000)
      cache.set("k", "refreshed", 60_000);
      // advance another 30 seconds (now=80_000 — would have expired at 60_000 if not refreshed)
      clock.sleep(30_000);
      expect(cache.get("k")).toBe("refreshed");
    });
  });

  describe("multiple keys", () => {
    it("independently tracks TTL per key", () => {
      const clock = createStubClock(0);
      const cache = new TtlCache({ clock });
      cache.set("short", "a", 10_000);
      cache.set("long", "b", 120_000);
      clock.sleep(30_000);
      expect(cache.get("short")).toBeUndefined(); // expired
      expect(cache.get("long")).toBe("b"); // still live
    });
  });

  describe("data types", () => {
    it("stores and retrieves objects", () => {
      const clock = createStubClock(0);
      const cache = new TtlCache({ clock });
      const obj = { foo: "bar", nested: { x: 1 } };
      cache.set("obj", obj, 60_000);
      expect(cache.get("obj")).toBe(obj); // same reference
    });

    it("stores and retrieves null", () => {
      const clock = createStubClock(0);
      const cache = new TtlCache({ clock });
      cache.set("nullval", null, 60_000);
      expect(cache.get("nullval")).toBeNull();
    });

    it("stores and retrieves arrays", () => {
      const clock = createStubClock(0);
      const cache = new TtlCache({ clock });
      const arr = [1, 2, 3];
      cache.set("arr", arr, 60_000);
      expect(cache.get("arr")).toEqual([1, 2, 3]);
    });
  });

  describe("TypeScript interface compliance", () => {
    it("TtlCacheOptions requires a clock field", () => {
      const clock = createStubClock(0);
      const opts: TtlCacheOptions = { clock };
      const cache = new TtlCache(opts);
      expect(cache).toBeDefined();
    });

    it("is not a singleton — each instance is independent", () => {
      const clock1 = createStubClock(0);
      const clock2 = createStubClock(0);
      const cache1 = new TtlCache({ clock: clock1 });
      const cache2 = new TtlCache({ clock: clock2 });
      cache1.set("k", "cache1-value", 60_000);
      expect(cache2.get("k")).toBeUndefined();
    });
  });
});
