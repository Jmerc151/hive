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
    <div className="min-h-screen bg-page flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-8 h-8 rounded-md bg-t1 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-display text-lg tracking-wider leading-none">H</span>
          </div>
          <h1 className="text-2xl font-bold font-display tracking-wider text-t1">Hive</h1>
          <p className="text-sm text-t3 mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-s1 rounded-2xl p-6 space-y-4" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
          {error && (
            <div className="text-danger text-sm rounded-lg px-3 py-2" style={{ background: 'rgba(255,59,48,0.1)', border: '0.5px solid rgba(255,59,48,0.2)' }}>
              {error}
            </div>
          )}

          <div>
            <label className="text-xs text-t3 mb-1 block">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              className="w-full bg-s3 rounded-lg px-3 py-2.5 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-1 focus:ring-t1"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
              placeholder="Enter username"
            />
          </div>

          <div>
            <label className="text-xs text-t3 mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full bg-s3 rounded-lg px-3 py-2.5 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-1 focus:ring-t1"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
              placeholder="Enter password"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full py-2.5 bg-t1 text-white rounded-lg font-medium text-sm hover:opacity-80 transition-all disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
