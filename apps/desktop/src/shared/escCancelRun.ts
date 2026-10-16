/** When Escape should stop the in-flight SQL run (M81). */

export type EscCancelRunInput = {
  running: boolean
  /** Palette / settings / goto / connection dialogs / any modal overlay. */
  modalOpen: boolean
}

export function shouldCancelRunOnEscape(input: EscCancelRunInput): boolean {
  return Boolean(input.running) && !input.modalOpen
}
