import { Router } from 'express';
import { query } from '../db/index.js';
import { validate, schemas } from '../middleware/validation.js';
import { authenticateAdmin, AuthRequest } from '../middleware/auth.js';
import {
  claimSquare,
  releaseSquare,
  getGridWithPlayers,
  getPendingRequests,
  approveSquare,
  rejectSquare,
  bulkApprovePlayer,
  bulkRejectPlayer,
} from '../services/gridService.js';
import { logAudit } from '../services/auditService.js';
import { sendSquareApprovedNotification, sendSquareRejectedNotification } from '../services/notificationService.js';

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

// Get pending square requests
router.get('/pending', async (req: AuthRequest, res) => {
  try {
    const poolResult = await query('SELECT id FROM pools WHERE id = $1 AND admin_id = $2', [req.params.id, req.admin!.id]);
    if (poolResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const pending = await getPendingRequests(req.params.id);
    res.json(pending);
  } catch (error) {
    console.error('Get pending error:', error);
    res.status(500).json({ error: 'Failed to get pending requests' });
  }
});

// Claim square (admin on behalf of player - always bypasses approval)
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

    res.json({ message: 'Square claimed', row, col, status: result.status });
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

    res.json({ message: 'Square released', row, col, previousPlayer: result.previousPlayer, wasStatus: result.wasStatus });
  } catch (error) {
    console.error('Release square error:', error);
    res.status(500).json({ error: 'Failed to release square' });
  }
});

// Approve a pending square request
router.post('/approve', validate(schemas.releaseSquare), async (req: AuthRequest, res) => {
  try {
    const { row, col } = req.body;
    const poolId = req.params.id;

    const result = await approveSquare(poolId, row, col, req.admin!.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Send notification to player (async, don't wait)
    if (result.playerId) {
      sendSquareApprovedNotification(result.playerId, poolId, [{ row, col }])
        .catch(err => console.error('[Notification] Failed to send approval notification:', err));
    }

    res.json({ message: 'Square approved', row, col, playerName: result.playerName });
  } catch (error) {
    console.error('Approve square error:', error);
    res.status(500).json({ error: 'Failed to approve square' });
  }
});

// Reject a pending square request
router.post('/reject', validate(schemas.releaseSquare), async (req: AuthRequest, res) => {
  try {
    const { row, col } = req.body;
    const poolId = req.params.id;

    const result = await rejectSquare(poolId, row, col, req.admin!.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Send notification to player (async, don't wait)
    if (result.playerId) {
      sendSquareRejectedNotification(result.playerId, poolId, [{ row, col }])
        .catch(err => console.error('[Notification] Failed to send rejection notification:', err));
    }

    res.json({ message: 'Square request rejected', row, col, playerName: result.playerName });
  } catch (error) {
    console.error('Reject square error:', error);
    res.status(500).json({ error: 'Failed to reject square request' });
  }
});

// Bulk approve all pending requests from a player
router.post('/bulk-approve/:playerId', async (req: AuthRequest, res) => {
  try {
    const poolId = req.params.id;
    const playerId = req.params.playerId;

    const result = await bulkApprovePlayer(poolId, playerId, req.admin!.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Send notification for all approved squares (async)
    if (result.approvedSquares && result.approvedSquares.length > 0) {
      sendSquareApprovedNotification(playerId, poolId, result.approvedSquares)
        .catch(err => console.error('[Notification] Failed to send bulk approval notification:', err));
    }

    res.json({ message: `Approved ${result.approved} squares`, approved: result.approved });
  } catch (error) {
    console.error('Bulk approve error:', error);
    res.status(500).json({ error: 'Failed to bulk approve' });
  }
});

// Bulk reject all pending requests from a player
router.post('/bulk-reject/:playerId', async (req: AuthRequest, res) => {
  try {
    const poolId = req.params.id;
    const playerId = req.params.playerId;

    const result = await bulkRejectPlayer(poolId, playerId, req.admin!.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Send notification for rejected squares (async)
    if (result.rejectedSquares && result.rejectedSquares.length > 0) {
      sendSquareRejectedNotification(playerId, poolId, result.rejectedSquares)
        .catch(err => console.error('[Notification] Failed to send bulk rejection notification:', err));
    }

    res.json({ message: `Rejected ${result.rejected} squares`, rejected: result.rejected });
  } catch (error) {
    console.error('Bulk reject error:', error);
    res.status(500).json({ error: 'Failed to bulk reject' });
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

    // Get both squares (only allow swapping claimed squares, not pending)
    const result = await query(
      `SELECT row_idx, col_idx, player_id, claim_status FROM squares
       WHERE pool_id = $1 AND ((row_idx = $2 AND col_idx = $3) OR (row_idx = $4 AND col_idx = $5))`,
      [poolId, square1.row, square1.col, square2.row, square2.col]
    );

    if (result.rows.length !== 2) {
      return res.status(400).json({ error: 'Could not find both squares' });
    }

    // Check that neither square is pending
    if (result.rows.some(r => r.claim_status === 'pending')) {
      return res.status(400).json({ error: 'Cannot swap pending squares. Approve or reject them first.' });
    }

    const sq1 = result.rows.find(r => r.row_idx === square1.row && r.col_idx === square1.col);
    const sq2 = result.rows.find(r => r.row_idx === square2.row && r.col_idx === square2.col);

    // Swap player_ids and update claim_status accordingly
    const sq1Status = sq2?.player_id ? 'claimed' : 'available';
    const sq2Status = sq1?.player_id ? 'claimed' : 'available';

    await query(
      `UPDATE squares SET player_id = $1, claim_status = $5
       WHERE pool_id = $2 AND row_idx = $3 AND col_idx = $4`,
      [sq2?.player_id || null, poolId, square1.row, square1.col, sq1Status]
    );
    await query(
      `UPDATE squares SET player_id = $1, claim_status = $5
       WHERE pool_id = $2 AND row_idx = $3 AND col_idx = $4`,
      [sq1?.player_id || null, poolId, square2.row, square2.col, sq2Status]
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
