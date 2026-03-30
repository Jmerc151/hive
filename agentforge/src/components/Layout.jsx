import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '◈' },
  { path: '/analytics', label: 'Analytics', icon: '◎' },
  { path: '/agents', label: 'Agents', icon: '◉' },
  { path: '/tasks', label: 'Tasks', icon: '▤' },
  { path: '/pipelines', label: 'Pipelines', icon: '▦' },
  { path: '/templates', label: 'Templates', icon: '◆' },
  { path: '/billing', label: 'Billing', icon: '◇' },
  { path: '/settings', label: 'Settings', icon: '⚙' },
];

const bottomNavItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '◈' },
  { path: '/agents', label: 'Agents', icon: '◉' },
  { path: '/tasks', label: 'Tasks', icon: '▤' },
  { path: '/pipelines', label: 'Pipelines', icon: '▦' },
  { path: '/settings', label: 'Settings', icon: '⚙' },
];

export default function Layout({ user, onLogout, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden md:flex w-60 bg-white border-r border-gray-200 flex-col">
        <div className="p-5 border-b border-gray-200">
          <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--color-brand)' }}>
            AgentForge
          </h1>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 truncate">{user.email}</span>
            <button
              onClick={onLogout}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile header — visible only on mobile */}
      <div className="fixed top-0 left-0 right-0 z-40 md:hidden bg-white border-b border-gray-200 h-14 flex items-center justify-between px-4">
        <h1 className="text-lg font-bold tracking-tight" style={{ color: 'var(--color-brand)' }}>
          AgentForge
        </h1>
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Open menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute top-0 right-0 bottom-0 w-72 bg-white shadow-xl flex flex-col animate-slide-in-right">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight" style={{ color: 'var(--color-brand)' }}>
                AgentForge
              </h2>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Close menu"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`
                  }
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="p-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 truncate">{user.email}</span>
                <button
                  onClick={onLogout}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Logout
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto pt-14 pb-16 px-4 md:pt-0 md:pb-0 md:px-8 md:py-8">
        {children}
      </main>

      {/* Mobile bottom nav — visible only on mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white border-t border-gray-200" style={{ height: 64, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-center justify-around h-full">
          {bottomNavItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center w-11 h-11 rounded-lg transition-colors ${
                  isActive ? 'text-indigo-600' : 'text-gray-400'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
