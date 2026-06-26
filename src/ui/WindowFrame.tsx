// WindowFrame — draggable glass chrome around one opened app (Phase 15, plan 15-03).
//
// The app does NOT render as a host-tree child of this frame. Instead the frame
// owns an empty body element and asks the manager-owned root machinery
// (mountApp / unmountApp, keyed by instanceId) to render a small Wrapper into
// that body. The Wrapper renders AppShell — which carries the ⋮ contextual
// prompt — around the resolved app component. So a single root contains the
// AppShell chrome, its ⋮ prompt wiring, and the app together; closing the frame
// tears the whole root down through unmountApp, leaving zero orphan roots.

import {
  createElement,
  useEffect,
  useRef,
  type ComponentType,
} from "react";
import { AppShell } from "./AppShell";
import { useDrag } from "./useDrag";
import { mountApp, unmountApp } from "../execution/mount";

export interface WindowFrameProps {
  id: string;
  instanceId: string;
  title: string;
  icon: string;
  x: number;
  y: number;
  z: number;
  minimized: boolean;
  /** Resolved app component; null renders a neutral placeholder body. */
  Component: ComponentType | null;
  onClose: () => void;
  onMinimize: () => void;
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  onModify?: (instruction: string) => void;
}

export function WindowFrame({
  instanceId,
  title,
  icon,
  x,
  y,
  z,
  minimized,
  Component,
  onClose,
  onMinimize,
  onFocus,
  onMove,
  onModify,
}: WindowFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const { handlePointerDown } = useDrag({
    elementRef: frameRef,
    initialX: x,
    initialY: y,
    onCommit: onMove,
  });

  // Mount the AppShell-wrapped app into the body via the manager-owned root.
  // Re-runs when the instance, resolved component, or title changes so the
  // wrapped chrome stays in step. The document.contains backstop is the
  // last-resort guard against rendering into a body that never reached the
  // live document (e.g. the window closed mid-resolve).
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    if (!document.contains(el)) return;

    function Wrapper() {
      return createElement(AppShell, {
        displayName: title,
        onClose,
        onModify,
        children: Component
          ? createElement(Component)
          : createElement(
              "span",
              { className: "window-chrome__placeholder" },
              "Preparing…",
            ),
      });
    }

    mountApp(instanceId, el, Wrapper);
    return () => unmountApp(instanceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId, Component, title]);

  return (
    <div
      ref={frameRef}
      className={"window-chrome" + (minimized ? " window-chrome--minimized" : "")}
      style={{ left: x, top: y, zIndex: z }}
    >
      <div
        className="window-chrome__titlebar titlebar-handle"
        onPointerDown={(e) => {
          onFocus();
          handlePointerDown(e);
        }}
      >
        <div className="window-chrome__traffic-lights">
          <button
            type="button"
            className="window-chrome__traffic-light window-chrome__traffic-light--close"
            aria-label="Close"
            onClick={onClose}
          />
          <button
            type="button"
            className="window-chrome__traffic-light window-chrome__traffic-light--min"
            aria-label="Minimize"
            onClick={onMinimize}
          />
          <button
            type="button"
            className="window-chrome__traffic-light window-chrome__traffic-light--max"
            aria-label="Maximize"
            disabled
          />
        </div>
        <span className="window-chrome__title">{title}</span>
        <span className="window-chrome__icon" aria-hidden="true">
          {icon}
        </span>
      </div>
      <div
        className="window-chrome__body"
        ref={bodyRef}
        onPointerDown={onFocus}
      />
    </div>
  );
}
