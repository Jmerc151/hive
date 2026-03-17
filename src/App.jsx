import { useState, useEffect, useCallback, useRef } from 'react'
import { api, BASE, API_KEY, getAuthToken, setSessionToken, getSessionToken } from './lib/api'
import ToastContainer, { useToast } from './components/Toast'
import Sidebar from './components/Sidebar'
import TaskBoard from './components/TaskBoard'
import CreateTaskModal from './components/CreateTaskModal'
import TaskDetail from './components/TaskDetail'
import ChatPanel from './components/ChatPanel'
import MobileNav from './components/MobileNav'
import AgentCards from './components/AgentCards'
import SpendDashboard from './components/SpendDashboard'
import BotGenerator from './components/BotGenerator'
import PromptReviewModal from './components/PromptReviewModal'
import AgentScorecard from './components/AgentScorecard'
import RevenuePanel from './components/RevenuePanel'
import PipelineBuilder from './components/PipelineBuilder'
import EventTriggers from './components/EventTriggers'
import SkillRegistry from './components/SkillRegistry'
import ABTestPanel from './components/ABTestPanel'
import TraceView from './components/TraceView'
import TradingDashboard from './components/TradingDashboard'
import ProposalsPanel from './components/ProposalsPanel'
import HistoryPanel from './components/HistoryPanel'
import SearchBar from './components/SearchBar'
import LiveTraceStream from './components/LiveTraceStream'
import AgentGraph from './components/AgentGraph'
import CostTimeline from './components/CostTimeline'
import IntelFeed from './components/IntelFeed'
import CommandBar from './components/CommandBar'
import SkillRegistryV2 from './components/SkillRegistryV2'
import DeliverablesPanel from './components/DeliverablesPanel'
import DeliverablesFeed from './components/DeliverablesFeed'
import ProjectRoadmap from './components/ProjectRoadmap'
import EvalHarness from './components/EvalHarness'
import KnowledgeBase from './components/KnowledgeBase'
import ScheduledJobs from './components/ScheduledJobs'
import MemoryDashboard from './components/MemoryDashboard'
import AgentSandbox from './components/AgentSandbox'
import UserManagement from './components/UserManagement'
import LoginScreen from './components/LoginScreen'
import MissionControl from './components/MissionControl'
import MCPServers from './components/MCPServers'
import GuardrailMonitor from './components/GuardrailMonitor'
import ErrorBoundary from './components/ErrorBoundary'

