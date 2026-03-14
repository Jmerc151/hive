# Agent Effectiveness Upgrade — Design Spec

## Goal
Make Hive agents produce real results by fixing prompts, closing feedback loops, adding missing tools, and upgrading the pipeline builder.

## Stream 1: Agent Prompt Overhaul

### Changes per agent (in agents/agents.json):

**All agents** get these additions to their system prompts:
- Memory protocol: "Before starting work, call [TOOL:recall_memory] with your task description to check for relevant past learnings. After completing work, call [TOOL:store_memory] with key findings worth remembering."
- Structured output reminder: "When your task involves generating structured data (opportunities, proposals, strategies), output valid JSON arrays so downstream systems can parse your results."

**Scout:**
- Add: `recall_memory`, `recall_hive_memory`, `store_memory`, `list_strategies` to tool references
- Add: "Before researching a topic, recall_memory to avoid repeating past work"
- Add: "After finding opportunities, store_memory with the key insight and source"

**Forge:**
- Remove: `send_email` reference (Forge doesn't have it)
- Add: `web_search`, `read_file`, `recall_memory`, `store_memory` references
- Add: "Before building, web_search for existing solutions and recall_memory for past build patterns"
- Add: "Use read_file to check existing workspace files before overwriting"

**Quill:**
- Add: `read_file`, `recall_memory`, `store_memory` references
- Add: "Before writing content, recall_memory for successful topics/headlines"
- Add: "Use read_file to check for existing content and avoid duplication"
- Add structured output for affiliate content: title, body, links array

**Dealer:**
- Add: `recall_memory`, `store_memory` references
- Add: "Before outreach, recall_memory for what approaches worked on similar prospects"
- Add: "After each outreach attempt, store_memory with outcome (response/no-response, approach used)"

**Oracle:** (already well-aligned, minor tweaks)
- Add: `recall_memory`, `store_memory` references
- Add: "After each trade decision, store_memory with reasoning and outcome for future reference"

**Nexus:**
- Add: `web_search`, `recall_memory`, `recall_hive_memory`, `store_memory` references
- Add: "Use web_search to research new prompt engineering techniques and agent patterns"
- Add: "Use recall_hive_memory to find cross-agent patterns and common failure modes"
- Soften: "Always create at least one follow-up" → "Create follow-up tasks when there's a clear actionable improvement"

## Stream 2: Heartbeat Feedback Loops

### Kill wasteful heartbeat:
- Remove `auto-standup` — it's a no-op trigger that burns tokens

### Fix memory-compaction:
- Change to use `anthropic/claude-haiku-4-5` for compaction instead of agent's own model (cheaper, avoids circular reasoning)

### Close 5 broken feedback loops:

For each of these heartbeats, add output parsing in the post-completion hook:

**bot-opportunity-scan:** After Scout completes, parse JSON array from output → INSERT into `bot_suggestions` table → auto-create Forge task for top-rated opportunity

**feature-discovery:** After Scout completes, parse JSON proposals → INSERT into `proposals` table with type='feature' → visible in Proposals panel

**ux-design-review:** After Nexus completes, parse JSON proposals → INSERT into `proposals` table with type='design' → visible in Proposals panel

**skill-discovery:** After Scout completes, parse JSON skill definitions → auto-create skills via existing skills CRUD → assign to suggested agents

**self-assessment:** After Nexus completes, parse improvement suggestions → INSERT into `proposals` table with type='prompt' → visible in Proposals panel

### Implementation approach:
Add a `parseHeartbeatOutput(taskTitle, agentId, output)` function in server/index.js that pattern-matches on task title prefixes (e.g., "[Bot Scan]", "[Feature Discovery]") and routes to the appropriate parser. Call this in the existing post-completion hook alongside QA review.

## Stream 3: New Tools

### http_request
- **Agents:** all 6
- **Params:** url (required), method (GET/POST/PUT/DELETE), headers (JSON), body (JSON)
- **Safety:** Block localhost/internal IPs, 30s timeout, 1MB response limit, max 3 per step
- **Returns:** { status, headers, body (truncated to 10KB) }

### list_workspace
- **Agents:** forge, quill, nexus
- **Params:** path (optional, defaults to workspace root)
- **Returns:** Array of { name, type (file/dir), size, modified }
- **Safety:** Restricted to workspace/ directory

### execute_code
- **Agents:** forge only
- **Params:** code (required), language (default: "node")
- **Implementation:** `child_process.execSync()` with 10s timeout, 1MB output limit
- **Safety:** Runs in workspace/ directory, no network access (blocked via environment), killed after timeout
- **Returns:** { stdout, stderr, exitCode }

### delete_file
- **Agents:** forge, nexus
- **Params:** path (required)
- **Safety:** Restricted to workspace/ directory, no `..` traversal
- **Returns:** { deleted: true/false }

## Stream 4: Visual Pipeline Builder

### Dependencies:
- Install `@xyflow/react` (the current name for react-flow)

### PipelineBuilder.jsx rewrite:
- **Node types:**
  - `agentNode` — rounded rectangle with agent avatar, name, prompt template textarea
  - `conditionNode` — diamond shape with condition text (output contains X → yes/no)
  - `startNode` / `endNode` — circle terminators
- **Edge types:**
  - Default: solid arrow (data flow)
  - Conditional: labeled with condition text
- **Features:**
  - Agent palette sidebar (drag agents onto canvas)
  - Connect nodes by dragging handles
  - Double-click to edit prompt template
  - Canvas controls: zoom, pan, minimap, fit-view
  - Save: convert react-flow JSON → existing pipeline steps format
  - Load: convert existing pipeline JSON → react-flow nodes/edges
- **Mobile fallback:** Below 768px, keep current list-based editor

## Files Modified

| File | Changes |
|------|---------|
| agents/agents.json | All 6 agent prompts updated |
| server/index.js | 4 new tools, parseHeartbeatOutput(), heartbeat fixes |
| src/components/PipelineBuilder.jsx | Full rewrite with @xyflow/react |
| package.json | Add @xyflow/react |
| CHANGELOG.md | New entry |
| SYSTEM.md | Update tool count, component info |

## Verification
1. Run a Scout task → verify it calls recall_memory before researching and store_memory after
2. Run bot-opportunity-scan heartbeat → verify output parsed into bot_suggestions
3. Test http_request tool with a public API → verify response returned
4. Test execute_code with `console.log("hello")` → verify stdout captured
5. Create a pipeline via drag-and-drop → save → verify JSON matches expected format
6. `npm run build` clean, `node --check server/index.js` passes
