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
import { ServicesProvider } from "../services/ServicesProvider";
import {
  createTestServices,
  type TestServicesOverrides,
} from "../services/testServices";
import type { Services } from "../services/services";

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
    maximized: false,
    Component: SimpleComponent as ComponentType,
    onClose: vi.fn(),
    onMinimize: vi.fn(),
    onFocus: vi.fn(),
    onMaximize: vi.fn(),
    onMove: vi.fn(),
    onModify: vi.fn(),
    ...over,
  };
}

// WindowFrame now reads frameMode from useServices(), so every render must be
// wrapped in a ServicesProvider. The default test bundle's frameMode is
// "in-tree", which keeps the body on the direct WindowBody path (no real
// browser frame) — exactly what the JSDOM/RTL suite needs.
function renderFrame(
  props: WindowFrameProps,
  servicesOverrides: TestServicesOverrides = {},
) {
  const services: Services = createTestServices(servicesOverrides);
  return render(
    <ServicesProvider services={services}>
      <WindowFrame {...props} />
    </ServicesProvider>,
  );
}

afterEach(() => {
  unmountAll();
  cleanup();
});

describe("WindowFrame", () => {
  it("renders glass chrome with traffic lights + title", () => {
    const { container } = renderFrame(makeProps({ title: "Notes" }));

    const chrome = container.querySelector(".window-chrome");
    expect(chrome).not.toBeNull();

    const lights = container.querySelectorAll(
      ".window-chrome__traffic-light",
    );
    expect(lights.length).toBe(3);

    expect(container.textContent).toContain("Notes");
  });

  it("renders the AppShell-wrapped app inside the body; ⋮ is in the titlebar (not body)", () => {
    const props = makeProps({
      instanceId: "inst-mount-1",
      Component: SimpleComponent as ComponentType,
    });

    const { container } = renderFrame(props);

    // The ⋮ "App options" button is in the titlebar (Phase 19: moved out of body).
    const titlebar = container.querySelector(
      ".window-chrome__titlebar",
    ) as HTMLElement;
    expect(titlebar).not.toBeNull();
    expect(within(titlebar).getByRole("button", { name: "App options" })).not.toBeNull();

    // The body does NOT contain the ⋮ button — it is chrome-free.
    const body = container.querySelector(
      ".window-chrome__body",
    ) as HTMLElement;
    expect(body).not.toBeNull();
    expect(body.querySelector('[aria-label="App options"]')).toBeNull();

    // The app content is still inside the body.
    expect(within(body).getByTestId("app-body")).not.toBeNull();
  });

  it("unmounting the frame tears down the app subtree (zero leak)", () => {
    const props = makeProps({ instanceId: "inst-leak-1" });

    const { unmount } = renderFrame(props);
    expect(document.querySelector("[data-testid='app-body']")).not.toBeNull();

    unmount();

    // The whole frame subtree (including the app body) leaves the document.
    expect(document.querySelector("[data-testid='app-body']")).toBeNull();
    expect(document.querySelector(".window-chrome")).toBeNull();
  });

  it("clicking the close traffic-light calls onClose", () => {
    const onCloseSpy = vi.fn();
    const { container } = renderFrame(makeProps({ onClose: onCloseSpy }));

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
    const { container, rerender } = renderFrame(props);

    const minBtn = container.querySelector(
      ".window-chrome__traffic-light--min",
    ) as HTMLButtonElement;
    expect(minBtn).not.toBeNull();

    fireEvent.click(minBtn);
    expect(onMinimizeSpy).toHaveBeenCalledTimes(1);

    rerender(
      <ServicesProvider services={createTestServices()}>
        <WindowFrame {...props} minimized={true} />
      </ServicesProvider>,
    );
    const chrome = container.querySelector(
      ".window-chrome",
    ) as HTMLElement;
    expect(chrome.className).toContain("window-chrome--minimized");
  });

  // Phase 19 (plan 19-02): the green max traffic-light is enabled and toggles
  // maximize; double-clicking the titlebar does too; drag is gated while maxed.

  it("clicking the green max traffic-light calls onMaximize once (and is enabled)", () => {
    const onMaximizeSpy = vi.fn();
    const { container } = renderFrame(makeProps({ onMaximize: onMaximizeSpy }));

    const maxBtn = container.querySelector(
      ".window-chrome__traffic-light--max",
    ) as HTMLButtonElement;
    expect(maxBtn).not.toBeNull();
    // The button is no longer disabled (Phase 19 enables maximize).
    expect(maxBtn.disabled).toBe(false);

    fireEvent.click(maxBtn);
    expect(onMaximizeSpy).toHaveBeenCalledTimes(1);
  });

  it("double-clicking the titlebar calls onMaximize once", () => {
    const onMaximizeSpy = vi.fn();
    const { container } = renderFrame(makeProps({ onMaximize: onMaximizeSpy }));

    const titlebar = container.querySelector(
      ".window-chrome__titlebar",
    ) as HTMLElement;
    expect(titlebar).not.toBeNull();

    fireEvent.doubleClick(titlebar);
    expect(onMaximizeSpy).toHaveBeenCalledTimes(1);
  });

  it("does not start a drag (onFocus/onMove) on titlebar pointerdown while maximized", () => {
    const onFocusSpy = vi.fn();
    const onMoveSpy = vi.fn();
    const { container } = renderFrame(
      makeProps({ maximized: true, onFocus: onFocusSpy, onMove: onMoveSpy }),
    );

    const handle = container.querySelector(
      ".titlebar-handle",
    ) as HTMLElement;
    expect(handle).not.toBeNull();

    // While maximized, pointerdown on the titlebar must not begin a drag —
    // neither onFocus nor a committed onMove fires.
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 160, clientY: 140 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 160, clientY: 140 });

    expect(onFocusSpy).not.toHaveBeenCalled();
    expect(onMoveSpy).not.toHaveBeenCalled();
  });

  it("pressing a titlebar button does not start a window drag (so its click is not eaten)", () => {
    // Regression: useDrag calls preventDefault() + setPointerCapture() on
    // pointerdown. If the titlebar's drag handler runs when the press lands on a
    // control (⋮ / close / min / max), a real browser suppresses that button's
    // click — invisible to jsdom (which no-ops both). Pressing a button must
    // raise the window (onFocus) but must NOT begin a drag (no onMove commit).
    const onFocusSpy = vi.fn();
    const onMoveSpy = vi.fn();
    const { container } = renderFrame(
      makeProps({ onFocus: onFocusSpy, onMove: onMoveSpy }),
    );
    const titlebar = container.querySelector(".titlebar-handle") as HTMLElement;
    const optBtn = within(titlebar).getByRole("button", {
      name: "App options",
    });

    // A press-drag-release that originates on the ⋮ button.
    fireEvent.pointerDown(optBtn, { pointerId: 1, clientX: 100, clientY: 8 });
    fireEvent.pointerMove(optBtn, { pointerId: 1, clientX: 220, clientY: 8 });
    fireEvent.pointerUp(optBtn, { pointerId: 1, clientX: 220, clientY: 8 });

    // The window is raised, but no drag is committed from a button press.
    expect(onFocusSpy).toHaveBeenCalled();
    expect(onMoveSpy).not.toHaveBeenCalled();
  });

  it("pointerdown on titlebar calls onFocus and does not steal input focus from a body input", () => {
    const onFocusSpy = vi.fn();
    const props = makeProps({
      instanceId: "inst-focus-1",
      Component: InputComponent as ComponentType,
      onFocus: onFocusSpy,
    });

    const { container } = renderFrame(props);

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

    const { container } = renderFrame(props);

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

  // Phase 16-01: title-group + hideClose tests
  it("titlebar has .window-chrome__title-group wrapping icon then title (icon first)", () => {
    const { container } = renderFrame(makeProps({ title: "Notes", icon: "N" }));

    const titlebar = container.querySelector(
      ".window-chrome__titlebar",
    ) as HTMLElement;
    expect(titlebar).not.toBeNull();

    const group = titlebar.querySelector(
      ".window-chrome__title-group",
    ) as HTMLElement;
    expect(group).not.toBeNull();

    const icon = group.querySelector(".window-chrome__icon") as HTMLElement;
    const title = group.querySelector(".window-chrome__title") as HTMLElement;

    expect(icon).not.toBeNull();
    expect(title).not.toBeNull();

    // Icon must precede title in DOM order
    const children = Array.from(group.children);
    const iconIdx = children.indexOf(icon);
    const titleIdx = children.indexOf(title);
    expect(iconIdx).toBeLessThan(titleIdx);
  });

  it(".window-chrome__title still carries the title text", () => {
    const { container } = renderFrame(makeProps({ title: "Calculator" }));

    const titleEl = container.querySelector(
      ".window-chrome__title",
    ) as HTMLElement;
    expect(titleEl).not.toBeNull();
    expect(titleEl.textContent?.trim()).toBe("Calculator");
  });

  it("framed app shows NO inner Close button in the body (traffic-light is authoritative)", () => {
    const props = makeProps({
      title: "Notes",
      Component: SimpleComponent as ComponentType,
    });

    const { container } = renderFrame(props);

    const body = container.querySelector(
      ".window-chrome__body",
    ) as HTMLElement;
    expect(body).not.toBeNull();

    // No button matching "Close Notes" inside the body (hideClose=true suppresses it)
    const innerClose = body.querySelector(
      '[aria-label="Close Notes"]',
    ) as HTMLButtonElement | null;
    expect(innerClose).toBeNull();

    // The traffic-light Close button (in the titlebar) must still be present
    const titlebar = container.querySelector(
      ".window-chrome__titlebar",
    ) as HTMLElement;
    const trafficClose = titlebar.querySelector(
      '[aria-label="Close"]',
    ) as HTMLButtonElement | null;
    expect(trafficClose).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // SANDBOX-05: frameMode-gated body swap. The render mode is injected via
  // services; the in-tree default keeps the direct WindowBody path, while the
  // iframe mode routes the body through the opaque-origin frame component.
  // -------------------------------------------------------------------------

  it("in-tree mode (the test default) renders the direct body and NO frame", () => {
    const props = makeProps({
      title: "Notes",
      transpiledJS: "const App = () => null;",
      themeVars: { "--text": "#fff" },
    });

    const { container } = renderFrame(props /* default frameMode: in-tree */);

    // The direct WindowBody path runs: the app content is in the body, and no
    // opaque-origin frame is created.
    const body = container.querySelector(".window-chrome__body") as HTMLElement;
    expect(within(body).getByTestId("app-body")).not.toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector(".app-frame")).toBeNull();
  });

  it("iframe mode with a compiled app string renders an opaque-origin frame (allow-scripts)", () => {
    const props = makeProps({
      title: "Notes",
      transpiledJS: "const App = () => null;",
      themeVars: { "--text": "#fff" },
    });

    const { container } = renderFrame(props, { frameMode: "iframe" });

    const frame = container.querySelector("iframe") as HTMLIFrameElement | null;
    expect(frame).not.toBeNull();
    expect(frame!.getAttribute("sandbox")).toBe("allow-scripts");
    // The direct in-tree app body is NOT rendered in frame mode.
    expect(container.querySelector("[data-testid='app-body']")).toBeNull();
  });

  it("iframe mode WITHOUT a compiled app string falls back to the placeholder, not a frame", () => {
    const props = makeProps({
      title: "Notes",
      Component: null,
      transpiledJS: undefined,
    });

    const { container } = renderFrame(props, { frameMode: "iframe" });

    // No compiled string yet: the body short-circuits to WindowBody, and since
    // Component is also null it shows the neutral placeholder — no frame.
    const body = container.querySelector(".window-chrome__body") as HTMLElement;
    expect(body.querySelector(".window-chrome__placeholder")).not.toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
  });
});
