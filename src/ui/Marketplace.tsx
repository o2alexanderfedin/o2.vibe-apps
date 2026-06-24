import { useCallback, useRef, useState } from "react";
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
import { APP_REGISTRY } from "../data/appRegistry";
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

// SHELL-02 stub duration (D-10) — inline "Opening…" affordance then reset.
const OPENING_RESET_MS = 800;

export function Marketplace() {
  // Tracks which card is showing the transient "Opening…" affordance.
  const [openingId, setOpeningId] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpen = useCallback((id: string) => {
    // Neutral product log only — never a banned token (D-10/D-32).
    logger.info("Opening " + id);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpeningId(id);
    timeoutRef.current = setTimeout(() => {
      setOpeningId(null);
      timeoutRef.current = null;
    }, OPENING_RESET_MS);
  }, []);

  return (
    <div className="storefront-grid">
      {APP_REGISTRY.map((app) => {
        const Icon = ICONS[app.icon] ?? Cloud;
        return (
          <button
            key={app.id}
            type="button"
            className="app-card"
            aria-label={`${app.displayName} — ${app.description}`}
            onClick={() => handleOpen(app.id)}
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
  );
}
