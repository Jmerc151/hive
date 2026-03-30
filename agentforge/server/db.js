import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://agentforge:agentforge@localhost:5432/agentforge',
  max: 20,
  idleTimeoutMillis: 30000,
});

// Scoped query helper — always pass workspace_id for tenant isolation
export function query(text, params) {
  return pool.query(text, params);
}

// Transaction helper
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run migrations
export async function migrate() {
  const migrationFiles = ['001_init.sql', '002_password_reset.sql'];
  for (const file of migrationFiles) {
    const sql = readFileSync(join(__dirname, '..', 'migrations', file), 'utf8');
    try {
      await pool.query(sql);
    } catch (err) {
      if (err.code === '42P07' || err.code === '42710') {
        // Table or index already exists, skip
      } else {
        throw err;
      }
    }
  }
  console.log('Migrations applied successfully');
}

// Health check
export async function checkHealth() {
  const { rows } = await pool.query('SELECT 1 as ok');
  return rows[0]?.ok === 1;
}

export default pool;
