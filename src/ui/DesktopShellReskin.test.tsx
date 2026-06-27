// Theme re-skin acceptance + minimized display:none (Phase 16, plan 16-04).
//
// THE PHASE HEADLINE, as a hard automated assertion: switching the named theme
// from one to another must visibly re-skin the whole desktop — the resolved
// wallpaper (--wall) and text (--text) CSS custom properties on
// document.documentElement DIFFER between two themes AND equal the target
// theme's verbatim VIBE_THEMES contract values (proving the correct theme
// applied, not merely that something changed). This closes the "no colors yet"
// gap from Phases 14-15 with a check that fails if theme switching ever stops
// re-skinning the OS chrome/wallpaper.
//
// Plus PERF-01's minimized-windows-don't-composite guarantee: a minimized frame
// carries .window-chrome--minimized AND the stylesheet sets display:none on it,
// so a minimized window maintains no compositor layer (Pitfall 4).
//
// DesktopShell renders inside ServicesProvider + VibeThemeProvider (via the
// shared test kit, which also installs the jsdom pointer-capture stubs). Theme
// state lives on document.documentElement and localStorage — both are reset in
// beforeEach so each test starts from the default (aurora) theme.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { _clearCachesForTesting } from "../execution/loader";
import { unmountAll } from "../execution/mount";
import { VIBE_THEMES } from "./VibeThemeProvider";
import {
  renderDesktopShell,
  openApp,
  frameByTitle,
} from "./desktopShellTestKit";

/** The resolved value of a CSS custom property on document.documentElement. */
function rootVar(name: string): string {
  return document.documentElement.style.getPropertyValue(name);
}

/** The menu-bar theme group's pill for a named theme (Aurora/Aero/Aqua/Noir). */
function themePill(label: string): HTMLElement {
  const banner = screen.getByRole("banner");
  const group = within(banner).getByRole("group", { name: "Color theme" });
  return within(group).getByRole("button", { name: label });
}

beforeEach(() => {
  _clearCachesForTesting();
  localStorage.clear();
  // Drop any custom properties a prior test left on documentElement so the
  // default theme (aurora) applies cleanly on mount.
  document.documentElement.style.cssText = "";
});

afterEach(() => {
  cleanup();
  unmountAll();
  _clearCachesForTesting();
  document.documentElement.style.cssText = "";
});

describe("DesktopShell theme re-skin acceptance (phase headline)", () => {
  it("switching theme (aurora → noir) re-skins documentElement: --wall AND --text DIFFER and match the target contract", async () => {
    renderDesktopShell();

    // The default theme (aurora) applied on mount — capture its wallpaper/text.
    await waitFor(() => expect(rootVar("--wall")).not.toBe(""));
    const auroraWall = rootVar("--wall");
    const auroraText = rootVar("--text");
    expect(auroraWall).toBe(VIBE_THEMES.aurora["--wall"]);
    expect(auroraText).toBe(VIBE_THEMES.aurora["--text"]);

    // Click the Noir pill in the menu bar's theme group — the live re-skin path
    // (setTheme → applyVibeTheme → documentElement.style.setProperty).
    act(() => {
      themePill("Noir").click();
    });

    const noirWall = rootVar("--wall");
    const noirText = rootVar("--text");

    // The wallpaper AND chrome text re-skinned — both differ from aurora.
    expect(noirWall).not.toBe(auroraWall);
    expect(noirText).not.toBe(auroraText);

    // And they equal noir's verbatim contract values (correct theme applied).
    expect(noirWall).toBe(VIBE_THEMES.noir["--wall"]);
    expect(noirText).toBe(VIBE_THEMES.noir["--text"]);
  });

  it("a minimized window carries .window-chrome--minimized AND the stylesheet sets display:none on it (PERF-01 no compositing)", async () => {
    const { user } = renderDesktopShell();

    // Open a window via the launcher, then minimize it from its traffic-light.
    await openApp(user, "Notes"); // seeded — no transport needed
    await waitFor(() => expect(frameByTitle("Notes")).toBeInTheDocument());

    const frame = frameByTitle("Notes");
    fireEvent.click(within(frame).getByRole("button", { name: "Minimize" }));

    // The frame gains the minimized marker class.
    await waitFor(() =>
      expect(frameByTitle("Notes").className).toContain(
        "window-chrome--minimized",
      ),
    );

    // The stylesheet sets display:none on that class — a minimized window holds
    // no compositor layer. Read the authored CSS from disk and isolate the rule.
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    const ruleMatch = css.match(/\.window-chrome--minimized\s*\{([\s\S]*?)\}/);
    expect(ruleMatch).not.toBeNull();
    expect(ruleMatch?.[1] ?? "").toMatch(/display:\s*none/);
  });
});
