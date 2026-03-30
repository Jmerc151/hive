// Tool registry — modular tool system for agents
// Each tool has: name, description, parameters (JSON Schema), execute function

const tools = {};

export function registerTool(name, definition) {
  tools[name] = definition;
}

export function getToolDefinitions(allowedTools) {
  const available = allowedTools?.length
    ? Object.entries(tools).filter(([name]) => allowedTools.includes(name))
    : Object.entries(tools);

  return available.map(([name, def]) => ({
    type: 'function',
    function: {
      name,
      description: def.description,
      parameters: def.parameters,
    },
  }));
}

export async function executeTool(name, args, workspaceId) {
  const tool = tools[name];
  if (!tool) return `Error: Unknown tool "${name}"`;

  try {
    return await tool.execute(args, workspaceId);
  } catch (err) {
    return `Error executing ${name}: ${err.message}`;
  }
}

// --- Built-in tools ---

registerTool('web_search', {
  description: 'Search the web for information using Brave Search',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      count: { type: 'number', description: 'Number of results (1-10, default 5)' },
    },
    required: ['query'],
  },
  async execute({ query, count = 5 }) {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) {
      return 'Web search not configured. Add BRAVE_SEARCH_API_KEY to your environment variables. Get a free key at https://brave.com/search/api/';
    }

    const numResults = Math.max(1, Math.min(10, Number(count) || 5));
    const params = new URLSearchParams({ q: query, count: numResults });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return `Error: Brave Search API returned ${res.status}${errText ? ': ' + errText.slice(0, 200) : ''}`;
      }

      const data = await res.json();
      const results = (data.web?.results || []).slice(0, 10).map(r => ({
        title: r.title || '',
        url: r.url || '',
        description: (r.description || '').slice(0, 500),
      }));

      if (!results.length) return `No results found for "${query}".`;
      return JSON.stringify(results);
    } catch (err) {
      return `Error: ${err.name === 'AbortError' ? 'Search timed out (10s)' : err.message}`;
    } finally {
      clearTimeout(timeout);
    }
  },
});

registerTool('create_task', {
  description: 'Create a follow-up task for another agent',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Task description' },
      agent_id: { type: 'string', description: 'Target agent ID' },
    },
    required: ['title'],
  },
  async execute({ title, description, agent_id }, workspaceId) {
    const { query: dbQuery } = await import('../db.js');
    const { rows: [task] } = await dbQuery(
      `INSERT INTO tasks (workspace_id, agent_id, title, description)
       VALUES ($1, $2, $3, $4) RETURNING id, title`,
      [workspaceId, agent_id || null, title, description || '']
    );
    return `Created task: ${task.title} (${task.id})`;
  },
});

registerTool('store_memory', {
  description: 'Store a learning or insight for future reference',
  parameters: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'The insight to remember' },
      category: { type: 'string', description: 'Category (e.g. research, strategy, customer)' },
    },
    required: ['content'],
  },
  async execute({ content, category }, workspaceId) {
    const { query: dbQuery } = await import('../db.js');
    await dbQuery(
      'INSERT INTO memories (workspace_id, content, category) VALUES ($1, $2, $3)',
      [workspaceId, content, category || 'general']
    );
    return 'Memory stored.';
  },
});

registerTool('recall_memory', {
  description: 'Search stored memories and past learnings',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to search for' },
    },
    required: ['query'],
  },
  async execute({ query: searchQuery }, workspaceId) {
    const { query: dbQuery } = await import('../db.js');
    const { rows } = await dbQuery(
      `SELECT content, category, created_at FROM memories
       WHERE workspace_id = $1 AND content ILIKE $2
       ORDER BY created_at DESC LIMIT 10`,
      [workspaceId, `%${searchQuery}%`]
    );
    if (!rows.length) return 'No relevant memories found.';
    return rows.map(r => `[${r.category}] ${r.content}`).join('\n');
  },
});

// --- http_request ---

const BLOCKED_IP_PATTERNS = [
  /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./, /^localhost$/i, /^\[::1\]$/,
];

function isBlockedUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    if (!['http:', 'https:'].includes(parsed.protocol)) return true;
    const host = parsed.hostname;
    return BLOCKED_IP_PATTERNS.some(p => p.test(host));
  } catch {
    return true;
  }
}

