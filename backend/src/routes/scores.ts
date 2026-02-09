import { Router } from 'express';
import { query } from '../db/index.js';
import { validate, schemas } from '../middleware/validation.js';
import { authenticateAdmin, AuthRequest } from '../middleware/auth.js';
import { enterScore, getPoolScores, getPoolWinners, getPayoutPercentages, calculateCurrentWinner } from '../services/winnerService.js';
import { getGameScores } from '../services/sportsApiService.js';
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

// Sync scores from ESPN API
router.post('/sync', async (req: AuthRequest, res) => {
  try {
    const poolId = req.params.id;

    // Get pool with external game ID
    const poolResult = await query<Pool>('SELECT * FROM pools WHERE id = $1 AND admin_id = $2', [poolId, req.admin!.id]);

    if (poolResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const pool = poolResult.rows[0];

    if (!pool.external_game_id) {
      return res.status(400).json({ error: 'No external game linked to this pool. Set external_game_id to sync scores.' });
    }

    if (!pool.col_digits || !pool.row_digits) {
      return res.status(400).json({ error: 'Grid must be locked before syncing scores' });
    }

    // Fetch live scores from ESPN
    const liveScores = await getGameScores(pool.sport, pool.external_game_id);

    if (!liveScores) {
      return res.status(404).json({ error: 'Could not fetch scores for this game. The game may not have started yet.' });
    }

    res.json({
      synced: true,
      gameStatus: liveScores.status,
      statusDetail: liveScores.status_detail,
      awayScore: liveScores.away_score,
      homeScore: liveScores.home_score,
      clock: liveScores.clock,
      period: liveScores.period,
      away: liveScores.away,
      home: liveScores.home,
    });
  } catch (error) {
    console.error('Sync scores error:', error);
    res.status(500).json({ error: 'Failed to sync scores' });
  }
});

// Get live score and current winner (for real-time updates)
router.get('/live', async (req: AuthRequest, res) => {
  try {
    const poolId = req.params.id;

    const poolResult = await query<Pool>('SELECT * FROM pools WHERE id = $1', [poolId]);

    if (poolResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const pool = poolResult.rows[0];

    // If no external game ID, return saved scores only
    if (!pool.external_game_id) {
      const [scores, winners] = await Promise.all([
        getPoolScores(poolId),
        getPoolWinners(poolId),
      ]);
      return res.json({ scores, winners, liveScore: null, currentWinner: null });
    }

    // Fetch live scores
    const liveScores = await getGameScores(pool.sport, pool.external_game_id);

    // Calculate current winner based on live scores
    let currentWinner = null;
    if (liveScores && pool.col_digits && pool.row_digits &&
        liveScores.away_score !== null && liveScores.home_score !== null) {
      currentWinner = await calculateCurrentWinner(pool, liveScores.away_score, liveScores.home_score);
    }

    const [scores, winners] = await Promise.all([
      getPoolScores(poolId),
      getPoolWinners(poolId),
    ]);

    res.json({
      scores,
      winners,
      liveScore: liveScores ? {
        status: liveScores.status,
        statusDetail: liveScores.status_detail,
        awayScore: liveScores.away_score,
        homeScore: liveScores.home_score,
        clock: liveScores.clock,
        period: liveScores.period,
      } : null,
      currentWinner,
    });
  } catch (error) {
    console.error('Get live scores error:', error);
    res.status(500).json({ error: 'Failed to get live scores' });
  }
});

export default router;
