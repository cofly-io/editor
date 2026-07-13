import type { ElevatorResizeHandle } from './types'

export function getElevatorResizeAxis(handle: ElevatorResizeHandle) {
  return handle.startsWith('width') ? 'width' : 'depth'
}

export function getElevatorResizeSign(handle: ElevatorResizeHandle) {
  return handle.endsWith('positive') ? 1 : -1
}

export function getSelectionModifierKeys(event?: { metaKey?: boolean; ctrlKey?: boolean }) {
  return {
    meta: Boolean(event?.metaKey),
    ctrl: Boolean(event?.ctrlKey),
  }
}
