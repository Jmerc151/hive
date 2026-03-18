/**
 * seed-skills.js
 *
 * Reads all SKILL.md files from the skills/ directory tree,
 * parses YAML frontmatter, and inserts each into the SQLite
 * skills table + agent_skills_v2 for agent assignments.
 *
 * Usage:
 *   node scripts/seed-skills.js           # seed if empty
 *   node scripts/seed-skills.js --force   # re-seed (clear + insert)
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import Database from 'better-sqlite3'

const DB_PATH = join(import.meta.dirname, '..', 'hive.db')
const SKILLS_DIR = join(import.meta.dirname, '..', 'skills')

function parseYAMLFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null

  const yaml = match[1]
  const meta = {}

  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    const key = line.slice(0, colonIdx).trim()
    let value = line.slice(colonIdx + 1).trim()

    // Parse arrays: ["a", "b"] or [a, b]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    }
    // Parse quoted strings
    else if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }

    meta[key] = value
  }

  return meta
}

function findSkillFiles(dir) {
  const skills = []

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)

    if (stat.isDirectory()) {
      skills.push(...findSkillFiles(full))
    } else if (entry === 'SKILL.md') {
      skills.push(full)
    }
  }

  return skills
}

/**
 * Exported for server/index.js — takes an existing db instance,
 * seeds if skills table is empty, returns count of skills seeded.
 */
export function seedSkills(db) {
  const count = db.prepare('SELECT COUNT(*) as n FROM skills').get().n
  if (count > 0) return 0

  const skillFiles = findSkillFiles(SKILLS_DIR)
  if (skillFiles.length === 0) return 0

  const insertSkill = db.prepare(`
    INSERT OR REPLACE INTO skills (id, slug, name, description, version, author, skill_md, tags, source, requires_tools)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertAgentSkill = db.prepare(`
    INSERT OR REPLACE INTO agent_skills_v2 (agent_id, skill_id, enabled, priority)
    VALUES (?, ?, 1, ?)
  `)

  let seeded = 0
  const tx = db.transaction(() => {
    let priority = 0
    for (const filePath of skillFiles) {
      const content = readFileSync(filePath, 'utf-8')
      const meta = parseYAMLFrontmatter(content)
      if (!meta || !meta.slug) continue

      const id = `skill_${meta.slug}`
      const tags = Array.isArray(meta.tags) ? JSON.stringify(meta.tags) : '[]'
      const requiresTools = Array.isArray(meta.requires_tools) ? JSON.stringify(meta.requires_tools) : '[]'
      let source = meta.source || 'custom'
      if (!['custom', 'clawhub', 'marketplace'].includes(source)) {
        source = source.includes('clawhub') ? 'clawhub' : 'custom'
      }

      insertSkill.run(id, meta.slug, meta.name || meta.slug, meta.description || '', meta.version || '1.0.0', meta.author || 'hive', content, tags, source, requiresTools)

      const agents = Array.isArray(meta.agents) ? meta.agents : []
      for (const agentId of agents) {
        insertAgentSkill.run(agentId, id, priority)
      }
      seeded++
      priority++
    }
  })
  tx()
  return seeded
}

/**
 * CLI mode — run directly with: node scripts/seed-skills.js [--force]
 */
function seedCLI(force = false) {
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const count = db.prepare('SELECT COUNT(*) as n FROM skills').get().n
  if (count > 0 && !force) {
    console.log(`Skills table already has ${count} entries. Use --force to re-seed.`)
    db.close()
    return
  }

  if (force) {
    db.prepare('DELETE FROM agent_skills_v2').run()
    db.prepare('DELETE FROM skills').run()
    console.log('Cleared existing skills and agent assignments.')
  }

  const skillFiles = findSkillFiles(SKILLS_DIR)
  console.log(`Found ${skillFiles.length} SKILL.md files.`)

  const insertSkill = db.prepare(`
    INSERT OR REPLACE INTO skills (id, slug, name, description, version, author, skill_md, tags, source, requires_tools)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertAgentSkill = db.prepare(`
    INSERT OR REPLACE INTO agent_skills_v2 (agent_id, skill_id, enabled, priority)
    VALUES (?, ?, 1, ?)
  `)

  const tx = db.transaction(() => {
    let priority = 0
    for (const filePath of skillFiles) {
      const content = readFileSync(filePath, 'utf-8')
      const meta = parseYAMLFrontmatter(content)
      if (!meta || !meta.slug) {
        console.warn(`Skipping ${filePath} — no valid frontmatter or slug.`)
        continue
      }

      const id = `skill_${meta.slug}`
      const tags = Array.isArray(meta.tags) ? JSON.stringify(meta.tags) : '[]'
      const requiresTools = Array.isArray(meta.requires_tools) ? JSON.stringify(meta.requires_tools) : '[]'
      let source = meta.source || 'custom'
      if (!['custom', 'clawhub', 'marketplace'].includes(source)) {
        source = source.includes('clawhub') ? 'clawhub' : 'custom'
      }

      insertSkill.run(id, meta.slug, meta.name || meta.slug, meta.description || '', meta.version || '1.0.0', meta.author || 'hive', content, tags, source, requiresTools)

      const agents = Array.isArray(meta.agents) ? meta.agents : []
      for (const agentId of agents) {
        insertAgentSkill.run(agentId, id, priority)
      }
      console.log(`  ✓ ${meta.slug} → [${agents.join(', ')}]`)
      priority++
    }
  })
  tx()

  const finalSkills = db.prepare('SELECT COUNT(*) as n FROM skills').get().n
  const finalAssignments = db.prepare('SELECT COUNT(*) as n FROM agent_skills_v2').get().n
  console.log(`\nSeeded ${finalSkills} skills with ${finalAssignments} agent assignments into hive.db.`)
  db.close()
}

// Only run CLI mode when executed directly (not imported)
const isMain = process.argv[1]?.endsWith('seed-skills.js')
if (isMain) {
  const force = process.argv.includes('--force')
  seedCLI(force)
}
