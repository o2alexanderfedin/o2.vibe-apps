import { describe, it, expect } from "vitest";
import { slugFromText, EXAMPLE_CHIPS } from "./launcherUtils";

describe("slugFromText", () => {
  it('converts "a pomodoro timer" to "pomodoro-timer"', () => {
    expect(slugFromText("a pomodoro timer")).toBe("pomodoro-timer");
  });

  it('converts "an alarm clock" to "alarm-clock"', () => {
    expect(slugFromText("an alarm clock")).toBe("alarm-clock");
  });

  it('converts "the weather dashboard" to "weather-dashboard"', () => {
    expect(slugFromText("the weather dashboard")).toBe("weather-dashboard");
  });

  it('trims and lowercases "  Notes App  " to "notes-app"', () => {
    expect(slugFromText("  Notes App  ")).toBe("notes-app");
  });

  it('converts "a/b + c" to "a-b-c" (non-alphanumeric become hyphens)', () => {
    expect(slugFromText("a/b + c")).toBe("a-b-c");
  });

  // Empty-slug boundary cases — the inputs behind the WR-02 guard. Pure
  // punctuation strips to nothing; a bare article keeps its letters because the
  // article strip only fires at a trailing word boundary.
  it('reduces pure punctuation "!!!" to an empty slug', () => {
    expect(slugFromText("!!!")).toBe("");
  });

  it('reduces "???" to an empty slug', () => {
    expect(slugFromText("???")).toBe("");
  });

  it('reduces "   .  " (whitespace + punctuation) to an empty slug', () => {
    expect(slugFromText("   .  ")).toBe("");
  });

  it('keeps a bare article "the" (no trailing word boundary to strip)', () => {
    expect(slugFromText("the")).toBe("the");
  });

  // Letters are letters in any script. A description written in Cyrillic, CJK,
  // Devanagari, or with accents must keep its letters — otherwise the slug is
  // empty and the launcher refuses to open the app at all.
  it('keeps Cyrillic letters: "таймер помодоро" → "таймер-помодоро"', () => {
    expect(slugFromText("таймер помодоро")).toBe("таймер-помодоро");
  });

  it('keeps CJK characters: "番茄钟" → "番茄钟"', () => {
    expect(slugFromText("番茄钟")).toBe("番茄钟");
  });

  it('keeps accented Latin letters: "Café Timer" → "café-timer"', () => {
    expect(slugFromText("Café Timer")).toBe("café-timer");
  });

  it('keeps combining marks inside a word: "टाइमर" stays one word', () => {
    expect(slugFromText("टाइमर")).toBe("टाइमर");
  });

  it("folds composed and decomposed accents to the same slug", () => {
    expect(slugFromText("cafe\u0301")).toBe(slugFromText("caf\u00e9"));
  });

  it("still turns symbols and emoji into separators", () => {
    expect(slugFromText("⏰ таймер!")).toBe("таймер");
  });
});

describe("EXAMPLE_CHIPS", () => {
  it("has exactly 3 entries", () => {
    expect(EXAMPLE_CHIPS).toHaveLength(3);
  });

  it("each entry has non-zero length", () => {
    for (const chip of EXAMPLE_CHIPS) {
      expect(chip.length).toBeGreaterThan(0);
    }
  });

  it("no entry contains banned tokens", () => {
    const bannedPattern =
      /synthesi[sz]|\bfake\b|\bmock\b|\bAI\b|\bllm\b|\bgenerat(e|ed|ing)\b/i;
    for (const chip of EXAMPLE_CHIPS) {
      expect(bannedPattern.test(chip)).toBe(false);
    }
  });
});
