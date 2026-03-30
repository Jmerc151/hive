import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { api, setAuth, clearAuth } from './lib/api';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Agents from './pages/Agents';
import Tasks from './pages/Tasks';
import Billing from './pages/Billing';
import Pipelines from './pages/Pipelines';
import Templates from './pages/Templates';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem('af_token');
    if (token) {
      api.me()
        .then(data => {
          setUser(data.user);
          if (data.workspaces?.[0]) {
            setAuth(token, data.workspaces[0].id);
          }
          return checkOnboarding();
        })
        .catch(() => clearAuth())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function checkOnboarding() {
    try {
      const data = await api.agents();
      const agents = Array.isArray(data) ? data : data.agents || [];
      if (agents.length === 0) {
        setNeedsOnboarding(true);
      } else {
        setNeedsOnboarding(false);
      }
    } catch {
      // If agents endpoint fails, check localStorage for onboarding state
      const saved = localStorage.getItem('af_onboarding');
      if (saved) {
        setNeedsOnboarding(true);
      }
    }
  }

  function handleLogin(data, isNewUser) {
    setAuth(data.token, data.workspaces?.[0]?.id || data.workspace?.id);
    setUser(data.user);
    if (isNewUser) {
      setNeedsOnboarding(true);
      navigate('/onboarding');
    } else {
      checkOnboarding().then(() => {
        navigate('/dashboard');
      });
    }
  }

  function handleLogout() {
    clearAuth();
    setUser(null);
    navigate('/');
  }

  function handleOnboardingComplete() {
    setNeedsOnboarding(false);
    navigate('/dashboard');
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading...</div>
      </div>
    );
  }

  // Not logged in — show public routes
  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route path="/signup" element={<Login onLogin={handleLogin} defaultSignup />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    );
  }

  if (needsOnboarding || location.pathname === '/onboarding') {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding onComplete={handleOnboardingComplete} />} />
        <Route path="*" element={<Navigate to="/onboarding" />} />
      </Routes>
    );
  }

  return (
    <ErrorBoundary>
      <Layout user={user} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/pipelines" element={<Pipelines />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  );
}
