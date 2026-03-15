import { useState, useEffect, useRef, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { api } from '../lib/api'
import { SkeletonChart } from './Skeleton'

const RANGES = ['1h', '24h', '7d']

const AGENT_COLORS = {
  scout: '#06b6d4', forge: '#3b82f6', quill: '#8b5cf6',
  dealer: '#3BB273', oracle: '#E8C547', nexus: '#ec4899'
}

const AGENT_AVATARS = {
  scout: '🔭', forge: '⚒️', quill: '✍️',
  dealer: '🤝', oracle: '🔮', nexus: '🧬'
}

export default function AgentGraph({ onClose }) {
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [range, setRange] = useState('24h')
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const graphRef = useRef()
  const containerRef = useRef()
  const [dims, setDims] = useState({ w: 800, h: 600 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setDims({ w: width, h: height })
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  const fetchData = useCallback(async () => {
    try {
      const [n, e] = await Promise.all([api.getGraphNodes(), api.getGraphEdges(range)])
      setNodes(n.map(node => ({
        id: node.id, name: node.name,
        color: AGENT_COLORS[node.id] || '#888',
        avatar: AGENT_AVATARS[node.id] || '🤖',
        status: node.status, val: 8
      })))
      setEdges(e.map((edge, i) => ({
        id: `e-${i}`,
        source: edge.source_agent_id || edge.source,
        target: edge.target_agent_id || edge.target,
        count: edge.count || 1,
        type: edge.interaction_type || edge.type || 'consult'
      })))
    } catch (err) { console.error('Graph fetch error:', err) }
    finally { setLoading(false) }
  }, [range])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  const isMobile = windowWidth < 500

  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    const r = 18
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.fillStyle = node.color + '22'
    ctx.fill()
    ctx.strokeStyle = node.color
    ctx.lineWidth = node.status === 'active' ? 3 : 1.5
    ctx.stroke()
    ctx.font = '20px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(node.avatar, node.x, node.y)
    if (globalScale > 0.6) {
      ctx.font = 'bold 10px sans-serif'
      ctx.fillStyle = '#1c1c1e'
      ctx.fillText(node.name, node.x, node.y + r + 12)
    }
  }, [])

  const linkCanvasObject = useCallback((link, ctx) => {
    const src = link.source, tgt = link.target
    if (typeof src !== 'object' || typeof tgt !== 'object') return
    const width = Math.min(1 + link.count * 0.8, 6)
    ctx.beginPath()
    if (link.type === 'tool_call') ctx.setLineDash([4, 4])
    else ctx.setLineDash([])
    ctx.moveTo(src.x, src.y)
    ctx.lineTo(tgt.x, tgt.y)
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'
    ctx.lineWidth = width
    ctx.stroke()
    ctx.setLineDash([])
    const dx = tgt.x - src.x, dy = tgt.y - src.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len === 0) return
    const ux = dx / len, uy = dy / len
    const ax = tgt.x - ux * 22, ay = tgt.y - uy * 22
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(ax - ux * 8 + uy * 4, ay - uy * 8 - ux * 4)
    ctx.lineTo(ax - ux * 8 - uy * 4, ay - uy * 8 + ux * 4)
    ctx.closePath()
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fill()
  }, [])

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-s1 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <h2 className="text-lg font-bold font-display text-t1">Agent Network</h2>
          <div className="flex items-center gap-2">
            {RANGES.map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${range === r ? 'bg-t1 text-white' : 'bg-s3 text-t3 hover:text-t1'}`}
                style={range !== r ? { border: '0.5px solid rgba(0,0,0,0.08)' } : {}}>
                {r}
              </button>
            ))}
            <button onClick={onClose} className="ml-2 text-t3 hover:text-t1 text-xl" aria-label="Close agent graph">&times;</button>
          </div>
        </div>

        <div className="flex-1 min-h-0 p-4">
          {loading ? (
            <SkeletonChart />
          ) : isMobile ? (
            <div className="space-y-2 overflow-y-auto max-h-[60vh]">
              {edges.length === 0 && <p className="text-t3 text-sm text-center py-8">No interactions in this time range</p>}
              {edges.map((edge, i) => (
                <div key={i} className="flex items-center gap-2 bg-s2 rounded-lg px-3 py-2 text-sm">
                  <span>{AGENT_AVATARS[edge.source?.id || edge.source] || '🤖'}</span>
                  <span className="text-t1 font-medium">{edge.source?.name || edge.source}</span>
                  <span className="text-t4">→</span>
                  <span>{AGENT_AVATARS[edge.target?.id || edge.target] || '🤖'}</span>
                  <span className="text-t1 font-medium">{edge.target?.name || edge.target}</span>
                  <span className="ml-auto text-t1 font-mono text-xs">{edge.count}x</span>
                </div>
              ))}
            </div>
          ) : (
            <div ref={containerRef} className="w-full h-[500px] rounded-lg overflow-hidden bg-s2">
              <ForceGraph2D
                ref={graphRef} width={dims.w} height={dims.h}
                graphData={{ nodes, links: edges }}
                nodeCanvasObject={nodeCanvasObject}
                nodePointerAreaPaint={(node, color, ctx) => { ctx.beginPath(); ctx.arc(node.x, node.y, 20, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill() }}
                linkCanvasObject={linkCanvasObject}
                linkDirectionalParticles={link => Math.min(link.count, 4)}
                linkDirectionalParticleWidth={2}
                linkDirectionalParticleColor={() => '#1c1c1e'}
                d3AlphaDecay={0.05} d3VelocityDecay={0.3} cooldownTicks={80}
                backgroundColor="transparent"
                onEngineStop={() => graphRef.current?.zoomToFit(300, 60)}
              />
            </div>
          )}
        </div>

        {!isMobile && edges.length > 0 && (
          <div className="px-4 pb-4">
            <div className="flex flex-wrap gap-3 text-xs text-t3">
              <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-black/15 inline-block" /> consult</span>
              <span className="flex items-center gap-1"><span className="w-6 h-0.5 border-t border-dashed border-black/15 inline-block" /> tool_call</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-t1 inline-block" /> particles = frequency</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
