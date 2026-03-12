import { useState, useRef, useEffect } from 'react'
import { api } from '../lib/api'

export default function SearchBar({ agents = [], onSelectTask }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef(null)
  const wrapperRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleChange = (v) => {
    setQuery(v)
    clearTimeout(debounceRef.current)
    if (v.length < 2) { setResults(null); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api.search(v)
        setResults(data)
        setOpen(true)
      } catch { setResults(null) }
    }, 300)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center gap-1.5 bg-hive-800 border border-hive-700 rounded-xl px-3 py-2">
        <span className="text-hive-500 text-sm">🔍</span>
        <input
          type="text" value={query} onChange={e => handleChange(e.target.value)}
          onFocus={() => results && setOpen(true)}
          placeholder="Search..."
          className="bg-transparent text-sm text-hive-200 placeholder:text-hive-500 focus:outline-none w-28 lg:w-40"
        />
      </div>

      {open && results && (results.tasks.length > 0 || results.logs.length > 0) && (
        <div className="absolute top-full mt-1 right-0 w-80 bg-hive-800 border border-hive-700 rounded-xl shadow-2xl z-50 max-h-80 overflow-y-auto">
          {results.tasks.length > 0 && (
            <div className="p-2">
              <div className="text-[10px] text-hive-500 uppercase tracking-wider px-2 py-1">Tasks</div>
              {results.tasks.map(t => {
                const a = agents.find(x => x.id === t.agent_id)
                return (
                  <div key={t.id} onClick={() => { onSelectTask(t.id); setOpen(false); setQuery('') }}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-hive-700/50 cursor-pointer">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      t.status === 'done' ? 'bg-green-500' : t.status === 'failed' ? 'bg-red-500' :
                      t.status === 'in_progress' ? 'bg-honey' : 'bg-hive-500'
                    }`} />
                    <span className="text-xs text-hive-200 truncate flex-1">{t.title}</span>
                    {a && <span className="text-xs shrink-0">{a.avatar}</span>}
                  </div>
                )
              })}
            </div>
          )}
          {results.logs.length > 0 && (
            <div className="p-2 border-t border-hive-700">
              <div className="text-[10px] text-hive-500 uppercase tracking-wider px-2 py-1">Logs</div>
              {results.logs.slice(0, 5).map((l, i) => (
                <div key={i} onClick={() => { if (l.task_id) { onSelectTask(l.task_id); setOpen(false); setQuery('') } }}
                  className="px-2 py-1.5 rounded-lg hover:bg-hive-700/50 cursor-pointer">
                  <div className="text-xs text-hive-300 truncate">{l.task_title}</div>
                  <div className="text-[10px] text-hive-500 truncate">{l.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
