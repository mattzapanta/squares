import { Router } from 'express';
import { query, withTransaction } from '../db/index.js';
import { validate, schemas } from '../middleware/validation.js';
import { authenticateAdmin, AuthRequest } from '../middleware/auth.js';
import { initializeGrid, getGridWithPlayers, lockGrid, unlockGrid, getClaimedCount } from '../services/gridService.js';
import { getPoolScores, getPoolWinners } from '../services/winnerService.js';
import { logAudit } from '../services/auditService.js';
import { Pool, PoolWithStats } from '../types/index.js';

const router = Router();

// All pool routes require admin auth
router.use(authenticateAdmin);

// List admin's pools
router.get('/', async (req: AuthRequest, res) => {
  try {
    const result = await query<PoolWithStats>(
      `SELECT p.*,
        (SELECT COUNT(*) FROM squares WHERE pool_id = p.id AND player_id IS NOT NULL) as claimed_count,
        (SELECT COUNT(*) FROM pool_players WHERE pool_id = p.id) as player_count,
        (SELECT COUNT(*) FROM pool_players WHERE pool_id = p.id AND payment_status = 'pending') as pending_count
       FROM pools p
       WHERE p.admin_id = $1
       ORDER BY p.created_at DESC`,
      [req.admin!.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('List pools error:', error);
    res.status(500).json({ error: 'Failed to list pools' });
  }
});

// Create pool
router.post('/', validate(schemas.createPool), async (req: AuthRequest, res) => {
  try {
    const pool = await withTransaction(async (client) => {
      const result = await client.query<Pool>(
        `INSERT INTO pools (admin_id, name, sport, away_team, home_team, game_date, game_time, game_label, denomination, payout_structure, tip_pct, max_per_player, ot_rule, external_game_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          req.admin!.id,
          req.body.name,
          req.body.sport,
          req.body.away_team,
          req.body.home_team,
          req.body.game_date || null,
          req.body.game_time || null,
          req.body.game_label || null,
          req.body.denomination,
          req.body.payout_structure,
          req.body.tip_pct,
          req.body.max_per_player,
          req.body.ot_rule,
          req.body.external_game_id || null,
        ]
      );

      const pool = result.rows[0];

      // Initialize the 10x10 grid
      await initializeGrid(pool.id);

      // Auto-add admin as a player in their own pool
      const admin = req.admin as any;
      if (admin.player_id) {
        await client.query(
          `INSERT INTO pool_players (pool_id, player_id, paid, payment_status)
           VALUES ($1, $2, true, 'confirmed')
           ON CONFLICT DO NOTHING`,
          [pool.id, admin.player_id]
        );
      }

      await logAudit({
        pool_id: pool.id,
        actor_type: 'admin',
        actor_id: req.admin!.id,
        action: 'pool_created',
        detail: { name: pool.name, sport: pool.sport, denomination: pool.denomination },
      });

      return pool;
    });

    res.status(201).json(pool);
  } catch (error) {
    console.error('Create pool error:', error);
    res.status(500).json({ error: 'Failed to create pool' });
  }
});

// Get pool detail
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const poolResult = await query<Pool>(
      'SELECT * FROM pools WHERE id = $1 AND admin_id = $2',
      [req.params.id, req.admin!.id]
    );

    if (poolResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const pool = poolResult.rows[0];

    // Get grid, players, scores, winners in parallel
    const [grid, players, scores, winners] = await Promise.all([
      getGridWithPlayers(pool.id),
      query(
        `SELECT p.*, pp.paid, pp.payment_status,
          (SELECT COUNT(*) FROM squares WHERE pool_id = $1 AND player_id = p.id) as square_count
         FROM players p
         JOIN pool_players pp ON p.id = pp.player_id
         WHERE pp.pool_id = $1
         ORDER BY p.name`,
        [pool.id]
      ),
      getPoolScores(pool.id),
      getPoolWinners(pool.id),
    ]);

    res.json({
      ...pool,
      grid,
      players: players.rows,
      scores,
      winners,
    });
  } catch (error) {
    console.error('Get pool error:', error);
    res.status(500).json({ error: 'Failed to get pool' });
  }
});

// Update pool settings
router.patch('/:id', validate(schemas.updatePool), async (req: AuthRequest, res) => {
  try {
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const allowedFields = ['name', 'game_date', 'game_time', 'game_label', 'payout_structure', 'tip_pct', 'max_per_player', 'ot_rule'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${idx++}`);
        values.push(req.body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id, req.admin!.id);

    const result = await query<Pool>(
      `UPDATE pools SET ${updates.join(', ')} WHERE id = $${idx++} AND admin_id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    await logAudit({
      pool_id: req.params.id,
      actor_type: 'admin',
      actor_id: req.admin!.id,
      action: 'pool_updated',
      detail: req.body,
    });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update pool error:', error);
    res.status(500).json({ error: 'Failed to update pool' });
  }
});

// Lock grid & randomize digits
router.post('/:id/lock', async (req: AuthRequest, res) => {
  try {
    // Verify ownership
    const poolResult = await query('SELECT id FROM pools WHERE id = $1 AND admin_id = $2', [req.params.id, req.admin!.id]);
    if (poolResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const result = await lockGrid(req.params.id, req.admin!.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Return updated pool
    const updatedPool = await query<Pool>('SELECT * FROM pools WHERE id = $1', [req.params.id]);
    res.json(updatedPool.rows[0]);
  } catch (error) {
    console.error('Lock grid error:', error);
    res.status(500).json({ error: 'Failed to lock grid' });
  }
});

// Unlock grid (admin override)
router.post('/:id/unlock', async (req: AuthRequest, res) => {
  try {
    const poolResult = await query('SELECT id FROM pools WHERE id = $1 AND admin_id = $2', [req.params.id, req.admin!.id]);
    if (poolResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const result = await unlockGrid(req.params.id, req.admin!.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const updatedPool = await query<Pool>('SELECT * FROM pools WHERE id = $1', [req.params.id]);
    res.json(updatedPool.rows[0]);
  } catch (error) {
    console.error('Unlock grid error:', error);
    res.status(500).json({ error: 'Failed to unlock grid' });
  }
});

// Delete pool
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const result = await query(
      'DELETE FROM pools WHERE id = $1 AND admin_id = $2 RETURNING id',
      [req.params.id, req.admin!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    res.json({ message: 'Pool deleted' });
  } catch (error) {
    console.error('Delete pool error:', error);
    res.status(500).json({ error: 'Failed to delete pool' });
  }
});

export default router;
