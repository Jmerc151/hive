import { useState, useEffect } from 'react';
import { api } from '../lib/api';

const TEMPLATES = [
  {
    id: 'content-agency',
    name: 'Content Agency',
    description: 'A team that researches trends, writes articles, manages social media, and optimizes for SEO.',
    icon: '✦',
    agentCount: 4,
    agents: ['Researcher', 'Writer', 'Editor', 'Social Manager'],
    exampleTask: 'Research 5 trending topics in AI this week',
  },
  {
    id: 'dev-team',
    name: 'Dev Team',
    description: 'Agents that architect, code, review, and test software projects end to end.',
    icon: '⚙',
    agentCount: 4,
    agents: ['Architect', 'Developer', 'Reviewer', 'QA Tester'],
    exampleTask: 'Design the architecture for a todo app API',
  },
  {
    id: 'sales-squad',
    name: 'Sales Squad',
    description: 'Prospect, qualify leads, draft outreach emails, and track your sales pipeline.',
    icon: '◆',
    agentCount: 3,
    agents: ['Prospector', 'Outreach Agent', 'Deal Closer'],
    exampleTask: 'Find 5 SaaS companies that might need AI automation',
  },
  {
    id: 'trading-desk',
    name: 'Trading Desk',
    description: 'Analyze markets, backtest strategies, and execute paper trades with risk management.',
    icon: '◈',
    agentCount: 3,
    agents: ['Analyst', 'Strategist', 'Trader'],
    exampleTask: 'Analyze the current S&P 500 trend and key support/resistance levels',
  },
  {
    id: 'research-lab',
    name: 'Research Lab',
    description: 'Deep research, competitive analysis, and report generation across any domain.',
    icon: '◉',
    agentCount: 3,
    agents: ['Researcher', 'Analyst', 'Report Writer'],
    exampleTask: 'Research the top 5 AI agent platforms and compare their features',
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Start from scratch and build your own agent team tailored to your needs.',
    icon: '◇',
    agentCount: 0,
    agents: [],
    exampleTask: '',
  },
];

const STORAGE_KEY = 'af_onboarding';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { step: 0, workspaceName: '', templateId: '', apiKey: '', taskDescription: '' };
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearOnboarding() {
  localStorage.removeItem(STORAGE_KEY);
}

