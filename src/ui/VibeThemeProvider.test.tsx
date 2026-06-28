import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { useContext, type ReactNode } from "react";
import {
  VibeThemeProvider,
  VibeThemeContext,
  VIBE_THEMES,
} from "./VibeThemeProvider";
import * as frameMountModule from "../execution/frameMount";
import { STORAGE_KEY_OS_THEME } from "../lib/storage";
import { ServicesProvider } from "../services/ServicesProvider";
import {
  createTestServices,
  createRecordingSettingsStore,
  type RecordingSettingsStore,
} from "../services/testServices";

// A consumer that surfaces the named-theme context so tests can read the
// current theme and drive setTheme via testid buttons (the theme.test.tsx
// Probe idiom).
function Probe() {
  const ctx = useContext(VibeThemeContext);
  if (!ctx) throw new Error("no vibe theme context");
  return (
    <div>
      <span data-testid="theme">{ctx.theme}</span>
      <button data-testid="set-aero" onClick={() => ctx.setTheme("aero")} />
      <button data-testid="set-aqua" onClick={() => ctx.setTheme("aqua")} />
      <button data-testid="set-noir" onClick={() => ctx.setTheme("noir")} />
    </div>
  );
}

// Wrap the provider in a ServicesProvider so useServices() resolves the
// injected (recording) settings store. Defaults to a fresh recording store.
function renderWithServices(
  ui: ReactNode,
  settingsStore: RecordingSettingsStore = createRecordingSettingsStore(),
) {
  return render(
    <ServicesProvider services={createTestServices({ settingsStore })}>
      <VibeThemeProvider>{ui}</VibeThemeProvider>
    </ServicesProvider>,
  );
}

describe("VibeThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    // Remove any CSS custom properties set on documentElement by a prior test.
    document.documentElement.style.cssText = "";
  });

  afterEach(() => {
    cleanup();
    document.documentElement.style.cssText = "";
  });

  it("defaults to aurora when nothing is persisted", () => {
    const { getByTestId } = renderWithServices(<Probe />);
    expect(getByTestId("theme").textContent).toBe("aurora");
  });

  it("reads the persisted theme name from localStorage on mount", () => {
    localStorage.setItem(STORAGE_KEY_OS_THEME, "noir");
    const { getByTestId } = renderWithServices(<Probe />);
    expect(getByTestId("theme").textContent).toBe("noir");
  });

  it("falls back to aurora when the stored value is invalid", () => {
    localStorage.setItem(STORAGE_KEY_OS_THEME, "bogus");
    const { getByTestId } = renderWithServices(<Probe />);
    expect(getByTestId("theme").textContent).toBe("aurora");
  });

  it("applies the stored theme's CSS custom properties to documentElement on mount", () => {
    localStorage.setItem(STORAGE_KEY_OS_THEME, "noir");
    renderWithServices(<Probe />);
    const root = document.documentElement;
    // noir --text and --glass values (verbatim from the design contract).
    expect(root.style.getPropertyValue("--text")).toBe("#f5eeff");
    expect(root.style.getPropertyValue("--glass")).toBe(
      "rgba(255,255,255,0.055)",
    );
  });

  it("setTheme applies the new theme's variables and persists to localStorage", () => {
    const { getByTestId } = renderWithServices(<Probe />);
    act(() => {
      getByTestId("set-aero").click();
    });
    const root = document.documentElement;
    // aero --text value.
    expect(root.style.getPropertyValue("--text")).toBe("#eef6ff");
    expect(getByTestId("theme").textContent).toBe("aero");
    expect(localStorage.getItem(STORAGE_KEY_OS_THEME)).toBe("aero");
  });

  it("setTheme mirrors the choice to the injected settings store exactly once (offline)", () => {
    const settingsStore = createRecordingSettingsStore();
    const { getByTestId } = renderWithServices(<Probe />, settingsStore);
    act(() => {
      getByTestId("set-aqua").click();
    });
    expect(settingsStore.writeCount).toBe(1);
    expect(settingsStore.writes).toEqual(["aqua"]);
  });

  it("setTheme pushes the new theme's variables to every live frame exactly once", () => {
    const broadcast = vi
      .spyOn(frameMountModule, "broadcastTheme")
      .mockImplementation(() => {});
    try {
      const { getByTestId } = renderWithServices(<Probe />);
      act(() => {
        getByTestId("set-noir").click();
      });
      expect(broadcast).toHaveBeenCalledTimes(1);
      expect(broadcast).toHaveBeenCalledWith(VIBE_THEMES.noir);
    } finally {
      broadcast.mockRestore();
    }
  });
});
