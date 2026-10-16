/** Detect open modal chrome in the renderer DOM (M81). */
export function isUiModalOpen(root: ParentNode = document): boolean {
  return Boolean(
    root.querySelector('[aria-modal="true"], .overlay, .palette-overlay, .import-overlay'),
  )
}