export default function Onboarding({ onComplete }) {
  const [state, setState] = useState(loadState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { step, workspaceName, templateId, apiKey, taskDescription } = state;
  const selectedTemplate = TEMPLATES.find(t => t.id === templateId);

  useEffect(() => {
    saveState(state);
  }, [state]);

  function update(patch) {
    setState(prev => ({ ...prev, ...patch }));
    setError('');
  }

  async function nextStep() {
    setError('');
    setLoading(true);
    try {
      if (step === 0) {
        if (!workspaceName.trim()) { setError('Please enter a workspace name.'); setLoading(false); return; }
        await api.updateWorkspace({ name: workspaceName.trim() }).catch(() => {});
        update({ step: 1 });
      } else if (step === 1) {
        if (!templateId) { setError('Please select a template.'); setLoading(false); return; }
        if (templateId !== 'custom') {
          await api.installTemplate(templateId).catch(() => {});
        }
        const tpl = TEMPLATES.find(t => t.id === templateId);
        update({ step: 2, taskDescription: state.taskDescription || tpl?.exampleTask || '' });
      } else if (step === 2) {
        if (apiKey.trim()) {
          await api.saveApiKey(apiKey.trim()).catch(() => {});
        }
        update({ step: 3 });
      } else if (step === 3) {
        if (taskDescription.trim()) {
          await api.createTask({ description: taskDescription.trim() }).catch(() => {});
        }
        update({ step: 4 });
      } else if (step === 4) {
        clearOnboarding();
        onComplete();
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const stepLabels = ['Welcome', 'Template', 'API Key', 'First Task', 'Done'];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Progress bar */}
      <div className="w-full bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            {stepLabels.map((label, i) => (
              <div key={label} className="flex items-center gap-1.5">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                    i < step
                      ? 'bg-indigo-600 text-white'
                      : i === step
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {i < step ? '✓' : i + 1}
                </div>
                <span className={`text-xs hidden sm:inline ${i <= step ? 'text-indigo-600 font-medium' : 'text-gray-400'}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${(step / (stepLabels.length - 1)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
              <div className="text-4xl mb-4">◈</div>
              <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-brand)' }}>
                Welcome to AgentForge
              </h1>
              <p className="text-gray-500 mb-8 max-w-md mx-auto">
                Build AI agent teams that actually do things. Research, code, sell, trade — your agents work together autonomously.
              </p>
              <div className="max-w-sm mx-auto text-left">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Workspace name
                </label>
                <input
                  type="text"
                  placeholder="My Company"
                  value={workspaceName}
                  onChange={e => update({ workspaceName: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                  onKeyDown={e => e.key === 'Enter' && nextStep()}
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
              <button
                onClick={nextStep}
                disabled={loading}
                className="mt-6 px-8 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {loading ? '...' : 'Get Started'}
              </button>
            </div>
          )}

          {/* Step 1: Pick Template */}
          {step === 1 && (
            <div>
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold">Pick a template</h2>
                <p className="text-sm text-gray-500 mt-1">Choose a pre-built agent team or start from scratch.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {TEMPLATES.map(tpl => (
                  <button
                    key={tpl.id}
                    onClick={() => update({ templateId: tpl.id })}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      templateId === tpl.id
                        ? 'border-indigo-600 bg-indigo-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-lg">{tpl.icon}</span>
                      <span className="font-semibold text-sm">{tpl.name}</span>
                      {tpl.agentCount > 0 && (
                        <span className="ml-auto text-xs text-gray-400">{tpl.agentCount} agents</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{tpl.description}</p>
                    {tpl.agents.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tpl.agents.map(a => (
                          <span key={a} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {error && <p className="text-sm text-red-500 mt-3 text-center">{error}</p>}
              <div className="flex justify-between mt-6">
                <button
                  onClick={() => update({ step: 0 })}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Back
                </button>
                <button
                  onClick={nextStep}
                  disabled={loading}
                  className="px-8 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? '...' : 'Continue'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: API Key */}
          {step === 2 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
              <h2 className="text-xl font-bold mb-2">Connect your API key</h2>
              <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                Connect your OpenRouter API key for unlimited usage, or use credits to get started.
              </p>
              <div className="max-w-sm mx-auto text-left">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  OpenRouter API Key <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="password"
                  placeholder="sk-or-..."
                  value={apiKey}
                  onChange={e => update({ apiKey: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-mono"
                  onKeyDown={e => e.key === 'Enter' && nextStep()}
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  Get a key at <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">openrouter.ai</a>
                </p>
              </div>
              {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
              <div className="flex justify-between mt-6 max-w-sm mx-auto">
                <button
                  onClick={() => update({ step: 1 })}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Back
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => { update({ apiKey: '' }); nextStep(); }}
                    className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Skip
                  </button>
                  <button
                    onClick={nextStep}
                    disabled={loading}
                    className="px-8 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {loading ? '...' : 'Continue'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: First Task */}
          {step === 3 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
              <h2 className="text-xl font-bold mb-2">Create your first task</h2>
              <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                Give your agents something to work on. You can always change this later.
              </p>
              <div className="max-w-md mx-auto text-left">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Task description
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe what you want your agents to do..."
                  value={taskDescription}
                  onChange={e => update({ taskDescription: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none"
                />
              </div>
              {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
              <div className="flex justify-between mt-6 max-w-md mx-auto">
                <button
                  onClick={() => update({ step: 2 })}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Back
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => { update({ taskDescription: '' }); nextStep(); }}
                    className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Skip
                  </button>
                  <button
                    onClick={nextStep}
                    disabled={loading}
                    className="px-8 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {loading ? '...' : 'Create & Continue'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 4 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
              <div className="text-4xl mb-4">✓</div>
              <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-brand)' }}>
                You're all set!
              </h2>
              <p className="text-gray-500 mb-8 max-w-md mx-auto">
                Your workspace <strong>{workspaceName}</strong> is ready.
                {selectedTemplate && selectedTemplate.id !== 'custom' && (
                  <> The <strong>{selectedTemplate.name}</strong> template has been installed.</>
                )}
              </p>
              <button
                onClick={nextStep}
                disabled={loading}
                className="px-8 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
