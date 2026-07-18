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

  // Test WR-04: setTheme with explicit vars applies to :root immediately (no Aurora flash)
  it("WR-04: setTheme with explicit vars applies to :root synchronously before re-render", () => {
    // Render with no pre-seeded customThemesState — simulates the gap where
    // refreshCustomThemes has not yet populated state after a save.
    const { getByTestId } = renderWithServices(<CustomProbe />);

    act(() => {
      // set-custom calls ctx.setTheme("custom:myTheme", CUSTOM_TEST_VARS)
      // where CUSTOM_TEST_VARS = { "--text": "#ctest01" }
      getByTestId("set-custom").click();
    });

    // :root must reflect the explicit vars immediately — not Aurora's --text.
    // If the eager apply is missing, :root would briefly show Aurora (#f3f1ff).
    expect(
      document.documentElement.style.getPropertyValue("--text"),
    ).toBe(CUSTOM_TEST_VARS["--text"]);
  });

  // ── AURORA-FLASH tests (Phase 22 post-hydration flash defect) ────────────────
  //
  // Defect: on reload with an active custom theme, VibeThemeProvider's apply-effect
  // fires before refreshCustomThemes() populates customThemesState (async IDB read).
  // With customThemesState empty AND pendingCustomVarsRef null (fresh mount, no
  // setTheme call), the previous code fell through to the Aurora fallback —
  // overwriting the correct custom vars the FOUC inline script had applied.
  //
  // Fix: read the localStorage mirror ("vibe.customTheme.<name>") — the same key
  // the FOUC script uses — as the gap fallback before falling back to Aurora.

  // Full 12-var custom map matching SMOKE_CUSTOM_VARS in smoke.spec.ts.
  const AURORA_FLASH_VARS: Record<string, string> = {
    "--text":    "#003366",
    "--wall":    "radial-gradient(130% 110% at 18% 8%, #001122 0%, #000a15 62%)",
    "--b1":      "#0066ff",
    "--b2":      "#0099ff",
    "--b3":      "#00ccff",
    "--b4":      "#0044ff",
    "--glass":   "rgba(0,0,255,0.10)",
    "--glass2":  "rgba(0,0,255,0.035)",
    "--bord":    "rgba(0,0,255,0.22)",
    "--hi":      "rgba(0,0,255,0.5)",
    "--accentA": "#0033ff",
    "--accentB": "#0088ff",
  };

  // AURORA-FLASH-01: apply-effect uses localStorage mirror — not Aurora — during
  // the IDB-load gap on initial mount with an active custom theme.
  // RED before fix (Aurora clobber); GREEN after fix (custom value preserved).
  it("AURORA-FLASH-01: apply-effect uses localStorage mirror, not Aurora, during IDB gap on mount", () => {
    // Seed both localStorage keys exactly as the FOUC script + readStoredCustomVars use.
    localStorage.setItem(STORAGE_KEY_OS_THEME, "custom:foo");
    localStorage.setItem("vibe.customTheme.foo", JSON.stringify(AURORA_FLASH_VARS));

    // Empty settings store → refreshCustomThemes resolves with an empty Map,
    // simulating the async IDB-load gap. pendingCustomVarsRef starts null (no
    // setTheme has been called). This is exactly the gap that caused the Aurora flash.
    const store = createRecordingSettingsStore();
    renderWithServices(<Probe />, store);

    // Synchronously after render — before/without awaiting the async IDB effect:
    // --text must be the custom value from the localStorage mirror, NOT Aurora's "#f3f1ff".
    expect(
      document.documentElement.style.getPropertyValue("--text"),
    ).toBe(AURORA_FLASH_VARS["--text"]);
    expect(
      document.documentElement.style.getPropertyValue("--text"),
    ).not.toBe(VIBE_THEMES.aurora["--text"]);
  });

  // AURORA-FLASH-02: absent localStorage mirror still falls back to Aurora.
  // Preserves the deleted-theme behavior: if the user deleted "foo" (mirror absent),
  // Aurora is the correct fallback. GREEN in both RED and GREEN phases.
  it("AURORA-FLASH-02: apply-effect falls back to Aurora when localStorage mirror is absent (deleted theme)", () => {
    // Only the osTheme key is set; the mirror key is absent (deleted-theme scenario).
    localStorage.setItem(STORAGE_KEY_OS_THEME, "custom:deleted");
    // Intentionally no "vibe.customTheme.deleted" entry.

    const store = createRecordingSettingsStore();
    renderWithServices(<Probe />, store);

    // With no vars available anywhere, Aurora is the correct and expected fallback.
    expect(
      document.documentElement.style.getPropertyValue("--text"),
    ).toBe(VIBE_THEMES.aurora["--text"]);
  });

  // AURORA-FLASH-03: currentVars memo also uses the localStorage mirror during the
  // IDB-load gap, so any frame opened during the gap gets the correct vars, not Aurora.
  // RED before fix; GREEN after fix.
  it("AURORA-FLASH-03: currentVars uses localStorage mirror, not Aurora, during IDB gap", () => {
    localStorage.setItem(STORAGE_KEY_OS_THEME, "custom:foo");
    localStorage.setItem("vibe.customTheme.foo", JSON.stringify(AURORA_FLASH_VARS));

    const store = createRecordingSettingsStore();
    const { getByTestId } = renderWithServices(<CustomProbe />, store);

    // currentVars must reflect the localStorage mirror, not aurora, during the gap.
    const vars = JSON.parse(
      getByTestId("currentVars").textContent ?? "{}",
    ) as Record<string, string>;
    expect(vars["--text"]).toBe(AURORA_FLASH_VARS["--text"]);
    expect(vars["--text"]).not.toBe(VIBE_THEMES.aurora["--text"]);
  });
});
