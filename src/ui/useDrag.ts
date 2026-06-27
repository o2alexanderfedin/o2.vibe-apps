import { useCallback, useEffect, useRef } from "react";

export interface UseDragOptions {
  elementRef: React.RefObject<HTMLElement | null>;
  initialX: number;
  initialY: number;
  onCommit: (x: number, y: number) => void;
}

/**
 * Pointer-capture drag hook with viewport clamping.
 *
 * Writes position to elementRef.current.style.transform inside rAF during drag
 * (no React re-renders on move). Calls onCommit exactly once on pointerup/pointercancel
 * with the final clamped position.
 */
export function useDrag({ elementRef, initialX, initialY, onCommit }: UseDragOptions): {
  handlePointerDown: (e: React.PointerEvent) => void;
} {
  const rafId = useRef<number>(0);
  const dragging = useRef(false);
  const startPointer = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: initialX, y: initialY });
  const lastClamped = useRef({ x: initialX, y: initialY });

  // Defensively cancel any pending rAF if the frame unmounts mid-drag (e.g. the
  // window is closed through a path other than pointerup while a drag is
  // active). The rAF callback is already guarded by `if (elementRef.current)`,
  // but cancelling on unmount avoids relying solely on onEnd ever running.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafId.current);
    };
  }, []);

  const clamp = useCallback((raw: { x: number; y: number }): { x: number; y: number } => {
    const el = elementRef.current;
    const rect = el ? el.getBoundingClientRect() : { width: 0, height: 0 };
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;
    return {
      x: Math.max(0, Math.min(raw.x, maxX)),
      y: Math.max(0, Math.min(raw.y, maxY)),
    };
  }, [elementRef]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      dragging.current = true;
      startPointer.current = { x: e.clientX, y: e.clientY };
      // initialX/initialY from options represent the starting logical position
      startPos.current = { x: initialX, y: initialY };

      const desktop = document.querySelector(".desktop");
      desktop?.classList.add("desktop--dragging");

      const onMove = (moveEvent: PointerEvent) => {
        if (!dragging.current) return;
        const dx = moveEvent.clientX - startPointer.current.x;
        const dy = moveEvent.clientY - startPointer.current.y;
        const raw = { x: startPos.current.x + dx, y: startPos.current.y + dy };
        const clamped = clamp(raw);
        lastClamped.current = clamped;

        cancelAnimationFrame(rafId.current);
        rafId.current = requestAnimationFrame(() => {
          if (elementRef.current) {
            elementRef.current.style.transform = `translate(${clamped.x}px,${clamped.y}px)`;
          }
        });
      };

      const onEnd = (endEvent: PointerEvent) => {
        if (!dragging.current) return;
        dragging.current = false;

        cancelAnimationFrame(rafId.current);
        (endEvent.currentTarget as HTMLElement).releasePointerCapture(endEvent.pointerId);

        const desktop2 = document.querySelector(".desktop");
        desktop2?.classList.remove("desktop--dragging");

        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onEnd);
        target.removeEventListener("pointercancel", onEnd);

        // Compute final position from end event
        const dx = endEvent.clientX - startPointer.current.x;
        const dy = endEvent.clientY - startPointer.current.y;
        const raw = { x: startPos.current.x + dx, y: startPos.current.y + dy };
        const final = clamp(raw);

        onCommit(final.x, final.y);
      };

      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onEnd);
      target.addEventListener("pointercancel", onEnd);
    },
    [elementRef, initialX, initialY, onCommit, clamp]
  );

  return { handlePointerDown };
}
