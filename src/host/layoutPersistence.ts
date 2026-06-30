// Layout persistence helpers (Phase 21, plan 21-01 — PERSIST-01).
//
// This is a pure module with zero external dependencies (no React, no IDB, no
// services). It provides the single source of truth for:
//   - LAYOUT_KEY: the IDB settings key used by writeRaw/readRaw
//   - LayoutEntry: the exact 7-field shape persisted per window
//   - isLayoutEntry: a runtime type guard for data arriving from IDB
//   - serializeLayout: WindowEntry[] → JSON string (picks only the 7 fields)
//   - deserializeLayout: JSON string → LayoutEntry[] (validates via isLayoutEntry)
//
// Trust boundary rationale (T-21-01, T-21-02):
//   - serializeLayout picks ONLY the 7 geometric fields, never instanceId,
//     transpiledJS, Component, or API key — enforced by the explicit mapping.
//   - deserializeLayout wraps JSON.parse in try/catch and filters via isLayoutEntry
//     so corrupt or tampered IDB data yields [] (fresh desktop start), not an
//     error propagated to the user.

import type { WindowEntry } from "../ui/useWindowManager";

/**
 * The IDB settings key used by realSettingsStore.writeRaw/readRaw to persist and
 * restore window layout. Plans 21-03 and 21-04 import this constant — it is the
 * single source of truth so a key rename is a one-line change here.
 */
export const LAYOUT_KEY = "windowLayout";

/**
 * The subset of WindowEntry that is safe to persist. Contains only the 7 geometric
 * and display fields needed to re-open each window at the same position and state.
 * Fields intentionally EXCLUDED: id (minted fresh on restore), instanceId (not
 * reproducible; a new instance is created on restore), maximized and restoreRect
 * (transient toggle state; restored windows start un-maximized), snapSide (same).
 */
export interface LayoutEntry {
  appType: string;
  title: string;
  icon: string;
  x: number;
  y: number;
  z: number;
  minimized: boolean;
}

// The canonical set of keys in a LayoutEntry — used by isLayoutEntry to reject
// objects that have extra fields (which would indicate corrupt or unexpected data).
const LAYOUT_ENTRY_KEYS: ReadonlySet<string> = new Set([
  "appType",
  "title",
  "icon",
  "x",
  "y",
  "z",
  "minimized",
]);

/**
 * Runtime type guard for LayoutEntry. Returns true only when `v` is a non-null
 * object with EXACTLY the 7 required fields at the correct types — no more, no
 * less. Extra fields cause false (T-21-02: strict shape check prevents un-expected
 * fields from silently passing through to the render path).
 */
export function isLayoutEntry(v: unknown): v is LayoutEntry {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj);
  // Exact key count: must have exactly 7 — rejects missing and extra fields.
  if (keys.length !== LAYOUT_ENTRY_KEYS.size) return false;
  // Every key must be one of the 7 canonical keys.
  for (const k of keys) {
    if (!LAYOUT_ENTRY_KEYS.has(k)) return false;
  }
  // Field type checks.
  if (typeof obj["appType"] !== "string") return false;
  if (typeof obj["title"] !== "string") return false;
  if (typeof obj["icon"] !== "string") return false;
  // Number.isFinite rejects NaN, Infinity, -Infinity, and non-number types
  // (unlike global isFinite it does not coerce) — trust boundary T-21-01.
  if (!Number.isFinite(obj["x"] as number)) return false;
  if (!Number.isFinite(obj["y"] as number)) return false;
  if (!Number.isFinite(obj["z"] as number)) return false;
  if (typeof obj["minimized"] !== "boolean") return false;
  return true;
}

/**
 * Serialize an array of open windows to a JSON string suitable for storage via
 * `realSettingsStore.writeRaw(LAYOUT_KEY, json)`. Each WindowEntry is projected
 * to a LayoutEntry-shaped object — only the 7 safe geometric fields are written.
 * Sensitive or transient fields (instanceId, maximized, restoreRect, snapSide,
 * id) are NEVER included (T-21-02).
 */
export function serializeLayout(windows: WindowEntry[]): string {
  const entries: LayoutEntry[] = windows.map((w) => ({
    appType: w.appType,
    title: w.title,
    icon: w.icon,
    x: w.x,
    y: w.y,
    z: w.z,
    minimized: w.minimized,
  }));
  return JSON.stringify(entries);
}

/**
 * Deserialize a JSON string from `realSettingsStore.readRaw(LAYOUT_KEY)` back to
 * a typed LayoutEntry array. Corrupt or unexpected data at the IDB trust boundary
 * (T-21-01) yields [] — a fresh desktop start — so the user sees an empty desktop
 * rather than an error. The filter via isLayoutEntry also strips any entries that
 * fail the shape check (e.g. stale records from a future schema version with extra
 * fields), keeping only entries the current code can safely use.
 */
export function deserializeLayout(raw: string): LayoutEntry[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLayoutEntry);
  } catch {
    return [];
  }
}
