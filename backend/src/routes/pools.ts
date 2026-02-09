import { Router } from 'express';
import { query, withTransaction } from '../db/index.js';
import { validate, schemas } from '../middleware/validation.js';
import { authenticateAdmin, AuthRequest } from '../middleware/auth.js';
import { initializeGrid, getGridWithPlayers, lockGrid, unlockGrid, getClaimedCount, getPendingRequests } from '../services/gridService.js';
import { getPoolScores, getPoolWinners } from '../services/winnerService.js';
import { logAudit } from '../services/auditService.js';
import { Pool, PoolWithStats, Player } from '../types/index.js';
import { sendNotification } from '../services/notificationService.js';
import { config } from '../config.js';

const router = Router();

// All pool routes require admin auth
router.use(authenticateAdmin);

// List admin's pools
router.get('/', async (req: AuthRequest, res) => {
  try {
    const result = await query<PoolWithStats>(
      `SELECT p.*,
        (SELECT COUNT(*) FROM squares WHERE pool_id = p.id AND claim_status = 'claimed') as claimed_count,
        (SELECT COUNT(*) FROM pool_players WHERE pool_id = p.id) as player_count,
        (SELECT COUNT(*) FROM pool_players WHERE pool_id = p.id AND payment_status = 'pending') as pending_count,
        (SELECT COUNT(*) FROM squares WHERE pool_id = p.id AND claim_status = 'pending') as pending_squares_count
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
        `INSERT INTO pools (admin_id, name, sport, away_team, home_team, game_date, game_time, game_label, denomination, payout_structure, custom_payouts, tip_pct, max_per_player, approval_threshold, ot_rule, external_game_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
          req.body.custom_payouts ? JSON.stringify(req.body.custom_payouts) : null,
          req.body.tip_pct,
          req.body.max_per_player,
          req.body.approval_threshold ?? 100, // Default 100 = effectively disabled
          req.body.ot_rule,
          req.body.external_game_id || null,
        ]
      );

      const pool = result.rows[0];

      // Initialize the 10x10 grid (pass client for transaction)
      await initializeGrid(pool.id, client);

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
      }, client);

      return pool;
    });

    res.status(201).json(pool);
  } catch (error) {
    console.error('Create pool error:', error);
    const err = error as Error;
    res.status(500).json({ error: 'Failed to create pool', message: err.message });
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

    // Get grid, players, scores, winners, pending requests in parallel
    const [grid, players, scores, winners, pendingRequests] = await Promise.all([
      getGridWithPlayers(pool.id),
      query(
        `SELECT p.*, pp.paid, pp.payment_status, pp.amount_paid,
          (SELECT COUNT(*) FROM squares WHERE pool_id = $1 AND player_id = p.id AND claim_status = 'claimed') as square_count,
          (SELECT COUNT(*) FROM squares WHERE pool_id = $1 AND player_id = p.id AND claim_status = 'pending') as pending_count
         FROM players p
         JOIN pool_players pp ON p.id = pp.player_id
         WHERE pp.pool_id = $1
         ORDER BY p.name`,
        [pool.id]
      ),
      getPoolScores(pool.id),
      getPoolWinners(pool.id),
      getPendingRequests(pool.id),
    ]);

    res.json({
      ...pool,
      grid,
      players: players.rows,
      scores,
      winners,
      pendingRequests,
    });
  } catch (error) {
    console.error('Get pool error:', error);
    res.status(500).json({ error: 'Failed to get pool' });
  }
});

