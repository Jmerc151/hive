import { useState, useRef, useEffect } from 'react'
import { api } from '../lib/api'

const AGENT_TILES = {
  scout: { letter: 'S', class: 'tile-scout' },
  forge: { letter: 'F', class: 'tile-forge' },
  quill: { letter: 'Q', class: 'tile-quill' },
  dealer: { letter: 'D', class: 'tile-dealer' },
  oracle: { letter: 'O', class: 'tile-oracle' },
  nexus: { letter: 'N', class: 'tile-nexus' },
}

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
      <div className="flex items-center gap-[6px] bg-page rounded-[9px] px-[11px] py-[6px]" style={{ border: '0.5px solid rgba(0,0,0,0.12)' }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0">
          <circle cx="5" cy="5" r="4" stroke="#aeaeb2" strokeWidth="1.2"/>
          <line x1="8.2" y1="8.2" x2="11" y2="11" stroke="#aeaeb2" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        <input
          type="text" value={query} onChange={e => handleChange(e.target.value)}
          onFocus={() => results && setOpen(true)}
          placeholder="Search outputs..."
          className="bg-transparent text-xs text-t1 placeholder:text-t4 focus:outline-none w-[140px] lg:w-[180px]"
        />
      </div>

      {open && results && (results.tasks.length > 0 || results.logs.length > 0) && (
        <div className="absolute top-full mt-1 right-0 w-80 bg-s1 rounded-xl shadow-2xl z-50 max-h-80 overflow-y-auto" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
          {results.tasks.length > 0 && (
            <div className="p-2">
              <div className="font-display text-[10px] tracking-[2px] text-t4 px-2 py-1">TASKS</div>
              {results.tasks.map(t => {
                const a = agents.find(x => x.id === t.agent_id)
                const tile = a ? AGENT_TILES[a.id] : null
                return (
                  <div key={t.id} onClick={() => { onSelectTask(t.id); setOpen(false); setQuery('') }}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-s3 cursor-pointer">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      t.status === 'done' ? 'bg-success' : t.status === 'failed' ? 'bg-danger' :
                      t.status === 'in_progress' ? 'bg-success' : 'bg-t5'
                    }`} />
                    <span className="text-xs text-t1 truncate flex-1">{t.title}</span>
                    {tile && <div className={`agent-tile w-4 h-4 rounded text-[8px] ${tile.class}`}>{tile.letter}</div>}
                  </div>
                )
              })}
            </div>
          )}
          {results.logs.length > 0 && (
            <div className="p-2" style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
              <div className="font-display text-[10px] tracking-[2px] text-t4 px-2 py-1">LOGS</div>
              {results.logs.slice(0, 5).map((l, i) => (
                <div key={i} onClick={() => { if (l.task_id) { onSelectTask(l.task_id); setOpen(false); setQuery('') } }}
                  className="px-2 py-1.5 rounded-lg hover:bg-s3 cursor-pointer">
                  <div className="text-xs text-t2 truncate">{l.task_title}</div>
                  <div className="text-[10px] text-t4 truncate">{l.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
