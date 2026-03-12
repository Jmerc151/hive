import { EventEmitter } from 'events'

export const TRACE_TYPES = ['THOUGHT', 'TOOL_CALL', 'TOOL_RESULT', 'DECISION', 'CONSULT', 'ERROR']

class TraceBus extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(100)
    this._id = 0
  }

  emitTrace(event) {
    const traceEvent = {
      ...event,
      id: ++this._id,
      timestamp: new Date().toISOString(),
    }
    this.emit(`trace:${event.agent_id}`, traceEvent)
    this.emit('trace:*', traceEvent)
    return traceEvent
  }
}

export const traceBus = new TraceBus()
