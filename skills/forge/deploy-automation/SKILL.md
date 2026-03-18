---
name: Deploy Automation
description: Automate deployment workflows for Ember and AgentForge projects across Vercel, Railway, Netlify, and AWS Lightsail.
version: "1.0.0"
agents: ["forge"]
tags: ["deployment", "devops", "automation"]
requires_env: ["NETLIFY_ACCESS_TOKEN"]
requires_tools: ["write_file", "http_request", "create_task"]
---

# Deploy Automation

Manage deployment pipelines for the 3 Hive platforms.

## Platform Map

| Project | Frontend | Backend | Deploy Method |
|---------|----------|---------|---------------|
| Ember (The Pass) | Vercel (sous-frontend) | Railway (innovative-respect) | Git push triggers |
| AgentForge | TBD | TBD | TBD |
| Hive Dashboard | Netlify (auto-deploy) | Lightsail VM (PM2) | Git push + SSH pull |

## Deployment Checklist

Before any deployment:
1. **Syntax check** — `node --check` on all modified server files.
2. **Build check** — `npm run build` must succeed with zero errors.
3. **Dependency audit** — no new dependencies unless explicitly approved.
4. **Environment variables** — verify all required env vars exist on target platform.

## Netlify Deploy (via API)

```
POST https://api.netlify.com/api/v1/sites/{site_id}/deploys
Authorization: Bearer $NETLIFY_ACCESS_TOKEN
```

Use for deploying landing pages and static sites.

## Lightsail Deploy (Hive)

Generate deployment instructions (cannot SSH directly):
1. `cd ~/hive && git stash && git pull`
2. `pm2 restart hive --update-env`
3. `curl -s http://16.145.215.162:3002/api/health | head -c 200`

**CRITICAL:** Always include `git stash` before `git pull`. The VM always has dirty state.

## Post-Deploy Verification

After every deploy, verify:
- Health endpoint returns 200 with `"status":"ok"`
- No error logs in PM2 output
- Key features still work (create and run a test task)

## Rollback Plan

If deploy breaks production:
1. Identify the bad commit from git log
2. `git revert <commit-hash>` and push
3. Pull and restart on VM
