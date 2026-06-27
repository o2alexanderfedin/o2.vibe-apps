// DesktopShell — the root desktop UI (Phase 16, plan 16-03, WIN-08).
//
// Assembles the Vibe OS desktop: a themed wallpaper + four animated blob layers
// behind the windows, the window stack itself, and the dock + menu bar + minimal
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
import { resolveComponent, evictLiveComponent } from "../execution/loader";
import { ProduceAuthError } from "../execution/producer";
import { ProduceThrottledError } from "../host/produceGate";
import { useServices } from "../services/ServicesProvider";
import { routeModification } from "../intent/routeModification";
import { registryKey } from "../registry/cacheKey";
import { logger } from "../lib/logger";
import { MenuBar } from "./MenuBar";
import { Dock } from "./Dock";
import { MinimalLauncher } from "./MinimalLauncher";

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
  const [openingId, setOpeningId] = useState<string | null>(null);
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
  // Gates the minimal launcher overlay (CONTEXT decision 4): opened from the
  // dock magnifier, closed on backdrop click / close control / after an open.
  const [launcherOpen, setLauncherOpen] = useState(false);
  // PERF-01 reduced-motion seam: mirrors the OS prefers-reduced-motion
  // preference into React state via a mockable window.matchMedia, so the CSS
  // degrade has a JS-observable companion (this drives the root marker class the
  // CSS + tests read, and gives any future JS path — e.g. blob-count reduction —
  // a hook). The CSS media query is the primary, JS-free degrade; this is the
  // testable signal on top of it.
  const [reducedMotion, setReducedMotion] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setOpeningId(appType);

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
      } finally {
        timeoutRef.current = setTimeout(() => {
          setOpeningId(null);
          timeoutRef.current = null;
        }, 300);
      }
    },
    [services, storeComponent, handleClose],
  );

  // Stable self-reference so the fallback retry handler can re-invoke the
  // latest handleOpen without adding it to its own dependency list.
  const handleOpenRef = useRef(handleOpen);
  handleOpenRef.current = handleOpen;

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
        const Component = await resolveComponent(
          instanceId + "-tweak-" + tweakKey.slice(0, 8),
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

  // Clear any pending reset timer on unmount.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

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
          const override = positions.get(entry.instanceId);
          const x = override?.x ?? entry.x;
          const y = override?.y ?? entry.y;
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
              Component={components.get(entry.instanceId) ?? null}
              onClose={() => handleClose(entry.id, entry.instanceId)}
              onMinimize={() => windowManager.minimize(entry.id)}
              onFocus={() => windowManager.focus(entry.id)}
              onMove={(nx, ny) =>
                setPositions((prev) =>
                  new Map(prev).set(entry.instanceId, { x: nx, y: ny }),
                )
              }
              onModify={(instruction) =>
                void handleModify(entry.instanceId, instruction)
              }
            />
          );
        })}
      </div>

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

      {/* The minimal launcher overlay (CONTEXT decision 4): lists the catalog;
          opening an app routes through the SAME ported handleOpen. */}
      {launcherOpen && (
        <MinimalLauncher
          onOpen={(appType, displayName) => {
            void handleOpen(appType, displayName);
          }}
          onClose={() => setLauncherOpen(false)}
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
