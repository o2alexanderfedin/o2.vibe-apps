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

import { useCallback, useContext, useEffect, useRef, useState } from "react";
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
  LAYOUT_KEY,
  serializeLayout,
  deserializeLayout,
} from "../host/layoutPersistence";
import {
  resolveComponent,
  evictLiveComponent,
  deriveDisplayName,
  getTranspiledJS,
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
import { runHandler } from "../execution/handler";
import { VibeThemeContext, VIBE_THEMES } from "./VibeThemeProvider";

// Work-area geometry (Phase 19, plan 19-02, CHROME-02). Maximize = zoom-to-work-
// area, NOT the OS Fullscreen API: a maximized window fills the viewport MINUS
// the menu bar (top) and the dock (bottom), so both stay visible — they ARE the
// product identity. These constants mirror the CSS layout chrome:
//   MENU_BAR_H  → .menu-bar { height: 40px } (src/index.css)
//   DOCK_RESERVE → .dock bottom:16px + padding 9px*2 + icon 52px ≈ 88px reserved
const MENU_BAR_H = 40;
const DOCK_RESERVE = 88;

// Trailing debounce for IDB layout persistence (Phase 21, PERSIST-01): only
// the final geometry state in a 300ms quiet period reaches the settings store,
// so dragging a window never produces a write-storm.
const LAYOUT_SAVE_DEBOUNCE_MS = 300;

// Snap-to-half (Phase 19, plan 19-03, CHROME-03). The SNAP_THRESHOLD that drives
// both the during-drag drop-zone preview (WindowFrame) and the on-release commit
// is the SHARED constant (IN-04), so preview and commit can never desynchronize.
// The commit decision itself is driven off the frame's reported edge side (the
// SAME signal as the preview) via WindowFrame's onSnap callback (WR-02), not a
// recomputed x + nominal-width — which was unreliable for wide frames.

// Read the current viewport size, guarded for SSR/older jsdom. The component
// mirrors this into state via a resize listener (WR-03) so a maximized/snapped
// window's rect is recomputed when the browser resizes rather than going stale.
function readViewport(): { vw: number; vh: number } {
  return {
    vw: typeof window !== "undefined" ? window.innerWidth : 1280,
    vh: typeof window !== "undefined" ? window.innerHeight : 800,
  };
}

// The work-area rect a maximized window fills, computed from the GIVEN viewport
// size (mirrored into state, WR-03) so a resize recomputes it. The rect starts
// below the menu bar and stops above the dock reserve.
function workArea(vw: number, vh: number): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  return {
    x: 0,
    y: MENU_BAR_H,
    w: vw,
    h: vh - MENU_BAR_H - DOCK_RESERVE,
  };
}

