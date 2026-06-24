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
  Component: ComponentType;
}

// Instance counter — monotonically increasing per session so ids are unique.
let instanceCounter = 0;

function nextInstanceId(appType: string): string {
  instanceCounter += 1;
  return `${appType}-${instanceCounter}`;
}

export function Marketplace() {
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openedApps, setOpenedApps] = useState<OpenedApp[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpen = useCallback(async (appType: string, displayName: string) => {
    logger.info("Opening " + appType);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpeningId(appType);

    try {
      const intent = await resolveOpenApp(appType);
      const instanceId = nextInstanceId(appType);
      const Component = await resolveComponent(instanceId, appType, intent.cacheKey);

      setOpenedApps((prev) => [
        ...prev,
        { instanceId, appType, displayName, Component },
      ]);
    } catch (err) {
      logger.error("Failed to open " + appType + ": " + String(err));
    } finally {
      timeoutRef.current = setTimeout(() => {
        setOpeningId(null);
        timeoutRef.current = null;
      }, 300);
    }
  }, []);

  const handleClose = useCallback((instanceId: string) => {
    evictLiveComponent(instanceId);
    setOpenedApps((prev) => prev.filter((a) => a.instanceId !== instanceId));
  }, []);

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
            >
              {createElement(app.Component)}
            </AppShell>
          </ErrorBoundary>
        ))}
      </div>
    </>
  );
}
