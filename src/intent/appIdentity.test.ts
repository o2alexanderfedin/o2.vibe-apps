// The key a window's app is cached under must be the same whether the app is
// being opened, tweaked, or restored after a reload. These tests pin the keys
// used before tweaks were saved, so apps already in the cache still open.

import { describe, expect, it } from "vitest";
import { appIdentity } from "./appIdentity";
import { registryKey } from "../registry/cacheKey";

describe("appIdentity", () => {
  it("an app opened by name keys on its type alone, with no prompt", async () => {
    const id = await appIdentity("notes");
    expect(id.cacheKey).toBe(await registryKey("app", "notes"));
    expect(id.prompt).toBeUndefined();
  });

  it("a described app keys exactly as the describe path always has", async () => {
    const id = await appIdentity("pomodoro", "a pomodoro timer");
    expect(id.cacheKey).toBe(await registryKey("app", "pomodoro", "a pomodoro timer"));
    expect(id.prompt).toBe("a pomodoro timer");
  });

  it("a tweaked catalogue app keys exactly as the tweak path always has", async () => {
    const id = await appIdentity("notes", undefined, "make it blue");
    expect(id.cacheKey).toBe(await registryKey("app", "notes", "make it blue"));
    expect(id.prompt).toBe("make it blue");
  });

  it("a tweaked described app asks for both the description and the tweak", async () => {
    const id = await appIdentity("pomodoro", "a pomodoro timer", "make it blue");
    expect(id.prompt).toContain("a pomodoro timer");
    expect(id.prompt).toContain("make it blue");
    expect(id.cacheKey).not.toBe(await registryKey("app", "pomodoro", "a pomodoro timer"));
    expect(id.cacheKey).not.toBe(await registryKey("app", "pomodoro", "make it blue"));
  });

  it("moving a word between the description and the tweak gives a different app", async () => {
    const a = await appIdentity("t", "a timer that", "rings loudly");
    const b = await appIdentity("t", "a timer", "that rings loudly");
    expect(a.cacheKey).not.toBe(b.cacheKey);
  });
});