// Update pool settings
router.patch('/:id', validate(schemas.updatePool), async (req: AuthRequest, res) => {
  try {
    const poolId = req.params.id;

    // Get current pool to check for denomination change
    const currentPool = await query<Pool>(
      'SELECT * FROM pools WHERE id = $1 AND admin_id = $2',
      [poolId, req.admin!.id]
    );

    if (currentPool.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const oldPool = currentPool.rows[0];
    const newDenomination = req.body.denomination;
    let refundsProcessed: { playerId: string; playerName: string; refundAmount: number }[] = [];

    // Handle denomination change with auto-refund
    if (newDenomination !== undefined && newDenomination !== oldPool.denomination) {
      const oldDenom = oldPool.denomination;
      const newDenom = newDenomination;

      if (newDenom > oldDenom) {
        // Increasing denomination - just warn, don't auto-charge
        // Admin will need to collect additional payments manually
      } else {
        // Decreasing denomination - auto-refund the difference to player wallets
        // Get all players who have paid (have buy_in entries in ledger)
        const paidPlayers = await query<{ player_id: string; player_name: string; square_count: number; total_paid: number }>(
          `SELECT
            l.player_id,
            p.name as player_name,
            (SELECT COUNT(*) FROM squares WHERE pool_id = $1 AND player_id = l.player_id AND claim_status = 'claimed') as square_count,
            ABS(SUM(l.amount)) as total_paid
           FROM ledger l
           JOIN players p ON l.player_id = p.id
           WHERE l.pool_id = $1 AND l.type = 'buy_in'
           GROUP BY l.player_id, p.name`,
          [poolId]
        );

        // Calculate and issue refunds
        for (const player of paidPlayers.rows) {
          const squaresPaidFor = Math.floor(player.total_paid / oldDenom);
          const oldCost = squaresPaidFor * oldDenom;
          const newCost = squaresPaidFor * newDenom;
          const refundAmount = oldCost - newCost;

          if (refundAmount > 0) {
            // Credit the difference to player's wallet
            await query(
              `INSERT INTO ledger (player_id, pool_id, type, amount, description)
               VALUES ($1, NULL, 'credit', $2, $3)`,
              [player.player_id, refundAmount, `Refund: denomination changed from $${oldDenom} to $${newDenom} in pool`]
            );

            refundsProcessed.push({
              playerId: player.player_id,
              playerName: player.player_name,
              refundAmount,
            });
          }
        }
      }
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    // Allow denomination changes with auto-refund capability
    const allowedFields = ['name', 'game_date', 'game_time', 'game_label', 'denomination', 'payout_structure', 'tip_pct', 'max_per_player', 'approval_threshold', 'ot_rule'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${idx++}`);
        values.push(req.body[field]);
      }
    }

    // Handle custom_payouts specially (needs JSON stringify)
    if (req.body.custom_payouts !== undefined) {
      updates.push(`custom_payouts = $${idx++}`);
      values.push(JSON.stringify(req.body.custom_payouts));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(poolId, req.admin!.id);

    const result = await query<Pool>(
      `UPDATE pools SET ${updates.join(', ')} WHERE id = $${idx++} AND admin_id = $${idx} RETURNING *`,
      values
    );

    await logAudit({
      pool_id: poolId,
      actor_type: 'admin',
      actor_id: req.admin!.id,
      action: 'pool_updated',
      detail: {
        ...req.body,
        refundsProcessed: refundsProcessed.length > 0 ? refundsProcessed : undefined,
      },
    });

    res.json({
      ...result.rows[0],
      refundsProcessed: refundsProcessed.length > 0 ? refundsProcessed : undefined,
    });
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

// Delete/Cancel pool (with automatic refunds to all players)
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const poolId = req.params.id;
    const refundsProcessed: { playerId: string; playerName: string; refundAmount: number }[] = [];

    // First verify pool exists and belongs to admin
    const poolCheck = await query<Pool>(
      'SELECT * FROM pools WHERE id = $1 AND admin_id = $2',
      [poolId, req.admin!.id]
    );

    if (poolCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const poolName = poolCheck.rows[0].name;

    // Get all payments made to this pool (from ledger)
    const paymentsResult = await query<{ player_id: string; player_name: string; total_paid: number }>(
      `SELECT
        l.player_id,
        p.name as player_name,
        COALESCE(ABS(SUM(l.amount)), 0) as total_paid
       FROM ledger l
       JOIN players p ON l.player_id = p.id
       WHERE l.pool_id = $1 AND l.type = 'buy_in'
       GROUP BY l.player_id, p.name`,
      [poolId]
    );

    // Refund each player's payments to their wallet
    for (const player of paymentsResult.rows) {
      const totalPaid = parseInt(String(player.total_paid)) || 0;
      if (totalPaid > 0) {
        await query(
          `INSERT INTO ledger (player_id, pool_id, type, amount, description)
           VALUES ($1, NULL, 'credit', $2, $3)`,
          [player.player_id, totalPaid, `Refund: pool "${poolName}" cancelled`]
        );

        refundsProcessed.push({
          playerId: player.player_id,
          playerName: player.player_name,
          refundAmount: totalPaid,
        });
      }
    }

    // Log audit before deleting (since pool_id will be invalid after delete)
    await logAudit({
      pool_id: poolId,
      actor_type: 'admin',
      actor_id: req.admin!.id,
      action: 'pool_cancelled',
      detail: {
        pool_name: poolName,
        refunds_issued: refundsProcessed.length,
        total_refunded: refundsProcessed.reduce((sum, r) => sum + r.refundAmount, 0),
      },
    });

    // Now delete the pool (cascades to squares, pool_players, etc.)
    await query(
      'DELETE FROM pools WHERE id = $1 AND admin_id = $2',
      [poolId, req.admin!.id]
    );

    res.json({
      message: 'Pool cancelled and deleted',
      refundsProcessed,
      totalRefunded: refundsProcessed.reduce((sum, r) => sum + r.refundAmount, 0),
    });
  } catch (error) {
    console.error('Delete pool error:', error);
    res.status(500).json({ error: 'Failed to delete pool' });
  }
});

// Send invites to players
router.post('/:id/notify/invite', async (req: AuthRequest, res) => {
  try {
    const poolId = req.params.id;
    const { playerIds } = req.body; // Optional: specific player IDs, or all if not provided

    // Get pool details
    const poolResult = await query<Pool>(
      'SELECT * FROM pools WHERE id = $1 AND admin_id = $2',
      [poolId, req.admin!.id]
    );

    if (poolResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const pool = poolResult.rows[0];

    // Get players to notify
    let playersQuery = `
      SELECT p.* FROM players p
      JOIN pool_players pp ON p.id = pp.player_id
      WHERE pp.pool_id = $1
    `;
    const queryParams: (string | string[])[] = [poolId];

    if (playerIds && Array.isArray(playerIds) && playerIds.length > 0) {
      playersQuery += ' AND p.id = ANY($2)';
      queryParams.push(playerIds);
    }

    const playersResult = await query<Player>(playersQuery, queryParams);
    const players = playersResult.rows;

    if (players.length === 0) {
      return res.status(400).json({ error: 'No players to notify' });
    }

    // Send invites
    const results: { playerId: string; playerName: string; success: boolean; channel?: string; error?: string }[] = [];

    for (const player of players) {
      const magicLink = `${config.frontendUrl}/p/${player.auth_token}?pool=${poolId}`;

      const smsMessage = `Hey ${player.name.split(' ')[0]}! You're invited to ${pool.away_team} vs ${pool.home_team} squares ($${pool.denomination}/sq). Pick your squares: ${magicLink}`;

      const htmlEmail = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%); border: 1px solid #2a2a2a; border-radius: 16px; padding: 32px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">🎲</div>
      <h1 style="color: #4ADE80; font-size: 24px; margin: 0 0 8px 0; font-weight: 800;">You're Invited!</h1>
      <p style="color: #888; font-size: 14px; margin: 0 0 24px 0;">Hey ${player.name}!</p>
      <div style="background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <div style="color: #fff; font-size: 20px; font-weight: 700; margin-bottom: 12px;">${pool.away_team} vs ${pool.home_team}</div>
        <div style="color: #FBBF24; font-size: 16px; margin-bottom: 8px;">$${pool.denomination} per square</div>
        ${pool.game_date ? `<div style="color: #888; font-size: 13px;">${new Date(pool.game_date).toLocaleDateString()} ${pool.game_time || ''}</div>` : ''}
      </div>
      <a href="${magicLink}" style="display: inline-block; background: linear-gradient(135deg, #4ADE80 0%, #22D3EE 100%); color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 16px;">Pick Your Squares</a>
      <p style="color: #555; font-size: 12px; margin-top: 24px;">Pool: ${pool.name}</p>
    </div>
  </div>
</body>
</html>`;

      try {
        const result = await sendNotification(
          player.id,
          `You're Invited! ${pool.away_team} vs ${pool.home_team} Squares`,
          smsMessage,
          htmlEmail
        );
        results.push({
          playerId: player.id,
          playerName: player.name,
          success: result.success,
          channel: result.channel,
          error: result.error,
        });
      } catch (err) {
        results.push({
          playerId: player.id,
          playerName: player.name,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    await logAudit({
      pool_id: poolId,
      actor_type: 'admin',
      actor_id: req.admin!.id,
      action: 'invites_sent',
      detail: { total: players.length, sent, failed },
    });

    res.json({
      message: `Sent ${sent} invite(s)${failed > 0 ? `, ${failed} failed` : ''}`,
      sent,
      failed,
      results,
    });
  } catch (error) {
    console.error('Send invites error:', error);
    res.status(500).json({ error: 'Failed to send invites' });
  }
});

// Send payment reminder to players
router.post('/:id/notify/reminder', async (req: AuthRequest, res) => {
  try {
    const poolId = req.params.id;

    // Get pool details
    const poolResult = await query<Pool>(
      'SELECT * FROM pools WHERE id = $1 AND admin_id = $2',
      [poolId, req.admin!.id]
    );

    if (poolResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const pool = poolResult.rows[0];

    // Get unpaid players with squares
    const playersResult = await query<Player & { square_count: number }>(
      `SELECT p.*,
        (SELECT COUNT(*) FROM squares WHERE pool_id = $1 AND player_id = p.id AND claim_status = 'claimed') as square_count
       FROM players p
       JOIN pool_players pp ON p.id = pp.player_id
       WHERE pp.pool_id = $1 AND pp.paid = false
       HAVING (SELECT COUNT(*) FROM squares WHERE pool_id = $1 AND player_id = p.id AND claim_status = 'claimed') > 0`,
      [poolId]
    );

    const players = playersResult.rows;

    if (players.length === 0) {
      return res.json({ message: 'No unpaid players to remind', sent: 0, failed: 0 });
    }

    // Send reminders
    const results: { playerId: string; playerName: string; success: boolean; error?: string }[] = [];

    for (const player of players) {
      const magicLink = `${config.frontendUrl}/p/${player.auth_token}?pool=${poolId}`;
      const amountOwed = player.square_count * pool.denomination;

      const smsMessage = `Reminder: You owe $${amountOwed} for ${player.square_count} square(s) in ${pool.away_team} vs ${pool.home_team}. Pay up! ${magicLink}`;

      const htmlEmail = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%); border: 1px solid #2a2a2a; border-radius: 16px; padding: 32px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">💸</div>
      <h1 style="color: #FB923C; font-size: 24px; margin: 0 0 8px 0; font-weight: 800;">Payment Reminder</h1>
      <p style="color: #888; font-size: 14px; margin: 0 0 24px 0;">Hey ${player.name}!</p>
      <div style="background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <div style="color: #fff; font-size: 18px; font-weight: 700; margin-bottom: 12px;">${pool.away_team} vs ${pool.home_team}</div>
        <div style="color: #FB923C; font-size: 28px; font-weight: 800; margin-bottom: 8px;">$${amountOwed} owed</div>
        <div style="color: #888; font-size: 13px;">${player.square_count} square(s) × $${pool.denomination}</div>
      </div>
      <p style="color: #888; font-size: 13px; margin-bottom: 24px;">Please pay the pool admin to secure your squares!</p>
      <a href="${magicLink}" style="display: inline-block; background: #FB923C; color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 16px;">View Your Squares</a>
    </div>
  </div>
</body>
</html>`;

      try {
        const result = await sendNotification(
          player.id,
          `Payment Reminder: $${amountOwed} for ${pool.name}`,
          smsMessage,
          htmlEmail
        );
        results.push({
          playerId: player.id,
          playerName: player.name,
          success: result.success,
          error: result.error,
        });
      } catch (err) {
        results.push({
          playerId: player.id,
          playerName: player.name,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      message: `Sent ${sent} reminder(s)${failed > 0 ? `, ${failed} failed` : ''}`,
      sent,
      failed,
      results,
    });
  } catch (error) {
    console.error('Send reminders error:', error);
    res.status(500).json({ error: 'Failed to send reminders' });
  }
});

export default router;
