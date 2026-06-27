// Shared neutral icon-key → glyph mapping (Phase 16, plan 16-02).
//
// The data layer (APP_REGISTRY, WindowEntry) carries a neutral string `icon`
// key (e.g. "cloud") so it stays free of component imports (RESEARCH Open
// Question 1). This module is the single render-layer place that maps those
// neutral keys to concrete lucide glyphs, reused by the Dock and the launcher.
// Marketplace keeps its own inline copy for now; plan 16-03 rewires it.

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

// Map the neutral icon key (data layer) to a concrete glyph (render layer).
export const ICONS: Record<string, LucideIcon> = {
  cloud: Cloud,
  calculator: Calculator,
  notes: NotebookPen,
  timer: Timer,
  currency: ArrowLeftRight,
  recipes: ChefHat,
  calendar: CalendarDays,
  budget: Wallet,
};

/**
 * Resolve a window's `appType` to its glyph: look up the registry entry, read
 * its neutral `icon` key, map that through ICONS, and fall back to Cloud for an
 * unknown type (e.g. an app produced on demand that is not in the catalog).
 */
export function iconForAppType(appType: string): LucideIcon {
  const entry = APP_REGISTRY.find((a) => a.id === appType);
  const key = entry?.icon;
  return (key && ICONS[key]) || Cloud;
}
