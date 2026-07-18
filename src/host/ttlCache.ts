// In-memory TTL cache with Clock dependency injection.
//
// Keeps recently-fetched data-source responses in memory so repeated calls with
// the same parameters return immediately without a network round-trip. Each entry
// stores the raw parsed data plus an expiry timestamp computed from the injected
// Clock at write time. Reads check the Clock against the expiry; expired entries
// are deleted on access (lazy eviction). Note that keys written but never read
// again will persist in memory until the cache instance is reclaimed. For the
// bounded allowlist key sets used by this project that is acceptable; add a
// max-size eviction policy if the key space becomes unbounded.
//
// Clock is injected (DI) — the same pattern used by TokenBucket and backoff —
// so tests drive time forward via createStubClock without any real timers.
// The cache is never persisted to IndexedDB; it resets on page reload (ephemeral).

import type { Clock } from "./clock";

/** Options bag for TtlCache — Clock is required for deterministic time control. */
export interface TtlCacheOptions {
  /** Injected time seam: realClock in production, createStubClock() in tests. */
  clock: Clock;
}

/** Internal shape of a stored cache entry (not exported — implementation detail). */
interface CacheEntry {
  data: unknown;
  expiresAt: number; // clock.now() + ttlMs at write time
}

/**
 * In-memory TTL cache keyed by arbitrary strings.
 *
 * - get(key): returns stored data if not expired; deletes + returns undefined if expired.
 * - set(key, data, ttlMs): writes data with expiry = clock.now() + ttlMs.
 * - Multiple instances are independent; there is no singleton.
 */
export class TtlCache {
  private readonly store = new Map<string, CacheEntry>();

  constructor(private readonly opts: TtlCacheOptions) {}

  /**
   * Return stored data if the entry exists and has not expired.
   * An expired entry is deleted and undefined is returned (lazy eviction).
   */
  get(key: string): unknown | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (this.opts.clock.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data;
  }

  /**
   * Store data under key with a TTL of ttlMs milliseconds from now.
   * If the key already exists it is overwritten (latest write wins).
   */
  set(key: string, data: unknown, ttlMs: number): void {
    this.store.set(key, {
      data,
      expiresAt: this.opts.clock.now() + ttlMs,
    });
  }
}
