/**
 * Seed skills from /skills directory tree into the SQLite skills table.
 * Reads all SKILL.md files, parses YAML frontmatter, and inserts into DB.
 *
 * Usage: node scripts/seed-skills.js
 * Also callable as a function from server startup.
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { v4 as uuid } from 'uuid'
import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = join(__dirname, '..')

function findSkillFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      results.push(...findSkillFiles(full))
    } else if (entry === 'SKILL.md') {
      results.push(full)
    }
  }
  return results
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return null

  const yaml = match[1]
  const body = match[2].trim()
  const meta = {}

  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value = line.slice(colonIdx + 1).trim()

    // Parse arrays like ["scout", "forge"]
    if (value.startsWith('[')) {
      try { value = JSON.parse(value) } catch { value = [] }
    }
    // Strip quotes
    if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }

    meta[key] = value
  }

  return { ...meta, body }
}

export function seedSkills(db) {
  const skillsDir = join(ROOT, 'skills')
  let files
  try {
    files = findSkillFiles(skillsDir)
  } catch {
    console.log('[seed-skills] No skills/ directory found, skipping.')
    return 0
  }

  if (files.length === 0) {
    console.log('[seed-skills] No SKILL.md files found.')
    return 0
  }

  // We'll skip individual skills that already exist by slug (checked inside the loop)

  const insert = db.prepare(`
    INSERT OR IGNORE INTO skills (id, slug, name, description, version, skill_md, tags, requires_tools, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'custom', datetime('now'), datetime('now'))
  `)

  const assignAgent = db.prepare(`
    INSERT OR IGNORE INTO agent_skills_v2 (agent_id, skill_id, enabled, priority)
    VALUES (?, ?, 1, ?)
  `)

  let seeded = 0
  const insertMany = db.transaction(() => {
    for (const file of files) {
      const content = readFileSync(file, 'utf-8')
      const parsed = parseFrontmatter(content)
      if (!parsed || !parsed.name) {
        console.log(`[seed-skills] Skipping ${file} — invalid frontmatter`)
        continue
      }

      const filePath = relative(ROOT, file)
      const slug = filePath
        .replace(/\/SKILL\.md$/, '')
        .replace(/^skills\//, '')
        .replace(/\//g, '-')

      // Check if this slug already exists
      const existingSkill = db.prepare('SELECT id FROM skills WHERE slug = ?').get(slug)
      if (existingSkill) continue

      const id = uuid()
      const agents = Array.isArray(parsed.agents) ? parsed.agents : []
      const tags = Array.isArray(parsed.tags) ? parsed.tags : []
      const requiresTools = Array.isArray(parsed.requires_tools) ? parsed.requires_tools : []

      insert.run(
        id,
        slug,
        parsed.name,
        parsed.description || '',
        parsed.version || '1.0.0',
        content,
        JSON.stringify(tags),
        JSON.stringify(requiresTools)
      )

      // Auto-assign to specified agents
      agents.forEach((agentId, idx) => {
        assignAgent.run(agentId, id, idx)
      })

      seeded++
      console.log(`[seed-skills] Seeded: ${parsed.name} → ${agents.join(', ')} (${slug})`)
    }
  })

  insertMany()
  console.log(`[seed-skills] Done. Seeded ${seeded} new skills.`)
  return seeded
}

// CLI mode: run directly with `node scripts/seed-skills.js`
if (process.argv[1] && process.argv[1].endsWith('seed-skills.js')) {
  const dbPath = join(ROOT, 'hive.db')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  const count = seedSkills(db)
  db.close()
  process.exit(count >= 0 ? 0 : 1)
}
