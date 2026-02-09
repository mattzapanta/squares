import { query, withTransaction } from '../db/index.js';
import { Square, Pool, ClaimStatus } from '../types/index.js';
import { logAudit } from './auditService.js';
import crypto from 'crypto';
import { PoolClient } from 'pg';

// Initialize empty 10x10 grid for a pool
export async function initializeGrid(poolId: string, client?: PoolClient): Promise<void> {
  const values: string[] = [];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
      params.push(poolId, row, col);
    }
  }

  // Add claim_status='available' as default
  const sql = `INSERT INTO squares (pool_id, row_idx, col_idx) VALUES ${values.join(', ')}`;

  if (client) {
    await client.query(sql, params);
  } else {
    await query(sql, params);
  }
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
       s.row_idx, s.col_idx, s.player_id, s.claim_status, s.claimed_at, s.requested_at, s.is_admin_override,
       p.name as player_name,
       p.phone as player_phone,
       p.email as player_email,
       pp.paid, pp.payment_status
     FROM squares s
     LEFT JOIN players p ON s.player_id = p.id
     LEFT JOIN pool_players pp ON s.player_id = pp.player_id AND pp.pool_id = $1
     WHERE s.pool_id = $1
     ORDER BY s.row_idx, s.col_idx`,
    [poolId]
  );

  // Convert to 2D array - include pending squares too
  const grid: (typeof result.rows[0] | null)[][] = Array(10).fill(null).map(() => Array(10).fill(null));
  for (const row of result.rows) {
    // Include if claimed OR pending (has player_id)
    grid[row.row_idx][row.col_idx] = row.player_id ? row : null;
  }

  return grid;
}

// Get pending square requests for a pool
export async function getPendingRequests(poolId: string) {
  const result = await query(
    `SELECT s.row_idx as row, s.col_idx as col, s.player_id, s.requested_at, p.name as player_name
     FROM squares s
     JOIN players p ON s.player_id = p.id
     WHERE s.pool_id = $1 AND s.claim_status = 'pending'
     ORDER BY s.requested_at ASC`,
    [poolId]
  );
  return result.rows;
}

// Count player's squares (claimed + pending count towards limits)
async function getPlayerSquareCount(client: PoolClient, poolId: string, playerId: string): Promise<{ claimed: number; pending: number }> {
  const result = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE claim_status = 'claimed') as claimed,
       COUNT(*) FILTER (WHERE claim_status = 'pending') as pending
     FROM squares
     WHERE pool_id = $1 AND player_id = $2`,
    [poolId, playerId]
  );
  return {
    claimed: parseInt(result.rows[0].claimed || '0'),
    pending: parseInt(result.rows[0].pending || '0'),
  };
}

export interface ClaimResult {
  success: boolean;
  error?: string;
  status?: 'claimed' | 'pending';
}

// Claim a square - may result in immediate claim or pending approval
export async function claimSquare(
  poolId: string,
  row: number,
  col: number,
  playerId: string,
  actorId: string,
  actorType: 'admin' | 'player'
): Promise<ClaimResult> {
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

    // Check if player is banned
    const playerResult = await client.query('SELECT name, banned FROM players WHERE id = $1', [playerId]);
    if (playerResult.rows[0]?.banned) {
      return { success: false, error: 'Player is banned from this pool' };
    }
    const playerName = playerResult.rows[0]?.name || 'Unknown';

    // Get current square counts (claimed + pending both count towards max)
    const counts = await getPlayerSquareCount(client, poolId, playerId);
    const totalSquares = counts.claimed + counts.pending;

    // Check max squares per player (admin can bypass)
    if (totalSquares >= pool.max_per_player && actorType !== 'admin') {
      return { success: false, error: `Maximum ${pool.max_per_player} squares per player` };
    }

    // Check if square is available (not claimed and not pending)
    const squareResult = await client.query(
      `SELECT * FROM squares
       WHERE pool_id = $1 AND row_idx = $2 AND col_idx = $3
       FOR UPDATE`,
      [poolId, row, col]
    );

    if (squareResult.rows.length === 0) {
      return { success: false, error: 'Square not found' };
    }

    const square = squareResult.rows[0];
    if (square.claim_status !== 'available') {
      if (square.claim_status === 'pending') {
        return { success: false, error: 'Square has a pending request' };
      }
      return { success: false, error: 'Square is already claimed' };
    }

    // Determine if this claim needs approval
    // Admin claims always bypass approval
    // Player claims: if this would be their (threshold+1)th square, it needs approval
    const needsApproval = actorType === 'player' &&
                          counts.claimed >= pool.approval_threshold;

    const newStatus: ClaimStatus = needsApproval ? 'pending' : 'claimed';
    const isOverride = pool.status !== 'open';

    if (needsApproval) {
      // Create pending request
      await client.query(
        `UPDATE squares
         SET player_id = $1, claim_status = 'pending', requested_at = NOW(), is_admin_override = $5
         WHERE pool_id = $2 AND row_idx = $3 AND col_idx = $4`,
        [playerId, poolId, row, col, isOverride]
      );

      await logAudit({
        pool_id: poolId,
        actor_type: actorType,
        actor_id: actorId,
        action: 'square_request_pending',
        detail: { row, col, player_id: playerId, player_name: playerName, current_count: counts.claimed },
      }, client);

      return { success: true, status: 'pending' };
    } else {
      // Immediate claim
      await client.query(
        `UPDATE squares
         SET player_id = $1, claim_status = 'claimed', claimed_at = NOW(), is_admin_override = $5
         WHERE pool_id = $2 AND row_idx = $3 AND col_idx = $4`,
        [playerId, poolId, row, col, isOverride]
      );

      await logAudit({
        pool_id: poolId,
        actor_type: actorType,
        actor_id: actorId,
        action: 'square_claimed',
        detail: { row, col, player_id: playerId, player_name: playerName },
      }, client);

      return { success: true, status: 'claimed' };
    }
  });
}

