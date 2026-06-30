// ThemeEditor comprehensive test suite (Phase 22, THEME-06/07/10).
//
// 12 behavior tests covering: live :root preview, CSS.supports rejection gate,
// IDB write path, customThemeIndex update, localStorage mirror, broadcastTheme
// spy, delete auto-switch ordering, built-in name collision guard,
// sanitizeDisplayName enforcement, contrast advisory warning, and cancel restore.
//
// JSDOM 29 does not implement window.CSS — every test that exercises the
// CSS.supports gate requires the stub defined in beforeEach below.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { ThemeEditor, type ThemeEditorProps } from "./ThemeEditor";
import { VibeThemeProvider } from "./VibeThemeProvider";
import { ServicesProvider } from "../services/ServicesProvider";
import {
  createTestServices,
  createRecordingSettingsStore,
  type RecordingSettingsStore,
} from "../services/testServices";
import * as frameMountModule from "../execution/frameMount";
import { STORAGE_KEY_OS_THEME } from "../lib/storage";
import { VIBE_THEMES } from "./VibeThemeProvider";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Render ThemeEditor wrapped in the required context providers.
 * Uses a fresh recording store per call unless one is supplied.
 */
function renderThemeEditor(
  props: Partial<ThemeEditorProps> & { onClose?: () => void } = {},
  settingsStore: RecordingSettingsStore = createRecordingSettingsStore(),
): { container: HTMLElement; settingsStore: RecordingSettingsStore } {
  const resolvedProps: ThemeEditorProps = {
    onClose: vi.fn(),
    ...props,
  };
  const utils = render(
    <ServicesProvider services={createTestServices({ settingsStore })}>
      <VibeThemeProvider>
        <ThemeEditor {...resolvedProps} />
      </VibeThemeProvider>
    </ServicesProvider>,
  );
  return { container: utils.container, settingsStore };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // CSS.supports is not defined in JSDOM 29 — stub it to return true (valid).
  Object.defineProperty(window, "CSS", {
    value: { supports: vi.fn().mockReturnValue(true) },
    writable: true,
    configurable: true,
  });
  localStorage.clear();
  document.documentElement.style.cssText = "";
});

