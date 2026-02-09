import { query } from '../db/index.js';
import { ActorType } from '../config.js';
import { PoolClient } from 'pg';

export interface AuditEntry {
  pool_id?: string;
  actor_type: ActorType;
  actor_id?: string;
  action: string;
  detail?: Record<string, unknown>;
}

export async function logAudit(entry: AuditEntry, client?: PoolClient): Promise<void> {
  const sql = `INSERT INTO audit_log (pool_id, actor_type, actor_id, action, detail)
     VALUES ($1, $2, $3, $4, $5)`;
  const params = [
    entry.pool_id || null,
    entry.actor_type,
    entry.actor_id || null,
    entry.action,
    entry.detail ? JSON.stringify(entry.detail) : null,
  ];

  if (client) {
    await client.query(sql, params);
  } else {
    await query(sql, params);
  }
}

export async function getPoolAuditLog(poolId: string, limit = 100) {
  const result = await query(
    `SELECT * FROM audit_log
     WHERE pool_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [poolId, limit]
  );
  return result.rows;
}
