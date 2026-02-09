import { query, withTransaction } from '../db/index.js';
import { Pool, Score, Winner } from '../types/index.js';
import { SPORTS_CONFIG, PayoutStructure, SportType } from '../config.js';
import { logAudit } from './auditService.js';

export interface WinnerResult {
  player_id: string;
  player_name: string;
  square_row: number;
  square_col: number;
  payout_amount: number;
  tip_suggestion: number;
}

// Calculate winner for a specific period
export async function calculateWinner(
  poolId: string,
  periodKey: string,
  awayScore: number,
  homeScore: number,
  payoutPct: number,
  adminId: string
): Promise<WinnerResult | null> {
  return withTransaction(async (client) => {
    // Get pool with locked digits
    const poolResult = await client.query<Pool>(
      'SELECT * FROM pools WHERE id = $1',
      [poolId]
    );

    if (poolResult.rows.length === 0) {
      throw new Error('Pool not found');
    }

    const pool = poolResult.rows[0];

    if (!pool.col_digits || !pool.row_digits) {
      throw new Error('Grid is not locked - cannot calculate winners');
    }

    // Find the winning square coordinates
    const awayLastDigit = awayScore % 10;
    const homeLastDigit = homeScore % 10;

    const col = pool.col_digits.indexOf(awayLastDigit);
    const row = pool.row_digits.indexOf(homeLastDigit);

    if (col === -1 || row === -1) {
      throw new Error('Invalid digit mapping');
    }

    // Find who owns that square
    const squareResult = await client.query(
      `SELECT s.*, p.name as player_name
       FROM squares s
       LEFT JOIN players p ON s.player_id = p.id
       WHERE s.pool_id = $1 AND s.row_idx = $2 AND s.col_idx = $3`,
      [poolId, row, col]
    );

    if (squareResult.rows.length === 0 || !squareResult.rows[0].player_id) {
      // No one owns this square - no winner
      return null;
    }

    const square = squareResult.rows[0];
    const poolTotal = 100 * pool.denomination;
    const payoutAmount = Math.round(poolTotal * payoutPct / 100);
    const tipSuggestion = Math.round(payoutAmount * pool.tip_pct / 100);

    // Upsert winner record
    await client.query(
      `INSERT INTO winners (pool_id, period_key, player_id, square_row, square_col, payout_amount, tip_suggestion)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (pool_id, period_key)
       DO UPDATE SET player_id = $3, square_row = $4, square_col = $5, payout_amount = $6, tip_suggestion = $7`,
      [poolId, periodKey, square.player_id, row, col, payoutAmount, tipSuggestion]
    );

    // Add to ledger
    await client.query(
      `INSERT INTO ledger (player_id, pool_id, type, amount, description)
       VALUES ($1, $2, 'payout', $3, $4)
       ON CONFLICT DO NOTHING`,
      [square.player_id, poolId, payoutAmount, `Won ${periodKey} payout`]
    );

    await logAudit({
      pool_id: poolId,
      actor_type: 'system',
      action: 'winner_calculated',
      detail: {
        period_key: periodKey,
        player_id: square.player_id,
        player_name: square.player_name,
        row,
        col,
        away_score: awayScore,
        home_score: homeScore,
        payout_amount: payoutAmount,
      },
    });

    return {
      player_id: square.player_id,
      player_name: square.player_name,
      square_row: row,
      square_col: col,
      payout_amount: payoutAmount,
      tip_suggestion: tipSuggestion,
    };
  });
}

// Get payout percentages based on structure and sport
export function getPayoutPercentages(
  structure: PayoutStructure,
  sport: SportType
): Record<string, number> {
  const config = SPORTS_CONFIG[sport];
  const periods = config.periods;
  const n = periods.length;
  const result: Record<string, number> = {};

  switch (structure) {
    case 'standard':
      // Even split
      const evenPct = Math.floor(100 / n);
      periods.forEach((p, i) => {
        result[`p${i}`] = i === n - 1 ? 100 - (evenPct * (n - 1)) : evenPct;
      });
      break;

    case 'heavy_final':
      // 10% each except final gets remainder
      periods.forEach((p, i) => {
        result[`p${i}`] = i === n - 1 ? 100 - (10 * (n - 1)) : 10;
      });
      break;

    case 'halftime_final':
      // 25% at half, 75% at final
      const halfIdx = Math.floor(n / 2) - 1;
      periods.forEach((p, i) => {
        if (i === halfIdx) result[`p${i}`] = 25;
        else if (i === n - 1) result[`p${i}`] = 75;
        else result[`p${i}`] = 0;
      });
      break;

    case 'reverse':
      // Decreasing: 40, 30, 20, 10 (or adjusted for period count)
      const weights = [40, 30, 20, 10];
      periods.forEach((p, i) => {
        result[`p${i}`] = weights[i] || Math.floor(100 / n);
      });
      break;

    default:
      periods.forEach((p, i) => {
        result[`p${i}`] = Math.floor(100 / n);
      });
  }

  return result;
}

// Enter score and calculate winner
export async function enterScore(
  poolId: string,
  periodKey: string,
  periodLabel: string,
  awayScore: number,
  homeScore: number,
  payoutPct: number,
  adminId: string
): Promise<{ score: Score; winner: WinnerResult | null }> {
  return withTransaction(async (client) => {
    // Upsert score
    const scoreResult = await client.query<Score>(
      `INSERT INTO scores (pool_id, period_key, period_label, away_score, home_score, payout_pct, entered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (pool_id, period_key)
       DO UPDATE SET away_score = $4, home_score = $5, payout_pct = $6, entered_at = NOW(), entered_by = $7
       RETURNING *`,
      [poolId, periodKey, periodLabel, awayScore, homeScore, payoutPct, adminId]
    );

    const score = scoreResult.rows[0];

    await logAudit({
      pool_id: poolId,
      actor_type: 'admin',
      actor_id: adminId,
      action: 'score_entered',
      detail: { period_key: periodKey, away_score: awayScore, home_score: homeScore },
    });

    // Calculate winner
    const winner = await calculateWinner(poolId, periodKey, awayScore, homeScore, payoutPct, adminId);

    return { score, winner };
  });
}

// Get all winners for a pool
export async function getPoolWinners(poolId: string) {
  const result = await query(
    `SELECT w.*, p.name as player_name
     FROM winners w
     JOIN players p ON w.player_id = p.id
     WHERE w.pool_id = $1
     ORDER BY w.period_key`,
    [poolId]
  );
  return result.rows;
}

// Get all scores for a pool
export async function getPoolScores(poolId: string) {
  const result = await query<Score>(
    `SELECT * FROM scores WHERE pool_id = $1 ORDER BY period_key`,
    [poolId]
  );
  return result.rows;
}