// Approve a pending square request
export async function approveSquare(
  poolId: string,
  row: number,
  col: number,
  adminId: string
): Promise<{ success: boolean; error?: string; playerName?: string; playerId?: string }> {
  return withTransaction(async (client) => {
    const squareResult = await client.query(
      `SELECT s.*, p.name as player_name
       FROM squares s
       JOIN players p ON s.player_id = p.id
       WHERE s.pool_id = $1 AND s.row_idx = $2 AND s.col_idx = $3
       FOR UPDATE`,
      [poolId, row, col]
    );

    if (squareResult.rows.length === 0) {
      return { success: false, error: 'Square not found' };
    }

    const square = squareResult.rows[0];
    if (square.claim_status !== 'pending') {
      return { success: false, error: 'Square is not pending approval' };
    }

    await client.query(
      `UPDATE squares
       SET claim_status = 'claimed', claimed_at = NOW()
       WHERE pool_id = $1 AND row_idx = $2 AND col_idx = $3`,
      [poolId, row, col]
    );

    await logAudit({
      pool_id: poolId,
      actor_type: 'admin',
      actor_id: adminId,
      action: 'square_request_approved',
      detail: { row, col, player_id: square.player_id, player_name: square.player_name },
    }, client);

    return { success: true, playerName: square.player_name, playerId: square.player_id };
  });
}

// Reject a pending square request
export async function rejectSquare(
  poolId: string,
  row: number,
  col: number,
  adminId: string
): Promise<{ success: boolean; error?: string; playerName?: string; playerId?: string }> {
  return withTransaction(async (client) => {
    const squareResult = await client.query(
      `SELECT s.*, p.name as player_name
       FROM squares s
       JOIN players p ON s.player_id = p.id
       WHERE s.pool_id = $1 AND s.row_idx = $2 AND s.col_idx = $3
       FOR UPDATE`,
      [poolId, row, col]
    );

    if (squareResult.rows.length === 0) {
      return { success: false, error: 'Square not found' };
    }

    const square = squareResult.rows[0];
    if (square.claim_status !== 'pending') {
      return { success: false, error: 'Square is not pending approval' };
    }

    await client.query(
      `UPDATE squares
       SET player_id = NULL, claim_status = 'available', requested_at = NULL
       WHERE pool_id = $1 AND row_idx = $2 AND col_idx = $3`,
      [poolId, row, col]
    );

    const playerId = square.player_id;

    await logAudit({
      pool_id: poolId,
      actor_type: 'admin',
      actor_id: adminId,
      action: 'square_request_rejected',
      detail: { row, col, player_id: playerId, player_name: square.player_name },
    }, client);

    return { success: true, playerName: square.player_name, playerId };
  });
}

