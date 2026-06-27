// DesktopShell — the root desktop UI (Phase 16, plan 16-03, WIN-08).
//
// Assembles the Vibe OS desktop: a themed wallpaper + four animated blob layers
// behind the windows, the window stack itself, and the dock + menu bar + search
// launcher chrome over them. It owns the proven open flow ported verbatim from
// the former storefront component (handleOpen / handleClose / storeComponent /
// handleModify), so windowing, contextual modification, the failure fallbacks,
// and the account/key dialog are preserved with zero behavioral regression.
//
// DesktopShell wraps its OWN WindowManagerProvider so it stays testable
// standalone — tests render a bare <DesktopShell/> (inside ServicesProvider +
// VibeThemeProvider) with no App wrapper, mirroring the prior component.
//
// All copy and class names are neutral (no banned hygiene tokens): the desktop
// reveals nothing about how an app's body comes to exist.

import { useCallback, useEffect, useRef, useState } from "react";
import { type ComponentType } from "react";
import { KeyDialog } from "./KeyDialog";
import { WindowFrame } from "./WindowFrame";
import {
  WindowManagerProvider,
  useWindowManager,
  type WindowManagerValue,
} from "./useWindowManager";
import { resolveOpenApp } from "../intent/resolver";
import {
  resolveComponent,
  evictLiveComponent,
  deriveDisplayName,
} from "../execution/loader";
import { ProduceAuthError } from "../execution/producer";
import { ProduceThrottledError } from "../host/produceGate";
import { useServices } from "../services/ServicesProvider";
import { routeModification } from "../intent/routeModification";
import { registryKey } from "../registry/cacheKey";
import { logger } from "../lib/logger";
import { MenuBar } from "./MenuBar";
import { Dock } from "./Dock";
import { SearchLauncherPanel } from "./SearchLauncherPanel";
import { slugFromText } from "./launcherUtils";

// Work-area geometry (Phase 19, plan 19-02, CHROME-02). Maximize = zoom-to-work-
// area, NOT the OS Fullscreen API: a maximized window fills the viewport MINUS
// the menu bar (top) and the dock (bottom), so both stay visible — they ARE the
// product identity. These constants mirror the CSS layout chrome:
//   MENU_BAR_H  → .menu-bar { height: 40px } (src/index.css)
//   DOCK_RESERVE → .dock bottom:16px + padding 9px*2 + icon 52px ≈ 88px reserved
const MENU_BAR_H = 40;
const DOCK_RESERVE = 88;

// Snap-to-half (Phase 19, plan 19-03, CHROME-03). When a drag commits with the
// pointer within SNAP_THRESHOLD px of the left/right viewport edge, the window
// snaps to that HALF of the work area instead of taking the dragged position.
// The same threshold drives the during-drag drop-zone preview.
const SNAP_THRESHOLD = 20;

// Nominal frame width used for the right-edge snap check (mirrors the window
// manager's DEFAULT_W). A drag whose committed x + this width reaches the right
// edge snaps right, the symmetric counterpart to x ≤ SNAP_THRESHOLD on the left.
const DEFAULT_FRAME_W = 400;

// The work-area rect a maximized window fills. Read from the live viewport so a
// resize-then-maximize uses the current size. The rect starts below the menu bar
// and stops above the dock reserve.
function workArea(): { x: number; y: number; w: number; h: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  return {
    x: 0,
    y: MENU_BAR_H,
    w: vw,
    h: vh - MENU_BAR_H - DOCK_RESERVE,
  };
}

// The half-rect a snapped window fills (Phase 19, plan 19-03). A LEFT snap takes
// the left half of the work area; a RIGHT snap the right half. Same model as
// maximize (work area, NOT the full viewport) so the menu bar + dock stay
// visible — quarter/corner snap is deferred (CHROME-F1, half only this phase).
function snapHalf(side: "left" | "right"): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const wa = workArea();
  const halfW = Math.round(wa.w / 2);
  return {
    x: side === "left" ? wa.x : wa.x + halfW,
    y: wa.y,
    w: halfW,
    h: wa.h,
  };
}