export default function App() {
  const { toasts, addToast, removeToast } = useToast()
  const [agents, setAgents] = useState([])
  const [tasks, setTasks] = useState([])
  const [filterAgent, setFilterAgent] = useState(null)
  const [mobileView, setMobileView] = useState('board')
  const [currentUser, setCurrentUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [sseConnected, setSseConnected] = useState(false)

  // Main view state — replaces 25+ individual show* states
  const [activeView, setActiveView] = useState('deliverables')

  // True overlay modals — stack on top of any view
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)
  const [reviewTaskId, setReviewTaskId] = useState(null)
  const [showScorecard, setShowScorecard] = useState(null)
  const [abTestTask, setAbTestTask] = useState(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showSkills, setShowSkills] = useState(null)

  // Check auth on mount
  useEffect(() => {
    const token = getSessionToken()
    if (token || API_KEY) {
      api.getMe().then(user => {
        setCurrentUser(user)
        setAuthChecked(true)
      }).catch(() => {
        setSessionToken(null)
        setAuthChecked(true)
      })
    } else {
      setAuthChecked(true)
    }
  }, [])

  const handleLogin = async (username, password) => {
    const { token, user } = await api.login(username, password)
    setSessionToken(token)
    setCurrentUser(user)
  }

  const handleLogout = async () => {
    try { await api.logout() } catch {}
    setSessionToken(null)
    setCurrentUser(null)
  }

  const refresh = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([api.getAgents(), api.getTasks()])
      setAgents(a)
      setTasks(t)
    } catch (e) {
      console.warn('[refresh] Failed to load data:', e.message)
    }
  }, [])

  const debounceRef = useRef(null)

  const debouncedRefresh = useCallback(() => {
    if (debounceRef.current) return
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      refresh()
    }, 1000)
  }, [refresh])

  useEffect(() => {
    refresh()
    const authToken = getAuthToken()
    const sseUrl = `${BASE}/events/stream${authToken ? `?token=${authToken}` : ''}`
    let es = null
    let reconnectTimer = null

    function connect() {
      es = new EventSource(sseUrl)
      es.addEventListener('connected', () => { setSseConnected(true); refresh() })
      es.addEventListener('task_update', () => debouncedRefresh())
      es.addEventListener('agent_status', () => debouncedRefresh())
      es.addEventListener('spend_update', () => {})
      es.onerror = () => setSseConnected(false)
    }

    connect()
    const fallback = setInterval(refresh, 30000)

    return () => {
      if (es) es.close()
      clearInterval(fallback)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [refresh, debouncedRefresh])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return

      if (e.key === 'Escape') {
        // Close overlay modals first (highest priority)
        if (selectedTask) { setSelectedTask(null); return }
        if (showCreate) { setShowCreate(false); return }
        if (reviewTaskId) { setReviewTaskId(null); return }
        if (abTestTask) { setAbTestTask(null); return }
        if (showScorecard) { setShowScorecard(null); return }
        if (showSkills) { setShowSkills(null); return }
        if (showShortcuts) { setShowShortcuts(false); return }
        // Navigate back to default view
        setActiveView('deliverables')
        return
      }

      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setShowCreate(true)
        return
      }

      if (e.key === '?' && e.shiftKey) {
        e.preventDefault()
        setShowShortcuts(prev => !prev)
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedTask, showCreate, reviewTaskId, abTestTask, showScorecard, showSkills, showShortcuts])

  useEffect(() => {
    async function setupPush() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
      try {
        const reg = await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        if (existing) return
        const { key } = await api.getVapidKey()
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
        await api.subscribePush(sub.toJSON())
      } catch (e) {
        console.log('Push subscription skipped:', e.message)
      }
    }
    setupPush()
  }, [])

  const handleCreateTask = async (data) => {
    await api.createTask(data)
    setShowCreate(false)
    refresh()
  }

  const handleRunTask = (taskId) => setReviewTaskId(taskId)

  const handleDirectRun = async (taskId) => {
    await api.runTask(taskId)
    refresh()
  }

  const handleUpdateTask = async (taskId, data) => {
    await api.updateTask(taskId, data)
    refresh()
  }

  const handleDeleteTask = async (taskId) => {
    await api.deleteTask(taskId)
    setSelectedTask(null)
    refresh()
  }

  const handleStopAgent = async (agentId) => {
    await api.stopAgent(agentId)
    refresh()
  }

  const filteredTasks = filterAgent ? tasks.filter(t => t.agent_id === filterAgent) : tasks
  const activeCount = agents.filter(a => a.isRunning).length
  const goBack = () => setActiveView('deliverables')

  if (authChecked && !currentUser && !API_KEY) {
    return <LoginScreen onLogin={handleLogin} />
  }

  // Render the active view inline (no modal overlay)
  const renderActiveView = () => {
    switch (activeView) {
      case 'deliverables':
        return (
          <DeliverablesFeed
            agents={agents}
            tasks={tasks}
            filterAgent={filterAgent}
            onSelectTask={setSelectedTask}
            onNewTask={() => setShowCreate(true)}
            onNav={(key) => setActiveView(key)}
          />
        )
      case 'graph':
        return <AgentGraph inline onClose={goBack} />
      case 'analytics':
        return <CostTimeline inline onClose={goBack} />
      case 'intel':
        return <IntelFeed inline onClose={goBack} />
      case 'skillsV2':
        return <SkillRegistryV2 inline onClose={goBack} />
      case 'projects':
        return <ProjectRoadmap inline agents={agents} onClose={goBack} onSelectTask={(id) => { setActiveView('deliverables'); setSelectedTask(id) }} />
      case 'history':
        return <HistoryPanel inline agents={agents} onSelectTask={(id) => { setSelectedTask(id) }} onClose={goBack} />
      case 'trace':
        return <LiveTraceStream inline onClose={goBack} />
      case 'triggers':
        return <EventTriggers inline agents={agents} pipelines={[]} onClose={goBack} />
      case 'pipelines':
        return <PipelineBuilder inline agents={agents} onClose={goBack} />
      case 'revenue':
        return <RevenuePanel inline agents={agents} onClose={goBack} />
      case 'trading':
        return <TradingDashboard inline agents={agents} onClose={goBack} />
      case 'proposals':
        return <ProposalsPanel inline agents={agents} onClose={goBack} />
      case 'botGen':
        return <BotGenerator inline onSubmit={(data) => { handleCreateTask(data); setActiveView('deliverables') }} onClose={goBack} />
      case 'sandbox':
        return <AgentSandbox inline agents={agents} onClose={goBack} />
      case 'eval':
        return <EvalHarness inline onClose={goBack} agents={agents} />
      case 'knowledge':
        return <KnowledgeBase inline onClose={goBack} />
      case 'schedule':
        return <ScheduledJobs inline agents={agents} onClose={goBack} />
      case 'memory':
        return <MemoryDashboard inline agents={agents} onClose={goBack} />
      case 'spend':
        return <SpendDashboard inline onClose={goBack} />
      case 'chat':
        return <ChatPanel inline agents={agents} onClose={goBack} onToast={addToast} />
      case 'users':
        return <UserManagement inline onClose={goBack} />
      case 'mission':
        return <MissionControl inline agents={agents} onClose={goBack} onSelectTask={(task) => { setActiveView('deliverables'); setSelectedTask(task) }} />
      case 'mcp':
        return <MCPServers inline onClose={goBack} />
      case 'guardrails':
        return <GuardrailMonitor inline onClose={goBack} />
      case 'deliverablesFull':
        return <DeliverablesPanel inline agents={agents} onClose={goBack} />
      default:
        return null
    }
  }

  return (
    <div className="flex h-screen h-[100dvh] overflow-hidden bg-page">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar
          agents={agents}
          filterAgent={filterAgent}
          onFilterAgent={setFilterAgent}
          onStopAgent={handleStopAgent}
          onNewTask={() => setShowCreate(true)}
          taskCount={tasks.length}
          onScorecard={(agent) => setShowScorecard(agent)}
          onSkills={(agent) => setShowSkills(agent)}
          currentUser={currentUser}
          onLogout={handleLogout}
          activeView={activeView}
          onNav={setActiveView}
        />
      </div>

      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* Topbar */}
        <header className="bg-s2 flex items-center gap-[10px] px-4 md:px-[20px] pt-3 pb-[10px] safe-top flex-shrink-0" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.07)' }}>
          <h1 className="font-display text-[22px] text-t1 tracking-[2px] leading-none">HIVE</h1>
          <div className="flex items-center gap-[5px]" title={sseConnected ? 'Live — real-time updates active' : 'Reconnecting\u2026'}>
            <span className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${sseConnected ? 'bg-success' : 'bg-warning dot-pulse'}`} />
            <span className={`text-[10px] hidden sm:inline ${sseConnected ? 'text-t4' : 'text-warning'}`}>
              {sseConnected ? 'Live' : 'Reconnecting'}
            </span>
          </div>
          {activeCount > 0 && (
            <div className="flex items-center gap-[5px] text-[10px] font-medium text-success px-[7px] py-[3px] rounded-[8px]" style={{ background: 'rgba(40,167,69,0.09)', border: '0.5px solid rgba(40,167,69,0.2)' }}>
              <span className="w-[5px] h-[5px] rounded-full bg-success dot-pulse" />
              {activeCount} active
            </div>
          )}
          <div className="flex-1 hidden md:block max-w-md mx-auto">
            <CommandBar agents={agents} onTaskCreated={() => refresh()} />
          </div>
          <div className="flex-1 md:hidden" />
          <SearchBar agents={agents} onSelectTask={setSelectedTask} />
        </header>

        {/* Mobile views */}
        {mobileView === 'agents' && (
          <div className="md:hidden flex-1 overflow-y-auto">
            <AgentCards agents={agents} tasks={tasks} filterAgent={filterAgent} onFilterAgent={setFilterAgent} onStopAgent={handleStopAgent} />
          </div>
        )}
        {mobileView === 'trace' && (
          <div className="md:hidden flex-1 overflow-hidden">
            <LiveTraceStream onClose={() => setMobileView('board')} embedded />
          </div>
        )}
        {mobileView === 'chat' && (
          <div className="md:hidden flex-1 overflow-hidden flex flex-col">
            <ChatPanel agents={agents} embedded onToast={addToast} isMobile />
          </div>
        )}

        {/* Desktop: Main content area — renders active view */}
        <ErrorBoundary>
        <div className="flex-1 overflow-hidden hidden md:flex flex-col">
          {/* Agent strip — only show on deliverables view */}
          {activeView === 'deliverables' && (
            <div className="hidden md:flex gap-[6px] px-[20px] py-2 bg-s2 overflow-x-auto flex-shrink-0" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.07)' }}>
              {(() => {
                const AGENT_ROLES = { scout: 'Research', forge: 'Build', quill: 'Write', dealer: 'Sell', oracle: 'Analyze', nexus: 'Manage' }
                return agents.map(agent => {
                  const agentTask = tasks.find(t => t.agent_id === agent.id && t.status === 'in_progress')
                  const isActive = !!agentTask
                  const isFiltered = filterAgent === agent.id
                  const agentDoneCount = tasks.filter(t => t.agent_id === agent.id && t.status === 'done').length
                  const statusText = isActive ? 'Working' : agentDoneCount > 0 ? `${agentDoneCount} done` : AGENT_ROLES[agent.id] || 'Idle'
                  return (
                    <div
                      key={agent.id}
                      className={`flex-shrink-0 flex items-center gap-[6px] py-[5px] pl-2 pr-[10px] rounded-[18px] cursor-pointer transition-all whitespace-nowrap ${
                        isFiltered ? 'bg-t1 text-white' : 'bg-s3 hover:bg-card'
                      }`}
                      style={{ border: isFiltered ? '0.5px solid var(--color-t1)' : '0.5px solid rgba(0,0,0,0.07)' }}
                      onClick={() => setFilterAgent(filterAgent === agent.id ? null : agent.id)}
                    >
                      <span className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${
                        isActive ? `bg-success ${isFiltered ? '' : 'dot-pulse'}` : isFiltered ? 'bg-white/50' : 'bg-t5'
                      }`} />
                      <span className={`text-xs font-medium ${isFiltered ? 'text-white' : 'text-t1'}`}>{agent.name}</span>
                      <span className={`text-[10px] ${isFiltered ? 'text-white/55' : 'text-t4'}`}>{statusText}</span>
                    </div>
                  )
                })
              })()}
            </div>
          )}

          {/* Active view */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {renderActiveView()}
          </div>
        </div>

        {/* Mobile: Full task board */}
        <div className={`flex-1 overflow-hidden md:hidden ${mobileView !== 'board' ? 'hidden' : 'flex'}`}>
          <TaskBoard tasks={filteredTasks} agents={agents} onSelectTask={setSelectedTask} onRunTask={handleRunTask} onUpdateTask={handleUpdateTask} />
        </div>
        </ErrorBoundary>
      </main>

      {/* Mobile bottom nav */}
      <MobileNav view={mobileView} onChangeView={setMobileView} activeCount={activeCount} onNewTask={() => setShowCreate(true)} />

      {/* TRUE overlay modals — stack on any view */}
      {showCreate && (
        <CreateTaskModal agents={agents} onSubmit={handleCreateTask} onClose={() => setShowCreate(false)} />
      )}

      {selectedTask && (
        <TaskDetail
          task={tasks.find(t => t.id === selectedTask)}
          agent={agents.find(a => a.id === tasks.find(t => t.id === selectedTask)?.agent_id)}
          agents={agents}
          onClose={() => setSelectedTask(null)}
          onRun={handleRunTask}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
          onAbTest={(task) => { setAbTestTask(task); setSelectedTask(null) }}
        />
      )}

      {reviewTaskId && (
        <PromptReviewModal
          task={tasks.find(t => t.id === reviewTaskId)}
          agent={agents.find(a => a.id === tasks.find(t => t.id === reviewTaskId)?.agent_id)}
          onRun={(taskId) => { handleDirectRun(taskId); setReviewTaskId(null) }}
          onClose={() => setReviewTaskId(null)}
        />
      )}

      {showScorecard && (
        <AgentScorecard agent={showScorecard} onClose={() => setShowScorecard(null)} />
      )}

      {abTestTask && (
        <ABTestPanel task={abTestTask} agent={agents.find(a => a.id === abTestTask?.agent_id)} onClose={() => setAbTestTask(null)} />
      )}

      {showSkills && (
        <SkillRegistry agent={showSkills} onClose={() => setShowSkills(null)} />
      )}

      {/* Mobile CommandBar */}
      {mobileView !== 'chat' && (
        <div className="md:hidden">
          <CommandBar agents={agents} onTaskCreated={() => refresh()} />
        </div>
      )}

      {/* Keyboard shortcuts help */}
      {showShortcuts && (
        <div className="modal-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="modal-backdrop" />
          <div className="modal-content p-6 max-w-sm w-full">
            <h3 className="font-display text-xl tracking-wider text-t1 mb-4">KEYBOARD SHORTCUTS</h3>
            <div className="space-y-2 text-sm">
              {[
                ['\u2318K', 'Command bar'],
                ['N', 'New task'],
                ['Esc', 'Close panel'],
                ['?', 'This help'],
              ].map(([key, desc]) => (
                <div key={key} className="flex justify-between">
                  <kbd className="px-2 py-0.5 bg-s3 rounded text-t2 font-mono text-xs" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>{key}</kbd>
                  <span className="text-t3">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
