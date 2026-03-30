import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function Login({ onLogin, defaultSignup }) {
  const [isSignup, setIsSignup] = useState(!!defaultSignup);
  const [showForgot, setShowForgot] = useState(false);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const data = isSignup
        ? await api.signup({ email, password, name })
        : await api.login({ email, password });
      onLogin(data, isSignup);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.forgotPassword({ email });
      setSuccess("If an account exists with that email, we've sent a reset link.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-2xl font-bold text-center mb-1" style={{ color: 'var(--color-brand)' }}>
            AgentForge
          </h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            {showForgot ? 'Reset your password' : isSignup ? 'Create your account' : 'Sign in to your account'}
          </p>

          {showForgot ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              />

              {error && <p className="text-sm text-red-500">{error}</p>}
              {success && <p className="text-sm text-green-600">{success}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {loading ? '...' : 'Send Reset Link'}
              </button>

              <p className="text-center text-sm text-gray-500">
                <button
                  type="button"
                  onClick={() => { setShowForgot(false); setError(''); setSuccess(''); }}
                  className="text-indigo-600 font-medium hover:underline"
                >
                  Back to sign in
                </button>
              </p>
            </form>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                {isSignup && (
                  <input
                    type="text"
                    placeholder="Name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                  />
                )}
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                />

                {error && <p className="text-sm text-red-500">{error}</p>}

                {!isSignup && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => { setShowForgot(true); setError(''); setSuccess(''); }}
                      className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? '...' : isSignup ? 'Create Account' : 'Sign In'}
                </button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-4">
                {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button
                  onClick={() => { setIsSignup(!isSignup); setError(''); navigate(isSignup ? '/login' : '/signup'); }}
                  className="text-indigo-600 font-medium hover:underline"
                >
                  {isSignup ? 'Sign in' : 'Sign up'}
                </button>
              </p>
            </>
          )}
          <p className="text-center text-sm text-gray-400 mt-3">
            <button onClick={() => navigate('/')} className="hover:text-gray-600 transition-colors">&larr; Back to home</button>
          </p>
        </div>
      </div>
    </div>
  );
}
