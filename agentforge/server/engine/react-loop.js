import { query } from '../db.js';
import { callLLM } from '../services/openrouter.js';
import { deductCredits } from '../middleware/credits.js';
import { executeTool, getToolDefinitions } from './tools.js';
import { taskEvents } from './events.js';

const MAX_STEPS = 5;

export async function executeTask(taskId, workspaceId) {
  // Load task and agent
  const { rows: [task] } = await query(
    'SELECT t.*, a.system_prompt, a.model, a.tools as agent_tools, a.name as agent_name FROM tasks t JOIN agents a ON a.id = t.agent_id WHERE t.id = $1 AND t.workspace_id = $2',
    [taskId, workspaceId]
  );

  if (!task) throw new Error('Task not found');
  if (!task.agent_id) throw new Error('Task has no assigned agent');

  // Emit start
  taskEvents.emitTaskStart(taskId, workspaceId, { title: task.title });

  const messages = [
    { role: 'system', content: task.system_prompt },
    { role: 'user', content: `Task: ${task.title}\n\n${task.description || ''}` },
  ];

  const allowedTools = typeof task.agent_tools === 'string'
    ? JSON.parse(task.agent_tools)
    : task.agent_tools || [];

  const toolDefs = getToolDefinitions(allowedTools);
  let step = 0;
  let finalResult = '';

  try {
    while (step < MAX_STEPS) {
      step++;

      // Check credits
      const { rows: [ws] } = await query('SELECT credits FROM workspaces WHERE id = $1', [workspaceId]);
      if (ws.credits < 1) {
        const msg = 'Insufficient credits — task paused';
        await logStep(taskId, workspaceId, step, 'error', msg);
        await query("UPDATE tasks SET status = 'paused', error = 'Insufficient credits' WHERE id = $1", [taskId]);
        taskEvents.emitTaskError(taskId, workspaceId, msg, step);
        return { status: 'paused', error: 'Insufficient credits' };
      }

      // Call LLM
      const response = await callLLM({
        model: task.model,
        messages,
        tools: toolDefs.length ? toolDefs : undefined,
      });

      // Deduct credit
      await deductCredits(workspaceId, 1, taskId, `Step ${step}: ${task.agent_name}`);

      // Log spend
      await query(
        `INSERT INTO spend_log (workspace_id, agent_id, task_id, model, tokens_in, tokens_out, cost_usd)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [workspaceId, task.agent_id, taskId, response.model || task.model,
         response.tokens_in, response.tokens_out, 0]
      );

      // Update task credits
      await query('UPDATE tasks SET credits_used = credits_used + 1 WHERE id = $1', [taskId]);

      // Handle tool calls
      if (response.tool_calls?.length) {
        // Log thought
        if (response.content) {
          await logStep(taskId, workspaceId, step, 'thought', response.content);
          taskEvents.emitTaskStep(taskId, workspaceId, step, 'thought', response.content);
          messages.push({ role: 'assistant', content: response.content, tool_calls: response.tool_calls });
        } else {
          messages.push({ role: 'assistant', tool_calls: response.tool_calls });
        }

        // Execute each tool
        for (const tc of response.tool_calls) {
          const toolName = tc.function.name;
          let toolArgs;
          try {
            toolArgs = JSON.parse(tc.function.arguments);
          } catch {
            toolArgs = {};
          }

          await logStep(taskId, workspaceId, step, 'action', `Calling ${toolName}`, toolName, toolArgs);
          taskEvents.emitTaskStep(taskId, workspaceId, step, 'action', `Calling ${toolName}`, { toolName, toolInput: toolArgs });

          const toolResult = await executeTool(toolName, toolArgs, workspaceId);
          const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);

          await logStep(taskId, workspaceId, step, 'observation', resultStr);
          taskEvents.emitTaskStep(taskId, workspaceId, step, 'observation', resultStr, { toolName });

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: resultStr,
          });
        }
      } else {
        // No tool calls — this is the final answer
        finalResult = response.content;
        await logStep(taskId, workspaceId, step, 'thought', finalResult);
        taskEvents.emitTaskStep(taskId, workspaceId, step, 'thought', finalResult);
        break;
      }
    }

    // Complete task
    await query(
      "UPDATE tasks SET status = 'completed', result = $2, completed_at = now() WHERE id = $1",
      [taskId, finalResult]
    );

    taskEvents.emitTaskComplete(taskId, workspaceId, finalResult, step);
    return { status: 'completed', result: finalResult, steps: step };
  } catch (err) {
    console.error(`Task ${taskId} failed:`, err);
    await query(
      "UPDATE tasks SET status = 'failed', error = $2, completed_at = now() WHERE id = $1",
      [taskId, err.message]
    );
    taskEvents.emitTaskError(taskId, workspaceId, err, step);
    return { status: 'failed', error: err.message };
  }
}

async function logStep(taskId, workspaceId, step, type, content, toolName, toolInput) {
  await query(
    `INSERT INTO task_logs (task_id, workspace_id, step, type, content, tool_name, tool_input)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [taskId, workspaceId, step, type, content, toolName || null, toolInput ? JSON.stringify(toolInput) : null]
  );
}
