import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup, within, waitFor, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ThemeSelector } from "./ThemeSelector";
import { VibeThemeProvider, VIBE_THEMES } from "./VibeThemeProvider";
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

  it("renders built-in theme pills labeled Aurora, Aero, Aqua, Noir", () => {
    const { getByRole, container } = renderWithServices(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <ThemeSelector onOpenThemeEditor={vi.fn()} />,
    );
    const group = getByRole("group", { name: "Color theme" });
    // The four built-in pills are present and accessible by name.
    expect(within(group).getByRole("button", { name: "Aurora" })).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Aero" })).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Aqua" })).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Noir" })).toBeTruthy();
    void container; // suppress unused warning
  });

  it("marks only the current theme's pill as pressed", () => {
    // Default theme is aurora when nothing is persisted.
    const { getByRole } = renderWithServices(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <ThemeSelector onOpenThemeEditor={vi.fn()} />,
    );
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
    const { getByRole } = renderWithServices(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <ThemeSelector onOpenThemeEditor={vi.fn()} />,
    );

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

  // ----------------------------------------------------------------
  // Phase 22 (THEME-07/08): custom theme pills, Duplicate, New Theme
  // ----------------------------------------------------------------

  it("renders custom theme pills alongside built-in pills when customThemes has entries", async () => {
    const settingsStore = createRecordingSettingsStore();
    const customVars1 = { ...VIBE_THEMES["aurora"], "--text": "#ff0000" };
    const customVars2 = { ...VIBE_THEMES["aurora"], "--text": "#0000ff" };
    await settingsStore.writeRaw(
      "customThemeIndex",
      JSON.stringify(["myTheme", "darkMode"]),
    );
    await settingsStore.writeRaw("custom:myTheme", JSON.stringify(customVars1));
    await settingsStore.writeRaw("custom:darkMode", JSON.stringify(customVars2));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderWithServices(<ThemeSelector onOpenThemeEditor={vi.fn()} />, settingsStore);

    // Wait for custom themes to be loaded from the pre-seeded store.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "myTheme" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "darkMode" })).toBeInTheDocument();
  });

  it("clicking a custom theme pill calls setTheme('custom:<name>', vars)", async () => {
    const settingsStore = createRecordingSettingsStore();
    const customVars = { ...VIBE_THEMES["aurora"], "--text": "#abcdef" };
    await settingsStore.writeRaw(
      "customThemeIndex",
      JSON.stringify(["myTheme"]),
    );
    await settingsStore.writeRaw("custom:myTheme", JSON.stringify(customVars));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderWithServices(<ThemeSelector onOpenThemeEditor={vi.fn()} />, settingsStore);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "myTheme" })).toBeInTheDocument();
    });

    act(() => {
      screen.getByRole("button", { name: "myTheme" }).click();
    });

    // setTheme("custom:myTheme") writes to localStorage (canonical selection key).
    expect(localStorage.getItem(STORAGE_KEY_OS_THEME)).toBe("custom:myTheme");
    // The pill reflects the active state.
    expect(
      screen.getByRole("button", { name: "myTheme" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("renders a 'New Theme' button and clicking it calls onOpenThemeEditor()", () => {
    const onOpenThemeEditor = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderWithServices(<ThemeSelector onOpenThemeEditor={onOpenThemeEditor} />);

    const btn = screen.getByRole("button", { name: /new theme/i });
    act(() => {
      btn.click();
    });

    // Called once with no arguments (undefined opts → open blank editor).
    expect(onOpenThemeEditor).toHaveBeenCalledTimes(1);
    expect(onOpenThemeEditor).toHaveBeenCalledWith(undefined);
  });

  it("each built-in pill has a Duplicate button; clicking Aurora's calls onOpenThemeEditor with Aurora's vars", () => {
    const onOpenThemeEditor = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderWithServices(<ThemeSelector onOpenThemeEditor={onOpenThemeEditor} />);

    // The Duplicate button for Aurora is accessible by its aria-label.
    const duplicateBtn = screen.getByRole("button", { name: "Duplicate Aurora" });
    act(() => {
      duplicateBtn.click();
    });

    expect(onOpenThemeEditor).toHaveBeenCalledTimes(1);
    expect(onOpenThemeEditor).toHaveBeenCalledWith({
      initialVars: VIBE_THEMES["aurora"],
    });
  });

  it("custom theme pills have an Edit button; clicking it calls onOpenThemeEditor with vars and editingName", async () => {
    const settingsStore = createRecordingSettingsStore();
    const customVars = { ...VIBE_THEMES["aurora"], "--text": "#123456" };
    await settingsStore.writeRaw(
      "customThemeIndex",
      JSON.stringify(["myTheme"]),
    );
    await settingsStore.writeRaw("custom:myTheme", JSON.stringify(customVars));

    const onOpenThemeEditor = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderWithServices(<ThemeSelector onOpenThemeEditor={onOpenThemeEditor} />, settingsStore);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Edit myTheme" })).toBeInTheDocument();
    });

    act(() => {
      screen.getByRole("button", { name: "Edit myTheme" }).click();
    });

    expect(onOpenThemeEditor).toHaveBeenCalledTimes(1);
    expect(onOpenThemeEditor).toHaveBeenCalledWith({
      initialVars: customVars,
      editingName: "myTheme",
    });
  });
});