afterEach(() => {
  cleanup();
  document.documentElement.style.cssText = "";
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ThemeEditor", () => {
  // Test 1 — live preview mutates :root without saving to IDB
  it("live preview: changing a var input sets :root immediately without IDB write", () => {
    const store = createRecordingSettingsStore();
    renderThemeEditor({}, store);

    const textInput = screen.getByDisplayValue(VIBE_THEMES.aurora["--text"]!);
    fireEvent.change(textInput, { target: { value: "#aabbcc" } });

    expect(
      document.documentElement.style.getPropertyValue("--text"),
    ).toBe("#aabbcc");
    // No IDB write should have happened during live preview.
    expect(store.rawWriteCount("custom:mytheme")).toBe(0);
  });

  // Test 2 — CSS.supports rejection: invalid value blocks all IDB writes
  it("CSS.supports rejection: invalid color value shows error and writes nothing to IDB", async () => {
    // Override CSS stub to return false (invalid CSS value).
    Object.defineProperty(window, "CSS", {
      value: { supports: vi.fn().mockReturnValue(false) },
      writable: true,
      configurable: true,
    });

    const store = createRecordingSettingsStore();
    renderThemeEditor({ onClose: vi.fn() }, store);

    // Fill the name input.
    const nameInput = screen.getByPlaceholderText("My theme");
    fireEvent.change(nameInput, { target: { value: "mytheme" } });

    // Click Save.
    await act(async () => {
      screen.getByText("Save theme").click();
    });

    // No IDB write should have occurred.
    expect(store.rawWriteCount("custom:mytheme")).toBe(0);
    // An error message should be visible.
    const errorEl = document.querySelector(".theme-editor__error");
    expect(errorEl).not.toBeNull();
    expect(errorEl!.textContent).toMatch(/invalid color value/i);
  });

  // Test 3 — save writes theme vars to IDB under "custom:<name>"
  it("save: writes writeRaw('custom:mytheme', ...) with the 12 vars", async () => {
    const store = createRecordingSettingsStore();
    renderThemeEditor({ onClose: vi.fn() }, store);

    const nameInput = screen.getByPlaceholderText("My theme");
    fireEvent.change(nameInput, { target: { value: "mytheme" } });

    await act(async () => {
      screen.getByText("Save theme").click();
    });

    expect(store.rawWriteCount("custom:mytheme")).toBe(1);
    const written = store.rawWrites.get("custom:mytheme")?.[0];
    expect(written).toBeDefined();
    const parsed = JSON.parse(written!) as Record<string, string>;
    expect(parsed["--text"]).toBeDefined();
    expect(typeof parsed["--text"]).toBe("string");
  });

  // Test 4 — save writes the customThemeIndex
  it("save: writes customThemeIndex containing the new theme name", async () => {
    const store = createRecordingSettingsStore();
    renderThemeEditor({ onClose: vi.fn() }, store);

    const nameInput = screen.getByPlaceholderText("My theme");
    fireEvent.change(nameInput, { target: { value: "mytheme" } });

    await act(async () => {
      screen.getByText("Save theme").click();
    });

    expect(store.rawWriteCount("customThemeIndex")).toBe(1);
    const indexRaw = store.rawWrites.get("customThemeIndex")?.[0];
    expect(indexRaw).toBeDefined();
    const indexArr = JSON.parse(indexRaw!) as string[];
    expect(indexArr).toContain("mytheme");
  });

  // Test 5 — save mirrors vars to localStorage
  it("save: mirrors vars to localStorage['vibe.customTheme.mytheme']", async () => {
    const store = createRecordingSettingsStore();
    renderThemeEditor({ onClose: vi.fn() }, store);

    const nameInput = screen.getByPlaceholderText("My theme");
    fireEvent.change(nameInput, { target: { value: "mytheme" } });

    await act(async () => {
      screen.getByText("Save theme").click();
    });

    const lsMirror = localStorage.getItem("vibe.customTheme.mytheme");
    expect(lsMirror).not.toBeNull();
    const parsed = JSON.parse(lsMirror!) as Record<string, string>;
    expect(parsed["--text"]).toBeDefined();
  });

  // Test 6 — save triggers broadcastTheme via setTheme
  it("save: broadcastTheme is called once with the vars object", async () => {
    const broadcast = vi
      .spyOn(frameMountModule, "broadcastTheme")
      .mockImplementation(() => {});

    try {
      const store = createRecordingSettingsStore();
      renderThemeEditor({ onClose: vi.fn() }, store);

      const nameInput = screen.getByPlaceholderText("My theme");
      fireEvent.change(nameInput, { target: { value: "mytheme" } });

      await act(async () => {
        screen.getByText("Save theme").click();
      });

      expect(broadcast).toHaveBeenCalledTimes(1);
      // Verify broadcastTheme received an object with the --text CSS var key.
      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ "--text": expect.any(String) }),
      );
    } finally {
      broadcast.mockRestore();
    }
  });

  // Test 7 — delete: setTheme("aurora") is called BEFORE deleteRaw
  it("delete: setTheme('aurora') is invoked before deleteRaw('custom:existingTheme')", async () => {
    const store = createRecordingSettingsStore();
    // Pre-seed the index so refreshCustomThemes finds the theme on mount.
    await store.writeRaw(
      "customThemeIndex",
      JSON.stringify(["existingTheme"]),
    );
    await store.writeRaw(
      "custom:existingTheme",
      JSON.stringify({ ...VIBE_THEMES.aurora }),
    );

    // Track call order via a shared log.
    const callOrder: string[] = [];

    const broadcast = vi
      .spyOn(frameMountModule, "broadcastTheme")
      .mockImplementation(() => {
        callOrder.push("broadcastTheme");
      });

    // Spy on deleteRaw to record when it fires.
    const origDeleteRaw = store.deleteRaw.bind(store);
    store.deleteRaw = async (key: string) => {
      callOrder.push(`deleteRaw:${key}`);
      return origDeleteRaw(key);
    };

    try {
      renderThemeEditor({ onClose: vi.fn(), editingName: "existingTheme" }, store);

      // broadcastTheme is called by setTheme("aurora") — must fire before delete.
      await act(async () => {
        screen.getByText("Delete theme").click();
      });

      const broadcastIdx = callOrder.findIndex((e) =>
        e === "broadcastTheme",
      );
      const deleteIdx = callOrder.findIndex((e) =>
        e === "deleteRaw:custom:existingTheme",
      );

      expect(broadcastIdx).toBeGreaterThanOrEqual(0);
      expect(deleteIdx).toBeGreaterThan(broadcastIdx);
      expect(store.rawDeletes.includes("custom:existingTheme")).toBe(true);
    } finally {
      broadcast.mockRestore();
    }
  });

  // Test 8 — built-in name "aurora" is stored under "custom:aurora"
  it("collision guard: name 'aurora' is stored as 'custom:aurora', not 'aurora'", async () => {
    const store = createRecordingSettingsStore();
    renderThemeEditor({ onClose: vi.fn() }, store);

    const nameInput = screen.getByPlaceholderText("My theme");
    fireEvent.change(nameInput, { target: { value: "aurora" } });

    await act(async () => {
      screen.getByText("Save theme").click();
    });

    expect(store.rawWriteCount("custom:aurora")).toBe(1);
    expect(store.rawWriteCount("aurora")).toBe(0);
  });

  // Test 9 — sanitizeDisplayName is applied to the user-supplied name
  it("sanitizeDisplayName: name is sanitized before use in the IDB key", async () => {
    const store = createRecordingSettingsStore();
    renderThemeEditor({ onClose: vi.fn() }, store);

    // "My Theme" has no banned tokens — sanitized result is "My Theme".
    const nameInput = screen.getByPlaceholderText("My theme");
    fireEvent.change(nameInput, { target: { value: "My Theme" } });

    await act(async () => {
      screen.getByText("Save theme").click();
    });

    // The IDB key must use the sanitized name (no raw user string bypass).
    expect(store.rawWriteCount("custom:My Theme")).toBe(1);
  });

  // Test 10 — contrast warning renders for low-contrast --text/--wall pair
  it("contrast warning: role=alert appears when --text and --wall (hex) have contrast < 4.5", () => {
    // #777777 on #ffffff: contrast ratio ≈ 4.48 (below 4.5 WCAG AA).
    // --wall must be a hex string so contrastRatio can parse it (non-null return).
    renderThemeEditor({
      initialVars: {
        ...VIBE_THEMES.aurora,
        "--text": "#777777",
        "--wall": "#ffffff",
      },
    });

    const alert = screen.queryByRole("alert");
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toMatch(/low contrast/i);
  });

  // Test 10b — built-in theme (gradient --wall) does NOT trip the contrast warning
  it("contrast warning: role=alert is absent for built-in themes (gradient --wall → null ratio)", () => {
    // All built-in themes use a radial-gradient for --wall.
    // contrastRatio returns null for non-hex values, so the warning never fires.
    renderThemeEditor({
      initialVars: { ...VIBE_THEMES.aurora },
    });

    const alert = screen.queryByRole("alert");
    expect(alert).toBeNull();
  });

  // Test 11 — contrast warning absent for high-contrast hex pair
  it("contrast warning: role=alert is absent when --text and --wall (hex) have contrast >= 4.5", () => {
    // #ffffff on #000000: contrast ratio = 21:1 (well above threshold).
    renderThemeEditor({
      initialVars: {
        ...VIBE_THEMES.aurora,
        "--text": "#ffffff",
        "--wall": "#000000",
      },
    });

    const alert = screen.queryByRole("alert");
    expect(alert).toBeNull();
  });

  // Test WR-01 — reserved-word-only name shows error instead of silently saving as "App"
  it("WR-01: name that sanitizes entirely to 'App' shows error and writes nothing", async () => {
    // 'synthesize' is a banned token; sanitizeDisplayName returns "App" for it.
    // The editor should surface an error rather than saving silently as "App".
    const store = createRecordingSettingsStore();
    renderThemeEditor({ onClose: vi.fn() }, store);

    const nameInput = screen.getByPlaceholderText("My theme");
    fireEvent.change(nameInput, { target: { value: "synthesize" } });

    await act(async () => {
      screen.getByText("Save theme").click();
    });

    // No IDB write should occur.
    expect(store.rawWriteCount("custom:App")).toBe(0);
    // An error message must be visible.
    const errorEl = document.querySelector(".theme-editor__error");
    expect(errorEl).not.toBeNull();
    expect(errorEl!.textContent).toMatch(/reserved words/i);
  });

  // Test WR-01b — user typing "App" (the exact fallback word) is allowed through
  it("WR-01b: user typing literal 'App' is saved under 'custom:App' without error", async () => {
    // "App" is not a banned token — sanitizeDisplayName("App") returns "App".
    // The guard only fires when sanitization PRODUCES "App" from non-"app" input.
    const store = createRecordingSettingsStore();
    renderThemeEditor({ onClose: vi.fn() }, store);

    const nameInput = screen.getByPlaceholderText("My theme");
    fireEvent.change(nameInput, { target: { value: "App" } });

    await act(async () => {
      screen.getByText("Save theme").click();
    });

    // Should save under "custom:App" with no validation error.
    expect(store.rawWriteCount("custom:App")).toBe(1);
    const errorEl = document.querySelector(".theme-editor__error");
    expect(errorEl).toBeNull();
  });

  // Test 12 — cancel restores :root to original values
  it("cancel: clicking Cancel restores :root CSS vars to their pre-open state", () => {
    // Set a known value on :root before opening the editor.
    document.documentElement.style.setProperty("--text", "#original");

    renderThemeEditor({ onClose: vi.fn() });

    // Change the input (live preview mutates :root).
    const textInput = screen.getByDisplayValue(VIBE_THEMES.aurora["--text"]!);
    fireEvent.change(textInput, { target: { value: "#changed" } });

    expect(
      document.documentElement.style.getPropertyValue("--text"),
    ).toBe("#changed");

    // Click Cancel — should restore the pre-open value.
    act(() => {
      screen.getByText("Cancel").click();
    });

    expect(
      document.documentElement.style.getPropertyValue("--text"),
    ).toBe("#original");
  });

  // Test CR-01 — rename: old IDB entry + old localStorage mirror removed; no duplicate pill
  it("CR-01: renaming a theme removes the old IDB key and old localStorage mirror", async () => {
    const store = createRecordingSettingsStore();
    // Pre-seed the store as if "oldTheme" already exists.
    await store.writeRaw(
      "customThemeIndex",
      JSON.stringify(["oldTheme"]),
    );
    await store.writeRaw(
      "custom:oldTheme",
      JSON.stringify({ ...VIBE_THEMES.aurora }),
    );
    localStorage.setItem(
      "vibe.customTheme.oldTheme",
      JSON.stringify({ ...VIBE_THEMES.aurora }),
    );

    const onClose = vi.fn();
    renderThemeEditor({ onClose, editingName: "oldTheme" }, store);

    // Change the name to "newTheme" (a rename).
    const nameInput = screen.getByDisplayValue("oldTheme");
    fireEvent.change(nameInput, { target: { value: "newTheme" } });

    await act(async () => {
      screen.getByText("Save theme").click();
    });

    // Old IDB entry must be deleted exactly once.
    expect(store.rawDeletes.includes("custom:oldTheme")).toBe(true);
    expect(store.rawDeletes.filter((k) => k === "custom:oldTheme").length).toBe(1);

    // Old localStorage mirror must be gone.
    expect(localStorage.getItem("vibe.customTheme.oldTheme")).toBeNull();

    // New IDB entry must be written.
    expect(store.rawWriteCount("custom:newTheme")).toBe(1);

    // Index must contain ONLY newTheme (not both oldTheme and newTheme).
    const indexRaw = store.rawWrites.get("customThemeIndex")?.[store.rawWriteCount("customThemeIndex") - 1];
    expect(indexRaw).toBeDefined();
    const indexArr = JSON.parse(indexRaw!) as string[];
    expect(indexArr).toContain("newTheme");
    expect(indexArr).not.toContain("oldTheme");

    // onClose must have been called (save completed).
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
