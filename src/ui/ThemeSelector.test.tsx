import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, act, cleanup, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { ThemeSelector } from "./ThemeSelector";
import { VibeThemeProvider } from "./VibeThemeProvider";
import { STORAGE_KEY_OS_THEME } from "../lib/storage";
import { ServicesProvider } from "../services/ServicesProvider";
import {
  createTestServices,
  createRecordingSettingsStore,
  type RecordingSettingsStore,
} from "../services/testServices";

// Wrap the selector in a VibeThemeProvider + ServicesProvider so useVibeTheme()
// resolves and useServices() finds the injected (recording) settings store.
// Mirrors the Plan-03 VibeThemeProvider.test.tsx wrapping.
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

describe("ThemeSelector", () => {
  beforeEach(() => {
    localStorage.clear();
    // Remove any CSS custom properties left on documentElement by a prior test.
    document.documentElement.style.cssText = "";
  });

  afterEach(() => {
    cleanup();
    document.documentElement.style.cssText = "";
  });

  it("renders exactly four pills labeled Aurora, Aero, Aqua, Noir", () => {
    const { getByRole } = renderWithServices(<ThemeSelector />);
    const group = getByRole("group", { name: "Color theme" });
    const pills = within(group).getAllByRole("button");
    expect(pills.map((p) => p.textContent)).toEqual([
      "Aurora",
      "Aero",
      "Aqua",
      "Noir",
    ]);
  });

  it("marks only the current theme's pill as pressed", () => {
    // Default theme is aurora when nothing is persisted.
    const { getByRole } = renderWithServices(<ThemeSelector />);
    expect(
      getByRole("button", { name: "Aurora" }).getAttribute("aria-pressed"),
    ).toBe("true");
    for (const label of ["Aero", "Aqua", "Noir"]) {
      expect(
        getByRole("button", { name: label }).getAttribute("aria-pressed"),
      ).toBe("false");
    }
  });

  it("clicking the Noir pill switches the active theme and re-skins documentElement", () => {
    const { getByRole } = renderWithServices(<ThemeSelector />);

    act(() => {
      getByRole("button", { name: "Noir" }).click();
    });

    // The clicked pill is now the pressed one (active theme = noir).
    expect(
      getByRole("button", { name: "Noir" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      getByRole("button", { name: "Aurora" }).getAttribute("aria-pressed"),
    ).toBe("false");

    // setTheme re-applied noir's contract on documentElement (THEME-02 live
    // re-skin) — noir --text value verbatim from the design contract.
    expect(document.documentElement.style.getPropertyValue("--text")).toBe(
      "#f5eeff",
    );
    // localStorage holds the new selection.
    expect(localStorage.getItem(STORAGE_KEY_OS_THEME)).toBe("noir");
  });
});
