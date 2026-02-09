import { Router } from 'express';
import { query } from '../db/index.js';
import { validate, schemas } from '../middleware/validation.js';
import { authenticateAdmin, AuthRequest } from '../middleware/auth.js';
import {
  recordPoolPayment,
  recordMultiPoolPayment,
  autoDistributePayment,
  getPlayerPaymentSummary,
  getPoolPaymentSummary,
} from '../services/paymentService.js';
import { z } from 'zod';

const router = Router();

router.use(authenticateAdmin);

// Schema for single pool payment
const singlePaymentSchema = z.object({
  player_id: z.string().uuid(),
  amount: z.number().positive(),
  auto_assign: z.boolean().default(true),
});

// Schema for multi-pool payment
const multiPaymentSchema = z.object({
  player_id: z.string().uuid(),
  total_amount: z.number().positive(),
  allocations: z.array(z.object({
    pool_id: z.string().uuid(),
    square_count: z.number().int().positive(),
    auto_assign: z.boolean().default(true),
  })),
});

// Schema for auto-distribute payment
const autoPaymentSchema = z.object({
  player_id: z.string().uuid(),
  amount: z.number().positive(),
  preferred_pool_ids: z.array(z.string().uuid()).optional(),
  strategy: z.enum(['sequential', 'even', 'deadline']).optional().default('sequential'),
});

// Schema for player credit (money not tied to any pool)
const playerCreditSchema = z.object({
  player_id: z.string().uuid(),
  amount: z.number().positive(),
  note: z.string().optional(),
});

