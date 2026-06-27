// Shared snap geometry constants (Phase 19, plan 19-03, CHROME-03).
//
// The snap-to-half feature has TWO halves that must agree: the during-drag
// drop-zone preview (WindowFrame's onEdgeChange) and the on-release commit
// (DesktopShell's onMove). Both decide "is the pointer within N px of a left/
// right edge?" — so the threshold MUST be a single shared value, not two
// independently-defined magic numbers that can silently desynchronize (IN-04).
//
// SNAP_THRESHOLD: a drag whose reported edge is within this many px of the
// left/right viewport edge surfaces a drop-zone preview AND snaps on release.
export const SNAP_THRESHOLD = 20;
