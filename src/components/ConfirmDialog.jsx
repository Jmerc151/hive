export default function ConfirmDialog({ isOpen, title, message, confirmLabel = 'Delete', confirmColor = 'danger', onConfirm, onCancel }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-hive-800 border border-hive-700 rounded-xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-hive-100 mb-2">{title}</h3>
        <p className="text-hive-400 text-sm mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-hive-300 hover:text-hive-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
              confirmColor === 'danger'
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-honey/20 text-honey hover:bg-honey/30'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