// Neutral, hygiene-safe fallback shown when an app fails to open for a generic
// reason. No mechanic-revealing language and no banned tokens — it just tells the
// user the app didn't load and offers a retry, which also makes failures
// visible/debuggable instead of the app silently disappearing.
function FailedAppContent({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="app-failed-fallback" role="alert">
      <p className="app-failed-fallback__body">
        This app couldn&rsquo;t load. Try again.
      </p>
      <button
        type="button"
        className="app-failed-fallback__retry"
        onClick={onRetry}
      >
        Try again
      </button>
    </div>
  );
}

// Inline reconfigure prompt shown when an open failed for an auth reason (401 /
// missing key, RESIL-03). It keeps the desktop usable (it renders INSIDE the
// failed app's shell, the rest of the desktop is untouched) and offers a single
// neutral "Connect your account" action that opens the existing KeyDialog. Copy
// is neutral and never mentions the underlying mechanic.
function NeedsAuthContent({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="app-failed-fallback" role="alert">
      <p className="app-failed-fallback__body">
        Connect your account to open this app.
      </p>
      <button
        type="button"
        className="app-failed-fallback__retry"
        onClick={onConnect}
      >
        Connect your account
      </button>
    </div>
  );
}

// Soft-cap fallback shown when the produce-cost guardrail blocks a fresh open
// because too many apps were opened in a short window (RESIL-05). The copy is
// neutral and reassuring — the cap recovers as the rolling window slides, so a
// later retry (or a re-open once a moment has passed) succeeds. It renders in the
// SAME neutral failed-open region, keeping the desktop usable underneath.
function ThrottledAppContent({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="app-failed-fallback" role="alert">
      <p className="app-failed-fallback__body">
        You&rsquo;re opening a lot of apps quickly — give it a moment.
      </p>
      <button
        type="button"
        className="app-failed-fallback__retry"
        onClick={onRetry}
      >
        Try again
      </button>
    </div>
  );
}

// DesktopShell owns its OWN WindowManagerProvider so the component is testable
// standalone (DesktopShell.test.tsx and the migrated open-flow tests render a
// bare <DesktopShell/> with no App wrapper, and would otherwise throw when
// DesktopShellInner consumes useWindowManager).
export function DesktopShell() {
  return (
    <WindowManagerProvider>
      <DesktopShellInner />
    </WindowManagerProvider>
  );
}

