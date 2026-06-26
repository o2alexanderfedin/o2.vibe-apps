import { render, act, cleanup } from "@testing-library/react";
import { within } from "@testing-library/dom";
import { useRef } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDrag } from "./useDrag";

// jsdom does not implement pointer capture APIs — install stubs before any test
// so vi.spyOn can wrap them per-test.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => undefined;
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

// Harness component that wires up the hook and exposes the handle div
interface HarnessProps {
  initialX?: number;
  initialY?: number;
  onCommit?: (x: number, y: number) => void;
}

function Harness({ initialX = 0, initialY = 0, onCommit = vi.fn() }: HarnessProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const { handlePointerDown } = useDrag({
    elementRef,
    initialX,
    initialY,
    onCommit,
  });

  return (
    <div className="desktop">
      <div ref={elementRef} data-testid="window">
        <div data-testid="handle" onPointerDown={handlePointerDown} />
      </div>
    </div>
  );
}

// Helper to fire pointer events on a target element
function firePointerEvent(
  element: Element,
  type: string,
  init: Partial<PointerEventInit> = {}
): void {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    clientX: 100,
    clientY: 100,
    ...init,
  });
  element.dispatchEvent(event);
}

describe("useDrag", () => {
  const ELEMENT_WIDTH = 320;
  const ELEMENT_HEIGHT = 240;
  const VIEWPORT_WIDTH = 1024;
  const VIEWPORT_HEIGHT = 768;

  beforeEach(() => {
    // Stub getBoundingClientRect so width/height are known
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: ELEMENT_WIDTH,
      height: ELEMENT_HEIGHT,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: ELEMENT_WIDTH,
      bottom: ELEMENT_HEIGHT,
      toJSON: () => ({}),
    } as DOMRect);

    // Set viewport dimensions
    Object.defineProperty(window, "innerWidth", { value: VIEWPORT_WIDTH, writable: true, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: VIEWPORT_HEIGHT, writable: true, configurable: true });

    // Make requestAnimationFrame run the callback synchronously
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("captures the pointer on handle pointerdown", () => {
    const spy = vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(() => undefined);
    const { getByTestId } = render(<Harness />);
    const handle = getByTestId("handle");

    act(() => {
      firePointerEvent(handle, "pointerdown", { pointerId: 42 });
    });

    expect(spy).toHaveBeenCalledWith(42);
  });

  it("writes position imperatively without React state during move", () => {
    const onCommit = vi.fn();
    vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(() => undefined);

    const { container } = render(<Harness initialX={50} initialY={60} onCommit={onCommit} />);
    const handle = within(container).getByTestId("handle");
    const windowEl = within(container).getByTestId("window");

    act(() => {
      firePointerEvent(handle, "pointerdown", { clientX: 100, clientY: 100 });
    });

    act(() => {
      firePointerEvent(handle, "pointermove", { clientX: 130, clientY: 140 });
    });

    // style.transform should reflect the delta from start
    expect(windowEl.style.transform).toMatch(/translate\(/);
    // onCommit must NOT be called during move
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits final position to state exactly once on pointerup", () => {
    const onCommit = vi.fn();
    vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(() => undefined);
    vi.spyOn(Element.prototype, "releasePointerCapture").mockImplementation(() => undefined);

    const { container } = render(<Harness initialX={50} initialY={60} onCommit={onCommit} />);
    const handle = within(container).getByTestId("handle");

    act(() => {
      firePointerEvent(handle, "pointerdown", { clientX: 100, clientY: 100 });
    });
    act(() => {
      firePointerEvent(handle, "pointermove", { clientX: 120, clientY: 130 });
    });
    act(() => {
      firePointerEvent(handle, "pointerup", { clientX: 120, clientY: 130 });
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    const [x, y] = onCommit.mock.calls[0] as [number, number];
    expect(typeof x).toBe("number");
    expect(typeof y).toBe("number");
  });

  it("clamps to viewport edges", () => {
    const onCommit = vi.fn();
    vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(() => undefined);
    vi.spyOn(Element.prototype, "releasePointerCapture").mockImplementation(() => undefined);

    const { container } = render(<Harness initialX={0} initialY={0} onCommit={onCommit} />);
    const handle = within(container).getByTestId("handle");

    act(() => {
      firePointerEvent(handle, "pointerdown", { clientX: 100, clientY: 100 });
    });
    // Drag way past the right/bottom edge
    act(() => {
      firePointerEvent(handle, "pointermove", { clientX: 5000, clientY: 5000 });
    });
    act(() => {
      firePointerEvent(handle, "pointerup", { clientX: 5000, clientY: 5000 });
    });

    const [x, y] = onCommit.mock.calls[0] as [number, number];
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(VIEWPORT_WIDTH - ELEMENT_WIDTH);
    expect(y).toBeLessThanOrEqual(VIEWPORT_HEIGHT - ELEMENT_HEIGHT);

    // Also verify negative clamping — use a fresh render scoped to its container
    const onCommit2 = vi.fn();

    const { container: container2 } = render(<Harness initialX={200} initialY={200} onCommit={onCommit2} />);
    const handle2 = within(container2).getByTestId("handle");

    act(() => {
      firePointerEvent(handle2, "pointerdown", { clientX: 100, clientY: 100 });
    });
    act(() => {
      firePointerEvent(handle2, "pointermove", { clientX: -5000, clientY: -5000 });
    });
    act(() => {
      firePointerEvent(handle2, "pointerup", { clientX: -5000, clientY: -5000 });
    });

    const [x2, y2] = onCommit2.mock.calls[0] as [number, number];
    expect(x2).toBeGreaterThanOrEqual(0);
    expect(y2).toBeGreaterThanOrEqual(0);
  });

  it("does not preventDefault on the window body", () => {
    vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(() => undefined);
    const { container } = render(<Harness />);
    const windowEl = within(container).getByTestId("window");

    // Fire pointerdown directly on the window frame (not the handle)
    const preventDefaultSpy = vi.fn();
    const event = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    Object.defineProperty(event, "preventDefault", { value: preventDefaultSpy });

    act(() => {
      windowEl.dispatchEvent(event);
    });

    // Window frame body pointerdown should not have preventDefault called
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it("releases pointer capture on pointerup", () => {
    const releaseSpy = vi.spyOn(Element.prototype, "releasePointerCapture").mockImplementation(() => undefined);
    vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(() => undefined);

    const { container } = render(<Harness />);
    const handle = within(container).getByTestId("handle");

    act(() => {
      firePointerEvent(handle, "pointerdown", { pointerId: 7 });
    });
    act(() => {
      firePointerEvent(handle, "pointerup", { pointerId: 7 });
    });

    expect(releaseSpy).toHaveBeenCalledWith(7);
  });
});
