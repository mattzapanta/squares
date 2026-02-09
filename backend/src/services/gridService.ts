import { query, withTransaction } from '../db/index.js';
import { Square, Pool } from '../types/index.js';
import { logAudit } from './auditService.js';
import crypto from 'crypto';

// Initialize empty 10x10 grid for a pool
export async function initializeGrid(poolId: string): Promise<void> {
  const values: string[] = [];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
      params.push(poolId, row, col);
    }
  }

  await query(
    `INSERT INTO squares (pool_id, row_idx, col_idx) VALUES ${values.join(', ')}`,
    params
  );
}

// Get grid for a pool
export async function getGrid(poolId: string): Promise<Square[]> {
  const result = await query<Square>(
    `SELECT s.*, p.name as player_name
     FROM squares s
     LEFT JOIN players p ON s.player_id = p.id
     WHERE s.pool_id = $1
     ORDER BY s.row_idx, s.col_idx`,
    [poolId]
  );
  return result.rows;
}

// Get grid with player details formatted for frontend
export async function getGridWithPlayers(poolId: string) {
  const result = await query(
    `SELECT
       s.row_idx, s.col_idx, s.player_id, s.claimed_at, s.is_admin_override,
       p.name as player_name,
       pp.paid, pp.payment_status
     FROM squares s
     LEFT JOIN players p ON s.player_id = p.id
     LEFT JOIN pool_players pp ON s.player_id = pp.player_id AND pp.pool_id = $1
     WHERE s.pool_id = $1
     ORDER BY s.row_idx, s.col_idx`,
    [poolId]
  );

  // Convert to 2D array
  const grid: (typeof result.rows[0] | null)[][] = Array(10).fill(null).map(() => Array(10).fill(null));
  for (const row of result.rows) {
    grid[row.row_idx][row.col_idx] = row.player_id ? row : null;
  }

  return grid;
}

// Claim a square
export async function claimSquare(
  poolId: string,
  row: number,
  col: number,
  playerId: string,
  actorId: string,
  actorType: 'admin' | 'player'
): Promise<{ success: boolean; error?: string }> {
  return withTransaction(async (client) => {
    // Check pool status
    const poolResult = await client.query<Pool>(
      'SELECT * FROM pools WHERE id = $1 FOR UPDATE',
      [poolId]
    );

    if (poolResult.rows.length === 0) {
      return { success: false, error: 'Pool not found' };
    }

    const pool = poolResult.rows[0];

    if (pool.status !== 'open' && actorType !== 'admin') {
      return { success: false, error: 'Pool is not open for claims' };
    }

    // Check if player is in the pool
    const memberResult = await client.query(
      'SELECT * FROM pool_players WHERE pool_id = $1 AND player_id = $2',
      [poolId, playerId]
    );

    if (memberResult.rows.length === 0) {
      return { success: false, error: 'Player is not a member of this pool' };
    }

    // Check max squares per player
    const countResult = await client.query(
      'SELECT COUNT(*) as count FROM squares WHERE pool_id = $1 AND player_id = $2',
      [poolId, playerId]
    );

    if (parseInt(countResult.rows[0].count) >= pool.max_per_player && actorType !== 'admin') {
      return { success: false, error: `Maximum ${pool.max_per_player} squares per player` };
    }

    // Try to claim the square
    const updateResult = await client.query(
      `UPDATE squares
       SET player_id = $1, claimed_at = NOW(), is_admin_override = $4
       WHERE pool_id = $2 AND row_idx = $3 AND col_idx = $5 AND player_id IS NULL
       RETURNING *`,
      [playerId, poolId, row, col, pool.status !== 'open', col]
    );

    if (updateResult.rows.length === 0) {
      // Square already claimed
      return { success: false, error: 'Square is already claimed' };
    }

    // Get player name for audit
    const playerResult = await client.query('SELECT name FROM players WHERE id = $1', [playerId]);
    const playerName = playerResult.rows[0]?.name || 'Unknown';

    await logAudit({
      pool_id: poolId,
      actor_type: actorType,
      actor_id: actorId,
      action: 'square_claimed',
      detail: { row, col, player_id: playerId, player_name: playerName },
    });

    return { success: true };
  });
}

