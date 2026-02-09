import { Router } from 'express';
import crypto from 'crypto';
import { query, withTransaction } from '../db/index.js';
import { validate, schemas } from '../middleware/validation.js';
import { authenticateAdmin, AuthRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';
import { Player } from '../types/index.js';

const router = Router({ mergeParams: true });

router.use(authenticateAdmin);

// List pool players
router.get('/', async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT p.*, pp.paid, pp.payment_status, pp.joined_at, pp.amount_paid,
        (SELECT COUNT(*) FROM squares WHERE pool_id = $1 AND player_id = p.id AND claim_status = 'claimed') as square_count,
        (SELECT COUNT(*) FROM squares WHERE pool_id = $1 AND player_id = p.id AND claim_status = 'pending') as pending_count
       FROM players p
       JOIN pool_players pp ON p.id = pp.player_id
       WHERE pp.pool_id = $1
       ORDER BY p.name`,
      [req.params.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('List players error:', error);
    res.status(500).json({ error: 'Failed to list players' });
  }
});

// Get invite links for all players in pool
router.get('/invite-links', async (req: AuthRequest, res) => {
  try {
    const poolId = req.params.id;

    // Verify admin owns the pool
    const poolCheck = await query(
      'SELECT id FROM pools WHERE id = $1 AND admin_id = $2',
      [poolId, req.admin!.id]
    );
    if (poolCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const result = await query(
      `SELECT p.id, p.name, p.phone, p.email, p.auth_token, pp.paid, pp.payment_status, pp.amount_paid,
        (SELECT COUNT(*) FROM squares WHERE pool_id = $1 AND player_id = p.id AND claim_status = 'claimed') as square_count
       FROM players p
       JOIN pool_players pp ON p.id = pp.player_id
       WHERE pp.pool_id = $1
       ORDER BY p.name`,
      [poolId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get invite links error:', error);
    res.status(500).json({ error: 'Failed to get invite links' });
  }
});

// Add player to pool
router.post('/', validate(schemas.addPlayer), async (req: AuthRequest, res) => {
  try {
    const { name, phone, email } = req.body;
    const poolId = req.params.id;

    const player = await withTransaction(async (client) => {
      // Check if player exists by phone or email
      let playerResult = await client.query<Player>(
        `SELECT * FROM players WHERE (phone = $1 AND $1 IS NOT NULL) OR (email = $2 AND $2 IS NOT NULL)`,
        [phone || null, email || null]
      );

      let player: Player;

      if (playerResult.rows.length > 0) {
        player = playerResult.rows[0];
        // Update name if different
        if (player.name !== name) {
          await client.query('UPDATE players SET name = $1 WHERE id = $2', [name, player.id]);
          player.name = name;
        }
      } else {
        // Create new player
        const authToken = crypto.randomBytes(32).toString('hex');
        const result = await client.query<Player>(
          `INSERT INTO players (name, phone, email, auth_token)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [name, phone || null, email || null, authToken]
        );
        player = result.rows[0];
      }

      // Add to pool if not already
      await client.query(
        `INSERT INTO pool_players (pool_id, player_id)
         VALUES ($1, $2)
         ON CONFLICT (pool_id, player_id) DO NOTHING`,
        [poolId, player.id]
      );

      await logAudit({
        pool_id: poolId,
        actor_type: 'admin',
        actor_id: req.admin!.id,
        action: 'player_added',
        detail: { player_id: player.id, name: player.name },
      });

      return player;
    });

    res.status(201).json(player);
  } catch (error) {
    console.error('Add player error:', error);
    res.status(500).json({ error: 'Failed to add player' });
  }
});

