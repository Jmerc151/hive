---
name: Deploy Automation
slug: deploy-automation
description: CI/CD and deployment automation for Ember, AgentForge, and Hive. Git workflows, build verification, and production deploy patterns.
version: 1.0.0
author: hive
agents: ["forge"]
tags: ["deployment", "ci-cd", "automation", "devops"]
source: clawhub-adapted
requires_env: ["NETLIFY_ACCESS_TOKEN"]
requires_tools: ["write_file", "execute_command", "http_request"]
---

# Deploy Automation

Production deployment patterns for Forge. Covers Git workflows, build checks, and deploy-then-verify cycles.

## Deployment Targets

| Project | Platform | Deploy Method | Verify |
|---------|----------|--------------|--------|
| Ember Frontend | Vercel | Git push → auto-deploy | `curl sous-frontend.vercel.app` |
| Ember Backend | Railway | Git push → auto-deploy | `curl sous-backend-production.up.railway.app/api/health` |
| Hive Frontend | Netlify | Git push → auto-deploy | Check Netlify dashboard |
| Hive Backend | AWS Lightsail | Git push → SSH pull → PM2 restart | `curl 16.145.215.162:3002/api/health` |
| Ember Landing | Vercel | Git push → auto-deploy | `curl ember-landing-phi.vercel.app` |

## Pre-Deploy Checklist

Before ANY deploy:

1. **Syntax check backend**: `node --check server/index.js`
2. **Build frontend**: `npm run build` — must exit 0
3. **Check for secrets**: No API keys, passwords, or tokens in committed code
4. **Review diff**: `git diff --stat` — verify only intended files changed
5. **Test locally**: Verify the feature works on `localhost` before pushing

## Git Workflow

```
# Standard feature deploy
git add -A
git commit -m "feat: {feature name} — {brief description}"
git push origin main
```

### Commit Message Format

| Prefix | Usage |
|--------|-------|
| `feat:` | New feature or capability |
| `fix:` | Bug fix |
| `refactor:` | Code restructure, no behavior change |
| `docs:` | Documentation only |
| `chore:` | Dependencies, config, tooling |

## Hive VM Deploy (Critical Path)

The Lightsail VM ALWAYS has dirty state. Never skip `git stash`.

```bash
# On the VM (via SSH):
cd ~/hive
git stash          # ALWAYS — VM has dirty state
git pull origin main
pm2 restart hive --update-env
```

### Post-Deploy Verification

```bash
# Verify health endpoint
curl -s http://16.145.215.162:3002/api/health | head -c 200

# Check PM2 status
pm2 status hive

# Check logs for errors
pm2 logs hive --lines 20
```

## Netlify Deploy via API

For programmatic deploys (Forge can trigger these):

```
POST https://api.netlify.com/api/v1/sites/{site_id}/deploys
Authorization: Bearer {NETLIFY_ACCESS_TOKEN}
```

## Rollback Protocol

If a deploy breaks production:

1. **Identify**: Check health endpoint, PM2 logs, browser console
2. **Revert**: `git revert HEAD && git push` (prefer revert over reset)
3. **Re-deploy**: Pull on VM, restart PM2
4. **Verify**: Hit health endpoint, test the affected feature
5. **Post-mortem**: Log the issue in task output for Nexus review

## Guardrails

- **Never force push** to main
- **Never deploy without building first** — the VM doesn't build
- **Always verify after deploy** — `curl` the health endpoint minimum
- **Never store secrets in git** — use .env files on the VM
- **Max 1 deploy per task** — if the first deploy fails, debug before retrying
