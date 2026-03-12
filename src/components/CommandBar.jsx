import { useState, useRef, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

const AGENT_IDS = ['scout', 'forge', 'quill', 'dealer', 'oracle', 'nexus']

export default function CommandBar({ agents = [], onTaskCreated }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [history, setHistory] = useState([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [showAC, setShowAC] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const inputRef = useRef(null)
  const toastTimer = useRef(null)
  const wrapperRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setMobileOpen(true)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowAC(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const showToast = useCallback((msg, type = 'success') => {
    clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }, [])

  const acMatches = text.trim()
    ? AGENT_IDS.filter(id => id.startsWith(text.trim().toLowerCase().split(' ')[0]))
    : []
  const showAutocomplete = showAC && acMatches.length > 0 && !text.includes(' ')

  const handleSubmit = async (e) => {
    e?.preventDefault()
    const cmd = text.trim()
    if (!cmd || loading) return
    setHistory(prev => [cmd, ...prev.filter(h => h !== cmd)].slice(0, 20))
    setHistoryIdx(-1)
    setShowAC(false)
    setLoading(true)
    try {
      const res = await api.parseCommand(cmd)
      if (res.is_query) {
        showToast(res.answer || res.result || 'No results', 'info')
      } else if (res.task) {
        const a = agents.find(x => x.id === res.task.agent_id)
        showToast(`Task created: ${a ? a.name : res.task.agent_id} → ${res.task.title}`, 'success')
        onTaskCreated?.(res.task)
      } else {
        showToast(res.message || 'Command processed', 'info')
      }
      setText('')
    } catch (err) {
      showToast(err.message || 'Failed to parse command', 'error')
    } finally { setLoading(false) }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length === 0) return
      const next = Math.min(historyIdx + 1, history.length - 1)
      setHistoryIdx(next); setText(history[next])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIdx <= 0) { setHistoryIdx(-1); setText(''); return }
      const next = historyIdx - 1
      setHistoryIdx(next); setText(history[next])
    } else if (e.key === 'Tab' && showAutocomplete) {
      e.preventDefault(); setText(acMatches[0] + ' '); setShowAC(false)
    } else if (e.key === 'Escape') {
      setMobileOpen(false); inputRef.current?.blur()
    }
  }

  const selectAgent = (id) => { setText(id + ' '); setShowAC(false); inputRef.current?.focus() }

  const inputEl = (
    <div ref={wrapperRef} className="relative w-full">
      <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-hive-800 border border-hive-700 rounded-xl px-3 py-2 focus-within:border-honey/50 transition-colors">
        <span className="text-hive-500 text-sm shrink-0">⌘K</span>
        <input ref={inputRef} type="text" value={text}
          onChange={e => { setText(e.target.value); setHistoryIdx(-1); setShowAC(e.target.value.length > 0) }}
          onKeyDown={handleKeyDown}
          onFocus={() => text.length > 0 && setShowAC(true)}
          placeholder="Type a command..."
          disabled={loading}
          className="bg-transparent text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none flex-1 min-w-0 disabled:opacity-50" />
        {loading && (
          <svg className="animate-spin h-4 w-4 text-honey shrink-0" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
      </form>
      {showAutocomplete && (
        <div className="absolute top-full mt-1 left-0 w-full bg-hive-800 border border-hive-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          {acMatches.map(id => {
            const a = agents.find(x => x.id === id)
            return (
              <div key={id} onClick={() => selectAgent(id)} className="flex items-center gap-2 px-3 py-2 hover:bg-hive-700/50 cursor-pointer">
                {a && <span className="text-base">{a.avatar}</span>}
                <span className="text-sm text-hive-200 font-medium">{a?.name || id}</span>
                {a && <span className="text-xs text-hive-500">{a.role}</span>}
              </div>
            )
          })}
        </div>
      )}
      {toast && (
        <div className={`absolute top-full mt-2 left-0 w-full px-3 py-2 rounded-xl text-sm border shadow-lg z-50 ${
          toast.type === 'error' ? 'bg-red-900/80 border-red-700 text-red-200'
          : toast.type === 'info' ? 'bg-blue-900/80 border-blue-700 text-blue-200'
          : 'bg-green-900/80 border-green-700 text-green-200'
        }`}>
          <div className="flex items-start justify-between gap-2">
            <span className="break-words min-w-0">{toast.msg}</span>
            <button onClick={() => setToast(null)} className="text-current opacity-60 hover:opacity-100 shrink-0">&times;</button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <>
      <div className="hidden md:block w-full">{inputEl}</div>
      <div className="md:hidden">
        {!mobileOpen && (
          <button onClick={() => { setMobileOpen(true); setTimeout(() => inputRef.current?.focus(), 50) }}
            className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-honey text-hive-900 flex items-center justify-center shadow-lg text-sm font-bold">
            ⌘K
          </button>
        )}
        {mobileOpen && (
          <div className="fixed inset-x-0 bottom-0 z-50 p-3 bg-hive-900/95 backdrop-blur border-t border-hive-700">
            <div className="flex items-center gap-2">
              <div className="flex-1">{inputEl}</div>
              <button onClick={() => setMobileOpen(false)} className="text-hive-400 hover:text-hive-200 text-sm px-2 py-2 shrink-0">Close</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