// Release a square
export async function releaseSquare(
  poolId: string,
  row: number,
  col: number,
  adminId: string
): Promise<{ success: boolean; error?: string; previousPlayer?: string }> {
  return withTransaction(async (client) => {
    // Get current square owner
    const squareResult = await client.query(
      `SELECT s.*, p.name as player_name
       FROM squares s
       LEFT JOIN players p ON s.player_id = p.id
       WHERE s.pool_id = $1 AND s.row_idx = $2 AND s.col_idx = $3
       FOR UPDATE`,
      [poolId, row, col]
    );

    if (squareResult.rows.length === 0) {
      return { success: false, error: 'Square not found' };
    }

    const square = squareResult.rows[0];
    if (!square.player_id) {
      return { success: false, error: 'Square is not claimed' };
    }

    const previousPlayer = square.player_name;

    // Check pool status for override flag
    const poolResult = await client.query('SELECT status FROM pools WHERE id = $1', [poolId]);
    const isLocked = poolResult.rows[0]?.status !== 'open';

    // Release the square
    await client.query(
      `UPDATE squares
       SET player_id = NULL, released_at = NOW(), is_admin_override = $4
       WHERE pool_id = $1 AND row_idx = $2 AND col_idx = $3`,
      [poolId, row, col, isLocked]
    );

    await logAudit({
      pool_id: poolId,
      actor_type: 'admin',
      actor_id: adminId,
      action: 'square_released',
      detail: { row, col, previous_player: previousPlayer },
    });

    return { success: true, previousPlayer };
  });
}

// Lock grid and randomize digits
export async function lockGrid(poolId: string, adminId: string): Promise<{ success: boolean; error?: string }> {
  return withTransaction(async (client) => {
    const poolResult = await client.query<Pool>(
      'SELECT * FROM pools WHERE id = $1 FOR UPDATE',
      [poolId]
    );

    if (poolResult.rows.length === 0) {
      return { success: false, error: 'Pool not found' };
    }

    const pool = poolResult.rows[0];

    if (pool.status !== 'open') {
      return { success: false, error: 'Pool is already locked' };
    }

    // Generate random digits
    const colDigits = shuffleArray([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const rowDigits = shuffleArray([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    await client.query(
      `UPDATE pools
       SET status = 'locked', locked_at = NOW(), col_digits = $2, row_digits = $3
       WHERE id = $1`,
      [poolId, colDigits, rowDigits]
    );

    await logAudit({
      pool_id: poolId,
      actor_type: 'admin',
      actor_id: adminId,
      action: 'grid_locked',
      detail: { col_digits: colDigits, row_digits: rowDigits },
    });

    return { success: true };
  });
}

// Unlock grid (admin override)
export async function unlockGrid(poolId: string, adminId: string): Promise<{ success: boolean; error?: string }> {
  return withTransaction(async (client) => {
    const poolResult = await client.query<Pool>(
      'SELECT * FROM pools WHERE id = $1 FOR UPDATE',
      [poolId]
    );

    if (poolResult.rows.length === 0) {
      return { success: false, error: 'Pool not found' };
    }

    const pool = poolResult.rows[0];

    if (pool.status === 'open') {
      return { success: false, error: 'Pool is already unlocked' };
    }

    if (pool.status === 'final') {
      return { success: false, error: 'Cannot unlock a finalized pool' };
    }

    await client.query(
      `UPDATE pools
       SET status = 'open', locked_at = NULL, col_digits = NULL, row_digits = NULL
       WHERE id = $1`,
      [poolId]
    );

    // Clear any scores and winners since digits are being reset
    await client.query('DELETE FROM winners WHERE pool_id = $1', [poolId]);
    await client.query('DELETE FROM scores WHERE pool_id = $1', [poolId]);

    await logAudit({
      pool_id: poolId,
      actor_type: 'admin',
      actor_id: adminId,
      action: 'grid_unlocked',
      detail: { note: 'Digits cleared, scores reset' },
    });

    return { success: true };
  });
}

// Get claimed count for a pool
export async function getClaimedCount(poolId: string): Promise<number> {
  const result = await query(
    'SELECT COUNT(*) as count FROM squares WHERE pool_id = $1 AND player_id IS NOT NULL',
    [poolId]
  );
  return parseInt(result.rows[0].count);
}

// Cryptographically secure shuffle
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const randomBytes = crypto.randomBytes(4);
    const randomValue = randomBytes.readUInt32BE(0);
    const j = randomValue % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
