import { useState, useEffect, useCallback, useRef } from 'react'
import { api, BASE, API_KEY } from './lib/api'
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
import ProjectsPanel from './components/ProjectsPanel'
import HistoryPanel from './components/HistoryPanel'
import SearchBar from './components/SearchBar'
import LiveTraceStream from './components/LiveTraceStream'
import AgentGraph from './components/AgentGraph'
import CostTimeline from './components/CostTimeline'
import IntelFeed from './components/IntelFeed'
import CommandBar from './components/CommandBar'
import SkillRegistryV2 from './components/SkillRegistryV2'
import DeliverablesPanel from './components/DeliverablesPanel'
import EvalHarness from './components/EvalHarness'
import KnowledgeBase from './components/KnowledgeBase'
import ScheduledJobs from './components/ScheduledJobs'
import MemoryDashboard from './components/MemoryDashboard'
import ErrorBoundary from './components/ErrorBoundary'

export default function App() {
  const { toasts, addToast, removeToast } = useToast()
  const [agents, setAgents] = useState([])
  const [tasks, setTasks] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)
  const [filterAgent, setFilterAgent] = useState(null)
  const [showChat, setShowChat] = useState(false)
  const [showSpend, setShowSpend] = useState(false)
  const [showBotGen, setShowBotGen] = useState(false)
  const [reviewTaskId, setReviewTaskId] = useState(null)
  const [mobileView, setMobileView] = useState('board')
  const [showScorecard, setShowScorecard] = useState(null) // agent object
  const [showRevenue, setShowRevenue] = useState(false)
  const [showPipelines, setShowPipelines] = useState(false)
  const [showTriggers, setShowTriggers] = useState(false)
  const [showSkills, setShowSkills] = useState(null) // agent object
  const [abTestTask, setAbTestTask] = useState(null) // task object
  const [showTrading, setShowTrading] = useState(false)
  const [showProposals, setShowProposals] = useState(false)
  const [showProjects, setShowProjects] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showTrace, setShowTrace] = useState(false)
  const [showGraph, setShowGraph] = useState(false)
  const [showCostTimeline, setShowCostTimeline] = useState(false)
  const [showIntel, setShowIntel] = useState(false)
  const [showSkillsV2, setShowSkillsV2] = useState(false)
  const [showDeliverables, setShowDeliverables] = useState(false)
  const [showEval, setShowEval] = useState(false)
  const [showKnowledge, setShowKnowledge] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [showMemory, setShowMemory] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)

  const refresh = useCallback(async () => {
    const [a, t] = await Promise.all([api.getAgents(), api.getTasks()])
    setAgents(a)
    setTasks(t)
  }, [])

  const [sseConnected, setSseConnected] = useState(false)
  const debounceRef = useRef(null)

  // Debounced refresh — batches rapid SSE events into one fetch per second
  const debouncedRefresh = useCallback(() => {
    if (debounceRef.current) return
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      refresh()
    }, 1000)
  }, [refresh])

  useEffect(() => {
    // Initial fetch
    refresh()

    // SSE connection for real-time updates
    const sseUrl = `${BASE}/events/stream${API_KEY ? `?token=${API_KEY}` : ''}`
    let es = null
    let reconnectTimer = null

    function connect() {
      es = new EventSource(sseUrl)

      es.addEventListener('connected', () => {
        setSseConnected(true)
        refresh() // Full refresh on reconnect
      })

      es.addEventListener('task_update', () => {
        debouncedRefresh()
      })

      es.addEventListener('agent_status', () => {
        debouncedRefresh()
      })

      es.addEventListener('spend_update', () => {
        // Spend updates don't need task/agent refresh
      })

      es.onerror = () => {
        setSseConnected(false)
        // EventSource auto-reconnects, but we mark disconnected
      }
    }

    connect()

    // Fallback poll every 30s for robustness
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
        setShowCreate(false)
        setSelectedTask(null)
        setShowSpend(false)
        setShowBotGen(false)
        setReviewTaskId(null)
        setShowScorecard(null)
        setShowRevenue(false)
        setShowPipelines(false)
        setShowTriggers(false)
        setShowSkills(null)
        setAbTestTask(null)
        setShowTrading(false)
        setShowProposals(false)
        setShowProjects(false)
        setShowHistory(false)
        setShowTrace(false)
        setShowGraph(false)
        setShowCostTimeline(false)
        setShowIntel(false)
        setShowSkillsV2(false)
        setShowDeliverables(false)
        setShowEval(false)
        setShowKnowledge(false)
        setShowSchedule(false)
        setShowMemory(false)
        setShowShortcuts(false)
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
  }, [])

  useEffect(() => {
    async function setupPush() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
      try {
        const reg = await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        if (existing) return

        const { key } = await api.getVapidKey()
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key
        })
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

  const handleRunTask = (taskId) => {
    setReviewTaskId(taskId)
  }

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

  const filteredTasks = filterAgent
    ? tasks.filter(t => t.agent_id === filterAgent)
    : tasks

  const activeCount = agents.filter(a => a.isRunning).length

  return (
    <div className="flex h-screen h-[100dvh] overflow-hidden bg-hive-900">
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
          onNav={(key) => {
            const navMap = {
              deliverables: () => setShowDeliverables(true),
              graph: () => setShowGraph(true),
              analytics: () => setShowCostTimeline(true),
              intel: () => setShowIntel(true),
              skillsV2: () => setShowSkillsV2(true),
              projects: () => setShowProjects(true),
              history: () => setShowHistory(true),
              trace: () => setShowTrace(true),
              triggers: () => setShowTriggers(true),
              pipelines: () => setShowPipelines(true),
              revenue: () => setShowRevenue(true),
              trading: () => setShowTrading(true),
              proposals: () => setShowProposals(true),
              botGen: () => setShowBotGen(true),
              eval: () => setShowEval(true),
              knowledge: () => setShowKnowledge(true),
              schedule: () => setShowSchedule(true),
              memory: () => setShowMemory(true),
              spend: () => setShowSpend(true),
              chat: () => setShowChat(true),
            }
            navMap[key]?.()
          }}
        />
      </div>

      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-4 md:px-6 py-2 md:py-3 border-b border-hive-700/50 bg-hive-900/80 backdrop-blur-xl safe-top">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-honey to-honey-dim flex items-center justify-center shadow-lg shadow-honey/20">
              <span className="text-base">🐝</span>
            </div>
            <div>
              <h1 className="text-base md:text-lg font-bold tracking-tight">Hive Command Center</h1>
              <p className="text-xs text-hive-400">
                {`${tasks.length} tasks · ${activeCount} active`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${sseConnected ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} title={sseConnected ? 'Live connected' : 'Reconnecting...'} />
            {activeCount > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-honey/10 border border-honey/20 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-honey animate-pulse" />
                <span className="text-xs font-medium text-honey">{activeCount} running</span>
              </div>
            )}
            <SearchBar agents={agents} onSelectTask={setSelectedTask} />
            <button
              onClick={() => setShowCreate(true)}
              aria-label="New task"
              className="flex items-center gap-1 px-3 py-2 bg-gradient-to-r from-honey to-honey-dim text-white rounded-xl font-medium text-sm shadow-lg shadow-honey/20 hover:shadow-honey/30 transition-all active:scale-95"
            >
              <span className="text-lg leading-none">+</span>
              <span className="hidden sm:inline">New Task</span>
            </button>
          </div>
        </header>

        {/* Mobile views */}
        {mobileView === 'agents' && (
          <div className="md:hidden flex-1 overflow-y-auto">
            <AgentCards
              agents={agents}
              tasks={tasks}
              filterAgent={filterAgent}
              onFilterAgent={setFilterAgent}
              onStopAgent={handleStopAgent}
            />
          </div>
        )}
        {mobileView === 'trace' && (
          <div className="md:hidden flex-1 overflow-hidden">
            <LiveTraceStream onClose={() => setMobileView('board')} embedded />
          </div>
        )}
        {mobileView === 'chat' && (
          <div className="md:hidden flex-1 overflow-hidden flex flex-col pb-16">
            <ChatPanel agents={agents} embedded onToast={addToast} />
          </div>
        )}

        {/* Desktop: Split layout — Chat left, Dashboard right */}
        <ErrorBoundary>
        <div className={`flex-1 overflow-hidden ${mobileView !== 'board' ? 'hidden md:flex' : 'flex'}`}>
          {/* Left: Chat panel (40%) */}
          <div className="hidden md:flex md:w-[40%] lg:w-[38%] border-r border-hive-700/50 flex-col">
            <ChatPanel agents={agents} embedded onToast={addToast} />
          </div>

          {/* Right: Activity dashboard (60%) */}
          <div className="flex-1 overflow-y-auto">
            {/* Agent status strip */}
            <div className="p-3 border-b border-hive-700/30">
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {agents.map(agent => {
                  const agentTask = tasks.find(t => t.agent_id === agent.id && t.status === 'in_progress')
                  return (
                    <div
                      key={agent.id}
                      className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border transition-all cursor-pointer ${
                        agentTask
                          ? 'bg-green-500/5 border-green-500/20'
                          : 'bg-hive-800/50 border-hive-700/30'
                      } ${filterAgent === agent.id ? 'ring-1 ring-honey' : ''}`}
                      onClick={() => setFilterAgent(filterAgent === agent.id ? null : agent.id)}
                    >
                      <span className="text-base">{agent.avatar}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{agent.name}</div>
                        <div className="text-[10px] text-hive-400 truncate max-w-[120px]">
                          {agentTask ? agentTask.title : 'Idle'}
                        </div>
                      </div>
                      {agentTask && <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Task board */}
            <div className="flex-1">
              <TaskBoard
                tasks={filteredTasks}
                agents={agents}
                onSelectTask={setSelectedTask}
                onRunTask={handleRunTask}
                onUpdateTask={handleUpdateTask}
              />
            </div>
          </div>
        </div>

        {/* Mobile: Full task board (no split) */}
        <div className={`flex-1 overflow-hidden md:hidden ${mobileView !== 'board' ? 'hidden' : 'flex'}`}>
          <TaskBoard
            tasks={filteredTasks}
            agents={agents}
            onSelectTask={setSelectedTask}
            onRunTask={handleRunTask}
            onUpdateTask={handleUpdateTask}
          />
        </div>
        </ErrorBoundary>
      </main>

      {/* Mobile bottom nav */}
      <MobileNav
        view={mobileView}
        onChangeView={setMobileView}
        activeCount={activeCount}
        onNewTask={() => setShowCreate(true)}
      />

      {/* Modals */}
      {showCreate && (
        <CreateTaskModal
          agents={agents}
          onSubmit={handleCreateTask}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Chat is now embedded in main layout — modal removed */}

      {showSpend && (
        <SpendDashboard onClose={() => setShowSpend(false)} />
      )}

      {showBotGen && (
        <BotGenerator
          onSubmit={(data) => { handleCreateTask(data); setShowBotGen(false) }}
          onClose={() => setShowBotGen(false)}
        />
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
        <AgentScorecard
          agent={showScorecard}
          onClose={() => setShowScorecard(null)}
        />
      )}

      {showRevenue && (
        <RevenuePanel
          agents={agents}
          onClose={() => setShowRevenue(false)}
        />
      )}

      {showPipelines && (
        <PipelineBuilder
          agents={agents}
          onClose={() => setShowPipelines(false)}
        />
      )}

      {showTriggers && (
        <EventTriggers
          agents={agents}
          pipelines={[]}
          onClose={() => setShowTriggers(false)}
        />
      )}

      {showSkills && (
        <SkillRegistry
          agent={showSkills}
          onClose={() => setShowSkills(null)}
        />
      )}

      {showTrading && (
        <TradingDashboard
          agents={agents}
          onClose={() => setShowTrading(false)}
        />
      )}

      {showProposals && (
        <ProposalsPanel
          agents={agents}
          onClose={() => setShowProposals(false)}
        />
      )}

      {abTestTask && (
        <ABTestPanel
          task={abTestTask}
          agent={agents.find(a => a.id === abTestTask?.agent_id)}
          onClose={() => setAbTestTask(null)}
        />
      )}

      {showProjects && (
        <ProjectsPanel
          agents={agents}
          onSelectTask={(id) => { setSelectedTask(id); setShowProjects(false) }}
          onClose={() => setShowProjects(false)}
        />
      )}

      {showHistory && (
        <HistoryPanel
          agents={agents}
          onSelectTask={(id) => { setSelectedTask(id); setShowHistory(false) }}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showTrace && (
        <LiveTraceStream onClose={() => setShowTrace(false)} />
      )}

      {showGraph && (
        <AgentGraph onClose={() => setShowGraph(false)} />
      )}

      {showCostTimeline && (
        <CostTimeline onClose={() => setShowCostTimeline(false)} />
      )}

      {showIntel && (
        <IntelFeed onClose={() => setShowIntel(false)} />
      )}

      {showSkillsV2 && (
        <SkillRegistryV2 onClose={() => setShowSkillsV2(false)} />
      )}

      {showEval && (
        <EvalHarness onClose={() => setShowEval(false)} agents={agents} />
      )}
      {showDeliverables && (
        <DeliverablesPanel
          agents={agents}
          onClose={() => setShowDeliverables(false)}
        />
      )}

      {showKnowledge && (
        <KnowledgeBase onClose={() => setShowKnowledge(false)} />
      )}

      {showSchedule && (
        <ScheduledJobs agents={agents} onClose={() => setShowSchedule(false)} />
      )}

      {showMemory && (
        <MemoryDashboard agents={agents} onClose={() => setShowMemory(false)} />
      )}

      {/* Mobile CommandBar — hide when chat is open since chat has its own input */}
      {mobileView !== 'chat' && (
        <div className="md:hidden">
          <CommandBar agents={agents} onTaskCreated={() => refresh()} />
        </div>
      )}

      {/* Keyboard shortcuts help */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowShortcuts(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-hive-800 border border-hive-700 rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-hive-100 mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-2 text-sm">
              {[
                ['⌘K', 'Command bar'],
                ['N', 'New task'],
                ['Esc', 'Close panel'],
                ['?', 'This help'],
              ].map(([key, desc]) => (
                <div key={key} className="flex justify-between">
                  <kbd className="px-2 py-0.5 bg-hive-700 rounded text-hive-300 font-mono text-xs">{key}</kbd>
                  <span className="text-hive-400">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
