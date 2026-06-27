import { render, fireEvent, cleanup } from "@testing-library/react";
import { within } from "@testing-library/dom";
import { createElement, type ComponentType } from "react";
import {
  describe,
  it,
  expect,
  vi,
  afterEach,
} from "vitest";
import { WindowFrame, type WindowFrameProps } from "./WindowFrame";
import { unmountAll } from "../execution/mount";

// jsdom does not implement pointer capture APIs — install stubs so the drag
// hook's handlePointerDown (which captures the pointer) does not throw.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => undefined;
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

// A trivial content component used as the resolved app body.
function SimpleComponent() {
  return createElement("div", { "data-testid": "app-body" }, "hello");
}

// A content component with a focusable input — used to prove that pointerdown
// on the titlebar raises the window without stealing keyboard focus.
function InputComponent() {
  return createElement("input", {
    "data-testid": "app-input",
    "aria-label": "field",
  });
}

let idCounter = 0;
function makeProps(over: Partial<WindowFrameProps> = {}): WindowFrameProps {
  idCounter += 1;
  return {
    id: `win-${idCounter}`,
    instanceId: `inst-${idCounter}`,
    title: "Notes",
    icon: "N",
    x: 40,
    y: 50,
    z: 210,
    minimized: false,
    Component: SimpleComponent as ComponentType,
    onClose: vi.fn(),
    onMinimize: vi.fn(),
    onFocus: vi.fn(),
    onMove: vi.fn(),
    onModify: vi.fn(),
    ...over,
  };
}

afterEach(() => {
  unmountAll();
  cleanup();
});

describe("WindowFrame", () => {
  it("renders glass chrome with traffic lights + title", () => {
    const { container } = render(
      createElement(WindowFrame, makeProps({ title: "Notes" })),
    );

    const chrome = container.querySelector(".window-chrome");
    expect(chrome).not.toBeNull();

    const lights = container.querySelectorAll(
      ".window-chrome__traffic-light",
    );
    expect(lights.length).toBe(3);

    expect(container.textContent).toContain("Notes");
  });

  it("renders the AppShell-wrapped app inside the body (single in-tree subtree)", () => {
    const props = makeProps({
      instanceId: "inst-mount-1",
      Component: SimpleComponent as ComponentType,
    });

    const { container } = render(createElement(WindowFrame, props));

    // The AppShell wraps the Component inside the body, so its ⋮ "App options"
    // button and the app's own content are present within the body subtree.
    const body = container.querySelector(
      ".window-chrome__body",
    ) as HTMLElement;
    expect(body).not.toBeNull();
    expect(within(body).getByLabelText("App options")).not.toBeNull();
    expect(within(body).getByTestId("app-body")).not.toBeNull();
  });

  it("unmounting the frame tears down the app subtree (zero leak)", () => {
    const props = makeProps({ instanceId: "inst-leak-1" });

    const { unmount } = render(createElement(WindowFrame, props));
    expect(document.querySelector("[data-testid='app-body']")).not.toBeNull();

    unmount();

    // The whole frame subtree (including the app body) leaves the document.
    expect(document.querySelector("[data-testid='app-body']")).toBeNull();
    expect(document.querySelector(".window-chrome")).toBeNull();
  });

  it("clicking the close traffic-light calls onClose", () => {
    const onCloseSpy = vi.fn();
    const { container } = render(
      createElement(WindowFrame, makeProps({ onClose: onCloseSpy })),
    );

    const closeBtn = container.querySelector(
      ".window-chrome__traffic-light--close",
    ) as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();

    fireEvent.click(closeBtn);
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
  });

  it("clicking the amber traffic-light calls onMinimize; minimized prop sets display:none class", () => {
    const onMinimizeSpy = vi.fn();
    const props = makeProps({ onMinimize: onMinimizeSpy });
    const { container, rerender } = render(
      createElement(WindowFrame, props),
    );

    const minBtn = container.querySelector(
      ".window-chrome__traffic-light--min",
    ) as HTMLButtonElement;
    expect(minBtn).not.toBeNull();

    fireEvent.click(minBtn);
    expect(onMinimizeSpy).toHaveBeenCalledTimes(1);

    rerender(createElement(WindowFrame, { ...props, minimized: true }));
    const chrome = container.querySelector(
      ".window-chrome",
    ) as HTMLElement;
    expect(chrome.className).toContain("window-chrome--minimized");
  });

  it("pointerdown on titlebar calls onFocus and does not steal input focus from a body input", () => {
    const onFocusSpy = vi.fn();
    const props = makeProps({
      instanceId: "inst-focus-1",
      Component: InputComponent as ComponentType,
      onFocus: onFocusSpy,
    });

    const { container } = render(createElement(WindowFrame, props));

    const input = document.querySelector(
      "[data-testid='app-input']",
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    input.focus();
    expect(document.activeElement).toBe(input);

    const handle = container.querySelector(
      ".titlebar-handle",
    ) as HTMLElement;
    expect(handle).not.toBeNull();

    fireEvent.pointerDown(handle);

    expect(onFocusSpy).toHaveBeenCalled();
    // Focus must remain on the body input (titlebar pointerdown must not steal it).
    expect(document.activeElement).toBe(input);
  });

  it("renders a neutral placeholder (no AppShell region) while the app is unresolved", () => {
    const props = makeProps({
      instanceId: "inst-placeholder-1",
      Component: null,
    });

    const { container } = render(createElement(WindowFrame, props));

    const body = container.querySelector(
      ".window-chrome__body",
    ) as HTMLElement;
    expect(body).not.toBeNull();
    // The in-flight body shows the neutral placeholder, not the app region.
    expect(
      body.querySelector(".window-chrome__placeholder"),
    ).not.toBeNull();
    expect(body.querySelector(".app-shell")).toBeNull();
  });
});
