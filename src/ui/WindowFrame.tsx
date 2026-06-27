// WindowFrame — draggable glass chrome around one opened app (Phase 15, plan 15-03).
//
// The AppShell-wrapped app renders as a normal child of this frame's React
// subtree (inside the host root), so it shares the host's reconciler, batching,
// and — in tests — the same `act()` scope. The AppShell carries no chrome of
// its own; the ⋮ contextual prompt now lives in this titlebar (Phase 19,
// plan 19-01) so the app body is a chrome-free zone ready for Phase 20.
//
// (Earlier this frame mounted the app into a SEPARATE manager-owned root via
// mountApp. That detached root rendered outside the test `act()` scope, which let
// a runaway effect-driven re-render in on-demand app/fixture code spin
// unthrottled and also raced when unmounting mid-render. Rendering in-tree
// removes both.)

import { useState, type ComponentType, memo, useRef } from "react";
import { MoreVertical } from "lucide-react";
import { AppShell } from "./AppShell";
import { ContextualPrompt } from "./ContextualPrompt";
import { ErrorBoundary } from "./ErrorBoundary";
import { useDrag } from "./useDrag";
import { iconForAppType } from "./iconForApp";
import { SNAP_THRESHOLD } from "./snapConstants";

interface WindowBodyProps {
  instanceId: string;
  title: string;
  Component: ComponentType | null;
  onClose: () => void;
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
  }: WindowBodyProps) {
    if (!Component) {
      return <div className="window-chrome__placeholder">Preparing…</div>;
    }
    // The AppShell carries role="region" (labeled by the app name); it only
    // appears once the component resolves, so the region denotes a READY app
    // rather than an empty in-flight placeholder. The app is wrapped in an
    // ErrorBoundary so a throwing app/widget is contained to this window instead
    // of crashing the whole desktop. AppShell is content-only (no header/chrome).
    return (
      <AppShell displayName={title}>
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
  /** When true, the frame is zoomed to the work area (Phase 19). Disables drag. */
  maximized: boolean;
  /** When set, the frame is snapped to the left/right HALF of the work area
   *  (Phase 19, plan 19-03, CHROME-03); null = not snapped. A snapped frame, like
   *  a maximized one, gets an explicit work-area half-rect w/h. */
  snapSide?: "left" | "right" | null;
  /** Optional explicit width/height applied when maximized OR snapped, so the
   *  frame fills the work area (or a half of it); a plain window stays
   *  transform-only + CSS-min. */
  w?: number;
  h?: number;
  /** Resolved app component; null renders a neutral placeholder body. */
  Component: ComponentType | null;
  onClose: () => void;
  onMinimize: () => void;
  onFocus: () => void;
  /** Toggle maximize ↔ restore (green traffic-light + double-click titlebar). */
  onMaximize: () => void;
  /** Commit a FREE (non-snapped) drag position. Fires only when the drag did NOT
   *  end within the snap threshold of an edge (otherwise onSnap fires instead). */
  onMove: (x: number, y: number) => void;
  /** Commit a SNAP. Fires when the drag ends within the snap threshold of an
   *  edge, carrying the SAME side the during-drag preview reported (onEdgeChange)
   *  — so preview and commit can never disagree (WR-02). When absent, the frame
   *  falls back to onMove with the clamped position. */
  onSnap?: (side: "left" | "right") => void;
  /** During a drag, report whether the pointer is within the snap threshold of
   *  the left/right edge (or null when not near an edge) so the desktop can show
   *  a drop-zone preview (Phase 19, plan 19-03). */
  onEdgeChange?: (side: "left" | "right" | null) => void;
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
  maximized,
  snapSide,
  w,
  h,
  Component,
  onClose,
  onMinimize,
  onFocus,
  onMaximize,
  onMove,
  onSnap,
  onEdgeChange,
  onModify,
}: WindowFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  // True only while a titlebar drag is in flight — gates the edge-proximity
  // signal so a hover (non-drag pointermove) never raises a snap drop-zone.
  const draggingRef = useRef(false);
  // Last edge side reported to onEdgeChange — avoids re-notifying the parent on
  // every pointermove when the side has not changed.
  const lastEdgeRef = useRef<"left" | "right" | null>(null);

  // A snapped frame, like a maximized one, is pinned to an explicit work-area
  // rect (the left/right half) and gets explicit w/h. Both ignore the
  // transform-only + CSS-min path so the frame fills its assigned rect.
  const pinned = maximized || snapSide != null;

  // The snap threshold is the SHARED SNAP_THRESHOLD constant (IN-04): a drag
  // whose pointer is within this many px of the left/right viewport edge
  // surfaces a drop-zone preview (and snaps on release — the commit in
  // DesktopShell is driven off the SAME reported edge side, WR-02).
  function reportEdge(clientX: number): void {
    if (!onEdgeChange) return;
    let side: "left" | "right" | null = null;
    if (clientX <= SNAP_THRESHOLD) side = "left";
    else if (clientX >= window.innerWidth - SNAP_THRESHOLD) side = "right";
    if (side !== lastEdgeRef.current) {
      lastEdgeRef.current = side;
      onEdgeChange(side);
    }
  }

  function handleApply(instruction: string): void {
    setPromptOpen(false);
    onModify?.(instruction);
  }

  // The `icon` prop carries the neutral appType key (e.g. "weather"); resolve it
  // to a glyph the same way the Dock does (iconForAppType) so the titlebar shows
  // an icon rather than the raw key string (WR-04).
  const TitleIcon = iconForAppType(icon);

  // Commit handler: if the drag ended within the snap threshold of an edge (the
  // SAME signal the during-drag preview used — lastEdgeRef, set by reportEdge),
  // commit a SNAP to that side; otherwise commit the free clamped position. This
  // guarantees the preview and the commit agree even for frames wider than the
  // nominal width, where a recomputed x+width check would disagree (WR-02). The
  // useDrag onCommit runs on pointerup BEFORE this frame's own onPointerUp resets
  // lastEdgeRef, so the side is still valid here.
  const commitDrag = (cx: number, cy: number): void => {
    const side = lastEdgeRef.current;
    if (side !== null && onSnap) {
      onSnap(side);
      return;
    }
    onMove(cx, cy);
  };

  const { handlePointerDown } = useDrag({
    elementRef: frameRef,
    initialX: x,
    initialY: y,
    onCommit: commitDrag,
  });

  return (
    <div
      ref={frameRef}
      className={
        "window-chrome" +
        (minimized ? " window-chrome--minimized" : "") +
        (maximized ? " window-chrome--maximized" : "") +
        (snapSide ? " window-chrome--snap-" + snapSide : "")
      }
      // Position is driven ENTIRELY by transform (box origin stays at the
      // desktop's top-left 0,0 via the CSS top/left). useDrag writes the same
      // transform imperatively during a drag; on commit, onMove updates the
      // positions map and this React-owned transform replaces the imperative
      // one cleanly — no double-applied left/top + transform offset.
      //
      // When maximized, an explicit width/height (the work-area rect, computed
      // in DesktopShell) is applied so the frame FILLS the work area; the CSS
      // min-size alone would leave it at its content size. The non-maximized
      // branch stays transform-only + CSS-min so the existing position/drag
      // tests are byte-identical.
      style={{
        transform: `translate(${x}px, ${y}px)`,
        zIndex: z,
        ...(pinned && w !== undefined && h !== undefined
          ? { width: w, height: h }
          : null),
      }}
    >
      <div
        className="window-chrome__titlebar titlebar-handle"
        onPointerDown={(e) => {
          // While maximized the window is pinned to the work area — gate drag so
          // it cannot be pulled out of the maximized rect (CONTEXT.md: simplest
          // path is to disable drag while maximized). Early-return before
          // onFocus()/handlePointerDown so neither a drag nor a focus-raise fires.
          if (maximized) return;
          // Pressing a titlebar control (close / min / max / ⋮) must NOT begin a
          // drag: useDrag calls preventDefault() + setPointerCapture() on
          // pointerdown, which in a real browser eats the button's click (jsdom
          // no-ops both, so RTL never saw it). Raise the window but skip the drag
          // so the control's click fires normally.
          if ((e.target as HTMLElement).closest("button")) {
            onFocus();
            return;
          }
          draggingRef.current = true;
          lastEdgeRef.current = null;
          onFocus();
          handlePointerDown(e);
        }}
        // During the drag, surface the edge-proximity signal so the desktop can
        // show a snap drop-zone preview. Pointer capture (set by useDrag) routes
        // moves here even past the titlebar bounds. Gated by draggingRef so a
        // bare hover never raises a preview.
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          reportEdge(e.clientX);
        }}
        onPointerUp={() => {
          // The drag committed (or ended) — stop reporting and let DesktopShell
          // clear the preview at onCommit. Clearing the local edge marker keeps
          // the next drag's first report fresh.
          draggingRef.current = false;
          lastEdgeRef.current = null;
        }}
        // Double-clicking the titlebar toggles maximize ↔ restore.
        onDoubleClick={onMaximize}
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
            // stopPropagation so the click does not start a titlebar drag.
            onClick={(e) => {
              e.stopPropagation();
              onMaximize();
            }}
          />
        </div>
        <div className="window-chrome__title-group">
          <span className="window-chrome__icon" aria-hidden="true">
            <TitleIcon size={14} />
          </span>
          <span className="window-chrome__title">{title}</span>
        </div>
        {/* ⋮ menu — opens the shared contextual prompt (MOD-01).
            Lives in the titlebar (Phase 19) so the app body is chrome-free.
            stopPropagation prevents the click from triggering the drag's onPointerDown. */}
        <button
          type="button"
          className="app-bar__icon-btn"
          aria-label="App options"
          aria-haspopup="dialog"
          aria-expanded={promptOpen}
          title="Options"
          onClick={(e) => {
            e.stopPropagation();
            setPromptOpen((open) => !open);
          }}
        >
          <MoreVertical size={20} aria-hidden="true" />
        </button>
      </div>
      {promptOpen && (
        <ContextualPrompt
          targetName={title}
          onApply={handleApply}
          onCancel={() => setPromptOpen(false)}
        />
      )}
      <div className="window-chrome__body" onPointerDown={onFocus}>
        <WindowBody
          instanceId={instanceId}
          title={title}
          Component={Component}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
