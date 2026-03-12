import { useState, useEffect, useCallback } from 'react'
import { api } from './lib/api'
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

export default function App() {
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

  const refresh = useCallback(async () => {
    const [a, t] = await Promise.all([api.getAgents(), api.getTasks()])
    setAgents(a)
    setTasks(t)
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 3000)
    return () => clearInterval(interval)
  }, [refresh])

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
        />
      </div>

      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-hive-700/50 bg-hive-900/80 backdrop-blur-xl safe-top">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-honey to-honey-dim flex items-center justify-center shadow-lg shadow-honey/20">
              <span className="text-base">🐝</span>
            </div>
            <div>
              <h1 className="text-base md:text-lg font-bold tracking-tight">Hive</h1>
              <p className="text-xs text-hive-400">
                {filterAgent
                  ? agents.find(a => a.id === filterAgent)?.name || filterAgent
                  : `${tasks.length} tasks · ${activeCount} active`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-honey/10 border border-honey/20 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-honey animate-pulse" />
                <span className="text-xs font-medium text-honey">{activeCount} running</span>
              </div>
            )}
            <SearchBar agents={agents} onSelectTask={setSelectedTask} />
            <button
              onClick={() => setShowProjects(true)}
              className="hidden lg:flex items-center gap-1.5 px-3 py-2 bg-hive-800 text-hive-200 rounded-xl text-sm hover:bg-hive-700 transition-colors border border-hive-700"
            >
              📁 <span className="hidden xl:inline">Projects</span>
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="hidden lg:flex items-center gap-1.5 px-3 py-2 bg-hive-800 text-hive-200 rounded-xl text-sm hover:bg-hive-700 transition-colors border border-hive-700"
            >
              📜 <span className="hidden xl:inline">History</span>
            </button>
            <button
              onClick={() => setShowTrace(true)}
              className="hidden lg:flex items-center gap-1.5 px-3 py-2 bg-hive-800 text-hive-200 rounded-xl text-sm hover:bg-hive-700 transition-colors border border-hive-700"
            >
              📡 <span className="hidden xl:inline">Trace</span>
            </button>
            <button
              onClick={() => setShowTriggers(true)}
              className="hidden lg:flex items-center gap-1.5 px-3 py-2 bg-hive-800 text-hive-200 rounded-xl text-sm hover:bg-hive-700 transition-colors border border-hive-700"
            >
              ⚡ <span className="hidden xl:inline">Triggers</span>
            </button>
            <button
              onClick={() => setShowPipelines(true)}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-hive-800 text-hive-200 rounded-xl text-sm hover:bg-hive-700 transition-colors border border-hive-700"
            >
              🔗 <span className="hidden lg:inline">Pipelines</span>
            </button>
            <button
              onClick={() => setShowRevenue(true)}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-hive-800 text-hive-200 rounded-xl text-sm hover:bg-hive-700 transition-colors border border-hive-700"
            >
              💵 <span className="hidden lg:inline">Revenue</span>
            </button>
            <button
              onClick={() => setShowTrading(true)}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-hive-800 text-hive-200 rounded-xl text-sm hover:bg-hive-700 transition-colors border border-hive-700"
            >
              📈 <span className="hidden lg:inline">Trading</span>
            </button>
            <button
              onClick={() => setShowProposals(true)}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-yellow-500/10 text-yellow-400 rounded-xl text-sm hover:bg-yellow-500/20 transition-colors border border-yellow-500/20"
            >
              💡 <span className="hidden lg:inline">Proposals</span>
            </button>
            <button
              onClick={() => setShowBotGen(true)}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-forge/15 text-forge border border-forge/30 rounded-xl text-sm hover:bg-forge/25 transition-colors"
            >
              ⚒️ <span className="hidden lg:inline">Generate Bot</span>
            </button>
            <button
              onClick={() => setShowSpend(true)}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-hive-800 text-hive-200 rounded-xl text-sm hover:bg-hive-700 transition-colors border border-hive-700"
            >
              💰 <span className="hidden lg:inline">Spend</span>
            </button>
            <button
              onClick={() => setShowChat(true)}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-hive-800 text-hive-200 rounded-xl text-sm hover:bg-hive-700 transition-colors border border-hive-700"
            >
              💬 <span className="hidden lg:inline">Chat</span>
            </button>
            <button
              onClick={() => setShowCreate(true)}
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
          <div className="md:hidden flex-1 overflow-hidden">
            <ChatPanel agents={agents} embedded />
          </div>
        )}

        {/* Task board */}
        <div className={`flex-1 overflow-hidden ${mobileView !== 'board' ? 'hidden md:flex' : 'flex'}`}>
          <TaskBoard
            tasks={filteredTasks}
            agents={agents}
            onSelectTask={setSelectedTask}
            onRunTask={handleRunTask}
            onUpdateTask={handleUpdateTask}
          />
        </div>
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

      {showChat && (
        <div className="hidden md:block">
          <ChatPanel agents={agents} onClose={() => setShowChat(false)} />
        </div>
      )}

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
    </div>
  )
}
