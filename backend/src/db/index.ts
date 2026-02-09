import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

import dns from 'dns';

// Force IPv4 DNS resolution (Render has IPv6 issues with some providers)
dns.setDefaultResultOrder('ipv4first');

// Use separate connection parameters if available (avoids $ escape issues)
const poolConfig = config.database.host ? {
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.name,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
} : {
  connectionString: config.database.url,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

export const pool = new Pool(poolConfig);

// Helper for transactions
export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Query helper with logging in dev
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'production') {
    console.log('Executed query', { text: text.substring(0, 100), duration, rows: result.rowCount });
  }
  return result;
}

// Check database connection
export async function checkConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    console.error('Database connection failed:', {
      message: err.message,
      code: err.code,
      dbUrl: config.database.url?.substring(0, 50) + '...',
    });
    return false;
  }
}

// Run pending migrations (self-healing)
export async function runMigrations(): Promise<void> {
  try {
    // Add custom_payouts column if it doesn't exist
    await pool.query(`
      ALTER TABLE pools ADD COLUMN IF NOT EXISTS custom_payouts JSONB
    `);
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration error:', error);
    // Don't throw - let the app continue even if migration fails
  }
}
