// LRU storage-pressure eviction (Phase 7, RESIL-06).
//
// IndexedDB has a finite quota. Without a relief valve a busy session eventually
// trips `QuotaExceededError` on write and the open loop stops working. This pass
// keeps the registry under control: when storage approaches its quota (the
// `usage/quota` ratio exceeds a threshold), it evicts the LEAST-RECENTLY-USED
// entries — oldest `updatedAt` first, ties broken by lowest `useCount` — across
// the `apps`, `widgets`, and `handlers` stores, until usage drops back under the
// threshold (or nothing is left to evict). The loop then keeps working instead of
// throwing on the next write.
//
// IoC/DI: BOTH the registry and the storage-estimate seam are injected. A unit
// test wires an in-memory registry plus a stub `estimate()` that returns a
// controlled usage/quota — so the victim selection and the "evict until under
// threshold" loop are verified with NO real IndexedDB and NO real navigator.storage.

import type { Registry, StoreName } from "../services/registry";
import type { StoragePressureSeam } from "../host/storageEstimate";
import type { LruMeta } from "./db";
import { logger } from "../lib/logger";

/** Default usage/quota ratio above which eviction kicks in (named, configurable). */
export const DEFAULT_EVICTION_THRESHOLD = 0.9;

/** The three stores eviction sweeps, in a fixed order for determinism. */
const STORES: readonly StoreName[] = ["apps", "widgets", "handlers"];

/** A single eviction candidate: which store/key, and its LRU recency keys. */
interface Candidate {
  store: StoreName;
  key: string;
  /** Last write/hit epoch ms (older = evict first). Defaults to 0 for v1 records. */
  updatedAt: number;
  /** Read count (lower = evict first on a recency tie). Defaults to 0. */
  useCount: number;
}

export interface StoragePressureOptions {
  /** Injectable persistent store (in-memory in tests, IndexedDB in production). */
  registry: Registry;
  /** Injectable usage/quota seam (stub in tests, navigator.storage in production). */
  storage: StoragePressureSeam;
  /** usage/quota ratio above which eviction runs (defaults to the named constant). */
  threshold?: number;
}

/**
 * Read a record's LRU bookkeeping, defaulting BOTH fields to 0 when absent so v1
 * records (written before Phase 7) sort as the oldest/least-used and are evicted
 * first. Centralized here so the default is applied consistently (DRY).
 */
function lruOf(record: LruMeta | undefined): { updatedAt: number; useCount: number } {
  return {
    updatedAt: typeof record?.updatedAt === "number" ? record.updatedAt : 0,
    useCount: typeof record?.useCount === "number" ? record.useCount : 0,
  };
}

/** Order two candidates LRU-first: older `updatedAt`, then lower `useCount`. */
function byLeastRecentlyUsed(a: Candidate, b: Candidate): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
  return a.useCount - b.useCount;
}

/**
 * Run one LRU eviction sweep. Resolves to the number of entries evicted (0 when
 * storage is under the threshold, or when the platform does not expose an
 * estimate — in which case the pass safely no-ops rather than guessing).
 *
 * Algorithm:
 *   1. Read the current usage/quota. If unavailable, or already under threshold,
 *      no-op (return 0).
 *   2. Build the candidate list across all three stores, each tagged with its LRU
 *      keys (defaulting v1 records to the oldest).
 *   3. Sort least-recently-used first and delete entries one at a time, re-reading
 *      the estimate after each deletion, stopping as soon as usage is back under
 *      the threshold or no candidates remain.
 */
export async function evictUnderPressure(
  opts: StoragePressureOptions,
): Promise<number> {
  const threshold = opts.threshold ?? DEFAULT_EVICTION_THRESHOLD;
  const { registry, storage } = opts;

  // (1) Is there pressure at all? Unknown estimate → skip (cannot tell).
  const ratio = await usageRatio(storage);
  if (ratio === null || ratio < threshold) return 0;

  // (2) Gather candidates across stores, tagged with their LRU recency keys.
  const candidates = await gatherCandidates(registry);
  candidates.sort(byLeastRecentlyUsed);

  // (3) Evict LRU-first, re-checking pressure after each deletion so we stop as
  // soon as we are back under threshold (evict the minimum necessary).
  let evicted = 0;
  for (const c of candidates) {
    await registry.del(c.store, c.key);
    evicted += 1;
    const next = await usageRatio(storage);
    if (next === null || next < threshold) break;
  }

  if (evicted > 0) {
    logger.info(`Storage pressure: evicted ${evicted} least-recently-used entr(y/ies)`);
  }
  return evicted;
}

/** Read usage/quota and reduce to a ratio in [0, ∞); null when unknown or quota is 0. */
async function usageRatio(storage: StoragePressureSeam): Promise<number | null> {
  const est = await storage.estimate();
  if (est === null || est.quota <= 0) return null;
  return est.usage / est.quota;
}

/** Build the LRU candidate list across all three stores. */
async function gatherCandidates(registry: Registry): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  for (const store of STORES) {
    const keys = await registry.keys(store);
    for (const key of keys) {
      const record = (await registry.get(store, key)) as LruMeta | undefined;
      const { updatedAt, useCount } = lruOf(record);
      candidates.push({ store, key, updatedAt, useCount });
    }
  }
  return candidates;
}
