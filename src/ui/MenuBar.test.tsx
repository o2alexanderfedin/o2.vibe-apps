import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import {
  render,
  cleanup,
  within,
  fireEvent,
  act,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { MenuBar } from "./MenuBar";
import { VibeThemeProvider } from "./VibeThemeProvider";
import { ServicesProvider } from "../services/ServicesProvider";
import {
  createTestServices,
  createRecordingSettingsStore,
} from "../services/testServices";

// Wrap MenuBar in ServicesProvider + VibeThemeProvider so the relocated
// ThemeSelector's useVibeTheme()/useServices() resolve (mirrors
// ThemeSelector.test.tsx).
function renderMenuBar(ui: ReactNode) {
  return render(
    <ServicesProvider
      services={createTestServices({
        settingsStore: createRecordingSettingsStore(),
      })}
    >
      <VibeThemeProvider>{ui}</VibeThemeProvider>
    </ServicesProvider>,
  );
}

describe("MenuBar", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.cssText = "";
  });

  afterEach(() => {
    cleanup();
    document.documentElement.style.cssText = "";
    vi.useRealTimers();
  });

  it("renders the OS wordmark and the active-app name when activeName is set", () => {
    const { getByText } = renderMenuBar(
      <MenuBar activeName="Weather" onOpenAccount={vi.fn()} />,
    );
    expect(getByText("Vibe OS")).toBeTruthy();
    expect(getByText("Weather")).toBeTruthy();
  });

  it("renders no active-app name node when activeName is null", () => {
    const { container, getByText } = renderMenuBar(
      <MenuBar activeName={null} onOpenAccount={vi.fn()} />,
    );
    expect(getByText("Vibe OS")).toBeTruthy();
    expect(
      container.querySelector(".menu-bar__active-app"),
    ).toBeNull();
  });

  it("renders the relocated theme switcher with four pills", () => {
    const { getByRole } = renderMenuBar(
      <MenuBar activeName={null} onOpenAccount={vi.fn()} />,
    );
    const group = getByRole("group", { name: "Color theme" });
    const pills = within(group).getAllByRole("button");
    expect(pills.map((p) => p.textContent)).toEqual([
      "Aurora",
      "Aero",
      "Aqua",
      "Noir",
    ]);
  });

  it("renders an account control that calls onOpenAccount on click", () => {
    const onOpenAccount = vi.fn();
    const { getByRole } = renderMenuBar(
      <MenuBar activeName={null} onOpenAccount={onOpenAccount} />,
    );
    fireEvent.click(getByRole("button", { name: "Account" }));
    expect(onOpenAccount).toHaveBeenCalledTimes(1);
  });

  it("renders a live HH:MM clock and clears its interval on unmount", () => {
    vi.useFakeTimers();
    // Pin the clock to a known instant so the rendered text is deterministic.
    vi.setSystemTime(new Date(2026, 5, 26, 9, 5, 0));

    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const { container, unmount } = renderMenuBar(
      <MenuBar activeName={null} onOpenAccount={vi.fn()} />,
    );

    const clock = container.querySelector(".menu-bar__clock");
    expect(clock).toBeTruthy();
    expect(clock!.textContent).toMatch(/^\d{2}:\d{2}$/);
    expect(clock!.textContent).toBe("09:05");

    // Move into the next minute, then fire a single interval tick so the
    // displayed text re-reads the (pinned) clock without the simulated timer
    // clock advancing past the target minute.
    act(() => {
      vi.setSystemTime(new Date(2026, 5, 26, 9, 6, 0));
      vi.advanceTimersByTime(1_000);
    });
    expect(clock!.textContent).toBe("09:06");

    // Unmount tears down the interval (no leaked timer).
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
