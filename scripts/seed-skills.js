/**
 * seed-skills.js
 *
 * Reads all SKILL.md files from the skills/ directory tree,
 * parses YAML frontmatter, and inserts each into the SQLite
 * skills table. Run on server startup if skills table is empty.
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

function seedSkills(force = false) {
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Create skills table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      version TEXT DEFAULT '1.0.0',
      author TEXT DEFAULT 'hive',
      skill_md TEXT NOT NULL,
      agents TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      source TEXT DEFAULT 'custom',
      requires_env TEXT DEFAULT '[]',
      requires_tools TEXT DEFAULT '[]',
      file_path TEXT DEFAULT '',
      installed_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // Check if already seeded
  const count = db.prepare('SELECT COUNT(*) as n FROM skills').get().n
  if (count > 0 && !force) {
    console.log(`Skills table already has ${count} entries. Use --force to re-seed.`)
    db.close()
    return
  }

  if (force) {
    db.prepare('DELETE FROM skills').run()
    console.log('Cleared existing skills.')
  }

  // Find all SKILL.md files
  const skillFiles = findSkillFiles(SKILLS_DIR)
  console.log(`Found ${skillFiles.length} SKILL.md files.`)

  const insert = db.prepare(`
    INSERT OR REPLACE INTO skills (id, slug, name, description, version, author, skill_md, agents, tags, source, requires_env, requires_tools, file_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const tx = db.transaction(() => {
    for (const filePath of skillFiles) {
      const content = readFileSync(filePath, 'utf-8')
      const meta = parseYAMLFrontmatter(content)

      if (!meta || !meta.slug) {
        console.warn(`Skipping ${filePath} — no valid frontmatter or slug.`)
        continue
      }

      const relPath = relative(join(import.meta.dirname, '..'), filePath)
      const id = `skill_${meta.slug}`
      const agents = Array.isArray(meta.agents) ? JSON.stringify(meta.agents) : '[]'
      const tags = Array.isArray(meta.tags) ? JSON.stringify(meta.tags) : '[]'
      const requiresEnv = Array.isArray(meta.requires_env) ? JSON.stringify(meta.requires_env) : '[]'
      const requiresTools = Array.isArray(meta.requires_tools) ? JSON.stringify(meta.requires_tools) : '[]'

      insert.run(
        id,
        meta.slug,
        meta.name || meta.slug,
        meta.description || '',
        meta.version || '1.0.0',
        meta.author || 'hive',
        content,
        agents,
        tags,
        meta.source || 'custom',
        requiresEnv,
        requiresTools,
        relPath
      )

      console.log(`  ✓ ${meta.slug} (${agents})`)
    }
  })

  tx()

  const final = db.prepare('SELECT COUNT(*) as n FROM skills').get().n
  console.log(`\nSeeded ${final} skills into hive.db.`)
  db.close()
}

// Run
const force = process.argv.includes('--force')
seedSkills(force)
