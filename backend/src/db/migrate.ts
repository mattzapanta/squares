import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate(direction: 'up' | 'down' = 'up') {
  const migrationsDir = path.join(__dirname, 'migrations');

  // Create migrations tracking table if it doesn't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  if (direction === 'up') {
    // Get all migration files
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    // Get applied migrations
    const applied = await pool.query<{ name: string }>('SELECT name FROM _migrations');
    const appliedSet = new Set(applied.rows.map(r => r.name));

    // Apply pending migrations
    for (const file of files) {
      if (!appliedSet.has(file)) {
        console.log(`Applying migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

        try {
          await pool.query(sql);
          await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
          console.log(`  ✓ Applied ${file}`);
        } catch (error) {
          console.error(`  ✗ Failed to apply ${file}:`, error);
          throw error;
        }
      }
    }

    console.log('All migrations applied.');
  } else {
    // For down, we'd need separate down migration files
    // For now, just warn
    console.log('Down migrations not implemented. Please manually revert.');
  }

  await pool.end();
}

const direction = process.argv[2] === 'down' ? 'down' : 'up';
migrate(direction).catch(console.error);
