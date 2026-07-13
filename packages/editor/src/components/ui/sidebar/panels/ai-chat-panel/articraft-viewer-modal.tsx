import { Icon } from '@iconify/react'
import { createPortal } from 'react-dom'

export type ArticraftViewerModalState = {
  url: string
  title: string
} | null

export function ArticraftViewerModal({
  modal,
  onClose,
}: {
  modal: ArticraftViewerModalState
  onClose: () => void
}) {
  if (!modal || typeof document === 'undefined') return null

  return createPortal(
    <div
      aria-label={modal.title}
      aria-modal="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/62 backdrop-blur-sm"
      role="dialog"
    >
      <div className="relative h-[99vh] w-[99vw] overflow-hidden rounded-2xl border border-white/12 bg-[#09090b] shadow-2xl shadow-black/50">
        <iframe
          className="h-full w-full border-0 bg-[#09090b]"
          src={modal.url}
          title={modal.title}
        />
        <button
          aria-label="Close Articraft Viewer"
          className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black text-white shadow-lg shadow-black/35 ring-1 ring-white/20 transition-transform hover:scale-105 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-white/70"
          onClick={onClose}
          type="button"
        >
          <Icon className="size-5" icon="mdi:close" />
        </button>
      </div>
    </div>,
    document.body,
  )
}
