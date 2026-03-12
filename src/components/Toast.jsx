import { useState, useEffect, useCallback } from 'react'

const ICONS = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
}

const COLORS = {
  success: 'bg-green-500/15 border-green-500/30 text-green-400',
  error: 'bg-red-500/15 border-red-500/30 text-red-400',
  info: 'bg-blue-500/15 border-blue-500/30 text-blue-400',
  warning: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
}

const ICON_COLORS = {
  success: 'bg-green-500/20 text-green-400',
  error: 'bg-red-500/20 text-red-400',
  info: 'bg-blue-500/20 text-blue-400',
  warning: 'bg-amber-500/20 text-amber-400',
}

export function useToast() {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((toast) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { ...toast, id }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, toast.duration || 4000)
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return { toasts, addToast, removeToast }
}

export default function ToastContainer({ toasts, onRemove }) {
  if (!toasts.length) return null

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onRemove }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setShow(true))
  }, [])

  const type = toast.type || 'info'

  return (
    <div
      className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border backdrop-blur-xl shadow-lg transition-all duration-300 ${
        COLORS[type]
      } ${show ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}
    >
      <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${ICON_COLORS[type]}`}>
        {ICONS[type]}
      </span>
      <p className="text-sm flex-1 leading-snug">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 text-hive-500 hover:text-hive-300 text-xs mt-0.5"
      >
        ✕
      </button>
    </div>
  )
}
