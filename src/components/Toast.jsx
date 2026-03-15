import { useState, useEffect, useCallback } from 'react'

const ICONS = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
}

const COLORS = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-blue-600',
  warning: 'text-amber-600',
}

const BG_STYLES = {
  success: { background: 'rgba(52,199,89,0.1)', border: '0.5px solid rgba(52,199,89,0.2)' },
  error: { background: 'rgba(255,59,48,0.1)', border: '0.5px solid rgba(255,59,48,0.2)' },
  info: { background: 'rgba(0,122,255,0.1)', border: '0.5px solid rgba(0,122,255,0.2)' },
  warning: { background: 'rgba(255,149,0,0.1)', border: '0.5px solid rgba(255,149,0,0.2)' },
}

const ICON_BG_STYLES = {
  success: { background: 'rgba(52,199,89,0.15)' },
  error: { background: 'rgba(255,59,48,0.15)' },
  info: { background: 'rgba(0,122,255,0.15)' },
  warning: { background: 'rgba(255,149,0,0.15)' },
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
      className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl backdrop-blur-xl shadow-lg transition-all duration-300 ${
        COLORS[type]
      } ${show ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}
      style={BG_STYLES[type]}
    >
      <span
        className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${COLORS[type]}`}
        style={ICON_BG_STYLES[type]}
      >
        {ICONS[type]}
      </span>
      <p className="text-sm flex-1 leading-snug">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 text-t4 hover:text-t2 text-xs mt-0.5"
      >
        ✕
      </button>
    </div>
  )
}