function DesktopShellInner() {
  const services = useServices();
  const windowManager = useWindowManager();
  // The resolved component (or a fallback component) per window instance. The
  // window is minted by the manager FIRST (so a frame appears immediately and
  // the isOpen guard works); this map carries the body once produce settles.
  // A null value renders WindowFrame's neutral "Preparing…" placeholder.
  const [components, setComponents] = useState<
    Map<string, ComponentType | null>
  >(new Map());
  // onMove position overrides keyed by instanceId. Committed drags update this
  // so a re-render keeps the dragged position (useDrag's imperative transform
  // is the during-drag source of truth; this is the committed source of truth).
  const [positions, setPositions] = useState<
    Map<string, { x: number; y: number }>
  >(new Map());
  // Owns the inline reconfigure dialog (RESIL-03): the desktop stays mounted and
  // usable while the KeyDialog is open over it, so a 401 never crashes the page
  // or blocks the rest of the desktop. Also reachable from the menu-bar account
  // control (SHELL-03).
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  // Gates the search/launcher overlay (Phase 17, CREATE-01/02): opened from the
  // dock magnifier, closed on backdrop click / close control / after an open.
  const [launcherOpen, setLauncherOpen] = useState(false);
  // Drives the panel's working indicator while a free-text describe is in flight
  // (true before resolve, false in the finally). Seeded picks resolve instantly
  // from cache and never set this, so the indicator only shows during a real
  // describe latency window.
  const [launcherWorking, setLauncherWorking] = useState(false);
  // PERF-01 reduced-motion seam: mirrors the OS prefers-reduced-motion
  // preference into React state via a mockable window.matchMedia, so the CSS
  // degrade has a JS-observable companion (this drives the root marker class the
  // CSS + tests read, and gives any future JS path — e.g. blob-count reduction —
  // a hook). The CSS media query is the primary, JS-free degrade; this is the
  // testable signal on top of it.
  const [reducedMotion, setReducedMotion] = useState(false);
  // Snap drop-zone preview (Phase 19, plan 19-03, CHROME-03). While a window is
  // dragged within SNAP_THRESHOLD of the left/right edge, this carries that side
  // so a translucent overlay marks the half the window will snap to on release;
  // null renders no overlay. Driven by each WindowFrame's during-drag onEdgeChange
  // signal and cleared at commit.
  const [snapPreview, setSnapPreview] = useState<"left" | "right" | null>(null);

  // Stable refs so callbacks can read current manager/services without
  // re-creating handlers (and so handleModify can look up the live window list).
  const windowManagerRef = useRef<WindowManagerValue>(windowManager);
  windowManagerRef.current = windowManager;

  // Tear down a window: evict its live component, route close through the
  // manager (which unmounts the single root), and drop its body/position.
  const handleClose = useCallback(
    (id: string, instanceId: string) => {
      evictLiveComponent(instanceId);
      windowManagerRef.current.close(id);
      setComponents((prev) => {
        const next = new Map(prev);
        next.delete(instanceId);
        return next;
      });
      setPositions((prev) => {
        if (!prev.has(instanceId)) return prev;
        const next = new Map(prev);
        next.delete(instanceId);
        return next;
      });
    },
    [],
  );

  // Store a finished open's body under its instanceId. The fallback variants
  // build a small component so a failed open still renders a neutral region
  // (role="region" via the window's AppShell) rather than a blank placeholder.
  const storeComponent = useCallback(
    (instanceId: string, Component: ComponentType | null) => {
      setComponents((prev) => new Map(prev).set(instanceId, Component));
    },
    [],
  );

  const handleOpen = useCallback(
    async (appType: string, displayName: string) => {
      logger.info("Opening " + appType);

      // Mint the window FIRST so a frame appears immediately (its body shows the
      // neutral "Preparing…" placeholder while produce is in flight) and the
      // manager-minted instanceId is the SINGLE source of truth keying resolve,
      // the components map, and the close/isOpen guard.
      const wm = windowManagerRef.current;
      const instanceId = wm.open(appType, {
        title: displayName,
        icon: appType,
      });

      // Close the window for a failed/aborted open, keyed by instanceId. The
      // manager owns the instanceId↔id mapping; if the entry is already gone
      // (window closed concurrently) the close is a harmless no-op.
      const closeByInstance = (iid: string) => {
        const wid = windowManagerRef.current.windows.find(
          (x) => x.instanceId === iid,
        )?.id;
        if (wid) handleClose(wid, iid);
      };

      try {
        const intent = await resolveOpenApp(appType);
        const Component = await resolveComponent(
          instanceId,
          appType,
          intent.cacheKey,
          services,
        );

        // PRIMARY mid-produce-close guard (Pitfall 9): if the window was closed
        // while produce was in flight, drop the result and evict — never store a
        // body for a window that no longer exists. Keyed on the manager-minted
        // instanceId (synchronously mirrored), so it never depends on the
        // windows array having flushed.
        if (!windowManagerRef.current.isOpenByInstance(instanceId)) {
          evictLiveComponent(instanceId);
          return;
        }

        storeComponent(instanceId, Component);
      } catch (err) {
        // Surface a neutral fallback so the failure is visible and debuggable;
        // diagnostics go to the gated logger, the user-facing copy stays
        // mechanic-free. 401 → inline reconfigure (RESIL-03); throttle (RESIL-05)
        // → softer "give it a moment"; otherwise the generic "couldn't load".
        const needsAuth = err instanceof ProduceAuthError;
        const throttled = err instanceof ProduceThrottledError;
        logger.error("Failed to open " + appType + ": " + String(err));

        // Even on failure, only render the fallback if the window still exists.
        if (!windowManagerRef.current.isOpenByInstance(instanceId)) {
          return;
        }

        const Fallback = makeFallback({
          needsAuth,
          throttled,
          onConnect: () => setKeyDialogOpen(true),
          onRetry: () => {
            closeByInstance(instanceId);
            void handleOpenRef.current(appType, displayName);
          },
        });
        storeComponent(instanceId, Fallback);
      }
    },
    [services, storeComponent, handleClose],
  );

  // Stable self-reference so the fallback retry handler can re-invoke the
  // latest handleOpen without adding it to its own dependency list.
  const handleOpenRef = useRef(handleOpen);
  handleOpenRef.current = handleOpen;

  // Free-text describe path (Phase 17, CREATE-02). The user types a description
  // in the panel; we derive a type slug, fold the full text into the cache key
  // (so each description caches as its own app), and route through the SAME
  // windowing machinery handleOpen uses. The ONE difference from handleOpen is
  // deliberate: resolveOpenApp does not fold a prompt into its cache key, so for
  // a description we build the key here via registryKey and call resolveComponent
  // directly with the pre-built key + the full text as the userPrompt. This
  // duplication is intentional and contained — handleOpen stays untouched so its
  // 7 integration tests keep passing; a later phase may extract a shared
  // free-text helper both paths route through.
  const handleDescribe = useCallback(
    async (text: string) => {
      setLauncherWorking(true);
      try {
        // Derive the slug, title, and cache key INSIDE the try so a rejection
        // from any of them (notably registryKey → crypto.subtle.digest, which
        // rejects on a non-secure origin / hardened CSP / certain embedded
        // webviews) still reaches the finally below: the launcher always closes
        // and the working indicator always clears, and the rejection never
        // escapes into the panel's handleSubmit as an unhandled rejection.
        const slug = slugFromText(text);
        const displayName = deriveDisplayName(slug, text);
        const cacheKey = await registryKey("app", slug, text);
        // Route through the windowing machinery: mint the window first (so a
        // frame appears immediately showing the neutral "Preparing…" placeholder
        // while resolve is in flight), then resolve the component under the
        // manager-minted instanceId.
        const wm = windowManagerRef.current;
        const instanceId = wm.open(slug, { title: displayName, icon: slug });
        const closeByInstance = (iid: string) => {
          const wid = windowManagerRef.current.windows.find(
            (x) => x.instanceId === iid,
          )?.id;
          if (wid) handleClose(wid, iid);
        };
        try {
          const Component = await resolveComponent(
            instanceId,
            slug,
            cacheKey,
            services,
            text,
          );
          if (!windowManagerRef.current.isOpenByInstance(instanceId)) {
            evictLiveComponent(instanceId);
            return;
          }
          storeComponent(instanceId, Component);
        } catch (err) {
          const needsAuth = err instanceof ProduceAuthError;
          const throttled = err instanceof ProduceThrottledError;
          logger.error("Failed to open described app: " + String(err));
          if (!windowManagerRef.current.isOpenByInstance(instanceId)) return;
          const Fallback = makeFallback({
            needsAuth,
            throttled,
            onConnect: () => setKeyDialogOpen(true),
            onRetry: () => {
              closeByInstance(instanceId);
              void handleDescribeRef.current(text);
            },
          });
          storeComponent(instanceId, Fallback);
        }
      } finally {
        setLauncherWorking(false);
        setLauncherOpen(false);
      }
    },
    [services, storeComponent, handleClose],
  );
  const handleDescribeRef = useRef(handleDescribe);
  handleDescribeRef.current = handleDescribe;

  // Contextual modification (Phase 5, MOD-02/03/04). A free-form instruction
  // from an app's `⋮` prompt is routed CLIENT-SIDE:
  //   - remove → close the window (same teardown as the close traffic-light).
  //   - clone  → mint a NEW window reusing the SAME resolved component.
  //   - tweak  → derive a NEW cache key from (type + instruction), resolve it,
  //              and REPLACE this instance's component IN PLACE so the window's
  //              single root re-renders. The resolve runs through
  //              instantiateWithWidgets, so a tweak changing the `@widget` set
  //              re-pre-warms widgets.
  const handleModify = useCallback(
    async (instanceId: string, instruction: string) => {
      const wm = windowManagerRef.current;
      const target = wm.windows.find((w) => w.instanceId === instanceId);
      if (!target) return;
      const routed = routeModification(instruction);

      if (routed.kind === "remove") {
        handleClose(target.id, instanceId);
        return;
      }

      if (routed.kind === "clone") {
        // Mint a new window reusing the SAME resolved component under the new
        // instance id — no model call. (A failed-to-open target carries a
        // fallback component; the clone renders the same fallback.)
        const cloneInstanceId = wm.open(target.appType, {
          title: target.title,
          icon: target.icon,
        });
        const sourceComponent = components.get(instanceId) ?? null;
        storeComponent(cloneInstanceId, sourceComponent);
        return;
      }

      // Tweak — re-resolve and replace this instance's component in place.
      logger.info("Tweaking " + target.appType);
      try {
        const tweakKey = await registryKey(
          "app",
          target.appType,
          routed.instruction,
        );
        // Resolve the tweak under the window's OWN instanceId (not a synthetic
        // id) so the live-component cache keeps exactly ONE key per window —
        // the one handleClose evicts. First evict the current live component so
        // tier-1 misses and the differing tweakKey drives a re-instantiate; the
        // fresh component then lands back under this window's instanceId, and
        // closing the window reclaims it with no leak (WR-01).
        evictLiveComponent(instanceId);
        const Component = await resolveComponent(
          instanceId,
          target.appType,
          tweakKey,
          services,
          routed.instruction,
        );
        storeComponent(instanceId, Component);
      } catch (err) {
        // A tweak that fails to resolve surfaces the neutral fallback (in place)
        // rather than vanishing the app or showing a mechanic.
        logger.error("Failed to tweak " + target.appType + ": " + String(err));
        const Fallback = makeFallback({
          needsAuth: false,
          throttled: false,
          onConnect: () => setKeyDialogOpen(true),
          onRetry: () => {
            handleClose(target.id, instanceId);
            void handleOpenRef.current(target.appType, target.title);
          },
        });
        storeComponent(instanceId, Fallback);
      }
    },
    [services, handleClose, storeComponent, components],
  );

  // Reflect the OS prefers-reduced-motion preference into state (PERF-01).
  // Guarded for environments where matchMedia is unavailable (older jsdom / SSR)
  // so the desktop still renders. Subscribes to live preference changes via the
  // modern addEventListener('change', ...) with a fallback to the legacy
  // addListener API (older Safari), and cleans up the listener on unmount.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function")
      return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // Legacy MediaQueryList API (older Safari) — addListener/removeListener.
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  // Window-management keyboard shortcuts (Phase 19, plans 19-03 + 19-04).
  // ONE global keydown listener serves every window shortcut:
  //   • Ctrl+Left / Ctrl+Right (CHROME-03) — snap the ACTIVE window to the
  //     work-area half WITHOUT a drag. Ctrl (not Cmd) is the snap modifier.
  //   • Cmd/Ctrl+W (CHROME-04) — close the active window. The browser tab is
  //     NEVER closed: preventDefault() suppresses the native tab-close.
  //   • Cmd/Ctrl+M (CHROME-04) — minimize the active window. preventDefault()
  //     suppresses the browser's native minimize.
  // Snap keys on e.ctrlKey; close/minimize key on (metaKey || ctrlKey) so Cmd+W
  // on macOS and Ctrl+W elsewhere both work — both branches coexist here.
  //
  // The handler acts (and calls preventDefault) ONLY when a Vibe OS window is
  // active — i.e. activeId() resolves a front-most non-minimized window. With no
  // window open the handler is a no-op (no preventDefault), so the browser tab
  // stays closable (T-19-10) and Ctrl+Arrow text navigation outside a window
  // stays free (T-19-08). The active-window-present gate is the same one the
  // snap branch uses; it is the reliable T-19-10 mitigation (document.hasFocus()
  // is unreliable in headless/background contexts and would silently disable the
  // shortcut, so it is NOT used as the gate). It resolves the active window via
  // activeId() (the same highest-z non-minimized definition the menu bar uses,
  // T-19-12), reading the live manager via windowManagerRef so it never closes
  // over a stale list. Lifecycle mirrors the matchMedia effect above (mount add /
  // unmount remove); handleClose is in the deps (it is memoized — re-register is
  // a no-op).
  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleKeyDown(e: KeyboardEvent): void {
      const wm = windowManagerRef.current;
      const mod = e.metaKey || e.ctrlKey;

      // Close / minimize the active window (Cmd on macOS, Ctrl elsewhere).
      if (mod && (e.key === "w" || e.key === "m")) {
        const activeId = wm.activeId();
        // No active Vibe OS window → leave the native shortcut alone so the user
        // can still close the browser tab (T-19-10).
        if (activeId === null) return;
        const active = wm.windows.find((w) => w.id === activeId);
        if (!active) return;

        e.preventDefault();
        if (e.key === "w") handleClose(active.id, active.instanceId);
        else wm.minimize(active.id);
        return;
      }

      // Snap uses Ctrl specifically.
      if (!e.ctrlKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

      const active = wm.activeId();
      // No active Vibe OS window → leave the key alone (no snap, no preventDefault)
      // so it does not hijack browser text navigation.
      if (active === null) return;

      e.preventDefault();
      if (e.key === "ArrowLeft") wm.snapLeft(active);
      else wm.snapRight(active);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  // The active window feeding the menu-bar name: the highest-z, non-minimized
  // window is the front-most one (same z-ordering the manager's zTop tracks).
  const activeWindow =
    [...windowManager.windows]
      .filter((w) => !w.minimized)
      .sort((a, b) => b.z - a.z)[0] ?? null;

  return (
    <div
      className={
        "desktop-shell" +
        (reducedMotion ? " desktop-shell--reduced-motion" : "")
      }
    >
      {/* Layer 1: wallpaper — the .desktop-shell background (var(--wall), CSS).
          Layer 2: four animated blobs behind the windows (purely decorative,
          aria-hidden). */}
      <div className="desktop-shell__blob desktop-shell__blob--1" aria-hidden="true" />
      <div className="desktop-shell__blob desktop-shell__blob--2" aria-hidden="true" />
      <div className="desktop-shell__blob desktop-shell__blob--3" aria-hidden="true" />
      <div className="desktop-shell__blob desktop-shell__blob--4" aria-hidden="true" />

      {/* Layer 3: the window stack — each open app is a draggable WindowFrame.
          The frame mounts an AppShell-wrapped body as ONE managed root (keyed by
          instanceId), so the ⋮ contextual prompt and close traffic-light live
          inside the same root and closing tears the whole root down with zero
          leaked roots. The .desktop container keeps isolation:isolate (Pitfall 3)
          so its z-index:100 sits above the blobs and below the dock/menu-bar. */}
      <div className="desktop">
        {windowManager.windows.map((entry) => {
          // A maximized window is pinned to the work area: its x/y come from
          // workArea() (NOT the drag positions override / cascade), and it is
          // sized to the work-area w/h so it fills the area. A non-maximized
          // window renders exactly as before (transform-only, positions override
          // ?? entry x/y, CSS min-size) — no width/height passed, so the existing
          // position/drag tests stay byte-identical.
          // A maximized window fills the work area; a SNAPPED window fills the
          // left/right HALF of the work area (same rect-application path). Both
          // ignore the drag positions override. A plain window renders unchanged
          // (transform-only, positions override ?? entry x/y, CSS min-size).
          const override = positions.get(entry.instanceId);
          const area = entry.maximized
            ? workArea()
            : entry.snapSide
              ? snapHalf(entry.snapSide)
              : null;
          const x = area ? area.x : (override?.x ?? entry.x);
          const y = area ? area.y : (override?.y ?? entry.y);
          return (
            <WindowFrame
              key={entry.id}
              id={entry.id}
              instanceId={entry.instanceId}
              title={entry.title}
              icon={entry.icon}
              x={x}
              y={y}
              z={entry.z}
              minimized={entry.minimized}
              maximized={entry.maximized}
              snapSide={entry.snapSide}
              w={area?.w}
              h={area?.h}
              Component={components.get(entry.instanceId) ?? null}
              onClose={() => handleClose(entry.id, entry.instanceId)}
              onMinimize={() => windowManager.minimize(entry.id)}
              onFocus={() => windowManager.focus(entry.id)}
              onMaximize={() =>
                entry.maximized
                  ? windowManager.unmaximize(entry.id)
                  : windowManager.maximize(entry.id)
              }
              // During a drag, report edge proximity so the drop-zone preview
              // shows the half the window would snap to (cleared on commit).
              onEdgeChange={(side) => setSnapPreview(side)}
              onMove={(nx, ny) => {
                // At commit, snap to a half if the dragged position reached an
                // edge (within SNAP_THRESHOLD), else keep the dragged position.
                // Either way the during-drag preview clears.
                setSnapPreview(null);
                if (nx <= SNAP_THRESHOLD) {
                  windowManager.snapLeft(entry.id);
                } else if (
                  nx + DEFAULT_FRAME_W >=
                  window.innerWidth - SNAP_THRESHOLD
                ) {
                  windowManager.snapRight(entry.id);
                } else {
                  setPositions((prev) =>
                    new Map(prev).set(entry.instanceId, { x: nx, y: ny }),
                  );
                }
              }}
              onModify={(instruction) =>
                void handleModify(entry.instanceId, instruction)
              }
            />
          );
        })}
      </div>

      {/* Snap drop-zone preview (Phase 19, plan 19-03, CHROME-03). While a drag
          reaches a screen edge, a translucent overlay marks the work-area half
          the window will snap to on release. Decorative (aria-hidden), pointer-
          transparent, and sits above the windows but below the dock/menu bar. */}
      {snapPreview !== null && (
        <div
          className={"desktop-snap-preview desktop-snap-preview--" + snapPreview}
          aria-hidden="true"
        />
      )}

      {/* Layer 4: chrome over the windows — the menu bar (top) carries the
          front-most window's name + the account control (KeyDialog gate); the
          dock (bottom) lists the open windows + the launcher control. */}
      <MenuBar
        activeName={activeWindow?.title ?? null}
        onOpenAccount={() => setKeyDialogOpen(true)}
      />
      <Dock
        windows={windowManager.windows}
        onFocus={windowManager.focus}
        onRestore={windowManager.restore}
        onOpenLauncher={() => setLauncherOpen(true)}
      />

      {/* The search/launcher panel (Phase 17, CREATE-01/02): lists the catalog
          (pre-installed) and accepts a free-text description that routes through
          the resolve→produce→cache→mount loop. Pre-installed picks reuse the
          ported handleOpen; a described app routes through handleDescribe. */}
      {launcherOpen && (
        <SearchLauncherPanel
          onOpen={(appType, displayName) => {
            void handleOpen(appType, displayName);
          }}
          onDescribe={(text) => handleDescribeRef.current(text)}
          onClose={() => setLauncherOpen(false)}
          isWorking={launcherWorking}
        />
      )}

      {/* Inline key reconfiguration (RESIL-03 / SHELL-03): opened from a 401
          fallback or the menu-bar account control. The desktop stays mounted
          underneath, so the page never crashes and the rest stays usable. */}
      {keyDialogOpen && <KeyDialog onClose={() => setKeyDialogOpen(false)} />}
    </div>
  );
}

// Build a fallback body component for a failed open/tweak. Returning a component
// (not an element) lets it be stored in the components map and rendered by the
// window's AppShell, so it still appears inside a role="region" labeled by the
// app — the failure is visible, never a silent blank.
function makeFallback(opts: {
  needsAuth: boolean;
  throttled: boolean;
  onConnect: () => void;
  onRetry: () => void;
}): ComponentType {
  return function Fallback() {
    if (opts.needsAuth) return <NeedsAuthContent onConnect={opts.onConnect} />;
    if (opts.throttled) return <ThrottledAppContent onRetry={opts.onRetry} />;
    return <FailedAppContent onRetry={opts.onRetry} />;
  };
}
