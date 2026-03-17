import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const CONFIDENCE_BADGE = (c) =>
  c >= 0.7 ? 'bg-green-500/15 text-green-600 border-green-500/20'
  : c >= 0.4 ? 'bg-yellow-500/15 text-yellow-600 border-yellow-500/20'
  : 'bg-red-500/15 text-red-600 border-red-500/20'

const STATUS_TABS = ['all', 'new', 'bookmarked']

function parseTags(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

export default function IntelFeed({ onClose, inline }) {
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(false)

  const refresh = () => {
    setLoading(true)
    api.getIntel({ status: filter === 'all' ? undefined : filter, limit: 50 })
      .then(data => setItems(Array.isArray(data) ? data : data?.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { refresh() }, [filter])

  const handleAction = async (id, status) => {
    await api.updateIntelStatus(id, status).catch(() => {})
    setExpanded(null)
    refresh()
  }

  const content = (
    <div className={inline ? "h-full flex flex-col" : "bg-s1 w-full max-w-lg shadow-2xl h-full flex flex-col"} style={inline ? {} : { borderLeft: '0.5px solid rgba(0,0,0,0.08)' }} onClick={e => e.stopPropagation()}>
      <div className="p-5 flex items-center justify-between shrink-0" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold font-display text-t1">Intel Feed</h2>
          {items.filter(i => i.status === 'new').length > 0 && (
            <span className="bg-t1/10 text-t1 text-xs px-2 py-0.5 rounded-full font-medium">
              {items.filter(i => i.status === 'new').length} new
            </span>
          )}
        </div>
        {!inline && <button onClick={onClose} className="text-t3 hover:text-t1 text-xl">&times;</button>}
      </div>

      <div className="flex gap-1 p-3 shrink-0 overflow-x-auto" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
        {STATUS_TABS.map(s => (
          <button key={s} onClick={() => { setFilter(s); setExpanded(null) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${filter === s ? 'bg-t1/10 text-t1' : 'text-t3 hover:text-t1 hover:bg-s3'}`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && items.length === 0 && <div className="text-center text-t3 py-8">Loading...</div>}
        {!loading && items.length === 0 && (
          <div className="text-center text-t3 py-12">
            <div className="text-sm">No intelligence items yet.</div>
            <div className="text-xs mt-1 text-t4">Run a Scout research task to populate.</div>
          </div>
        )}

        {items.map(item => {
          const isExpanded = expanded === item.id
          const tags = parseTags(item.tags)
          const conf = item.confidence ?? 0.5
          return (
            <div key={item.id}
              className={`bg-s1 rounded-lg transition-colors cursor-pointer ${isExpanded ? '' : 'hover:bg-s2'}`}
              style={{ border: isExpanded ? '0.5px solid rgba(0,0,0,0.15)' : '0.5px solid rgba(0,0,0,0.08)' }}
              onClick={() => setExpanded(isExpanded ? null : item.id)}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h3 className="text-sm font-medium text-t1 leading-snug flex-1">{item.title}</h3>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${CONFIDENCE_BADGE(conf)}`}>
                    {Math.round(conf * 100)}%
                  </span>
                </div>
                <p className={`text-xs text-t3 leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>{item.summary}</p>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tags.map(tag => <span key={tag} className="text-[10px] bg-s3 text-t2 px-1.5 py-0.5 rounded">{tag}</span>)}
                  </div>
                )}
                {item.status && item.status !== 'new' && (
                  <span className={`inline-block mt-2 text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                    item.status === 'bookmarked' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                    : item.status === 'sent_to_forge' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                    : 'bg-s3 text-t4 border-transparent'
                  }`} style={item.status !== 'bookmarked' && item.status !== 'sent_to_forge' ? { border: '0.5px solid rgba(0,0,0,0.08)' } : {}}>{item.status === 'sent_to_forge' ? 'Sent to Forge' : item.status}</span>
                )}
              </div>
              {isExpanded && (
                <div className="px-4 pb-4 pt-3 space-y-3" style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
                  {item.source_url && (
                    <a href={item.source_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-t1 hover:text-t2 underline break-all" onClick={e => e.stopPropagation()}>
                      {item.source_url}
                    </a>
                  )}
                  <div className="text-[10px] text-t4">{item.created_at && new Date(item.created_at).toLocaleString()}</div>
                  <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    {item.status !== 'sent_to_forge' && (
                      <button onClick={() => handleAction(item.id, 'sent_to_forge')}
                        className="flex-1 px-3 py-1.5 bg-blue-500/15 text-blue-600 border border-blue-500/20 rounded-lg text-xs font-medium hover:bg-blue-500/25 transition-colors">
                        Send to Forge
                      </button>
                    )}
                    {item.status !== 'bookmarked' && (
                      <button onClick={() => handleAction(item.id, 'bookmarked')}
                        className="flex-1 px-3 py-1.5 bg-yellow-500/15 text-yellow-600 border border-yellow-500/20 rounded-lg text-xs font-medium hover:bg-yellow-500/25 transition-colors">
                        Bookmark
                      </button>
                    )}
                    {item.status !== 'dismissed' && (
                      <button onClick={() => handleAction(item.id, 'dismissed')}
                        className="flex-1 px-3 py-1.5 bg-s3 text-t3 rounded-lg text-xs font-medium hover:bg-s3 transition-colors"
                        style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  if (inline) return content

  return (
    <div className="fixed inset-0 bg-page backdrop-blur-sm z-50 flex justify-end" onClick={onClose}>
      {content}
    </div>
  )
}
