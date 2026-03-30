const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function callLLM({ model, messages, tools, temperature = 0.7 }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');

  const body = {
    model,
    messages,
    temperature,
    max_tokens: 4096,
  };
  if (tools?.length) body.tools = tools;

  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://agentforge.ai',
      'X-Title': 'AgentForge',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenRouter ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  const choice = data.choices?.[0];
  const usage = data.usage || {};

  return {
    content: choice?.message?.content || '',
    tool_calls: choice?.message?.tool_calls || [],
    tokens_in: usage.prompt_tokens || 0,
    tokens_out: usage.completion_tokens || 0,
    model: data.model,
  };
}