// Bulk add players
router.post('/bulk', validate(schemas.bulkAddPlayers), async (req: AuthRequest, res) => {
  try {
    const { players } = req.body;
    const poolId = req.params.id;
    const results: { success: Player[]; failed: { player: typeof players[0]; error: string }[] } = {
      success: [],
      failed: [],
    };

    for (const p of players) {
      try {
        const authToken = crypto.randomBytes(32).toString('hex');

        // Try to find existing or create new
        let playerResult = await query<Player>(
          `SELECT * FROM players WHERE (phone = $1 AND $1 IS NOT NULL) OR (email = $2 AND $2 IS NOT NULL)`,
          [p.phone || null, p.email || null]
        );

        let player: Player;

        if (playerResult.rows.length > 0) {
          player = playerResult.rows[0];
        } else {
          if (!p.phone && !p.email) {
            results.failed.push({ player: p, error: 'Phone or email required' });
            continue;
          }
          const result = await query<Player>(
            `INSERT INTO players (name, phone, email, auth_token)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [p.name, p.phone || null, p.email || null, authToken]
          );
          player = result.rows[0];
        }

        // Add to pool
        await query(
          `INSERT INTO pool_players (pool_id, player_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [poolId, player.id]
        );

        results.success.push(player);
      } catch (err) {
        results.failed.push({ player: p, error: 'Failed to add' });
      }
    }

    await logAudit({
      pool_id: poolId,
      actor_type: 'admin',
      actor_id: req.admin!.id,
      action: 'players_bulk_added',
      detail: { added: results.success.length, failed: results.failed.length },
    });

    res.json(results);
  } catch (error) {
    console.error('Bulk add error:', error);
    res.status(500).json({ error: 'Failed to bulk add players' });
  }
});

// Update player payment status
router.patch('/:playerId', validate(schemas.updatePaymentStatus), async (req: AuthRequest, res) => {
  try {
    const { paid, payment_status, amount_paid } = req.body;
    const poolId = req.params.id;
    const playerId = req.params.playerId;

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (paid !== undefined) {
      updates.push(`paid = $${idx++}`);
      values.push(paid);
    }
    if (payment_status !== undefined) {
      updates.push(`payment_status = $${idx++}`);
      values.push(payment_status);
    }
    if (amount_paid !== undefined) {
      updates.push(`amount_paid = $${idx++}`);
      values.push(amount_paid);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(poolId, playerId);

    const result = await query(
      `UPDATE pool_players SET ${updates.join(', ')} WHERE pool_id = $${idx++} AND player_id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found in pool' });
    }

    await logAudit({
      pool_id: poolId,
      actor_type: 'admin',
      actor_id: req.admin!.id,
      action: 'payment_updated',
      detail: { player_id: playerId, paid, payment_status, amount_paid },
    });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({ error: 'Failed to update payment status' });
  }
});

// Mark player as deadbeat (releases all their claimed and pending squares)
router.post('/:playerId/deadbeat', async (req: AuthRequest, res) => {
  try {
    const poolId = req.params.id;
    const playerId = req.params.playerId;

    await withTransaction(async (client) => {
      // Get counts before releasing
      const countResult = await client.query(
        `SELECT
          COUNT(*) FILTER (WHERE claim_status = 'claimed') as claimed_count,
          COUNT(*) FILTER (WHERE claim_status = 'pending') as pending_count
         FROM squares WHERE pool_id = $1 AND player_id = $2`,
        [poolId, playerId]
      );
      const claimed = parseInt(countResult.rows[0].claimed_count) || 0;
      const pending = parseInt(countResult.rows[0].pending_count) || 0;

      // Release all squares (both claimed and pending)
      await client.query(
        `UPDATE squares SET player_id = NULL, claim_status = 'available', released_at = NOW(), requested_at = NULL
         WHERE pool_id = $1 AND player_id = $2`,
        [poolId, playerId]
      );

      // Mark as deadbeat
      await client.query(
        `UPDATE pool_players SET payment_status = 'deadbeat', paid = false
         WHERE pool_id = $1 AND player_id = $2`,
        [poolId, playerId]
      );

      await logAudit({
        pool_id: poolId,
        actor_type: 'admin',
        actor_id: req.admin!.id,
        action: 'player_marked_deadbeat',
        detail: { player_id: playerId, claimed_released: claimed, pending_released: pending },
      });
    });

    res.json({ message: 'Player marked as deadbeat' });
  } catch (error) {
    console.error('Mark deadbeat error:', error);
    res.status(500).json({ error: 'Failed to mark as deadbeat' });
  }
});

// Reinstate player
router.post('/:playerId/reinstate', async (req: AuthRequest, res) => {
  try {
    const poolId = req.params.id;
    const playerId = req.params.playerId;

    await query(
      `UPDATE pool_players SET payment_status = 'pending'
       WHERE pool_id = $1 AND player_id = $2`,
      [poolId, playerId]
    );

    await logAudit({
      pool_id: poolId,
      actor_type: 'admin',
      actor_id: req.admin!.id,
      action: 'player_reinstated',
      detail: { player_id: playerId },
    });

    res.json({ message: 'Player reinstated' });
  } catch (error) {
    console.error('Reinstate error:', error);
    res.status(500).json({ error: 'Failed to reinstate player' });
  }
});

// Remove player from pool (with automatic refund to wallet)
router.delete('/:playerId', async (req: AuthRequest, res) => {
  try {
    const poolId = req.params.id;
    const playerId = req.params.playerId;
    let refundAmount = 0;

    await withTransaction(async (client) => {
      // Get counts before releasing
      const countResult = await client.query(
        `SELECT
          COUNT(*) FILTER (WHERE claim_status = 'claimed') as claimed_count,
          COUNT(*) FILTER (WHERE claim_status = 'pending') as pending_count
         FROM squares WHERE pool_id = $1 AND player_id = $2`,
        [poolId, playerId]
      );
      const claimed = parseInt(countResult.rows[0].claimed_count) || 0;
      const pending = parseInt(countResult.rows[0].pending_count) || 0;

      // Check how much the player has paid into this pool (from ledger)
      const paymentResult = await client.query(
        `SELECT COALESCE(ABS(SUM(amount)), 0) as total_paid
         FROM ledger
         WHERE pool_id = $1 AND player_id = $2 AND type = 'buy_in'`,
        [poolId, playerId]
      );
      const totalPaid = parseInt(paymentResult.rows[0].total_paid) || 0;

      // If player has paid, credit the amount back to their wallet
      if (totalPaid > 0) {
        refundAmount = totalPaid;
        await client.query(
          `INSERT INTO ledger (player_id, pool_id, type, amount, description)
           VALUES ($1, NULL, 'credit', $2, $3)`,
          [playerId, totalPaid, `Refund: removed from pool`]
        );
      }

      // Release squares (set claim_status to available)
      await client.query(
        `UPDATE squares SET player_id = NULL, claim_status = 'available', released_at = NOW(), requested_at = NULL
         WHERE pool_id = $1 AND player_id = $2`,
        [poolId, playerId]
      );

      // Remove from pool
      await client.query(
        'DELETE FROM pool_players WHERE pool_id = $1 AND player_id = $2',
        [poolId, playerId]
      );

      await logAudit({
        pool_id: poolId,
        actor_type: 'admin',
        actor_id: req.admin!.id,
        action: 'player_removed',
        detail: {
          player_id: playerId,
          claimed_released: claimed,
          pending_released: pending,
          refund_amount: refundAmount,
        },
      });
    });

    res.json({
      message: 'Player removed',
      refundAmount,
      refundedToWallet: refundAmount > 0,
    });
  } catch (error) {
    console.error('Remove player error:', error);
    res.status(500).json({ error: 'Failed to remove player' });
  }
});

export default router;
