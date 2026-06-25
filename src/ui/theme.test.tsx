import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { useContext } from "react";
import { ThemeProvider, ThemeContext } from "./ThemeProvider";
import { STORAGE_KEY_THEME } from "../lib/storage";

// Controllable matchMedia stub: lets each test set the current `matches`
// value and manually fire the 'change' listener (the shared setup stub's
// addEventListener is a no-op, so we install a richer one here).
type MediaListener = (e: { matches: boolean }) => void;

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<MediaListener>();
  const mql = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_event: string, cb: MediaListener) => {
      listeners.add(cb);
    },
    removeEventListener: (_event: string, cb: MediaListener) => {
      listeners.delete(cb);
    },
    // deprecated aliases kept for safety
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue(mql),
  });
  return {
    setMatches(next: boolean) {
      matches = next;
    },
    fireChange(next: boolean) {
      matches = next;
      act(() => {
        for (const cb of listeners) cb({ matches });
      });
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

// A tiny consumer that exposes the cycle action so tests can drive it.
function Probe() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("no theme context");
  return (
    <button data-testid="cycle" onClick={ctx.cycleTheme}>
      {ctx.mode}
    </button>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute("data-theme");
  });

  it("applies data-theme=light to :root when stored theme is light", () => {
    installMatchMedia(false);
    localStorage.setItem(STORAGE_KEY_THEME, "light");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("switching to dark updates data-theme and persists dark under marketplace.theme", () => {
    installMatchMedia(false);
    localStorage.setItem(STORAGE_KEY_THEME, "light");
    const { getByTestId } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    // cycle light -> dark
    act(() => {
      getByTestId("cycle").click();
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(STORAGE_KEY_THEME)).toBe("dark");
  });

  it("resolves data-theme=dark in system mode when matchMedia matches dark", () => {
    installMatchMedia(true); // prefers-color-scheme: dark
    localStorage.setItem(STORAGE_KEY_THEME, "system");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("re-applies data-theme when the matchMedia 'change' listener fires in system mode", () => {
    const mm = installMatchMedia(false); // start light
    localStorage.setItem(STORAGE_KEY_THEME, "system");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(mm.listenerCount()).toBeGreaterThan(0); // wired via addEventListener('change')
    mm.fireChange(true); // OS flips to dark
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("defaults mode to system when nothing is stored", () => {
    installMatchMedia(false);
    const { getByTestId } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(getByTestId("cycle").textContent).toBe("system");
  });

  it("cycles light -> dark -> system -> light", () => {
    installMatchMedia(false);
    localStorage.setItem(STORAGE_KEY_THEME, "light");
    const { getByTestId } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    const btn = getByTestId("cycle");
    expect(btn.textContent).toBe("light");
    act(() => btn.click());
    expect(btn.textContent).toBe("dark");
    act(() => btn.click());
    expect(btn.textContent).toBe("system");
    act(() => btn.click());
    expect(btn.textContent).toBe("light");
  });
});
