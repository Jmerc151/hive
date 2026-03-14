import { useState, useEffect, useRef, useCallback } from 'react'
import { BASE, getAuthToken } from '../lib/api'

const MAX_EVENTS = 500

export function useTraceStream({ agentId = 'all', taskId = null, enabled = true } = {}) {
  const [events, setEvents] = useState([])
  const [connected, setConnected] = useState(false)
  const esRef = useRef(null)

  useEffect(() => {
    if (!enabled) {
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
        setConnected(false)
      }
      return
    }

    // Build SSE URL
    const baseOrigin = BASE.startsWith('http') ? BASE : `${window.location.origin}${BASE}`
    let url = agentId === 'all'
      ? `${baseOrigin}/trace/live`
      : `${baseOrigin}/agents/${agentId}/trace/live`

    const params = new URLSearchParams()
    const authToken = getAuthToken()
    if (authToken) params.set('token', authToken)
    if (taskId) params.set('task_id', taskId)
    if (params.toString()) url += `?${params}`

    const es = new EventSource(url)
    esRef.current = es

    es.addEventListener('connected', () => setConnected(true))

    es.addEventListener('trace', (e) => {
      try {
        const event = JSON.parse(e.data)
        setEvents(prev => {
          const next = [...prev, event]
          return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next
        })
      } catch {}
    })

    es.onerror = () => setConnected(false)

    return () => {
      es.close()
      esRef.current = null
    }
  }, [agentId, taskId, enabled])

  const clear = useCallback(() => setEvents([]), [])

  return { events, connected, clear }
}
