// Desktop layout measurements shared by the desktop and the app frame. These
// constants mirror the CSS layout chrome:
//   MENU_BAR_H   → .menu-bar { height: 40px } (src/index.css)
//   DOCK_RESERVE → .dock bottom:16px + padding 9px*2 + icon 52px ≈ 88px reserved
//   TITLEBAR_H   → .window-chrome__body { height: calc(100% - 36px) } (src/index.css)
export const MENU_BAR_H = 40;
export const DOCK_RESERVE = 88;
export const TITLEBAR_H = 36;

/** The tallest an app's body may be while its whole window still fits in the
 *  work area (the viewport between the menu bar and the dock) — the same
 *  height a maximized window gets, less its titlebar. */
export function maxAppBodyHeight(vh: number): number {
  return Math.max(0, vh - MENU_BAR_H - DOCK_RESERVE - TITLEBAR_H);
}
