import { Router } from 'express';
import { query } from '../db/index.js';
import { authenticatePlayer, AuthRequest } from '../middleware/auth.js';
import { claimSquare, getGridWithPlayers } from '../services/gridService.js';
import { Player, Pool } from '../types/index.js';

const router = Router();

// Get player's view (their pools, grids, balance)
router.get('/:token', authenticatePlayer, async (req: AuthRequest, res) => {
  try {
    const player = req.player!;

    // Get all pools this player is in
    const poolsResult = await query(
      `SELECT p.*, pp.paid, pp.payment_status,
        (SELECT COUNT(*) FROM squares WHERE pool_id = p.id AND player_id = $1) as my_squares,
        (SELECT COUNT(*) FROM squares WHERE pool_id = p.id AND player_id IS NOT NULL) as claimed_count
       FROM pools p
       JOIN pool_players pp ON p.id = pp.pool_id
       WHERE pp.player_id = $1
       ORDER BY p.created_at DESC`,
      [player.id]
    );

    // Get ledger summary
    const ledgerResult = await query(
      `SELECT SUM(amount) as balance FROM ledger WHERE player_id = $1`,
      [player.id]
    );

    res.json({
      player: {
        id: player.id,
        name: player.name,
        phone: player.phone,
        email: player.email,
      },
      pools: poolsResult.rows,
      balance: parseInt(ledgerResult.rows[0]?.balance) || 0,
    });
  } catch (error) {
    console.error('Get player view error:', error);
    res.status(500).json({ error: 'Failed to get player view' });
  }
});

// Get specific pool view for player
router.get('/:token/pools/:poolId', authenticatePlayer, async (req: AuthRequest, res) => {
  try {
    const player = req.player!;
    const poolId = req.params.poolId;

    // Check player is in this pool
    const memberCheck = await query(
      'SELECT * FROM pool_players WHERE pool_id = $1 AND player_id = $2',
      [poolId, player.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this pool' });
    }

    // Get pool details
    const poolResult = await query<Pool>('SELECT * FROM pools WHERE id = $1', [poolId]);

    if (poolResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const pool = poolResult.rows[0];

    // Get grid
    const grid = await getGridWithPlayers(poolId);

    // Get scores and winners
    const [scoresResult, winnersResult] = await Promise.all([
      query('SELECT * FROM scores WHERE pool_id = $1 ORDER BY period_key', [poolId]),
      query(
        `SELECT w.*, p.name as player_name FROM winners w
         JOIN players p ON w.player_id = p.id
         WHERE w.pool_id = $1`,
        [poolId]
      ),
    ]);

    // Count my squares
    const mySquares = await query(
      'SELECT row_idx, col_idx FROM squares WHERE pool_id = $1 AND player_id = $2',
      [poolId, player.id]
    );

    res.json({
      pool,
      grid,
      scores: scoresResult.rows,
      winners: winnersResult.rows,
      mySquares: mySquares.rows,
      membership: memberCheck.rows[0],
    });
  } catch (error) {
    console.error('Get pool view error:', error);
    res.status(500).json({ error: 'Failed to get pool view' });
  }
});

// Claim a square (player self-service)
router.post('/:token/pools/:poolId/claim', authenticatePlayer, async (req: AuthRequest, res) => {
  try {
    const player = req.player!;
    const poolId = req.params.poolId;
    const { row, col } = req.body;

    if (typeof row !== 'number' || typeof col !== 'number' || row < 0 || row > 9 || col < 0 || col > 9) {
      return res.status(400).json({ error: 'Invalid row or col (must be 0-9)' });
    }

    const result = await claimSquare(poolId, row, col, player.id, player.id, 'player');

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ message: 'Square claimed', row, col });
  } catch (error) {
    console.error('Player claim error:', error);
    res.status(500).json({ error: 'Failed to claim square' });
  }
});

// Get player's ledger across all pools
router.get('/:token/ledger', authenticatePlayer, async (req: AuthRequest, res) => {
  try {
    const player = req.player!;

    const result = await query(
      `SELECT l.*, p.name as pool_name
       FROM ledger l
       JOIN pools p ON l.pool_id = p.id
       WHERE l.player_id = $1
       ORDER BY l.created_at DESC`,
      [player.id]
    );

    const total = await query(
      'SELECT SUM(amount) as balance FROM ledger WHERE player_id = $1',
      [player.id]
    );

    res.json({
      entries: result.rows,
      balance: parseInt(total.rows[0]?.balance) || 0,
    });
  } catch (error) {
    console.error('Get ledger error:', error);
    res.status(500).json({ error: 'Failed to get ledger' });
  }
});

export default router;
