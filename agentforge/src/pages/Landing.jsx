import { useNavigate } from 'react-router-dom';

const templates = [
  { icon: '✍️', name: 'Content Agency', agents: 3, desc: 'Writer, editor, and SEO optimizer working together to produce publish-ready content.' },
  { icon: '⚙️', name: 'Dev Team', agents: 4, desc: 'Architect, frontend, backend, and QA agents that ship features end-to-end.' },
  { icon: '📞', name: 'Sales Squad', agents: 3, desc: 'Prospector, outreach, and closer agents that find leads and book meetings.' },
  { icon: '📈', name: 'Trading Desk', agents: 2, desc: 'Analyst and executor agents running strategies on paper or live markets.' },
  { icon: '🔬', name: 'Research Lab', agents: 3, desc: 'Deep researcher, fact-checker, and synthesizer for multi-source analysis.' },
];

const features = [
  { icon: '🤝', title: 'Multi-Agent Teams', desc: 'Agents collaborate, consult each other, and create follow-up tasks automatically.' },
  { icon: '🔄', title: 'ReAct Execution', desc: 'Reason + Act loop with real tool calls, not just chat. Every step is observable.' },
  { icon: '💰', title: 'Spend Controls', desc: 'Per-agent budgets, daily and monthly limits. No surprise bills, ever.' },
  { icon: '🔗', title: 'Pipeline Builder', desc: 'Chain agents into multi-step workflows with dependencies and approval gates.' },
  { icon: '🏪', title: 'Template Marketplace', desc: 'Pre-built agent teams or share your own configurations with the community.' },
  { icon: '🔑', title: 'BYO API Key', desc: 'Use your own OpenRouter or OpenAI key, or pay per credit. Your choice.' },
];

const tiers = [
  { name: 'Free', price: '$0', period: 'forever', credits: '50 credits', agents: '2 agents', highlight: false, cta: 'Get Started' },
  { name: 'Starter', price: '$29', period: '/mo', credits: '500 credits', agents: '4 agents', highlight: false, cta: 'Start Free Trial' },
  { name: 'Pro', price: '$99', period: '/mo', credits: '2,000 credits', agents: 'Unlimited agents', highlight: true, cta: 'Start Free Trial', badge: 'Most Popular', extra: 'BYO API key' },
  { name: 'Team', price: '$299', period: '/mo', credits: '10,000 credits', agents: 'Unlimited agents', highlight: false, cta: 'Contact Us', extra: '5 seats + API access' },
];

