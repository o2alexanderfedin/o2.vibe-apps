// prefers-reduced-motion degrade test (Phase 16, plan 16-04, PERF-01).
//
// PERF-01's concrete, offline-testable deliverable: under the OS-level
// prefers-reduced-motion preference the ambient blob layer must stop animating
// (the CSS media query is the primary, JS-free degrade) AND DesktopShell must
// expose a matchMedia-driven, mockable marker on its root so the JS path is
// observable to tests (and future hooks like blob-count reduction).
//
// jsdom does NOT implement window.matchMedia, so these tests stub it to drive
// matches=true / matches=false. DesktopShell is wrapped in ServicesProvider +
// VibeThemeProvider (via the shared test kit) and the pointer-capture stubs are
// installed as a side effect of importing the kit.
//
// Test doubles are named "stub" (never a banned hygiene token).

/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { DesktopShell } from "./DesktopShell";
import { ServicesProvider } from "../services/ServicesProvider";
import { VibeThemeProvider } from "./VibeThemeProvider";
import { createTestServices } from "../services/testServices";
// Importing the kit installs the jsdom pointer-capture stubs the drag hook
// relies on (side effect — DesktopShell mounts a draggable WindowFrame surface).
import "./desktopShellTestKit";

// Build a matchMedia stub whose `.matches` is fixed for the reduced-motion
// query. It carries the full MediaQueryList surface DesktopShell may touch
// (addEventListener/removeEventListener + the legacy addListener/removeListener)
// so the subscribe/cleanup seam works regardless of which API it picks.
function stubMatchMedia(matches: boolean): void {
  const stub = (query: string): MediaQueryList =>
    ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(), // legacy Safari API
      removeListener: vi.fn(), // legacy Safari API
      dispatchEvent: vi.fn(() => false),
    }) as unknown as MediaQueryList;
  vi.stubGlobal("matchMedia", stub);
}

function renderShell() {
  return render(
    <ServicesProvider services={createTestServices()}>
      <VibeThemeProvider>
        <DesktopShell />
      </VibeThemeProvider>
    </ServicesProvider>,
  );
}

function desktopShellRoot(): HTMLElement {
  const el = document.querySelector(".desktop-shell") as HTMLElement | null;
  if (!el) throw new Error("no .desktop-shell rendered");
  return el;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("prefers-reduced-motion degrade (PERF-01)", () => {
  it("marks the desktop-shell root reduced-motion when matchMedia matches=true", () => {
    stubMatchMedia(true);
    renderShell();

    // The matchMedia-driven JS marker is present so tests (and future JS hooks)
    // can observe the reduced-motion preference.
    expect(desktopShellRoot().className).toContain(
      "desktop-shell--reduced-motion",
    );
  });

  it("omits the reduced-motion marker when matchMedia matches=false (animated path)", () => {
    stubMatchMedia(false);
    renderShell();

    expect(desktopShellRoot().className).not.toContain(
      "desktop-shell--reduced-motion",
    );
  });

  it("declares the CSS degrade — @media (prefers-reduced-motion: reduce) sets animation:none on .desktop-shell__blob", () => {
    // The CSS media query is the primary, JS-free degrade (Pitfall 4): under the
    // OS preference the blob animation is disabled outright. Read the authored
    // stylesheet from disk (mirrors hygiene.test.ts's readFileSync approach).
    const css = readFileSync(
      resolve(process.cwd(), "src/index.css"),
      "utf8",
    );

    // The reduced-motion media block exists.
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);

    // Within that block, the blob layer's animation is turned off. Isolate the
    // media block's body and assert it targets .desktop-shell__blob with
    // animation: none (the per-frame compositing is removed).
    const blockMatch = css.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\n\})/,
    );
    expect(blockMatch).not.toBeNull();
    const block = blockMatch?.[0] ?? "";
    expect(block).toContain(".desktop-shell__blob");
    expect(block).toMatch(/animation:\s*none/);
  });
});