// Cancel a pending request (by player)
export async function cancelPendingSquare(
  poolId: string,
  row: number,
  col: number,
  playerId: string
): Promise<{ success: boolean; error?: string }> {
  return withTransaction(async (client) => {
    const squareResult = await client.query(
      `SELECT * FROM squares
       WHERE pool_id = $1 AND row_idx = $2 AND col_idx = $3
       FOR UPDATE`,
      [poolId, row, col]
    );

    if (squareResult.rows.length === 0) {
      return { success: false, error: 'Square not found' };
    }

    const square = squareResult.rows[0];
    if (square.claim_status !== 'pending') {
      return { success: false, error: 'Square is not pending' };
    }
    if (square.player_id !== playerId) {
      return { success: false, error: 'Not your pending request' };
    }

    await client.query(
      `UPDATE squares
       SET player_id = NULL, claim_status = 'available', requested_at = NULL
       WHERE pool_id = $1 AND row_idx = $2 AND col_idx = $3`,
      [poolId, row, col]
    );

    const playerResult = await client.query('SELECT name FROM players WHERE id = $1', [playerId]);
    const playerName = playerResult.rows[0]?.name || 'Unknown';

    await logAudit({
      pool_id: poolId,
      actor_type: 'player',
      actor_id: playerId,
      action: 'square_request_cancelled',
      detail: { row, col, player_name: playerName },
    }, client);

    return { success: true };
  });
}

// Bulk approve all pending requests from a player
export async function bulkApprovePlayer(
  poolId: string,
  playerId: string,
  adminId: string
): Promise<{ success: boolean; approved: number; error?: string; approvedSquares?: { row: number; col: number }[] }> {
  return withTransaction(async (client) => {
    const pendingResult = await client.query(
      `SELECT s.row_idx, s.col_idx FROM squares s
       WHERE s.pool_id = $1 AND s.player_id = $2 AND s.claim_status = 'pending'
       FOR UPDATE`,
      [poolId, playerId]
    );

    if (pendingResult.rows.length === 0) {
      return { success: false, approved: 0, error: 'No pending requests from this player' };
    }

    await client.query(
      `UPDATE squares
       SET claim_status = 'claimed', claimed_at = NOW()
       WHERE pool_id = $1 AND player_id = $2 AND claim_status = 'pending'`,
      [poolId, playerId]
    );

    const playerResult = await client.query('SELECT name FROM players WHERE id = $1', [playerId]);
    const playerName = playerResult.rows[0]?.name || 'Unknown';

    const approvedSquares = pendingResult.rows.map(r => ({ row: r.row_idx, col: r.col_idx }));

    await logAudit({
      pool_id: poolId,
      actor_type: 'admin',
      actor_id: adminId,
      action: 'squares_bulk_approved',
      detail: {
        player_id: playerId,
        player_name: playerName,
        count: pendingResult.rows.length,
        squares: approvedSquares,
      },
    }, client);

    return { success: true, approved: pendingResult.rows.length, approvedSquares };
  });
}

// Bulk reject all pending requests from a player
export async function bulkRejectPlayer(
  poolId: string,
  playerId: string,
  adminId: string
): Promise<{ success: boolean; rejected: number; error?: string; rejectedSquares?: { row: number; col: number }[] }> {
  return withTransaction(async (client) => {
    const pendingResult = await client.query(
      `SELECT s.row_idx, s.col_idx FROM squares s
       WHERE s.pool_id = $1 AND s.player_id = $2 AND s.claim_status = 'pending'
       FOR UPDATE`,
      [poolId, playerId]
    );

    if (pendingResult.rows.length === 0) {
      return { success: false, rejected: 0, error: 'No pending requests from this player' };
    }

    await client.query(
      `UPDATE squares
       SET player_id = NULL, claim_status = 'available', requested_at = NULL
       WHERE pool_id = $1 AND player_id = $2 AND claim_status = 'pending'`,
      [poolId, playerId]
    );

    const playerResult = await client.query('SELECT name FROM players WHERE id = $1', [playerId]);
    const playerName = playerResult.rows[0]?.name || 'Unknown';

    const rejectedSquares = pendingResult.rows.map(r => ({ row: r.row_idx, col: r.col_idx }));

    await logAudit({
      pool_id: poolId,
      actor_type: 'admin',
      actor_id: adminId,
      action: 'squares_bulk_rejected',
      detail: {
        player_id: playerId,
        player_name: playerName,
        count: pendingResult.rows.length,
        squares: rejectedSquares,
      },
    }, client);

    return { success: true, rejected: pendingResult.rows.length, rejectedSquares };
  });
}