export default function Landing() {
  const navigate = useNavigate();

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">AF</div>
            <span className="font-semibold text-lg">AgentForge</span>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm text-gray-600">
            <button onClick={() => scrollTo('how')} className="hover:text-gray-900 transition-colors">How It Works</button>
            <button onClick={() => scrollTo('templates')} className="hover:text-gray-900 transition-colors">Templates</button>
            <button onClick={() => scrollTo('pricing')} className="hover:text-gray-900 transition-colors">Pricing</button>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/login')} className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Log in</button>
            <button onClick={() => navigate('/signup')} className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">Get Started</button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-20 pb-16 sm:pt-28 sm:pb-24 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight">
            AI Agent Teams That{' '}
            <span className="text-indigo-600">Actually Work</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Build, deploy, and manage autonomous AI agent teams. Pick a template, assign tasks, watch them execute. No PhD required.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button onClick={() => navigate('/signup')} className="w-full sm:w-auto px-8 py-3.5 bg-indigo-600 text-white rounded-xl text-base font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/25">
              Get Started Free
            </button>
            <button onClick={() => scrollTo('how')} className="w-full sm:w-auto px-8 py-3.5 bg-gray-100 text-gray-700 rounded-xl text-base font-medium hover:bg-gray-200 transition-colors">
              See How It Works
            </button>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-10 border-y border-gray-100 bg-gray-50/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-sm text-gray-500 mb-4">Built for developers, agencies, and founders</p>
          <div className="flex items-center justify-center gap-8 sm:gap-12 text-gray-400">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-mono font-bold text-gray-500">JS</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-7 h-7 text-gray-400" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="12" r="3" fill="currentColor"/><ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(0 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(120 12 12)"/></svg>
              <span className="text-sm font-medium text-gray-500">React</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-gray-400">⬡</span>
              <span className="text-sm font-medium text-gray-500">Node.js</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-gray-400">⚡</span>
              <span className="text-sm font-medium text-gray-500">OpenAI</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how" className="py-20 sm:py-28 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center">How It Works</h2>
          <p className="mt-4 text-gray-600 text-center text-lg">Three steps to your first autonomous agent team.</p>
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12">
            {[
              { step: '1', title: 'Pick a Team Template', desc: 'Content Agency, Dev Team, Sales Squad, or build your own from scratch.' },
              { step: '2', title: 'Assign Tasks', desc: 'Tell your agents what to do in plain English. They figure out the rest.' },
              { step: '3', title: 'Watch Them Execute', desc: 'Real-time execution trace shows every thought, action, and result.' },
            ].map(s => (
              <div key={s.step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 font-bold text-xl flex items-center justify-center mx-auto">{s.step}</div>
                <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-gray-600 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Template Showcase */}
      <section id="templates" className="py-20 sm:py-28 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center">Agent Team Templates</h2>
          <p className="mt-4 text-gray-600 text-center text-lg">Install in 1 click. Customize everything.</p>
          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map(t => (
              <div key={t.name} className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-indigo-300 hover:shadow-lg transition-all">
                <div className="text-3xl">{t.icon}</div>
                <h3 className="mt-3 font-semibold text-base">{t.name}</h3>
                <p className="mt-1 text-xs text-indigo-600 font-medium">{t.agents} agents</p>
                <p className="mt-3 text-sm text-gray-600 leading-relaxed">{t.desc}</p>
              </div>
            ))}
            <div className="bg-white rounded-2xl p-6 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-center hover:border-indigo-300 transition-colors">
              <span className="text-3xl text-gray-400">+</span>
              <p className="mt-2 font-medium text-gray-600">Build Your Own</p>
              <p className="mt-1 text-xs text-gray-500">Start from scratch</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 sm:py-28 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center">Everything You Need</h2>
          <p className="mt-4 text-gray-600 text-center text-lg">Production-ready agent infrastructure, out of the box.</p>
          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map(f => (
              <div key={f.title}>
                <div className="text-2xl">{f.icon}</div>
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 sm:py-28 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center">Simple, Transparent Pricing</h2>
          <p className="mt-4 text-gray-600 text-center text-lg">Start free. Scale when you're ready.</p>
          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {tiers.map(t => (
              <div key={t.name} className={`rounded-2xl p-6 flex flex-col ${t.highlight ? 'bg-indigo-600 text-white ring-4 ring-indigo-600/20 scale-105' : 'bg-white border border-gray-200'}`}>
                {t.badge && <span className="text-xs font-semibold bg-indigo-500 text-white px-2.5 py-1 rounded-full self-start mb-3">{t.badge}</span>}
                <h3 className={`font-semibold text-lg ${t.highlight ? 'text-white' : ''}`}>{t.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{t.price}</span>
                  <span className={`text-sm ${t.highlight ? 'text-indigo-200' : 'text-gray-500'}`}>{t.period}</span>
                </div>
                <div className={`mt-5 space-y-2.5 text-sm flex-1 ${t.highlight ? 'text-indigo-100' : 'text-gray-600'}`}>
                  <p>✓ {t.credits}</p>
                  <p>✓ {t.agents}</p>
                  {t.extra && <p>✓ {t.extra}</p>}
                  <p>✓ Real-time traces</p>
                  <p>✓ Agent memory</p>
                  <p>✓ Pipeline builder</p>
                </div>
                <button
                  onClick={() => navigate('/signup')}
                  className={`mt-6 w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${t.highlight ? 'bg-white text-indigo-600 hover:bg-indigo-50' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                >
                  {t.cta}
                </button>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-gray-500">
            All plans include: real-time traces, agent memory, pipeline builder, email notifications.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 sm:py-28 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold">Start Building Your Agent Team</h2>
          <p className="mt-4 text-gray-600 text-lg">No credit card required. 50 free credits.</p>
          <button
            onClick={() => navigate('/signup')}
            className="mt-8 px-10 py-4 bg-indigo-600 text-white rounded-xl text-base font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/25"
          >
            Get Started Free
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-10 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">AF</div>
            <span className="font-medium text-sm">AgentForge</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <button onClick={() => navigate('/login')} className="hover:text-gray-700 transition-colors">Log in</button>
            <button onClick={() => navigate('/signup')} className="hover:text-gray-700 transition-colors">Sign up</button>
            <button onClick={() => scrollTo('pricing')} className="hover:text-gray-700 transition-colors">Pricing</button>
          </div>
          <p className="text-xs text-gray-400">&copy; 2026 AgentForge. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