// The half-rect a snapped window fills (Phase 19, plan 19-03), computed from the
// GIVEN viewport size (WR-03). A LEFT snap takes the left half of the work area;
// a RIGHT snap the right half. Same model as maximize (work area, NOT the full
// viewport) so the menu bar + dock stay visible — quarter/corner snap is
// deferred (CHROME-F1, half only this phase).
function snapHalf(
  side: "left" | "right",
  vw: number,
  vh: number,
): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const wa = workArea(vw, vh);
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
  // Parallel to `components`: the compiled app STRING per window instance, used
  // only when frameMode==="iframe" to seed the opaque-origin frame body
  // (SANDBOX-05). In the in-tree default these strings are ignored — WindowFrame
  // renders the resolved Component directly — so this map is inert in the suite.
  const [transpiledMap, setTranspiledMap] = useState<Map<string, string>>(
    new Map(),
  );
  // Committed free-drag positions live on the manager entry itself (via
  // setGeometry), so x/y is the SINGLE authoritative source of truth (WR-01) —
  // there is no separate positions map to drift from it. useDrag's imperative
  // transform remains the during-drag source of truth; setGeometry is the
  // committed one. Keeping geometry on the entry lets maximize/snap capture the
  // EFFECTIVE current position into restoreRect for a faithful restore.
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
  // Mirror the viewport size into state (WR-03) so a maximized/snapped window's
  // rect (workArea/snapHalf) recomputes on browser resize instead of going
  // stale until some unrelated state change forces a re-render. Seeded from the
  // live viewport and kept in-step via a resize listener (mirrors the matchMedia
  // effect pattern below).
  const [viewport, setViewport] = useState(() => readViewport());

  // Stable refs so callbacks can read current manager/services without
  // re-creating handlers (and so handleModify can look up the live window list).
  const windowManagerRef = useRef<WindowManagerValue>(windowManager);
  windowManagerRef.current = windowManager;
  // Latest compiled-string map read inside handleModify (clone/tweak) WITHOUT
  // adding transpiledMap to the callback deps — mirrors the windowManagerRef
  // pattern so the callback identity stays stable and never closes over a stale
  // map (CR-02 / WR-01).
  const transpiledMapRef = useRef(transpiledMap);
  transpiledMapRef.current = transpiledMap;
  // Gates the save effect so it cannot write before the mount-only restore has
  // finished reading. Without this a slow IDB read lets the initial save-effect
  // timer fire first and clobber the stored layout with "[]" (WR-04, PERSIST-01).
  // Set to true by restoreDesktop() after all openAt calls complete (including
  // the early-return paths for empty/missing data, so a fresh desktop still
  // saves normally after the first user change).
  const restoredRef = useRef(false);

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
      // Drop the compiled-string entry too so a closed window leaks nothing in
      // iframe mode (mirrors the components-map cleanup).
      setTranspiledMap((prev) => {
        const next = new Map(prev);
        next.delete(instanceId);
        return next;
      });
      // No positions map to clean up — the entry's own x/y (removed by the
      // manager's close) is the only geometry store (WR-01).
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
        // Capture the compiled app string alongside the Component so iframe mode
        // can seed the frame body (SANDBOX-05). Inert in the in-tree default.
        const tjs = getTranspiledJS(intent.cacheKey);
        if (tjs) {
          setTranspiledMap((prev) => new Map(prev).set(instanceId, tjs));
        }
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
          // Capture the compiled app string for iframe mode (SANDBOX-05). The
          // described path builds its own cacheKey; reuse it here. Inert in-tree.
          const tjs = getTranspiledJS(cacheKey);
          if (tjs) {
            setTranspiledMap((prev) => new Map(prev).set(instanceId, tjs));
          }
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
        // CR-02 (isolation): carry the source's compiled string to the clone's
        // instance id so the clone takes the SAME opaque-origin frame path
        // (WindowFrame gates on frameMode==="iframe" && transpiledJS). Without
        // this the clone falls through to the in-tree body and runs the component
        // directly in the host tree — re-exposing the execution path this phase
        // removes. Read through the ref so the callback identity stays stable.
        const tjs = transpiledMapRef.current.get(instanceId);
        if (tjs) {
          setTranspiledMap((prev) => new Map(prev).set(cloneInstanceId, tjs));
        }
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
        // WR-01 (iframe mode): mirror the open/describe paths — update this
        // instance's compiled string so the frame re-bootstraps with the tweaked
        // body. Without this the srcdoc useMemo (keyed on transpiledJS) never
        // rebuilds and the tweak is invisible in production iframe mode.
        const tjs = getTranspiledJS(tweakKey);
        if (tjs) {
          setTranspiledMap((prev) => new Map(prev).set(instanceId, tjs));
        }
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

  // Mirror the viewport size into state on browser resize (WR-03) so pinned
  // (maximized/snapped) windows recompute their rect from the fresh size. Guard
  // for environments without window. Re-syncs once on mount in case the size
  // changed between the lazy initializer and the effect attaching.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewport(readViewport());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
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
      // CR-02: never hijack keys the user is typing into an app's OWN editable
      // field. Apps render real inputs in-tree, and Ctrl+Arrow (word-by-word
      // caret), Cmd/Ctrl+W, and Cmd/Ctrl+M are standard editing chords there —
      // bail early when the event originates from an editable target (mirrors
      // the document.activeElement / tag checks in KeyDialog and
      // SearchLauncherPanel).
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }

      const wm = windowManagerRef.current;
      const mod = e.metaKey || e.ctrlKey;
      // WR-04: normalize case (Caps Lock / Shift produce "W"/"M") so the close/
      // minimize chord still matches; the resulting key is compared lowercase.
      const key = e.key.toLowerCase();

      // Close / minimize the active window (Cmd on macOS, Ctrl elsewhere).
      // WR-04: exclude Shift — Cmd+Shift+W is the browser's "close all tabs"
      // chord and must NOT match OUR close shortcut, so the browser tab is never
      // closed (CHROME-04).
      if (mod && !e.shiftKey && (key === "w" || key === "m")) {
        const activeId = wm.activeId();
        // No active Vibe OS window → leave the native shortcut alone so the user
        // can still close the browser tab (T-19-10).
        if (activeId === null) return;
        const active = wm.windows.find((w) => w.id === activeId);
        if (!active) return;

        e.preventDefault();
        if (key === "w") handleClose(active.id, active.instanceId);
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

  // Debounced layout save (Phase 21, PERSIST-01): any change to the windows
  // array (open, close, move, focus, minimize) starts a 300ms trailing timer;
  // the last change in a quiet period wins — no write fires during an active
  // drag. Mirrors the MenuBar clock's setInterval idiom.
  //
  // WR-04 race guard: skip ALL writes until the mount-only restore has set
  // restoredRef.current = true. On slow storage the 300ms timer can fire before
  // the async readRaw resolves, clobbering the persisted layout with "[]". The
  // ref costs nothing on every subsequent call (the guard is a single boolean
  // branch) and is set in all three code paths of restoreDesktop() — including
  // the empty/missing-data early-return paths — so a fresh desktop (no saved
  // layout) still enables saves normally after the first user-driven change.
  useEffect(() => {
    if (!restoredRef.current) return; // restore not yet complete — skip write
    const timer = setTimeout(() => {
      void services.settingsStore.writeRaw(
        LAYOUT_KEY,
        serializeLayout(windowManager.windows),
      );
    }, LAYOUT_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [windowManager.windows, services.settingsStore]);

  // Mount-only restore (Phase 21, PERSIST-02/03): reads the persisted layout
  // from IDB and re-opens all saved windows at their exact geometry via
  // openAt, sorted by z ascending so the highest-z window is opened last and
  // appears on top. Then resolves each component serially (1 concurrent).
  //
  // PERSIST-03 critical path: services.registry.get("apps", cacheKey) is
  // checked BEFORE calling resolveComponent. A null result means the app was
  // evicted from IDB — we show the placeholder immediately without reaching
  // tryAcquire() at loader.ts:320 (no quota spend on evicted apps).
  //
  // Empty dep array is intentional: this runs once on mount and reads live
  // refs (windowManagerRef, handleOpenRef) rather than stale closure values —
  // the same discipline used by the keyboard-shortcut effect above.
  useEffect(() => {
    async function restoreDesktop(): Promise<void> {
      const raw = await services.settingsStore.readRaw(LAYOUT_KEY);
      if (!raw) {
        // Nothing persisted — fresh session. Release the save gate so the first
        // user-driven window change is saved normally (WR-04).
        restoredRef.current = true;
        return;
      }

      const layout = deserializeLayout(raw);
      if (layout.length === 0) {
        // Empty or corrupt data — treat as a fresh start. Same gate release so
        // a fresh desktop still saves after the first window open (WR-04).
        restoredRef.current = true;
        return;
      }

      // Sort ascending so the last-opened window has the highest z and
      // appears on top, matching the visual order at save time.
      const sorted = [...layout].sort((a, b) => a.z - b.z);

      // Open all windows atomically before async resolution so frames appear
      // immediately at their persisted geometry with no cascade flash.
      const opened: Array<{
        appType: string;
        title: string;
        instanceId: string;
      }> = [];
      for (const entry of sorted) {
        const instanceId = windowManagerRef.current.openAt(
          entry.appType,
          { title: entry.title, icon: entry.icon },
          { x: entry.x, y: entry.y, z: entry.z, minimized: entry.minimized },
        );
        opened.push({ appType: entry.appType, title: entry.title, instanceId });
      }

      // All openAt calls are synchronously complete — release the save gate.
      // The next windows-state change (from storeComponent below, or from a user
      // action) will trigger the save effect with restoredRef.current === true,
      // so saves correctly reflect the restored layout (WR-04).
      restoredRef.current = true;

      // Resolve components serially (1 concurrent). Cache hits (tiers 1-3)
      // never reach tryAcquire(); evicted or unresolvable apps fall through
      // to the placeholder path (PERSIST-03).
      for (const { appType, title, instanceId } of opened) {
        // Guard: window may have been closed before resolution completed.
        if (!windowManagerRef.current.isOpenByInstance(instanceId)) continue;
        try {
          const intent = await resolveOpenApp(appType);
          // PERSIST-03: check IDB before calling resolveComponent so that
          // an evicted app never reaches tryAcquire() in loader.ts:320.
          const stored = await services.registry.get("apps", intent.cacheKey);
          if (stored != null) {
            // App is cached in IDB — resolve through the three-tier loader.
            const Component = await resolveComponent(
              instanceId,
              appType,
              intent.cacheKey,
              services,
            );
            if (!windowManagerRef.current.isOpenByInstance(instanceId)) {
              evictLiveComponent(instanceId);
              continue;
            }
            storeComponent(instanceId, Component);
          } else {
            // App evicted from IDB — show placeholder without spending quota.
            if (!windowManagerRef.current.isOpenByInstance(instanceId)) continue;
            const Fallback = makeFallback({
              needsAuth: false,
              throttled: false,
              onConnect: () => setKeyDialogOpen(true),
              onRetry: () => {
                const wid = windowManagerRef.current.windows.find(
                  (w) => w.instanceId === instanceId,
                )?.id;
                if (wid) handleClose(wid, instanceId);
                void handleOpenRef.current(appType, title);
              },
            });
            storeComponent(instanceId, Fallback);
          }
        } catch {
          // resolveOpenApp threw (bad app type) or resolveComponent failed.
          // Show placeholder so the window is never a silent blank frame.
          if (!windowManagerRef.current.isOpenByInstance(instanceId)) continue;
          const Fallback = makeFallback({
            needsAuth: false,
            throttled: false,
            onConnect: () => setKeyDialogOpen(true),
            onRetry: () => {
              const wid = windowManagerRef.current.windows.find(
                (w) => w.instanceId === instanceId,
              )?.id;
              if (wid) handleClose(wid, instanceId);
              void handleOpenRef.current(appType, title);
            },
          });
          storeComponent(instanceId, Fallback);
        }
      }
    }
    void restoreDesktop();
  }, []); // mount-only — intentional empty deps (reads live refs, not stale closures)

  // The active window feeding the menu-bar name comes from the manager's
  // activeWindow() — the SINGLE source of truth for "front-most" that the
  // keyboard-shortcut target also uses, so the name and the shortcut target can
  // never disagree (WR-05).
  const activeWindow = windowManager.activeWindow();

  // The current theme's CSS-variable map, baked into a frame's first paint so an
  // opaque-origin app body (whose :root cannot inherit the host's variables)
  // renders in-theme immediately (SANDBOX-05). Read defensively via the context
  // directly (not the throwing useVibeTheme hook) so DesktopShell still renders
  // outside a VibeThemeProvider; absent a provider it falls back to the default
  // theme. Only consumed in iframe mode — inert under the in-tree default.
  const themeCtx = useContext(VibeThemeContext);
  const currentThemeVars = VIBE_THEMES[themeCtx?.theme ?? "aurora"];

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
          // left/right HALF of the work area (same rect-application path). A
          // plain window renders transform-only from the entry's authoritative
          // x/y (committed drags write back via setGeometry — WR-01), CSS min-size.
          const area = entry.maximized
            ? workArea(viewport.vw, viewport.vh)
            : entry.snapSide
              ? snapHalf(entry.snapSide, viewport.vw, viewport.vh)
              : null;
          const x = area ? area.x : entry.x;
          const y = area ? area.y : entry.y;
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
              // The drag ended within the snap threshold of an edge — snap to the
              // SAME side the preview reported (WR-02). The during-drag preview
              // clears. Always raise-to-front via the snap* call.
              onSnap={(side) => {
                setSnapPreview(null);
                if (side === "left") windowManager.snapLeft(entry.id);
                else windowManager.snapRight(entry.id);
              }}
              onMove={(nx, ny) => {
                // Free (non-edge) commit. The during-drag preview clears.
                setSnapPreview(null);
                // If the window was snapped, clear the snap so it can actually
                // move (CR-01) — otherwise the snap-half rect would keep winning
                // in render and the drag would spring back.
                if (entry.snapSide !== null) {
                  windowManager.unsnap(entry.id);
                }
                // Write the dragged position back to the entry as the
                // authoritative geometry (WR-01).
                windowManager.setGeometry(entry.id, nx, ny);
              }}
              onModify={(instruction) =>
                void handleModify(entry.instanceId, instruction)
              }
              // SANDBOX-05 (iframe mode only — ignored under the in-tree
              // default). The compiled app string seeds the frame body; the
              // theme vars bake into its first paint; the handler/data brokers
              // are PARENT-SIDE closures over services, so the key never crosses
              // into the frame. appType lets a delegated body build the per-action
              // intent that matches the parent's cached handler (CR-01).
              appType={entry.appType}
              transpiledJS={transpiledMap.get(entry.instanceId)}
              themeVars={currentThemeVars}
              onRunHandler={(intent, input) =>
                runHandler(intent, input, services)
              }
              onFetchData={(sourceId, params) =>
                services.fetchDataBroker?.fetch(sourceId, params) ??
                Promise.resolve({ error: "This data could not be loaded." })
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
