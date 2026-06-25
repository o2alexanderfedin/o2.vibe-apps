import { useCallback, useEffect, useRef, useState } from "react";
import {
  Cloud,
  Calculator,
  NotebookPen,
  Timer,
  ArrowLeftRight,
  ChefHat,
  CalendarDays,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { createElement, type ComponentType } from "react";
import { APP_REGISTRY } from "../data/appRegistry";
import { AppShell } from "./AppShell";
import { ErrorBoundary } from "./ErrorBoundary";
import { resolveOpenApp } from "../intent/resolver";
import { resolveComponent, evictLiveComponent } from "../execution/loader";
import { useServices } from "../services/ServicesProvider";
import { routeModification } from "../intent/routeModification";
import { cacheKey } from "../registry/cacheKey";
import { logger } from "../lib/logger";

// Map the neutral icon key (data layer) to a concrete glyph (render layer)
// per RESEARCH Open Question 1 — keeps the data free of component imports.
const ICONS: Record<string, LucideIcon> = {
  cloud: Cloud,
  calculator: Calculator,
  notes: NotebookPen,
  timer: Timer,
  currency: ArrowLeftRight,
  recipes: ChefHat,
  calendar: CalendarDays,
  budget: Wallet,
};

interface OpenedApp {
  instanceId: string;
  appType: string;
  displayName: string;
  // Component is present on a successful open; null when the open failed and a
  // neutral fallback should render in its place instead of vanishing silently.
  Component: ComponentType | null;
}

// Neutral, hygiene-safe fallback shown when an app fails to open. No
// mechanic-revealing language and no banned tokens — it just tells the user the
// app didn't load and offers a retry, which also makes failures visible/debuggable
// instead of the app silently disappearing.
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

// Instance counter — monotonically increasing per session so ids are unique.
let instanceCounter = 0;

function nextInstanceId(appType: string): string {
  instanceCounter += 1;
  return `${appType}-${instanceCounter}`;
}

export function Marketplace() {
  const services = useServices();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openedApps, setOpenedApps] = useState<OpenedApp[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A ref mirror of openedApps so handleModify can read the current list (e.g.
  // the target's appType/Component) without re-creating on every list change.
  const openedAppsRef = useRef<OpenedApp[]>(openedApps);
  openedAppsRef.current = openedApps;

  const handleOpen = useCallback(
    async (appType: string, displayName: string) => {
      logger.info("Opening " + appType);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setOpeningId(appType);

      try {
        const intent = await resolveOpenApp(appType);
        const instanceId = nextInstanceId(appType);
        const Component = await resolveComponent(
          instanceId,
          appType,
          intent.cacheKey,
          services,
        );

        setOpenedApps((prev) => [
          ...prev,
          { instanceId, appType, displayName, Component },
        ]);
      } catch (err) {
        // Silent-failure fix: instead of only logging and dropping the app
        // (the user saw nothing), surface a neutral fallback region so the
        // failure is visible and debuggable. Diagnostics still go to the
        // gated logger; the user-facing copy stays mechanic-free.
        logger.error("Failed to open " + appType + ": " + String(err));
        const instanceId = nextInstanceId(appType);
        setOpenedApps((prev) => [
          ...prev,
          { instanceId, appType, displayName, Component: null },
        ]);
      } finally {
        timeoutRef.current = setTimeout(() => {
          setOpeningId(null);
          timeoutRef.current = null;
        }, 300);
      }
    },
    [services],
  );

  const handleClose = useCallback((instanceId: string) => {
    evictLiveComponent(instanceId);
    setOpenedApps((prev) => prev.filter((a) => a.instanceId !== instanceId));
  }, []);

  // Contextual modification (Phase 5, MOD-02/03/04). A free-form instruction
  // from an app's `⋮` prompt is routed CLIENT-SIDE:
  //   - remove → drop the instance (same teardown as the close button) — no model call.
  //   - clone  → add a NEW instance reusing the SAME resolved component — no model call.
  //   - tweak  → derive a NEW cache key from (type + instruction), resolve it
  //              (cache hit or produce with the instruction woven in), and REPLACE
  //              the same entry's Component IN PLACE so React re-renders this
  //              AppShell. The resolve runs through instantiateWithWidgets, so a
  //              tweak that changes the `@widget` set re-pre-warms widgets.
  const handleModify = useCallback(
    async (instanceId: string, instruction: string) => {
      const target = openedAppsRef.current.find(
        (a) => a.instanceId === instanceId,
      );
      if (!target) return;
      const routed = routeModification(instruction);

      if (routed.kind === "remove") {
        handleClose(instanceId);
        return;
      }

      if (routed.kind === "clone") {
        // Reuse the SAME resolved component/record under a new instance id — no
        // model call. (A failed-to-open target has a null Component; the clone
        // carries the same null and renders the same neutral fallback.)
        const cloneId = nextInstanceId(target.appType);
        setOpenedApps((prev) => [
          ...prev,
          {
            instanceId: cloneId,
            appType: target.appType,
            displayName: target.displayName,
            Component: target.Component,
          },
        ]);
        return;
      }

      // Tweak — re-resolve and replace this entry's Component in place.
      logger.info("Tweaking " + target.appType);
      try {
        const tweakKey = await cacheKey(target.appType + "\n" + routed.instruction);
        const Component = await resolveComponent(
          instanceId + "-tweak-" + tweakKey.slice(0, 8),
          target.appType,
          tweakKey,
          services,
          routed.instruction,
        );
        setOpenedApps((prev) =>
          prev.map((a) =>
            a.instanceId === instanceId ? { ...a, Component } : a,
          ),
        );
      } catch (err) {
        // A tweak that fails to resolve surfaces the existing neutral fallback
        // (Component: null) rather than vanishing the app or showing a mechanic.
        logger.error("Failed to tweak " + target.appType + ": " + String(err));
        setOpenedApps((prev) =>
          prev.map((a) =>
            a.instanceId === instanceId ? { ...a, Component: null } : a,
          ),
        );
      }
    },
    [services, handleClose],
  );

  // Clear any pending reset timer on unmount.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <>
      <div className="storefront-grid">
        {APP_REGISTRY.map((app) => {
          const Icon = ICONS[app.icon] ?? Cloud;
          return (
            <button
              key={app.id}
              type="button"
              className="app-card"
              aria-label={`${app.displayName} — ${app.description}`}
              onClick={() => void handleOpen(app.id, app.displayName)}
            >
              <span className="app-card__icon">
                <Icon size={32} aria-hidden="true" />
              </span>
              <span className="app-card__name">{app.displayName}</span>
              <span className="app-card__description">{app.description}</span>
              {openingId === app.id && (
                <span className="app-card__opening" role="status">
                  Opening…
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Opened apps — each in an AppShell, wrapped in ErrorBoundary */}
      <div className="opened-apps">
        {openedApps.map((app) => (
          <ErrorBoundary key={app.instanceId}>
            <AppShell
              displayName={app.displayName}
              onClose={() => handleClose(app.instanceId)}
              onModify={(instruction) =>
                void handleModify(app.instanceId, instruction)
              }
            >
              {app.Component !== null ? (
                createElement(app.Component)
              ) : (
                <FailedAppContent
                  onRetry={() => {
                    handleClose(app.instanceId);
                    void handleOpen(app.appType, app.displayName);
                  }}
                />
              )}
            </AppShell>
          </ErrorBoundary>
        ))}
      </div>
    </>
  );
}