// Release a square (works for both claimed and pending)
export async function releaseSquare(
  poolId: string,
  row: number,
  col: number,
  adminId: string
): Promise<{ success: boolean; error?: string; previousPlayer?: string; wasStatus?: ClaimStatus }> {
  return withTransaction(async (client) => {
    const squareResult = await client.query(
      `SELECT * FROM squares
       WHERE pool_id = $1 AND row_idx = $2 AND col_idx = $3
       FOR UPDATE`,
      [poolId, row, col]
    );

    if (squareResult.rows.length === 0) {
      return { success: false, error: 'Square not found' };
    }

    const square = squareResult.rows[0];
    if (!square.player_id || square.claim_status === 'available') {
      return { success: false, error: 'Square is not claimed or pending' };
    }

    const previousStatus = square.claim_status as ClaimStatus;

    // Get player name
    const playerResult = await client.query('SELECT name FROM players WHERE id = $1', [square.player_id]);
    const previousPlayer = playerResult.rows[0]?.name || 'Unknown';

    // Check pool status for override flag
    const poolResult = await client.query('SELECT status FROM pools WHERE id = $1', [poolId]);
    const isLocked = poolResult.rows[0]?.status !== 'open';

    // Release the square
    await client.query(
      `UPDATE squares
       SET player_id = NULL, claim_status = 'available', released_at = NOW(),
           requested_at = NULL, is_admin_override = $4
       WHERE pool_id = $1 AND row_idx = $2 AND col_idx = $3`,
      [poolId, row, col, isLocked]
    );

    await logAudit({
      pool_id: poolId,
      actor_type: 'admin',
      actor_id: adminId,
      action: previousStatus === 'pending' ? 'square_request_rejected' : 'square_released',
      detail: { row, col, previous_player: previousPlayer, was_status: previousStatus },
    }, client);

    return { success: true, previousPlayer, wasStatus: previousStatus };
  });
}

// Release all squares (claimed and pending) for a player in a pool
export async function releaseAllPlayerSquares(
  poolId: string,
  playerId: string,
  adminId: string
): Promise<{ success: boolean; released: number }> {
  return withTransaction(async (client) => {
    const squaresResult = await client.query(
      `SELECT row_idx, col_idx, claim_status FROM squares
       WHERE pool_id = $1 AND player_id = $2`,
      [poolId, playerId]
    );

    if (squaresResult.rows.length === 0) {
      return { success: true, released: 0 };
    }

    const poolResult = await client.query('SELECT status FROM pools WHERE id = $1', [poolId]);
    const isLocked = poolResult.rows[0]?.status !== 'open';

    await client.query(
      `UPDATE squares
       SET player_id = NULL, claim_status = 'available', released_at = NOW(),
           requested_at = NULL, is_admin_override = $3
       WHERE pool_id = $1 AND player_id = $2`,
      [poolId, playerId, isLocked]
    );

    const playerResult = await client.query('SELECT name FROM players WHERE id = $1', [playerId]);
    const playerName = playerResult.rows[0]?.name || 'Unknown';

    await logAudit({
      pool_id: poolId,
      actor_type: 'admin',
      actor_id: adminId,
      action: 'player_squares_released',
      detail: {
        player_id: playerId,
        player_name: playerName,
        count: squaresResult.rows.length,
        squares: squaresResult.rows.map(r => ({ row: r.row_idx, col: r.col_idx, status: r.claim_status })),
      },
    }, client);

    return { success: true, released: squaresResult.rows.length };
  });
}

// Lock grid and randomize digits
export async function lockGrid(poolId: string, adminId: string): Promise<{ success: boolean; error?: string; pendingCount?: number }> {
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

    // Check for pending squares - block lock if any exist
    const pendingResult = await client.query(
      `SELECT COUNT(*) as count FROM squares WHERE pool_id = $1 AND claim_status = 'pending'`,
      [poolId]
    );
    const pendingCount = parseInt(pendingResult.rows[0].count);

    if (pendingCount > 0) {
      return {
        success: false,
        error: `Cannot lock grid with ${pendingCount} pending square request(s). Approve or reject them first.`,
        pendingCount,
      };
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
    }, client);

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
    }, client);

    return { success: true };
  });
}

// Get claimed count for a pool (only actually claimed, not pending)
export async function getClaimedCount(poolId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*) as count FROM squares WHERE pool_id = $1 AND claim_status = 'claimed'`,
    [poolId]
  );
  return parseInt(result.rows[0].count);
}

// Get pending count for a pool
export async function getPendingCount(poolId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*) as count FROM squares WHERE pool_id = $1 AND claim_status = 'pending'`,
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
