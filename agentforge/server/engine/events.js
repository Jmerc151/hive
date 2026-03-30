import { EventEmitter } from 'events';

class TaskEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  emitTaskStart(taskId, workspaceId, meta = {}) {
    this.emit(`task:${taskId}`, {
      event: 'task:start',
      taskId,
      workspaceId,
      step: 0,
      type: 'start',
      content: meta.title || 'Task execution started',
      timestamp: new Date().toISOString(),
    });
  }

  emitTaskStep(taskId, workspaceId, step, type, content, extra = {}) {
    this.emit(`task:${taskId}`, {
      event: 'task:step',
      taskId,
      workspaceId,
      step,
      type,
      content,
      toolName: extra.toolName || null,
      toolInput: extra.toolInput || null,
      timestamp: new Date().toISOString(),
    });
  }

  emitTaskComplete(taskId, workspaceId, result, steps) {
    this.emit(`task:${taskId}`, {
      event: 'task:complete',
      taskId,
      workspaceId,
      step: steps,
      type: 'complete',
      content: result,
      timestamp: new Date().toISOString(),
    });
  }

  emitTaskError(taskId, workspaceId, error, step = 0) {
    this.emit(`task:${taskId}`, {
      event: 'task:error',
      taskId,
      workspaceId,
      step,
      type: 'error',
      content: typeof error === 'string' ? error : error.message,
      timestamp: new Date().toISOString(),
    });
  }

  subscribe(taskId, listener) {
    this.on(`task:${taskId}`, listener);
    return () => this.off(`task:${taskId}`, listener);
  }
}

export const taskEvents = new TaskEventBus();
