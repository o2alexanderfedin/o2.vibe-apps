// Card-sized placeholder for a future loading state (UI-SPEC §4).
// STUB for Phase 3 — not rendered in the live Phase-1 flow, but it must
// compile and carry the correct a11y affordances. Neutral copy only.
export function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-label="Loading" aria-busy="true">
      <div className="skeleton-block skeleton-block--icon" />
      <div className="skeleton-block skeleton-block--name" />
      <div className="skeleton-block skeleton-block--desc" />
      <span role="status" className="skeleton-card__hidden-status">
        Opening…
      </span>
    </div>
  );
}
