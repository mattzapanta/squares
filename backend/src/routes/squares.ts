import { Router } from 'express';
import { query } from '../db/index.js';
import { validate, schemas } from '../middleware/validation.js';
import { authenticateAdmin, AuthRequest } from '../middleware/auth.js';
import { claimSquare, releaseSquare, getGridWithPlayers } from '../services/gridService.js';
import { logAudit } from '../services/auditService.js';

const router = Router({ mergeParams: true });

router.use(authenticateAdmin);

// Get grid
router.get('/', async (req: AuthRequest, res) => {
  try {
    const poolResult = await query('SELECT id FROM pools WHERE id = $1 AND admin_id = $2', [req.params.id, req.admin!.id]);
    if (poolResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const grid = await getGridWithPlayers(req.params.id);
    res.json(grid);
  } catch (error) {
    console.error('Get grid error:', error);
    res.status(500).json({ error: 'Failed to get grid' });
  }
});

// Claim square (admin on behalf of player)
router.post('/claim', validate(schemas.claimSquare), async (req: AuthRequest, res) => {
  try {
    const { row, col, player_id } = req.body;

    if (!player_id) {
      return res.status(400).json({ error: 'player_id is required for admin claims' });
    }

    const result = await claimSquare(
      req.params.id,
      row,
      col,
      player_id,
      req.admin!.id,
      'admin'
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ message: 'Square claimed', row, col });
  } catch (error) {
    console.error('Claim square error:', error);
    res.status(500).json({ error: 'Failed to claim square' });
  }
});

// Release square
router.post('/release', validate(schemas.releaseSquare), async (req: AuthRequest, res) => {
  try {
    const { row, col } = req.body;

    const result = await releaseSquare(req.params.id, row, col, req.admin!.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ message: 'Square released', row, col, previousPlayer: result.previousPlayer });
  } catch (error) {
    console.error('Release square error:', error);
    res.status(500).json({ error: 'Failed to release square' });
  }
});

// Assign square to player
router.post('/assign', validate(schemas.assignSquare), async (req: AuthRequest, res) => {
  try {
    const { row, col, player_id } = req.body;

    // First release if claimed, then claim for new player
    await releaseSquare(req.params.id, row, col, req.admin!.id).catch(() => {}); // Ignore if not claimed

    const result = await claimSquare(
      req.params.id,
      row,
      col,
      player_id,
      req.admin!.id,
      'admin'
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ message: 'Square assigned', row, col });
  } catch (error) {
    console.error('Assign square error:', error);
    res.status(500).json({ error: 'Failed to assign square' });
  }
});

// Swap two squares
router.post('/swap', validate(schemas.swapSquares), async (req: AuthRequest, res) => {
  try {
    const { square1, square2 } = req.body;
    const poolId = req.params.id;

    // Get both squares
    const result = await query(
      `SELECT row_idx, col_idx, player_id FROM squares
       WHERE pool_id = $1 AND ((row_idx = $2 AND col_idx = $3) OR (row_idx = $4 AND col_idx = $5))`,
      [poolId, square1.row, square1.col, square2.row, square2.col]
    );

    if (result.rows.length !== 2) {
      return res.status(400).json({ error: 'Could not find both squares' });
    }

    const sq1 = result.rows.find(r => r.row_idx === square1.row && r.col_idx === square1.col);
    const sq2 = result.rows.find(r => r.row_idx === square2.row && r.col_idx === square2.col);

    // Swap player_ids
    await query(
      'UPDATE squares SET player_id = $1 WHERE pool_id = $2 AND row_idx = $3 AND col_idx = $4',
      [sq2?.player_id || null, poolId, square1.row, square1.col]
    );
    await query(
      'UPDATE squares SET player_id = $1 WHERE pool_id = $2 AND row_idx = $3 AND col_idx = $4',
      [sq1?.player_id || null, poolId, square2.row, square2.col]
    );

    await logAudit({
      pool_id: poolId,
      actor_type: 'admin',
      actor_id: req.admin!.id,
      action: 'squares_swapped',
      detail: { square1, square2 },
    });

    res.json({ message: 'Squares swapped' });
  } catch (error) {
    console.error('Swap squares error:', error);
    res.status(500).json({ error: 'Failed to swap squares' });
  }
});

export default router;
