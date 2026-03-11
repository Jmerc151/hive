import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const BOT_TYPES = [
  { value: 'chrome-extension', label: 'Chrome Extension', icon: '🌐' },
  { value: 'telegram-bot', label: 'Telegram Bot', icon: '✈️' },
  { value: 'discord-bot', label: 'Discord Bot', icon: '🎮' },
  { value: 'web-app', label: 'Web App / SaaS', icon: '🖥️' },
  { value: 'cli-tool', label: 'CLI Tool', icon: '⌨️' },
  { value: 'api', label: 'API / Microservice', icon: '🔌' },
  { value: 'landing-page', label: 'Landing Page', icon: '📄' },
]

export default function BotGenerator({ onSubmit, onClose }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [description, setDescription] = useState('')
  const [audience, setAudience] = useState('')
  const [monetization, setMonetization] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    api.getBotSuggestions().then(setSuggestions).catch(() => {})
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await api.refreshBotSuggestions()
      // Poll for new suggestions after Scout starts
      setTimeout(async () => {
        const s = await api.getBotSuggestions()
        setSuggestions(s)
        setRefreshing(false)
      }, 3000)
    } catch {
      setRefreshing(false)
    }
  }

  const useSuggestion = (s) => {
    setName(s.name)
    setType(s.type)
    setDescription(s.description)
    setAudience(s.audience || '')
    setMonetization(s.monetization || '')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim() || !type || !description.trim()) return

    const typeLabel = BOT_TYPES.find(t => t.value === type)?.label || type

    const prompt = `Build a complete, production-ready ${typeLabel}: "${name.trim()}"

## Requirements
${description.trim()}

${audience ? `## Target Audience\n${audience.trim()}\n` : ''}
${monetization ? `## Monetization Strategy\n${monetization.trim()}\n` : ''}
## Deliverables
Generate a COMPLETE, self-contained ${typeLabel} package with:
1. All source code files — fully implemented, no TODOs or stubs
2. package.json with all dependencies
3. README.md with step-by-step setup instructions
4. .env.example with all required environment variables (never pre-filled with real keys)
5. Must work with: npm install && npm start

Format each file as a markdown heading (## filename.ext) followed by a code block.`

    onSubmit({
      title: `Build ${typeLabel}: ${name.trim()}`,
      description: prompt,
      priority: 'high',
      agent_id: 'forge'
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-hive-800 border border-hive-700 rounded-xl w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-hive-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚒️</span>
            <h2 className="text-lg font-semibold">Generate Bot</h2>
          </div>
          <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl">&times;</button>
        </div>

        {/* Suggestions */}
        {(suggestions.length > 0 || refreshing) && (
          <div className="p-5 border-b border-hive-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-hive-300">Scout Suggestions</h3>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="text-xs text-scout hover:text-cyan-300 transition-colors disabled:opacity-50"
              >
                {refreshing ? '🔭 Scanning...' : '🔭 Refresh Ideas'}
              </button>
            </div>
            <div className="space-y-2">
              {suggestions.slice(0, 5).map(s => (
                <button
                  key={s.id}
                  onClick={() => useSuggestion(s)}
                  className="w-full text-left p-3 rounded-lg border border-hive-600 hover:border-scout/50 hover:bg-scout/5 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">{BOT_TYPES.find(t => t.value === s.type)?.icon || '🤖'}</span>
                    <span className="font-medium text-sm text-hive-100 group-hover:text-scout">{s.name}</span>
                    <span className="text-[10px] text-hive-500 ml-auto">{BOT_TYPES.find(t => t.value === s.type)?.label || s.type}</span>
                  </div>
                  <p className="text-xs text-hive-400 line-clamp-2">{s.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No suggestions yet */}
        {suggestions.length === 0 && !refreshing && (
          <div className="px-5 pt-4">
            <button
              onClick={handleRefresh}
              className="w-full p-3 rounded-lg border border-dashed border-hive-600 text-sm text-hive-400 hover:border-scout/50 hover:text-scout transition-all"
            >
              🔭 Ask Scout to suggest bot ideas
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Bot Name */}
          <div>
            <label className="block text-sm font-medium text-hive-300 mb-1.5">Bot Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. PriceTracker Pro" autoFocus
              className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2.5 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50 focus:border-honey" />
          </div>

          {/* Bot Type */}
          <div>
            <label className="block text-sm font-medium text-hive-300 mb-1.5">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {BOT_TYPES.map(bt => (
                <button key={bt.value} type="button"
                  onClick={() => setType(bt.value)}
                  className={`text-left p-2.5 rounded-lg border text-sm transition-all ${
                    type === bt.value
                      ? 'border-honey bg-honey/10 text-honey'
                      : 'border-hive-600 text-hive-400 hover:border-hive-500 hover:text-hive-200'
                  }`}>
                  <span className="mr-1.5">{bt.icon}</span>{bt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-hive-300 mb-1.5">What should it do?</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Describe the features, behavior, and any specific requirements..."
              rows={4}
              className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2.5 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50 focus:border-honey resize-none" />
          </div>

          {/* Advanced options */}
          <details className="group">
            <summary className="text-xs text-hive-400 cursor-pointer hover:text-hive-300">
              Advanced options (optional)
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-sm font-medium text-hive-300 mb-1.5">Target Audience</label>
                <input type="text" value={audience} onChange={e => setAudience(e.target.value)}
                  placeholder="e.g. Small business owners, developers..."
                  className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2.5 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50 focus:border-honey" />
              </div>
              <div>
                <label className="block text-sm font-medium text-hive-300 mb-1.5">Monetization Strategy</label>
                <input type="text" value={monetization} onChange={e => setMonetization(e.target.value)}
                  placeholder="e.g. Freemium, one-time purchase, subscription..."
                  className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2.5 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50 focus:border-honey" />
              </div>
            </div>
          </details>

          {/* Forge preview */}
          <div className="flex items-start gap-3 p-3 bg-hive-700/30 rounded-lg border border-hive-700">
            <span className="text-2xl">⚒️</span>
            <div>
              <div className="font-medium text-sm" style={{ color: '#3b82f6' }}>Forge</div>
              <div className="text-xs text-hive-400 mt-0.5">Will generate complete, runnable code with README, package.json, and .env.example</div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-hive-400 hover:text-hive-200 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!name.trim() || !type || !description.trim()}
              className="px-5 py-2 bg-gradient-to-r from-forge to-blue-600 text-white rounded-lg font-medium text-sm hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
              <span>⚒️</span> Generate Bot
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
