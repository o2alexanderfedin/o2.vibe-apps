// WindowFrame — draggable glass chrome around one opened app (Phase 15, plan 15-03).
//
// The AppShell-wrapped app renders as a normal child of this frame's React
// subtree (inside the host root), so it shares the host's reconciler, batching,
// and — in tests — the same `act()` scope. The AppShell carries the ⋮ contextual
// prompt around the resolved app component; closing or unmounting the frame tears
// the whole subtree down through React, leaving zero orphan roots.
//
// (Earlier this frame mounted the app into a SEPARATE manager-owned root via
// mountApp. That detached root rendered outside the test `act()` scope, which let
// a runaway effect-driven re-render in on-demand app/fixture code spin
// unthrottled and also raced when unmounting mid-render. Rendering in-tree
// removes both.)

import { type ComponentType, memo, useRef } from "react";
import { AppShell } from "./AppShell";
import { ErrorBoundary } from "./ErrorBoundary";
import { useDrag } from "./useDrag";

interface WindowBodyProps {
  instanceId: string;
  title: string;
  Component: ComponentType | null;
  onClose: () => void;
  onModify?: (instruction: string) => void;
}

// The mounted app body, memoized so window-chrome churn (z-order restacks, drag
// position commits, minimize toggles) does NOT re-render the app subtree. That
// isolation is what keeps an effect-driven re-render inside an on-demand app from
// being continually "kicked" by the manager — re-rendering the app's ancestor on
// every focus/move resets React's nested-update bail-out, which would otherwise
// let a self-updating app component spin without ever settling. The comparator
// ignores callback identity on purpose (the parent recreates them each render
// but they read live state through refs), keying only on what changes the body.
const WindowBody = memo(
  function WindowBody({
    title,
    Component,
    onClose,
    onModify,
  }: WindowBodyProps) {
    if (!Component) {
      return <div className="window-chrome__placeholder">Preparing…</div>;
    }
    // The AppShell carries role="region" (labeled by the app) plus the ⋮ prompt;
    // it only appears once the component resolves, so the region denotes a READY
    // app rather than an empty in-flight placeholder. The app is wrapped in an
    // ErrorBoundary so a throwing app/widget is contained to this window instead
    // of crashing the whole desktop.
    return (
      <AppShell displayName={title} onClose={onClose} onModify={onModify}>
        <ErrorBoundary>
          <Component />
        </ErrorBoundary>
      </AppShell>
    );
  },
  (prev, next) =>
    prev.instanceId === next.instanceId &&
    prev.title === next.title &&
    prev.Component === next.Component,
);

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

  const { handlePointerDown } = useDrag({
    elementRef: frameRef,
    initialX: x,
    initialY: y,
    onCommit: onMove,
  });

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
      <div className="window-chrome__body" onPointerDown={onFocus}>
        <WindowBody
          instanceId={instanceId}
          title={title}
          Component={Component}
          onClose={onClose}
          onModify={onModify}
        />
      </div>
    </div>
  );
}
