import { Router } from 'express';
import { query } from '../db/index.js';
import { validate, schemas } from '../middleware/validation.js';
import { authenticateAdmin, AuthRequest } from '../middleware/auth.js';
import { enterScore, getPoolScores, getPoolWinners, getPayoutPercentages } from '../services/winnerService.js';
import { Pool } from '../types/index.js';

const router = Router({ mergeParams: true });

router.use(authenticateAdmin);

// Get all scores for pool
router.get('/', async (req: AuthRequest, res) => {
  try {
    const [scores, winners] = await Promise.all([
      getPoolScores(req.params.id),
      getPoolWinners(req.params.id),
    ]);

    res.json({ scores, winners });
  } catch (error) {
    console.error('Get scores error:', error);
    res.status(500).json({ error: 'Failed to get scores' });
  }
});

// Enter/update score for a period
router.post('/', validate(schemas.enterScore), async (req: AuthRequest, res) => {
  try {
    const poolId = req.params.id;
    const { period_key, period_label, away_score, home_score, payout_pct } = req.body;

    // Verify pool is locked
    const poolResult = await query<Pool>('SELECT * FROM pools WHERE id = $1 AND admin_id = $2', [poolId, req.admin!.id]);

    if (poolResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const pool = poolResult.rows[0];

    if (!pool.col_digits || !pool.row_digits) {
      return res.status(400).json({ error: 'Grid must be locked before entering scores' });
    }

    const result = await enterScore(
      poolId,
      period_key,
      period_label,
      away_score,
      home_score,
      payout_pct,
      req.admin!.id
    );

    res.json(result);
  } catch (error) {
    console.error('Enter score error:', error);
    res.status(500).json({ error: 'Failed to enter score' });
  }
});

// Get payout structure preview
router.get('/payouts', async (req: AuthRequest, res) => {
  try {
    const poolResult = await query<Pool>('SELECT * FROM pools WHERE id = $1', [req.params.id]);

    if (poolResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const pool = poolResult.rows[0];
    const payouts = getPayoutPercentages(pool.payout_structure, pool.sport);
    const poolTotal = 100 * pool.denomination;

    const breakdown = Object.entries(payouts).map(([key, pct]) => ({
      period: key,
      percentage: pct,
      amount: Math.round(poolTotal * pct / 100),
    }));

    res.json({ total: poolTotal, breakdown });
  } catch (error) {
    console.error('Get payouts error:', error);
    res.status(500).json({ error: 'Failed to get payouts' });
  }
});

export default router;