registerTool('http_request', {
  description: 'Make an HTTP GET or POST request to a URL',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to request (http/https only)' },
      method: { type: 'string', description: 'HTTP method (GET or POST)', default: 'GET' },
      headers: { type: 'object', description: 'Request headers' },
      body: { type: 'string', description: 'Request body (for POST)' },
    },
    required: ['url'],
  },
  async execute({ url, method = 'GET', headers = {}, body }) {
    if (isBlockedUrl(url)) return 'Error: URL blocked — only public http/https URLs allowed.';
    const upperMethod = method.toUpperCase();
    if (!['GET', 'POST'].includes(upperMethod)) return 'Error: Only GET and POST methods are supported.';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const opts = { method: upperMethod, headers, signal: controller.signal };
      if (upperMethod === 'POST' && body) opts.body = body;
      const res = await fetch(url, opts);
      const text = await res.text();
      return JSON.stringify({
        status: res.status,
        content_type: res.headers.get('content-type') || '',
        body: text.slice(0, 5000),
      });
    } catch (err) {
      return `Error: ${err.name === 'AbortError' ? 'Request timed out (10s)' : err.message}`;
    } finally {
      clearTimeout(timeout);
    }
  },
});

// --- scrape_page ---

registerTool('scrape_page', {
  description: 'Extract plain text content from a webpage',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL of the page to scrape' },
    },
    required: ['url'],
  },
  async execute({ url }) {
    const result = await executeTool('http_request', { url, method: 'GET' });
    if (result.startsWith('Error:')) return result;
    try {
      const { body } = JSON.parse(result);
      const text = body
        // Strip boilerplate elements first
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        // Strip cookie/consent banners (common class/id patterns)
        .replace(/<div[^>]*(cookie|consent|gdpr|banner)[^>]*>[\s\S]*?<\/div>/gi, '')
        // Strip scripts and styles
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        // Strip remaining tags
        .replace(/<[^>]+>/g, ' ')
        // Decode HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        // Collapse whitespace: normalize spaces within lines, then collapse blank lines
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim();
      return text.slice(0, 5000) || 'No text content found.';
    } catch {
      return 'Error: Failed to parse response.';
    }
  },
});

// --- execute_code ---

registerTool('execute_code', {
  description: 'Run JavaScript code in a sandboxed context',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JavaScript code to execute' },
    },
    required: ['code'],
  },
  async execute({ code }) {
    const vm = await import('vm');
    const logs = [];
    const sandbox = {
      console: {
        log: (...args) => logs.push(args.map(String).join(' ')),
        error: (...args) => logs.push('[error] ' + args.map(String).join(' ')),
        warn: (...args) => logs.push('[warn] ' + args.map(String).join(' ')),
      },
      JSON, Math, Date, Array, Object, String, Number, Boolean,
      parseInt, parseFloat, isNaN, isFinite,
      Map, Set, RegExp, Error, Promise,
    };
    try {
      const script = new vm.Script(code, { timeout: 5000 });
      const context = vm.createContext(sandbox);
      const returnValue = script.runInContext(context, { timeout: 5000 });
      return JSON.stringify({
        logs: logs.join('\n'),
        result: returnValue !== undefined ? String(returnValue) : 'undefined',
      });
    } catch (err) {
      return `Error: ${err.message}`;
    }
  },
});

// --- analyze_data ---

registerTool('analyze_data', {
  description: 'Analyze structured JSON data — compute basic stats for numeric fields',
  parameters: {
    type: 'object',
    properties: {
      data: { type: 'string', description: 'JSON string of data (array of objects)' },
      question: { type: 'string', description: 'What to analyze about the data' },
    },
    required: ['data'],
  },
  async execute({ data, question }) {
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      return 'Error: Invalid JSON data.';
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    if (!items.length) return 'No data to analyze.';

    const stats = { count: items.length, fields: {} };
    const sampleKeys = Object.keys(items[0] || {});

    for (const key of sampleKeys) {
      const values = items.map(i => i[key]).filter(v => v !== null && v !== undefined);
      const nums = values.map(Number).filter(n => !isNaN(n));
      if (nums.length > 0) {
        const sum = nums.reduce((a, b) => a + b, 0);
        stats.fields[key] = {
          type: 'numeric',
          count: nums.length,
          sum: Math.round(sum * 1000) / 1000,
          avg: Math.round((sum / nums.length) * 1000) / 1000,
          min: Math.min(...nums),
          max: Math.max(...nums),
        };
      } else {
        const unique = new Set(values.map(String));
        stats.fields[key] = {
          type: 'categorical',
          count: values.length,
          unique: unique.size,
          sample: [...unique].slice(0, 5),
        };
      }
    }

    return JSON.stringify({ question: question || 'General analysis', stats });
  },
});

// --- send_notification ---

const notifications = [];

registerTool('send_notification', {
  description: 'Store a notification for the user',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Notification message' },
      priority: { type: 'string', description: 'Priority level: low, normal, or high', default: 'normal' },
    },
    required: ['message'],
  },
  async execute({ message, priority = 'normal' }) {
    if (!['low', 'normal', 'high'].includes(priority)) priority = 'normal';
    notifications.push({ message, priority, created_at: new Date().toISOString() });
    return `Notification stored (priority: ${priority}): "${message}"`;
  },
});

export function getNotifications() {
  return [...notifications];
}

export function clearNotifications() {
  notifications.length = 0;
}
