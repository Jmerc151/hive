# Hive Project Context Files

This folder contains key files from the Hive project to give Claude.ai full codebase context. Upload all files in this folder as project knowledge.

## Files Included

| File | Source Path | Why Included |
|------|-------------|--------------|
| `CLAUDE.md` | `~/Downloads/CLAUDE.md` | Master project instructions, build queue, coding standards, architecture overview. This is the primary reference document. |
| `SYSTEM.md` | `server/SYSTEM.md` | Architecture overview — deployment details, table schemas, agent definitions, API endpoint catalog. |
| `CHANGELOG.md` | `CHANGELOG.md` | Feature log with dates. Shows what has been built and when. |
| `agents-agents.json` | `agents/agents.json` | All 6 agent definitions with system prompts, model routing, and tool configurations. |
| `src-lib-api.js` | `src/lib/api.js` | Frontend API client — every endpoint the frontend calls, with the request wrapper pattern. |
| `server-db.js` | `server/db.js` | SQLite schema — all 20+ table definitions, indexes, default settings, and migration logic. |
| `package.json` | `package.json` | Dependencies and scripts. Shows what libraries are available. |
| `src-App.jsx` | `src/App.jsx` | Main React dashboard — layout, routing, state management, component composition. |
| `server-index-SUMMARY.md` | (generated) | Summary of server/index.js (9010 lines, too large to include). Describes all API routes, ReAct loop, spend controls, heartbeats, guardrails, and trading logic. |

## Files NOT Included

| File | Reason |
|------|--------|
| `server/index.js` | 9010 lines — too large. See `server-index-SUMMARY.md` for a structured summary. |
| `server/services/*.js` | Peripheral services (marketData, broker, backtest, analysis, email). Reference db.js and SYSTEM.md for their interfaces. |
| `src/components/*.jsx` | 22 components. App.jsx imports them all, so you can see the component list there. Build new components by matching existing patterns. |
| `memory/*.md` | Per-agent learning files. Not needed for code context. |

## How to Use

1. Create a new project in Claude.ai
2. Upload all files from this folder as project knowledge
3. Set CLAUDE.md as the primary instruction document
4. When asking Claude to build features, reference the build queue in CLAUDE.md
