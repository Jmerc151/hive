import { useState } from 'react'

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username || !password) return
    setLoading(true)
    setError('')
    try {
      await onLogin(username, password)
    } catch (err) {
      setError(err.message || 'Invalid credentials')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-hive-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-honey to-honey-dim flex items-center justify-center mx-auto mb-4 shadow-lg shadow-honey/20">
            <span className="text-3xl">🐝</span>
          </div>
          <h1 className="text-2xl font-bold text-hive-100">Hive</h1>
          <p className="text-sm text-hive-400 mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-hive-800 border border-hive-700 rounded-2xl p-6 space-y-4">
          {error && (
            <div className="bg-danger/10 border border-danger/20 text-danger text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs text-hive-400 mb-1 block">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              className="w-full bg-hive-900 border border-hive-700 rounded-lg px-3 py-2.5 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:border-honey/50"
              placeholder="Enter username"
            />
          </div>

          <div>
            <label className="text-xs text-hive-400 mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full bg-hive-900 border border-hive-700 rounded-lg px-3 py-2.5 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:border-honey/50"
              placeholder="Enter password"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full py-2.5 bg-gradient-to-r from-honey to-honey-dim text-white rounded-lg font-medium text-sm shadow-lg shadow-honey/20 hover:shadow-honey/30 transition-all disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
