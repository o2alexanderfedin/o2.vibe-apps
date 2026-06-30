import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, cleanup, waitFor } from "@testing-library/react";
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

// Custom-vars fixture used by tests 3 and 7. Defined at module scope so both
// the button click handler (inside JSX) and the test assertion reference the
// same object identity.
const CUSTOM_TEST_VARS = { "--text": "#ctest01" };

// Extended Probe for Phase 22 custom-theme tests. Exposes currentVars,
// customThemes, refreshCustomThemes, and a custom setTheme button.
function CustomProbe() {
  const ctx = useContext(VibeThemeContext);
  if (!ctx) throw new Error("no vibe theme context");
  return (
    <div>
      <span data-testid="theme">{ctx.theme}</span>
      <span data-testid="currentVars">{JSON.stringify(ctx.currentVars)}</span>
      <span data-testid="customThemeCount">{ctx.customThemes.size}</span>
      <span data-testid="customThemeEntry-myTheme">
        {JSON.stringify(ctx.customThemes.get("myTheme") ?? null)}
      </span>
      <span data-testid="customThemeEntry-myCustom">
        {JSON.stringify(ctx.customThemes.get("myCustom") ?? null)}
      </span>
      <button
        data-testid="set-custom"
        onClick={() => ctx.setTheme("custom:myTheme", CUSTOM_TEST_VARS)}
      />
      <button
        data-testid="set-noir-custom"
        onClick={() => ctx.setTheme("noir")}
      />
      <button
        data-testid="refresh"
        onClick={() => void ctx.refreshCustomThemes()}
      />
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

// Phase 22 — custom theme support (THEME-07/08)
// TDD: tests written before implementation; RED phase expected to fail on
// currentVars, customThemes population, readStoredOsTheme custom: acceptance.
describe("VibeThemeProvider — custom themes (Phase 22)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.cssText = "";
  });

  afterEach(() => {
    cleanup();
    document.documentElement.style.cssText = "";
  });

  // Test 1: currentVars returns the resolved vars for the active built-in theme
  it("currentVars returns VIBE_THEMES['aurora'] when the active theme is aurora", () => {
    const { getByTestId } = renderWithServices(<CustomProbe />);
    const vars = JSON.parse(getByTestId("currentVars").textContent ?? "{}") as Record<string, string>;
    expect(vars["--text"]).toBe(VIBE_THEMES.aurora["--text"]);
    expect(vars["--b1"]).toBe(VIBE_THEMES.aurora["--b1"]);
  });

  // Test 2: customThemes populated from IDB on mount
  it("customThemes has size 1 after mounting with pre-seeded customThemeIndex + theme key", async () => {
    const store = createRecordingSettingsStore();
    await store.writeRaw("customThemeIndex", JSON.stringify(["myTheme"]));
    await store.writeRaw(
      "custom:myTheme",
      JSON.stringify({ "--text": "#abc123", "--b1": "#111222" }),
    );
    const { getByTestId } = renderWithServices(<CustomProbe />, store);
    await waitFor(
      () => {
        expect(getByTestId("customThemeCount").textContent).toBe("1");
      },
      { timeout: 2000 },
    );
    const entry = JSON.parse(
      getByTestId("customThemeEntry-myTheme").textContent ?? "null",
    ) as Record<string, string> | null;
    expect(entry).not.toBeNull();
    expect(entry!["--text"]).toBe("#abc123");
  });

  // Test 3: setTheme("custom:myTheme", vars) broadcasts the provided vars
  it("setTheme with 'custom:' name and explicit vars calls broadcastTheme with those vars", () => {
    const broadcast = vi
      .spyOn(frameMountModule, "broadcastTheme")
      .mockImplementation(() => {});
    try {
      const { getByTestId } = renderWithServices(<CustomProbe />);
      act(() => {
        getByTestId("set-custom").click();
      });
      expect(broadcast).toHaveBeenCalledWith(CUSTOM_TEST_VARS);
    } finally {
      broadcast.mockRestore();
    }
  });

  // Test 4: setTheme("noir") still broadcasts the built-in vars (no regression)
  it("setTheme with built-in name calls broadcastTheme with VIBE_THEMES vars (no regression)", () => {
    const broadcast = vi
      .spyOn(frameMountModule, "broadcastTheme")
      .mockImplementation(() => {});
    try {
      const { getByTestId } = renderWithServices(<CustomProbe />);
      act(() => {
        getByTestId("set-noir-custom").click();
      });
      expect(broadcast).toHaveBeenCalledWith(VIBE_THEMES.noir);
    } finally {
      broadcast.mockRestore();
    }
  });

  // Test 5: refreshCustomThemes updates customThemes when new data added to store
  it("refreshCustomThemes re-reads IDB and updates customThemes state", async () => {
    const store = createRecordingSettingsStore();
    const { getByTestId } = renderWithServices(<CustomProbe />, store);
    expect(getByTestId("customThemeCount").textContent).toBe("0");
    // Add a new theme to the in-memory store after initial render
    await store.writeRaw("customThemeIndex", JSON.stringify(["newTheme"]));
    await store.writeRaw("custom:newTheme", JSON.stringify({ "--text": "#newcol" }));
    // Trigger refresh via the button
    act(() => {
      getByTestId("refresh").click();
    });
    await waitFor(
      () => {
        expect(getByTestId("customThemeCount").textContent).toBe("1");
      },
      { timeout: 2000 },
    );
  });

  // Test 6: readStoredOsTheme() accepts "custom:*" values
  it("theme initializes from localStorage when the stored value starts with 'custom:'", () => {
    localStorage.setItem(STORAGE_KEY_OS_THEME, "custom:savedTheme");
    const { getByTestId } = renderWithServices(<CustomProbe />);
    expect(getByTestId("theme").textContent).toBe("custom:savedTheme");
  });

  // Test 7: currentVars returns custom theme vars for "custom:*" active theme
  it("currentVars returns the custom theme's vars when the active theme is 'custom:*'", async () => {
    const customVars = { "--text": "#customtext7", "--b1": "#custom1b" };
    const store = createRecordingSettingsStore();
    await store.writeRaw("customThemeIndex", JSON.stringify(["myCustom"]));
    await store.writeRaw("custom:myCustom", JSON.stringify(customVars));
    localStorage.setItem(STORAGE_KEY_OS_THEME, "custom:myCustom");
    const { getByTestId } = renderWithServices(<CustomProbe />, store);
    await waitFor(
      () => {
        const vars = JSON.parse(
          getByTestId("currentVars").textContent ?? "{}",
        ) as Record<string, string>;
        expect(vars["--text"]).toBe("#customtext7");
      },
      { timeout: 2000 },
    );
  });
});
