// Injectable storage-pressure seam (Phase 7, RESIL-06).
//
// Two browser surfaces drive the storage-pressure guards:
//   1. `navigator.storage.persist()` — asks the browser to mark this origin's
//      data as persistent (less likely to be cleared under pressure). It may be
//      undefined (jsdom, older engines), so the call is GUARDED.
//   2. `navigator.storage.estimate()` — reports approximate `usage`/`quota`
//      bytes, used to decide whether the registry is approaching its quota.
//
// Both are wrapped behind an injectable interface so unit tests substitute a stub
// that returns a controlled usage/quota ratio — NO real `navigator.storage` is
// touched in unit scope. Production wires the real `navigator.storage` adapter.

/** Approximate bytes used / available for this origin's storage. */
export interface StorageEstimate {
  /** Bytes currently used (approximate). */
  usage: number;
  /** Total bytes available (approximate). */
  quota: number;
}

/**
 * The injectable storage-pressure surface. Production wires the real
 * `navigator.storage`; tests wire a stub returning a controlled estimate.
 */
export interface StoragePressureSeam {
  /**
   * Ask the browser to persist this origin's data. Guarded — resolves to false
   * (never throws) when `navigator.storage.persist` is unavailable.
   */
  requestPersist(): Promise<boolean>;
  /**
   * Read the approximate usage/quota. Resolves to null when the platform does
   * not expose `navigator.storage.estimate` (the caller then skips the LRU pass,
   * since it cannot tell whether pressure exists).
   */
  estimate(): Promise<StorageEstimate | null>;
}

/**
 * Production seam over `navigator.storage`. Every access is guarded so a missing
 * API degrades gracefully (no throw) rather than breaking init or the open flow.
 */
export const navigatorStorageSeam: StoragePressureSeam = {
  async requestPersist(): Promise<boolean> {
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.storage?.persist === "function"
      ) {
        return await navigator.storage.persist();
      }
    } catch {
      // Some engines reject instead of returning false — treat as "not persisted".
    }
    return false;
  },
  async estimate(): Promise<StorageEstimate | null> {
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.storage?.estimate === "function"
      ) {
        const est = await navigator.storage.estimate();
        // Both fields are optional in the spec; default missing values to 0.
        return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
      }
    } catch {
      // estimate() can reject in restricted contexts — treat as "unknown".
    }
    return null;
  },
};
