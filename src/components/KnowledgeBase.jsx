import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const STATUS_STYLES = {
  pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  processing: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  ready: 'bg-success/15 text-success border-green-500/20',
  failed: 'bg-danger/15 text-danger border-red-500/20',
}

const SOURCE_BADGE = {
  text: 'bg-s4 text-t2',
  url: 'bg-blue-500/15 text-blue-400',
  file: 'bg-purple-500/15 text-purple-400',
}

export default function KnowledgeBase({ onClose }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [chunks, setChunks] = useState({})
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searching, setSearching] = useState(false)

  // Add document form
  const [addTitle, setAddTitle] = useState('')
  const [addContent, setAddContent] = useState('')

  // Import URL form
  const [importUrl, setImportUrl] = useState('')
  const [importTitle, setImportTitle] = useState('')

  const refresh = () => {
    setLoading(true)
    api.getKnowledge()
      .then(data => setDocs(Array.isArray(data) ? data : []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { refresh() }, [])

  // Poll for processing documents
  useEffect(() => {
    const hasProcessing = docs.some(d => d.status === 'pending' || d.status === 'processing')
    if (!hasProcessing) return
    const timer = setInterval(refresh, 3000)
    return () => clearInterval(timer)
  }, [docs])

  const loadChunks = async (docId) => {
    if (chunks[docId]) return
    try {
      const data = await api.getKnowledgeChunks(docId)
      setChunks(prev => ({ ...prev, [docId]: data }))
    } catch { /* ignore */ }
  }

  const handleExpand = (docId) => {
    if (expanded === docId) {
      setExpanded(null)
    } else {
      setExpanded(docId)
      loadChunks(docId)
    }
  }

  const handleAdd = async () => {
    if (!addTitle.trim() || !addContent.trim()) return
    try {
      await api.addKnowledge({ title: addTitle.trim(), content: addContent.trim(), source_type: 'text' })
      setAddTitle('')
      setAddContent('')
      setShowAdd(false)
      refresh()
    } catch { /* ignore */ }
  }

  const handleImport = async () => {
    if (!importUrl.trim()) return
    try {
      await api.importKnowledgeUrl(importUrl.trim(), importTitle.trim() || undefined)
      setImportUrl('')
      setImportTitle('')
      setShowImport(false)
      refresh()
    } catch { /* ignore */ }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this document and all its chunks?')) return
    try {
      await api.deleteKnowledge(id)
      setExpanded(null)
      refresh()
    } catch { /* ignore */ }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) { setSearchResults(null); return }
    setSearching(true)
    try {
      const results = await api.searchKnowledge(searchQuery.trim(), 10)
      setSearchResults(results)
    } catch { setSearchResults([]) }
    finally { setSearching(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex justify-end" onClick={onClose}>
      <div className="bg-s1 border-l border-s4 w-full max-w-lg shadow-2xl h-full flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-s4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Knowledge Base</h2>
            <span className="bg-s4 text-t2 text-xs px-2 py-0.5 rounded-full font-medium">
              {docs.length} docs
            </span>
          </div>
          <button onClick={onClose} className="text-t3 hover:text-t1 text-xl">&times;</button>
        </div>

        {/* Actions bar */}
        <div className="flex gap-2 p-3 border-b border-s4 shrink-0">
          <button
            onClick={() => { setShowAdd(true); setShowImport(false) }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-s3 text-t1 hover:bg-t1/30 transition-colors"
          >
            + Add Document
          </button>
          <button
            onClick={() => { setShowImport(true); setShowAdd(false) }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
          >
            Import URL
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-s4 shrink-0">
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search knowledge base..."
              className="flex-1 bg-page border border-s4 rounded-lg px-3 py-2 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:border-t1/50"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-s4 text-t1 hover:bg-s5 transition-colors disabled:opacity-50"
            >
              {searching ? '...' : 'Search'}
            </button>
            {searchResults && (
              <button
                onClick={() => { setSearchResults(null); setSearchQuery('') }}
                className="px-2 py-2 rounded-lg text-xs text-t3 hover:text-t1"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Add Document Modal */}
        {showAdd && (
          <div className="p-4 border-b border-s4 bg-page/50 shrink-0">
            <div className="text-sm font-medium text-t1 mb-2">Add Document</div>
            <input
              value={addTitle}
              onChange={e => setAddTitle(e.target.value)}
              placeholder="Document title"
              className="w-full bg-page border border-s4 rounded-lg px-3 py-2 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:border-t1/50 mb-2"
            />
            <textarea
              value={addContent}
              onChange={e => setAddContent(e.target.value)}
              placeholder="Paste document content here..."
              rows={8}
              className="w-full bg-page border border-s4 rounded-lg px-3 py-2 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:border-t1/50 resize-none"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded-lg text-xs text-t3 hover:text-t1">Cancel</button>
              <button
                onClick={handleAdd}
                disabled={!addTitle.trim() || !addContent.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-t1 text-white hover:bg-t2 transition-colors disabled:opacity-50"
              >
                Add & Process
              </button>
            </div>
          </div>
        )}

        {/* Import URL Modal */}
        {showImport && (
          <div className="p-4 border-b border-s4 bg-page/50 shrink-0">
            <div className="text-sm font-medium text-t1 mb-2">Import from URL</div>
            <input
              value={importUrl}
              onChange={e => setImportUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="w-full bg-page border border-s4 rounded-lg px-3 py-2 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:border-t1/50 mb-2"
            />
            <input
              value={importTitle}
              onChange={e => setImportTitle(e.target.value)}
              placeholder="Title (optional, defaults to URL)"
              className="w-full bg-page border border-s4 rounded-lg px-3 py-2 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:border-t1/50"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button onClick={() => setShowImport(false)} className="px-3 py-1.5 rounded-lg text-xs text-t3 hover:text-t1">Cancel</button>
              <button
                onClick={handleImport}
                disabled={!importUrl.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                Import & Process
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3">
          {/* Search results view */}
          {searchResults ? (
            <div className="space-y-2">
              <div className="text-xs text-t3 mb-2">{searchResults.length} results for "{searchQuery}"</div>
              {searchResults.length === 0 && (
                <div className="text-center text-t4 text-sm py-8">No matching chunks found</div>
              )}
              {searchResults.map((r, i) => (
                <div key={r.id || i} className="bg-page/60 border border-s4 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-t1">Score: {r.score}</span>
                  </div>
                  <p className="text-sm text-t1 leading-relaxed">{r.content?.slice(0, 300)}{r.content?.length > 300 ? '...' : ''}</p>
                </div>
              ))}
            </div>
          ) : (
            /* Document list */
            <div className="space-y-2">
              {loading && docs.length === 0 && (
                <div className="text-center text-t4 text-sm py-8">Loading...</div>
              )}
              {!loading && docs.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-3xl mb-2">📚</div>
                  <p className="text-t3 text-sm">No documents yet</p>
                  <p className="text-t4 text-xs mt-1">Add documents to build your knowledge base</p>
                </div>
              )}
              {docs.map(doc => (
                <div key={doc.id} className="bg-page/60 border border-s4 rounded-lg overflow-hidden">
                  <div
                    className="p-3 cursor-pointer hover:bg-s3 transition-colors"
                    onClick={() => handleExpand(doc.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-sm font-medium text-t1 truncate">{doc.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${SOURCE_BADGE[doc.source_type] || SOURCE_BADGE.text}`}>
                          {doc.source_type}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLES[doc.status] || STATUS_STYLES.pending}`}>
                          {doc.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-t4">
                      <span>{doc.chunk_count || 0} chunks</span>
                      {doc.source_url && <span className="truncate max-w-[200px]">{doc.source_url}</span>}
                      <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Expanded view */}
                  {expanded === doc.id && (
                    <div className="border-t border-s4 p-3 bg-page/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-t2">Chunks Preview</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(doc.id) }}
                          className="text-xs text-danger hover:text-red-300 px-2 py-0.5 rounded hover:bg-red-500/10"
                        >
                          Delete
                        </button>
                      </div>
                      {!chunks[doc.id] ? (
                        <div className="text-xs text-t4">Loading chunks...</div>
                      ) : chunks[doc.id].length === 0 ? (
                        <div className="text-xs text-t4">
                          {doc.status === 'ready' ? 'No chunks' : 'Document still processing...'}
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-60 overflow-y-auto">
                          {chunks[doc.id].map(chunk => (
                            <div key={chunk.id} className="bg-s2 rounded p-2 text-xs text-t2 leading-relaxed">
                              <span className="text-t4 font-mono mr-1">#{chunk.chunk_index}</span>
                              {chunk.content.slice(0, 150)}{chunk.content.length > 150 ? '...' : ''}
                              <span className="text-t5 ml-1">({chunk.token_count}t)</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
