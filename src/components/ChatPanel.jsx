import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../lib/api'

function renderMarkdown(text) {
  if (!text) return text
  let clean = text.replace(/\[ACTION:\w+\][\s\S]*?\[\/ACTION\]/g, '').trim()
  clean = clean.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  clean = clean.replace(/`([^`]+)`/g, '<code class="bg-s3 px-1 rounded text-xs">$1</code>')
  clean = clean.replace(/^[-•] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
  clean = clean.replace(/((?:<li[^>]*>.*?<\/li>\n?)+)/g, '<ul class="space-y-0.5 my-1">$1</ul>')
  clean = clean.replace(/\n/g, '<br/>')
  return clean
}

const SUGGESTIONS = [
  { label: 'Agent status', text: 'What are my agents doing right now?' },
  { label: "Today's spend", text: 'How much have I spent today?' },
  { label: 'Find new skills', text: 'Search GitHub and Reddit for new AI agent skills' },
  { label: 'My skills', text: 'What skills do my agents have?' },
  { label: 'Scout research', text: 'Have Scout research trending AI tools' },
  { label: 'System health', text: 'Give me a full system health check' },
]

function WelcomeCard({ agents, onSuggestionClick }) {
  const running = agents.filter(a => a.isRunning).length
  const idle = agents.length - running

  return (
    <div className="px-4 py-6 space-y-4">
      {/* Status summary */}
      <div className="bg-gradient-to-br from-t1/5 to-t1/0 rounded-2xl p-4" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🐝</span>
          <span className="text-sm font-semibold font-display text-t1">Hive Overview</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="text-xl font-bold text-t1">{agents.length}</div>
            <div className="text-[10px] text-t3 uppercase tracking-wider">Agents</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-green-600">{running}</div>
            <div className="text-[10px] text-t3 uppercase tracking-wider">Active</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-t3">{idle}</div>
            <div className="text-[10px] text-t3 uppercase tracking-wider">Idle</div>
          </div>
        </div>
        {/* Agent pills */}
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3" style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
          {agents.map(a => (
            <span key={a.id} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-s1" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
              <span>{a.avatar}</span>
              <span className="text-t2">{a.name}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${a.isRunning ? 'bg-green-500' : 'bg-s3'}`} />
            </span>
          ))}
        </div>
      </div>

      {/* Suggestions */}
      <div>
        <p className="text-[10px] text-t4 uppercase tracking-wider mb-2 px-1">Try asking</p>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map(s => (
            <button
              key={s.label}
              onClick={() => onSuggestionClick(s.text)}
              className="text-xs px-3 py-1.5 rounded-full bg-s1 text-t2 hover:text-t1 transition-all active:scale-95"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ChatPanel({ agents, onClose, embedded, inline, onToast, isMobile = false }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [standupLoading, setStandupLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [actions, setActions] = useState([])
  const [mode, setMode] = useState('assistant')
  const bottomRef = useRef(null)
  const prevCountRef = useRef(0)

  useEffect(() => {
    const fetchMsgs = async () => {
      const msgs = await api.getMessages(mode === 'assistant' ? 'assistant' : 'feed')
      setMessages(msgs)
    }
    fetchMsgs()
    const interval = setInterval(fetchMsgs, mode === 'feed' ? 2000 : 10000)
    return () => clearInterval(interval)
  }, [mode])

  useEffect(() => {
    if (messages.length !== prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      prevCountRef.current = messages.length
    }
  }, [messages])

  useEffect(() => {
    if (streaming) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [streamingText, streaming])

  const submitMessage = useCallback(async (text) => {
    if (!text.trim() || streaming) return
    const userText = text.trim()
    setInput('')
    setStreaming(true)
    setStreamingText('')
    setActions([])

    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      sender_id: 'user',
      sender_name: 'You',
      sender_avatar: '👤',
      text: userText,
      created_at: new Date().toISOString()
    }
    setMessages(prev => [...prev, tempUserMsg])

    try {
      const res = await api.askChat(userText)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.token) {
                fullText += data.token
                setStreamingText(fullText)
              }
              if (data.action) {
                setActions(prev => [...prev, data.action])
                const actionLabel = data.action.type === 'create_task' ? `Task created: ${data.action.result?.title || 'New task'}`
                  : data.action.type === 'pause_agents' ? 'Agents paused'
                  : data.action.type === 'resume_agents' ? 'Agents resumed'
                  : data.action.type === 'update_setting' ? 'Setting updated'
                  : data.action.type === 'run_task' ? 'Task queued'
                  : data.action.type
                onToast?.({ type: 'success', message: actionLabel })
              }
              if (data.done) {
                const msgs = await api.getMessages('assistant')
                setMessages(msgs)
              }
              if (data.error) {
                fullText += `\n\nError: ${data.error}`
                setStreamingText(fullText)
                onToast?.({ type: 'error', message: data.error })
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      setStreamingText(`Connection error: ${err.message}`)
      onToast?.({ type: 'error', message: `Connection error: ${err.message}` })
    } finally {
      setStreaming(false)
      setStreamingText('')
    }
  }, [streaming, onToast])

  const handleSend = async () => {
    if (mode === 'assistant') {
      submitMessage(input)
      return
    }
    if (!input.trim()) return
    await api.sendMessage({ text: input.trim() })
    setInput('')
    const msgs = await api.getMessages('feed')
    setMessages(msgs)
  }

  const handleSuggestionClick = (text) => {
    submitMessage(text)
  }

  const handleStandup = async () => {
    setStandupLoading(true)
    try {
      await api.triggerStandup()
    } finally {
      setTimeout(() => setStandupLoading(false), 3000)
    }
  }

  const handleClear = async () => {
    await api.clearMessages()
    setMessages([])
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const formatTime = (ts) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const hasNoMessages = messages.length === 0 && !streaming
  const showWelcome = mode === 'assistant' && hasNoMessages

  const content = (
    <div className={`flex flex-col ${embedded ? 'h-full' : 'h-full'}`}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-t1/10 flex items-center justify-center">
            <span className="text-sm">{mode === 'assistant' ? '🐝' : '💬'}</span>
          </div>
          <div>
            <h2 className="font-semibold text-sm text-t1">{mode === 'assistant' ? 'Hive Assistant' : 'Team Feed'}</h2>
            <p className="text-xs text-t4">{mode === 'assistant' ? 'AI-powered control' : `${agents.length} agents`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-s1 rounded-lg p-0.5" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
            <button
              onClick={() => setMode('assistant')}
              className={`text-[10px] px-2 py-1 rounded-md transition-all ${mode === 'assistant' ? 'bg-t1/10 text-t1' : 'text-t3 hover:text-t1'}`}
            >
              AI
            </button>
            <button
              onClick={() => setMode('feed')}
              className={`text-[10px] px-2 py-1 rounded-md transition-all ${mode === 'feed' ? 'bg-t1/10 text-t1' : 'text-t3 hover:text-t1'}`}
            >
              Feed
            </button>
          </div>
          <button
            onClick={handleClear}
            className="text-xs text-t4 hover:text-t2 px-2 py-1 rounded-lg active:bg-s3"
          >
            Clear
          </button>
          {onClose && (
            <button onClick={onClose} className="text-t3 hover:text-t1 text-xl">&times;</button>
          )}
        </div>
      </div>

      {/* Standup banner — feed mode only */}
      {mode === 'feed' && (
        <div className="px-4 py-2" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <button
            onClick={handleStandup}
            disabled={standupLoading}
            className="w-full py-2.5 rounded-xl text-sm font-medium transition-all bg-gradient-to-r from-t1/10 to-t1/5 text-t1 hover:from-t1/20 hover:to-t1/10 disabled:opacity-50 active:scale-[0.98]"
            style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
          >
            {standupLoading ? 'Standup in progress...' : '📋 Start Team Standup'}
          </button>
        </div>
      )}

      {/* Messages area */}
      <div className={`flex-1 overflow-y-auto ${isMobile ? 'pb-[70px]' : ''}`}>
        {showWelcome ? (
          <WelcomeCard agents={agents} onSuggestionClick={handleSuggestionClick} />
        ) : hasNoMessages && mode === 'feed' ? (
          <div className="text-center text-t4 py-16 px-4">
            <div className="w-16 h-16 rounded-2xl bg-s1 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">💬</span>
            </div>
            <p className="text-sm font-medium text-t2">No messages yet</p>
            <p className="text-xs mt-1">Start a team standup or send a message</p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {messages.map((msg) => {
              const isUser = msg.sender_id === 'user'
              const isSystem = msg.sender_id === 'system'
              const isAssistant = msg.sender_id === 'hive-assistant'

              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <span className="text-xs text-t4 bg-s1 px-3 py-1 rounded-full" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                      {msg.sender_avatar} {msg.text}
                    </span>
                  </div>
                )
              }

              return (
                <div key={msg.id} className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
                  <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-sm ${
                    isAssistant ? 'bg-t1/10' : 'bg-s3'
                  }`}>
                    {isAssistant ? '🐝' : msg.sender_avatar || '👤'}
                  </div>
                  <div className={`max-w-[80%] ${isUser ? 'text-right' : ''}`}>
                    <div className={`flex items-center gap-2 mb-0.5 ${isUser ? 'justify-end' : ''}`}>
                      {!isUser && (
                        <span className={`text-xs font-semibold ${isAssistant ? 'text-t1' : ''}`} style={isAssistant ? {} : { color: msg.sender_color || '#78716c' }}>
                          {isAssistant ? 'Hive Assistant' : msg.sender_name}
                        </span>
                      )}
                      <span className="text-[10px] text-t5">{formatTime(msg.created_at)}</span>
                    </div>
                    <div className={`text-sm rounded-2xl px-3.5 py-2 inline-block text-left leading-relaxed ${
                      isUser
                        ? 'bg-t1 text-white rounded-br-md'
                        : isAssistant
                          ? 'bg-t1/5 text-t1 rounded-bl-md'
                          : 'bg-s1 text-t1 rounded-bl-md'
                    }`}
                      style={!isUser ? { border: '0.5px solid rgba(0,0,0,0.08)' } : undefined}
                      dangerouslySetInnerHTML={isAssistant ? { __html: renderMarkdown(msg.text) } : undefined}
                    >
                      {isAssistant ? undefined : msg.text}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Streaming response */}
            {streaming && (
              <div className="flex gap-2.5">
                <div className="shrink-0 w-8 h-8 rounded-xl bg-t1/10 flex items-center justify-center text-sm">
                  🐝
                </div>
                <div className="max-w-[80%]">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-t1">Hive Assistant</span>
                  </div>
                  <div className="text-sm rounded-2xl px-3.5 py-2 inline-block text-left leading-relaxed bg-t1/5 text-t1 rounded-bl-md" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                    {streamingText ? (
                      <span dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingText) }} />
                    ) : (
                      <span className="flex gap-1 items-center">
                        <span className="w-1.5 h-1.5 bg-t1 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-t1 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-t1 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    )}
                  </div>
                  {actions.map((action, i) => (
                    <div key={i} className="mt-1.5 flex items-center gap-1.5 text-xs text-green-600">
                      <span className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center text-[10px]">✓</span>
                      <span>{action.type === 'create_task' ? `Task created: ${action.result?.title || 'New task'}` : action.type === 'pause_agents' ? 'Agents paused' : action.type === 'resume_agents' ? 'Agents resumed' : action.type === 'update_setting' ? 'Setting updated' : action.type === 'run_task' ? 'Task queued' : action.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />

            {/* Inline suggestion chips after messages */}
            {mode === 'assistant' && !streaming && messages.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {SUGGESTIONS.slice(0, 3).map(s => (
                  <button
                    key={s.label}
                    onClick={() => handleSuggestionClick(s.text)}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-s3 text-t3 hover:text-t1 transition-all active:scale-95"
                    style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input — mobile: fixed above bottom nav; desktop: inline */}
      {isMobile ? (
        <div className="fixed left-0 right-0 z-30 px-3 py-2 bg-page/95 backdrop-blur-xl" style={{ bottom: '54px', borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
          <div className="flex gap-1.5 items-center">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={mode === 'assistant' ? 'Ask the hive...' : 'Message...'}
              className="flex-1 bg-s1 rounded-xl px-3 py-2.5 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-t1/30 placeholder:text-t4 min-w-0"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
              disabled={streaming}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              className="w-10 h-10 shrink-0 bg-t1 text-white rounded-xl text-sm font-medium hover:opacity-90 transition-all disabled:opacity-30 active:scale-95 flex items-center justify-center"
            >
              {streaming ? '…' : '↑'}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2 bg-page backdrop-blur-xl shrink-0" style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingBottom: '8px' }}>
          <div className="flex gap-1.5 items-center">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={mode === 'assistant' ? 'Ask the hive...' : 'Message...'}
              className="flex-1 bg-s1 rounded-xl px-3 py-2 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-t1/30 placeholder:text-t4 min-w-0"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
              disabled={streaming}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              className="w-9 h-9 shrink-0 bg-t1 text-white rounded-xl text-sm font-medium hover:opacity-90 transition-all disabled:opacity-30 active:scale-95 flex items-center justify-center"
            >
              {streaming ? '…' : '↑'}
            </button>
          </div>
        </div>
      )}
    </div>
  )

  if (embedded || inline) {
    return content
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-lg bg-page shadow-2xl flex flex-col h-full" onClick={e => e.stopPropagation()} style={{ borderLeft: '0.5px solid rgba(0,0,0,0.08)' }}>
        {content}
      </div>
    </div>
  )
}
