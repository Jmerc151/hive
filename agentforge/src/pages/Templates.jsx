import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [installing, setInstalling] = useState(null);
  const [installed, setInstalled] = useState({});

  useEffect(() => {
    api.templates().then(setTemplates).catch(() => {});
  }, []);

  async function handleInstall(templateId) {
    setInstalling(templateId);
    try {
      const result = await api.installTemplate(templateId);
      setInstalled(prev => ({ ...prev, [templateId]: result }));
    } catch (err) {
      alert(err.message);
    } finally {
      setInstalling(null);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Agent Templates</h2>
      <p className="text-sm text-gray-500 mb-6">Pre-built agent teams you can install with one click.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(t => (
          <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">{t.icon}</span>
              <div>
                <div className="font-semibold">{t.name}</div>
                <div className="text-xs text-gray-400">{t.agentCount} agents</div>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-4 flex-1">{t.description}</p>

            {/* Agent previews */}
            {t.agents?.length > 0 && (
              <div className="mb-4">
                {(expanded === t.id ? t.agents : t.agents.slice(0, 2)).map((a, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                         style={{ background: a.color, color: 'white' }}>
                      {a.avatar}
                    </div>
                    <span className="text-sm font-medium">{a.name}</span>
                    <span className="text-xs text-gray-400">— {a.role}</span>
                  </div>
                ))}
                {t.agents.length > 2 && (
                  <button onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                    className="text-xs text-indigo-600 hover:underline mt-1">
                    {expanded === t.id ? 'Show less' : `+${t.agents.length - 2} more agents`}
                  </button>
                )}
              </div>
            )}

            {/* Install button */}
            {installed[t.id] ? (
              <div className="text-sm text-green-600 font-medium text-center py-2 bg-green-50 rounded-lg">
                Installed {installed[t.id].installed} agents
              </div>
            ) : t.id === 'custom' ? (
              <div className="text-sm text-gray-400 text-center py-2">
                Go to Agents to build your own
              </div>
            ) : (
              <button
                onClick={() => handleInstall(t.id)}
                disabled={installing === t.id}
                className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {installing === t.id ? 'Installing...' : 'Install Template'}
              </button>
            )}
          </div>
        ))}
      </div>

      {templates.length === 0 && (
        <div className="text-center py-12 text-gray-400">Loading templates...</div>
      )}
    </div>
  );
}