// Record payment for a single pool
// POST /api/pools/:id/payments
router.post('/pools/:poolId/payments', async (req: AuthRequest, res) => {
  try {
    const parsed = singlePaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    }

    const { player_id, amount, auto_assign } = parsed.data;
    const poolId = req.params.poolId;

    // Verify admin owns the pool
    const poolCheck = await query(
      'SELECT id FROM pools WHERE id = $1 AND admin_id = $2',
      [poolId, req.admin!.id]
    );
    if (poolCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const result = await recordPoolPayment(
      poolId,
      player_id,
      amount,
      auto_assign,
      req.admin!.id
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// Full auto-distribute payment across pools
// POST /api/payments/auto
router.post('/auto', async (req: AuthRequest, res) => {
  try {
    const parsed = autoPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    }

    const { player_id, amount, preferred_pool_ids, strategy } = parsed.data;

    const result = await autoDistributePayment(
      player_id,
      amount,
      req.admin!.id,
      {
        preferredPoolIds: preferred_pool_ids,
        distributionStrategy: strategy,
      }
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    console.error('Auto payment error:', error);
    res.status(500).json({ error: 'Failed to auto-distribute payment' });
  }
});

// Record multi-pool payment
// POST /api/payments/multi
router.post('/multi', async (req: AuthRequest, res) => {
  try {
    const parsed = multiPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    }

    const { player_id, total_amount, allocations } = parsed.data;

    const result = await recordMultiPoolPayment(
      player_id,
      total_amount,
      allocations.map(a => ({
        poolId: a.pool_id,
        squareCount: a.square_count,
        autoAssign: a.auto_assign,
      })),
      req.admin!.id
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    console.error('Multi-pool payment error:', error);
    res.status(500).json({ error: 'Failed to record multi-pool payment' });
  }
});

// Get player's payment summary
// GET /api/payments/player/:playerId
router.get('/player/:playerId', async (req: AuthRequest, res) => {
  try {
    const summary = await getPlayerPaymentSummary(req.params.playerId);
    res.json(summary);
  } catch (error) {
    console.error('Get player payment summary error:', error);
    res.status(500).json({ error: 'Failed to get payment summary' });
  }
});

// Get pool's payment summary
// GET /api/pools/:id/payments/summary
router.get('/pools/:poolId/summary', async (req: AuthRequest, res) => {
  try {
    const poolId = req.params.poolId;

    // Verify admin owns the pool
    const poolCheck = await query(
      'SELECT id FROM pools WHERE id = $1 AND admin_id = $2',
      [poolId, req.admin!.id]
    );
    if (poolCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const summary = await getPoolPaymentSummary(poolId);
    res.json(summary);
  } catch (error) {
    console.error('Get pool payment summary error:', error);
    res.status(500).json({ error: 'Failed to get payment summary' });
  }
});

// Get ledger for a pool
// GET /api/pools/:id/ledger
router.get('/pools/:poolId/ledger', async (req: AuthRequest, res) => {
  try {
    const poolId = req.params.poolId;

    // Verify admin owns the pool
    const poolCheck = await query(
      'SELECT id FROM pools WHERE id = $1 AND admin_id = $2',
      [poolId, req.admin!.id]
    );
    if (poolCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const result = await query(
      `SELECT l.*, p.name as player_name
       FROM ledger l
       JOIN players p ON l.player_id = p.id
       WHERE l.pool_id = $1
       ORDER BY l.created_at DESC`,
      [poolId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get ledger error:', error);
    res.status(500).json({ error: 'Failed to get ledger' });
  }
});

// Get ledger for a player across all pools
// GET /api/payments/player/:playerId/ledger
router.get('/player/:playerId/ledger', async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT l.*, p.name as pool_name, pl.name as player_name
       FROM ledger l
       LEFT JOIN pools p ON l.pool_id = p.id
       JOIN players pl ON l.player_id = pl.id
       WHERE l.player_id = $1
       ORDER BY l.created_at DESC`,
      [req.params.playerId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get player ledger error:', error);
    res.status(500).json({ error: 'Failed to get ledger' });
  }
});

// Add credit to player's wallet (not tied to any pool)
// POST /api/payments/credit
router.post('/credit', async (req: AuthRequest, res) => {
  try {
    const parsed = playerCreditSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    }

    const { player_id, amount, note } = parsed.data;

    // Verify player exists
    const playerCheck = await query('SELECT id, name FROM players WHERE id = $1', [player_id]);
    if (playerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerName = playerCheck.rows[0].name;

    // Record credit in ledger (pool_id is NULL for unassigned credit)
    const ledgerResult = await query(
      `INSERT INTO ledger (player_id, pool_id, type, amount, description)
       VALUES ($1, NULL, 'credit', $2, $3)
       RETURNING id`,
      [player_id, amount, note || `Credit added by admin`]
    );

    // Get updated balance
    const balanceResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as balance
       FROM ledger
       WHERE player_id = $1`,
      [player_id]
    );

    res.json({
      success: true,
      creditAdded: amount,
      ledgerEntryId: ledgerResult.rows[0].id,
      totalBalance: parseInt(balanceResult.rows[0].balance),
      playerName,
    });
  } catch (error) {
    console.error('Add credit error:', error);
    res.status(500).json({ error: 'Failed to add credit' });
  }
});

// Get player's wallet balance (unassigned credit)
// GET /api/payments/player/:playerId/balance
router.get('/player/:playerId/balance', async (req: AuthRequest, res) => {
  try {
    const playerId = req.params.playerId;

    // Get total balance from ledger
    const result = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'credit' AND pool_id IS NULL THEN amount ELSE 0 END), 0) as unassigned_credit,
         COALESCE(SUM(CASE WHEN type = 'buy_in' THEN ABS(amount) ELSE 0 END), 0) as total_spent,
         COALESCE(SUM(CASE WHEN type = 'payout' THEN amount ELSE 0 END), 0) as total_won,
         COALESCE(SUM(amount), 0) as net_balance
       FROM ledger
       WHERE player_id = $1`,
      [playerId]
    );

    const row = result.rows[0];
    res.json({
      unassignedCredit: parseInt(row.unassigned_credit),
      totalSpent: parseInt(row.total_spent),
      totalWon: parseInt(row.total_won),
      netBalance: parseInt(row.net_balance),
    });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

// Apply player's credit to a pool
// POST /api/payments/apply-credit
router.post('/apply-credit', async (req: AuthRequest, res) => {
  try {
    const { player_id, pool_id, amount, auto_assign } = req.body;

    if (!player_id || !pool_id || !amount) {
      return res.status(400).json({ error: 'player_id, pool_id, and amount are required' });
    }

    // Check player's available credit (unassigned credit only)
    const balanceResult = await query(
      `SELECT COALESCE(SUM(CASE WHEN type = 'credit' AND pool_id IS NULL THEN amount ELSE 0 END), 0) as unassigned_credit
       FROM ledger
       WHERE player_id = $1`,
      [player_id]
    );
    const availableCredit = parseInt(balanceResult.rows[0].unassigned_credit);

    if (availableCredit < amount) {
      return res.status(400).json({
        error: `Insufficient credit. Available: $${availableCredit}, Requested: $${amount}`,
        availableCredit,
        shortfall: amount - availableCredit,
      });
    }

    // Deduct from wallet first (create negative credit entry)
    await query(
      `INSERT INTO ledger (player_id, pool_id, type, amount, description)
       VALUES ($1, NULL, 'credit', $2, $3)`,
      [player_id, -amount, `Applied credit to pool`]
    );

    // Apply the credit to the pool (this uses existing recordPoolPayment)
    const result = await recordPoolPayment(
      pool_id,
      player_id,
      amount,
      auto_assign !== false, // Default to true
      req.admin!.id
    );

    res.json({
      ...result,
      creditUsed: amount,
      remainingWalletBalance: availableCredit - amount,
    });
  } catch (error) {
    console.error('Apply credit error:', error);
    res.status(500).json({ error: 'Failed to apply credit' });
  }
});

// Combined payment: use existing credit + add new money
// POST /api/payments/combined
router.post('/combined', async (req: AuthRequest, res) => {
  try {
    const { player_id, pool_id, use_credit, new_amount, auto_assign } = req.body;

    if (!player_id || !pool_id) {
      return res.status(400).json({ error: 'player_id and pool_id are required' });
    }

    const useCredit = use_credit || 0;
    const newAmount = new_amount || 0;
    const totalAmount = useCredit + newAmount;

    if (totalAmount <= 0) {
      return res.status(400).json({ error: 'Total amount must be positive' });
    }

    // Check available credit if trying to use it
    if (useCredit > 0) {
      const balanceResult = await query(
        `SELECT COALESCE(SUM(CASE WHEN type = 'credit' AND pool_id IS NULL THEN amount ELSE 0 END), 0) as unassigned_credit
         FROM ledger
         WHERE player_id = $1`,
        [player_id]
      );
      const availableCredit = parseInt(balanceResult.rows[0].unassigned_credit);

      if (availableCredit < useCredit) {
        return res.status(400).json({
          error: `Insufficient credit. Available: $${availableCredit}, Trying to use: $${useCredit}`,
          availableCredit,
        });
      }

      // Deduct credit from wallet
      await query(
        `INSERT INTO ledger (player_id, pool_id, type, amount, description)
         VALUES ($1, NULL, 'credit', $2, $3)`,
        [player_id, -useCredit, `Applied $${useCredit} credit to pool`]
      );
    }

    // Record the combined payment
    const result = await recordPoolPayment(
      pool_id,
      player_id,
      totalAmount,
      auto_assign !== false,
      req.admin!.id
    );

    res.json({
      ...result,
      creditUsed: useCredit,
      newMoneyReceived: newAmount,
      totalApplied: totalAmount,
    });
  } catch (error) {
    console.error('Combined payment error:', error);
    res.status(500).json({ error: 'Failed to process combined payment' });
  }
});

// Search players (for payment input autocomplete)
// GET /api/payments/search-players?q=name
router.get('/search-players', async (req: AuthRequest, res) => {
  try {
    const searchTerm = req.query.q as string || '';

    const result = await query(
      `SELECT DISTINCT p.id, p.name, p.phone, p.email,
         (SELECT COUNT(*) FROM pool_players pp WHERE pp.player_id = p.id) as pool_count,
         (SELECT COUNT(*) FROM squares s WHERE s.player_id = p.id AND s.claim_status = 'claimed') as total_squares
       FROM players p
       WHERE p.name ILIKE $1 OR p.email ILIKE $1 OR p.phone ILIKE $1
       ORDER BY p.name
       LIMIT 20`,
      [`%${searchTerm}%`]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Search players error:', error);
    res.status(500).json({ error: 'Failed to search players' });
  }
});

export default router;
