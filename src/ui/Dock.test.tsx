import { render, fireEvent, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Dock } from "./Dock";
import type { WindowEntry } from "./useWindowManager";

afterEach(cleanup);

// Build a WindowEntry with sensible defaults; override per test.
function makeWindow(over: Partial<WindowEntry> = {}): WindowEntry {
  return {
    id: "win-1",
    instanceId: "weather-1",
    appType: "weather",
    title: "Weather",
    icon: "weather",
    x: 0,
    y: 0,
    z: 200,
    minimized: false,
    maximized: false,
    restoreRect: null,
    snapSide: null,
    ...over,
  };
}

describe("Dock", () => {
  it("renders one icon button per window plus a magnifier launcher button", () => {
    const windows = [
      makeWindow({ id: "win-1", title: "Weather", appType: "weather" }),
      makeWindow({ id: "win-2", title: "Calculator", appType: "calculator" }),
    ];
    const { getByRole } = render(
      <Dock
        windows={windows}
        onFocus={vi.fn()}
        onRestore={vi.fn()}
        onOpenLauncher={vi.fn()}
      />,
    );

    const nav = getByRole("navigation", { name: "Open apps" });
    const buttons = within(nav).getAllByRole("button");
    // 2 window icons + 1 magnifier.
    expect(buttons).toHaveLength(3);
    // The magnifier carries an accessible label.
    expect(
      within(nav).getByRole("button", { name: "Open launcher" }),
    ).toBeTruthy();
    // One labeled button per window.
    expect(within(nav).getByRole("button", { name: "Weather" })).toBeTruthy();
    expect(
      within(nav).getByRole("button", { name: "Calculator" }),
    ).toBeTruthy();
  });

  it("renders a running-indicator dot inside each window's dock icon", () => {
    const windows = [makeWindow({ id: "win-1", title: "Weather" })];
    const { getByRole, container } = render(
      <Dock
        windows={windows}
        onFocus={vi.fn()}
        onRestore={vi.fn()}
        onOpenLauncher={vi.fn()}
      />,
    );

    const iconBtn = getByRole("button", { name: "Weather" });
    expect(iconBtn.querySelector(".dock__running-dot")).toBeTruthy();
    // The magnifier is not a running window, so it has no dot.
    expect(container.querySelectorAll(".dock__running-dot")).toHaveLength(1);
  });

  it("clicking a non-minimized window's icon calls onFocus with its id (not onRestore)", () => {
    const onFocus = vi.fn();
    const onRestore = vi.fn();
    const windows = [
      makeWindow({ id: "win-7", title: "Notes", minimized: false }),
    ];
    const { getByRole } = render(
      <Dock
        windows={windows}
        onFocus={onFocus}
        onRestore={onRestore}
        onOpenLauncher={vi.fn()}
      />,
    );

    fireEvent.click(getByRole("button", { name: "Notes" }));
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledWith("win-7");
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("clicking a minimized window's icon calls onRestore with its id (not onFocus)", () => {
    const onFocus = vi.fn();
    const onRestore = vi.fn();
    const windows = [
      makeWindow({ id: "win-9", title: "Timer", minimized: true }),
    ];
    const { getByRole } = render(
      <Dock
        windows={windows}
        onFocus={onFocus}
        onRestore={onRestore}
        onOpenLauncher={vi.fn()}
      />,
    );

    fireEvent.click(getByRole("button", { name: "Timer" }));
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledWith("win-9");
    expect(onFocus).not.toHaveBeenCalled();
  });

  it("clicking the magnifier button calls onOpenLauncher", () => {
    const onOpenLauncher = vi.fn();
    const { getByRole } = render(
      <Dock
        windows={[]}
        onFocus={vi.fn()}
        onRestore={vi.fn()}
        onOpenLauncher={onOpenLauncher}
      />,
    );

    fireEvent.click(getByRole("button", { name: "Open launcher" }));
    expect(onOpenLauncher).toHaveBeenCalledTimes(1);
  });
});
