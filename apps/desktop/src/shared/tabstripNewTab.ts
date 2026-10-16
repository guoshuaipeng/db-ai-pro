/** Detect double-clicks on tab-strip chrome that should open a new tab (M90). */

const BLOCK =
  '.tab, .tab-main, .tab-close, .tab-rename-input, .tab-context-menu, .tab-picker, .tab-nav, .tab-actions, .tab-pin, .tab-label, .tab-badge, .tab-conn-stripe'

/** Minimal closest() surface so shared/ typechecks without DOM lib. */
export type TabstripClickTarget = {
  closest: (selectors: string) => unknown
}

/** True when the event target is empty strip / spacer, not a tab control. */
export function isTabstripBackgroundDoubleClick(target: TabstripClickTarget | null | undefined): boolean {
  if (!target || typeof target.closest !== 'function') return false
  if (target.closest(BLOCK)) return false
  return Boolean(target.closest('.tabstrip-scroll, .tabstrip-empty, .tabstrip'))
}
