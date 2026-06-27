import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import { MinimalLauncher } from "./MinimalLauncher";
import { APP_REGISTRY } from "../data/appRegistry";

afterEach(cleanup);

describe("MinimalLauncher", () => {
  it("renders one app button per APP_REGISTRY entry, labeled by displayName", () => {
    const { getByRole } = render(
      <MinimalLauncher onOpen={vi.fn()} onClose={vi.fn()} />,
    );
    const dialog = getByRole("dialog", { name: "Open an app" });
    // One button per registry entry plus the close control.
    const grid = dialog.querySelector(".launcher__grid")!;
    const appButtons = within(grid as HTMLElement).getAllByRole("button");
    expect(appButtons).toHaveLength(APP_REGISTRY.length);
    for (const app of APP_REGISTRY) {
      expect(
        within(grid as HTMLElement).getByRole("button", {
          name: app.displayName,
        }),
      ).toBeTruthy();
    }
  });

  it("clicking an app button calls onOpen(id, displayName) then onClose", () => {
    const calls: string[] = [];
    const onOpen = vi.fn(() => calls.push("open"));
    const onClose = vi.fn(() => calls.push("close"));
    const target = APP_REGISTRY[0]!;

    const { getByRole } = render(
      <MinimalLauncher onOpen={onOpen} onClose={onClose} />,
    );

    fireEvent.click(getByRole("button", { name: target.displayName }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(target.id, target.displayName);
    expect(onClose).toHaveBeenCalledTimes(1);
    // Open happens before close.
    expect(calls).toEqual(["open", "close"]);
  });

  it("the close control calls onClose", () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <MinimalLauncher onOpen={vi.fn()} onClose={onClose} />,
    );
    fireEvent.click(getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking the overlay backdrop calls onClose, but clicking inside the panel does not", () => {
    const onClose = vi.fn();
    const { getByRole, container } = render(
      <MinimalLauncher onOpen={vi.fn()} onClose={onClose} />,
    );

    // Overlay (backdrop) click → close.
    const overlay = container.querySelector(".launcher-overlay")!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Clicking inside the panel does NOT bubble to the overlay (stopPropagation).
    const dialog = getByRole("dialog", { name: "Open an app" });
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
