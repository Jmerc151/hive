export default function ConfirmDialog({ isOpen, title, message, confirmLabel = 'Delete', confirmColor = 'danger', onConfirm, onCancel }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div className="relative bg-s1 border border-s4 rounded-xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-t1 mb-2">{title}</h3>
        <p className="text-t3 text-sm mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-t2 hover:text-t1 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
              confirmColor === 'danger'
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-t1/20 text-t1 hover:bg-t1/30'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
