import { query, withTransaction } from '../db/index.js';
import { Pool } from '../types/index.js';
import { logAudit } from './auditService.js';
import { claimSquare } from './gridService.js';
import { PoolClient } from 'pg';

interface PaymentAllocation {
  poolId: string;
  squareCount: number;
  autoAssign: boolean; // If true, auto-pick random squares. If false, just credit payment.
}

interface PaymentResult {
  success: boolean;
  error?: string;
  totalAmount: number;
  allocations: {
    poolId: string;
    poolName: string;
    denomination: number;
    squaresAllocated: number;
    squaresAssigned: number;
    assignedSquares?: { row: number; col: number }[];
    creditRemaining: number;
  }[];
  ledgerEntryIds: string[];
}

interface SinglePoolPaymentResult {
  success: boolean;
  error?: string;
  squaresAllocated: number;
  squaresAssigned: number;
  assignedSquares?: { row: number; col: number }[];
  creditRemaining: number;
  amountCredited: number;
  ledgerEntryId?: string;
}

// Record a payment for a single pool
export async function recordPoolPayment(
  poolId: string,
  playerId: string,
  amount: number,
  autoAssign: boolean,
  adminId: string
): Promise<SinglePoolPaymentResult> {
  return withTransaction(async (client) => {
    // Get pool details
    const poolResult = await client.query<Pool>(
      'SELECT * FROM pools WHERE id = $1',
      [poolId]
    );

    if (poolResult.rows.length === 0) {
      return { success: false, error: 'Pool not found', squaresAllocated: 0, squaresAssigned: 0, creditRemaining: 0, amountCredited: 0 };
    }

    const pool = poolResult.rows[0];

    // Verify player is in the pool
    const memberResult = await client.query(
      'SELECT * FROM pool_players WHERE pool_id = $1 AND player_id = $2',
      [poolId, playerId]
    );

    if (memberResult.rows.length === 0) {
      return { success: false, error: 'Player is not a member of this pool', squaresAllocated: 0, squaresAssigned: 0, creditRemaining: 0, amountCredited: 0 };
    }

    // Calculate how many squares this covers
    const denomination = pool.denomination;
    const squaresFromPayment = Math.floor(amount / denomination);
    const remainder = amount % denomination;

    // Get player's current squares in this pool (claimed only, not pending)
    const currentSquaresResult = await client.query(
      `SELECT COUNT(*) as count FROM squares
       WHERE pool_id = $1 AND player_id = $2 AND claim_status = 'claimed'`,
      [poolId, playerId]
    );
    const currentSquares = parseInt(currentSquaresResult.rows[0].count);

    // Get available squares
    const availableResult = await client.query(
      `SELECT row_idx, col_idx FROM squares
       WHERE pool_id = $1 AND claim_status = 'available'
       ORDER BY RANDOM()`,
      [poolId]
    );
    const availableSquares = availableResult.rows;

    let squaresToAssign = squaresFromPayment;
    let squaresAssigned = 0;
    const assignedSquares: { row: number; col: number }[] = [];

    // Check max squares per player limit
    const maxAllowed = pool.max_per_player - currentSquares;
    if (squaresToAssign > maxAllowed) {
      squaresToAssign = maxAllowed;
    }

    // Limit by available squares
    if (squaresToAssign > availableSquares.length) {
      squaresToAssign = availableSquares.length;
    }

    if (autoAssign && squaresToAssign > 0) {
      // Auto-assign random available squares
      for (let i = 0; i < squaresToAssign; i++) {
        const square = availableSquares[i];

        // Directly claim the square (bypass normal claim flow since admin is doing it)
        await client.query(
          `UPDATE squares
           SET player_id = $1, claim_status = 'claimed', claimed_at = NOW()
           WHERE pool_id = $2 AND row_idx = $3 AND col_idx = $4`,
          [playerId, poolId, square.row_idx, square.col_idx]
        );

        assignedSquares.push({ row: square.row_idx, col: square.col_idx });
        squaresAssigned++;
      }
    }

    // Calculate actual amount credited (based on squares allocated, not excess)
    const amountForSquares = squaresToAssign * denomination;
    const creditRemaining = remainder + ((squaresFromPayment - squaresToAssign) * denomination);

    // Record in ledger
    const ledgerResult = await client.query(
      `INSERT INTO ledger (player_id, pool_id, type, amount, description)
       VALUES ($1, $2, 'buy_in', $3, $4)
       RETURNING id`,
      [
        playerId,
        poolId,
        -amountForSquares, // Negative = player paid/debit from their balance
        `Payment for ${squaresToAssign} square(s) @ $${denomination}/sq${autoAssign ? ' (auto-assigned)' : ''}`
      ]
    );

    // Mark player as paid (confirmed) if they have squares
    const totalSquaresNow = currentSquares + squaresAssigned;
    if (totalSquaresNow > 0) {
      await client.query(
        `UPDATE pool_players SET paid = true, payment_status = 'confirmed'
         WHERE pool_id = $1 AND player_id = $2`,
        [poolId, playerId]
      );
    }

    // Get player name for audit
    const playerResult = await client.query('SELECT name FROM players WHERE id = $1', [playerId]);
    const playerName = playerResult.rows[0]?.name || 'Unknown';

    await logAudit({
      pool_id: poolId,
      actor_type: 'admin',
      actor_id: adminId,
      action: 'payment_recorded',
      detail: {
        player_id: playerId,
        player_name: playerName,
        amount_received: amount,
        squares_allocated: squaresToAssign,
        squares_assigned: squaresAssigned,
        assigned_squares: assignedSquares,
        credit_remaining: creditRemaining,
        auto_assign: autoAssign,
      },
    }, client);

    return {
      success: true,
      squaresAllocated: squaresToAssign,
      squaresAssigned,
      assignedSquares: autoAssign ? assignedSquares : undefined,
      creditRemaining,
      amountCredited: amountForSquares,
      ledgerEntryId: ledgerResult.rows[0].id,
    };
  });
}

// Record payment that covers multiple pools
export async function recordMultiPoolPayment(
  playerId: string,
  totalAmount: number,
  allocations: PaymentAllocation[],
  adminId: string
): Promise<PaymentResult> {
  return withTransaction(async (client) => {
    const results: PaymentResult['allocations'] = [];
    const ledgerEntryIds: string[] = [];
    let remainingAmount = totalAmount;

    // Verify player exists
    const playerResult = await client.query('SELECT id, name FROM players WHERE id = $1', [playerId]);
    if (playerResult.rows.length === 0) {
      return {
        success: false,
        error: 'Player not found',
        totalAmount,
        allocations: [],
        ledgerEntryIds: [],
      };
    }
    const playerName = playerResult.rows[0].name;

    for (const allocation of allocations) {
      const { poolId, squareCount, autoAssign } = allocation;

      // Get pool details
      const poolResult = await client.query<Pool>(
        'SELECT * FROM pools WHERE id = $1',
        [poolId]
      );

      if (poolResult.rows.length === 0) {
        results.push({
          poolId,
          poolName: 'Unknown',
          denomination: 0,
          squaresAllocated: 0,
          squaresAssigned: 0,
          creditRemaining: 0,
        });
        continue;
      }

      const pool = poolResult.rows[0];
      const costForSquares = squareCount * pool.denomination;

      // Check if player is in pool
      const memberResult = await client.query(
        'SELECT * FROM pool_players WHERE pool_id = $1 AND player_id = $2',
        [poolId, playerId]
      );

      if (memberResult.rows.length === 0) {
        // Auto-add player to pool
        await client.query(
          `INSERT INTO pool_players (pool_id, player_id, paid, payment_status)
           VALUES ($1, $2, true, 'confirmed')`,
          [poolId, playerId]
        );
      }

      // Get current squares and check limits
      const currentResult = await client.query(
        `SELECT COUNT(*) as count FROM squares
         WHERE pool_id = $1 AND player_id = $2 AND claim_status = 'claimed'`,
        [poolId, playerId]
      );
      const currentSquares = parseInt(currentResult.rows[0].count);
      const maxAllowed = Math.min(pool.max_per_player - currentSquares, squareCount);

      // Get available squares
      const availableResult = await client.query(
        `SELECT row_idx, col_idx FROM squares
         WHERE pool_id = $1 AND claim_status = 'available'
         ORDER BY RANDOM()
         LIMIT $2`,
        [poolId, maxAllowed]
      );

      const squaresToAssign = Math.min(maxAllowed, availableResult.rows.length);
      const assignedSquares: { row: number; col: number }[] = [];

      if (autoAssign && squaresToAssign > 0) {
        for (let i = 0; i < squaresToAssign; i++) {
          const sq = availableResult.rows[i];
          await client.query(
            `UPDATE squares
             SET player_id = $1, claim_status = 'claimed', claimed_at = NOW()
             WHERE pool_id = $2 AND row_idx = $3 AND col_idx = $4`,
            [playerId, poolId, sq.row_idx, sq.col_idx]
          );
          assignedSquares.push({ row: sq.row_idx, col: sq.col_idx });
        }
      }

      const actualCost = squaresToAssign * pool.denomination;
      remainingAmount -= actualCost;

      // Record in ledger
      const ledgerResult = await client.query(
        `INSERT INTO ledger (player_id, pool_id, type, amount, description)
         VALUES ($1, $2, 'buy_in', $3, $4)
         RETURNING id`,
        [
          playerId,
          poolId,
          -actualCost,
          `Payment for ${squaresToAssign} square(s) @ $${pool.denomination}/sq${autoAssign ? ' (auto-assigned)' : ''}`
        ]
      );
      ledgerEntryIds.push(ledgerResult.rows[0].id);

      // Update payment status
      if (squaresToAssign > 0) {
        await client.query(
          `UPDATE pool_players SET paid = true, payment_status = 'confirmed'
           WHERE pool_id = $1 AND player_id = $2`,
          [poolId, playerId]
        );
      }

      results.push({
        poolId,
        poolName: pool.name,
        denomination: pool.denomination,
        squaresAllocated: squaresToAssign,
        squaresAssigned: autoAssign ? assignedSquares.length : 0,
        assignedSquares: autoAssign ? assignedSquares : undefined,
        creditRemaining: 0, // Calculated at end
      });
    }

    // Log overall multi-pool payment
    await logAudit({
      pool_id: undefined,
      actor_type: 'admin',
      actor_id: adminId,
      action: 'multi_pool_payment',
      detail: {
        player_id: playerId,
        player_name: playerName,
        total_amount: totalAmount,
        pools: results.map(r => ({
          poolId: r.poolId,
          poolName: r.poolName,
          squares: r.squaresAllocated,
        })),
        credit_remaining: remainingAmount,
      },
    }, client);

    return {
      success: true,
      totalAmount,
      allocations: results,
      ledgerEntryIds,
    };
  });
}

// Get player's payment summary across pools
export async function getPlayerPaymentSummary(playerId: string): Promise<{
  pools: {
    poolId: string;
    poolName: string;
    denomination: number;
    squareCount: number;
    amountOwed: number;
    amountPaid: number;
    balance: number;
    paid: boolean;
  }[];
  totalOwed: number;
  totalPaid: number;
  overallBalance: number;
}> {
  // Get all pools player is in with their squares
  const result = await query(
    `SELECT
       pp.pool_id,
       p.name as pool_name,
       p.denomination,
       pp.paid,
       pp.payment_status,
       (SELECT COUNT(*) FROM squares s WHERE s.pool_id = p.id AND s.player_id = $1 AND s.claim_status = 'claimed') as square_count,
       COALESCE((SELECT SUM(ABS(amount)) FROM ledger l WHERE l.pool_id = p.id AND l.player_id = $1 AND l.type = 'buy_in'), 0) as amount_paid
     FROM pool_players pp
     JOIN pools p ON pp.pool_id = p.id
     WHERE pp.player_id = $1
     ORDER BY p.created_at DESC`,
    [playerId]
  );

  const pools = result.rows.map(row => {
    const squareCount = parseInt(row.square_count);
    const amountOwed = squareCount * row.denomination;
    const amountPaid = parseInt(row.amount_paid);

    return {
      poolId: row.pool_id,
      poolName: row.pool_name,
      denomination: row.denomination,
      squareCount,
      amountOwed,
      amountPaid,
      balance: amountPaid - amountOwed, // Positive = overpaid, negative = owes
      paid: row.paid,
    };
  });

  const totalOwed = pools.reduce((sum, p) => sum + p.amountOwed, 0);
  const totalPaid = pools.reduce((sum, p) => sum + p.amountPaid, 0);

  return {
    pools,
    totalOwed,
    totalPaid,
    overallBalance: totalPaid - totalOwed,
  };
}

// Full auto payment - admin just enters player + amount, system handles everything
export async function autoDistributePayment(
  playerId: string,
  totalAmount: number,
  adminId: string,
  options?: {
    preferredPoolIds?: string[]; // Prioritize these pools first
    distributionStrategy?: 'even' | 'sequential' | 'deadline'; // How to distribute
  }
): Promise<{
  success: boolean;
  error?: string;
  totalAmount: number;
  totalSquaresAssigned: number;
  remainingCredit: number;
  poolsUpdated: {
    poolId: string;
    poolName: string;
    denomination: number;
    squaresAssigned: number;
    amountUsed: number;
    assignedSquares: { row: number; col: number }[];
  }[];
}> {
  return withTransaction(async (client) => {
    // Verify player exists
    const playerResult = await client.query('SELECT id, name FROM players WHERE id = $1', [playerId]);
    if (playerResult.rows.length === 0) {
      return {
        success: false,
        error: 'Player not found',
        totalAmount,
        totalSquaresAssigned: 0,
        remainingCredit: totalAmount,
        poolsUpdated: [],
      };
    }
    const playerName = playerResult.rows[0].name;

    // Get all open pools the player is a member of (or could join)
    // Prioritize pools they're already in, then by deadline
    const poolsResult = await client.query<Pool & { is_member: boolean }>(
      `SELECT DISTINCT p.*,
         pp.player_id IS NOT NULL as is_member,
         CASE WHEN p.game_date IS NULL THEN '9999-12-31' ELSE p.game_date END as sort_date
       FROM pools p
       LEFT JOIN pool_players pp ON p.id = pp.pool_id AND pp.player_id = $1
       WHERE p.status = 'open'
         AND (pp.player_id IS NOT NULL OR p.id = ANY($2::uuid[]))
       ORDER BY is_member DESC, sort_date ASC`,
      [playerId, options?.preferredPoolIds || []]
    );

    const strategy = options?.distributionStrategy || 'sequential';
    let remainingAmount = totalAmount;
    const poolsUpdated: {
      poolId: string;
      poolName: string;
      denomination: number;
      squaresAssigned: number;
      amountUsed: number;
      assignedSquares: { row: number; col: number }[];
    }[] = [];

    // Reorder pools if preferred pools specified
    let orderedPools = poolsResult.rows;
    if (options?.preferredPoolIds?.length) {
      orderedPools = [
        ...poolsResult.rows.filter(p => options.preferredPoolIds!.includes(p.id)),
        ...poolsResult.rows.filter(p => !options.preferredPoolIds!.includes(p.id)),
      ];
    }

    if (strategy === 'sequential') {
      // Fill one pool at a time until money runs out
      for (const pool of orderedPools) {
        if (remainingAmount < pool.denomination) break;

        // Check if player is in pool, add if not
        const memberCheck = await client.query(
          'SELECT 1 FROM pool_players WHERE pool_id = $1 AND player_id = $2',
          [pool.id, playerId]
        );
        if (memberCheck.rows.length === 0) {
          await client.query(
            `INSERT INTO pool_players (pool_id, player_id, paid, payment_status)
             VALUES ($1, $2, true, 'confirmed')`,
            [pool.id, playerId]
          );
        }

        // Get current squares and check max
        const currentResult = await client.query(
          `SELECT COUNT(*) as count FROM squares
           WHERE pool_id = $1 AND player_id = $2 AND claim_status = 'claimed'`,
          [pool.id, playerId]
        );
        const currentSquares = parseInt(currentResult.rows[0].count);
        const maxCanAdd = pool.max_per_player - currentSquares;

        if (maxCanAdd <= 0) continue;

        // Get available squares
        const availableResult = await client.query(
          `SELECT row_idx, col_idx FROM squares
           WHERE pool_id = $1 AND claim_status = 'available'
           ORDER BY RANDOM()`,
          [pool.id]
        );

        const maxAffordable = Math.floor(remainingAmount / pool.denomination);
        const squaresToAssign = Math.min(maxCanAdd, availableResult.rows.length, maxAffordable);

        if (squaresToAssign === 0) continue;

        const assignedSquares: { row: number; col: number }[] = [];

        for (let i = 0; i < squaresToAssign; i++) {
          const sq = availableResult.rows[i];
          await client.query(
            `UPDATE squares
             SET player_id = $1, claim_status = 'claimed', claimed_at = NOW()
             WHERE pool_id = $2 AND row_idx = $3 AND col_idx = $4`,
            [playerId, pool.id, sq.row_idx, sq.col_idx]
          );
          assignedSquares.push({ row: sq.row_idx, col: sq.col_idx });
        }

        const amountUsed = squaresToAssign * pool.denomination;
        remainingAmount -= amountUsed;

        // Record in ledger
        await client.query(
          `INSERT INTO ledger (player_id, pool_id, type, amount, description)
           VALUES ($1, $2, 'buy_in', $3, $4)`,
          [
            playerId,
            pool.id,
            -amountUsed,
            `Auto-payment: ${squaresToAssign} square(s) @ $${pool.denomination}/sq`
          ]
        );

        // Update payment status
        await client.query(
          `UPDATE pool_players SET paid = true, payment_status = 'confirmed'
           WHERE pool_id = $1 AND player_id = $2`,
          [pool.id, playerId]
        );

        poolsUpdated.push({
          poolId: pool.id,
          poolName: pool.name,
          denomination: pool.denomination,
          squaresAssigned: squaresToAssign,
          amountUsed,
          assignedSquares,
        });
      }
    } else if (strategy === 'even') {
      // Distribute evenly across all pools they're in
      const memberPools = orderedPools.filter(p => (p as Pool & { is_member: boolean }).is_member);

      if (memberPools.length === 0) {
        return {
          success: false,
          error: 'Player is not a member of any open pools',
          totalAmount,
          totalSquaresAssigned: 0,
          remainingCredit: totalAmount,
          poolsUpdated: [],
        };
      }

      const amountPerPool = Math.floor(totalAmount / memberPools.length);

      for (const pool of memberPools) {
        const maxSquares = Math.floor(amountPerPool / pool.denomination);
        if (maxSquares === 0) continue;

        // Same logic as sequential but with calculated amount
        const currentResult = await client.query(
          `SELECT COUNT(*) as count FROM squares
           WHERE pool_id = $1 AND player_id = $2 AND claim_status = 'claimed'`,
          [pool.id, playerId]
        );
        const currentSquares = parseInt(currentResult.rows[0].count);
        const maxCanAdd = pool.max_per_player - currentSquares;

        const availableResult = await client.query(
          `SELECT row_idx, col_idx FROM squares
           WHERE pool_id = $1 AND claim_status = 'available'
           ORDER BY RANDOM()`,
          [pool.id]
        );

        const squaresToAssign = Math.min(maxCanAdd, availableResult.rows.length, maxSquares);

        if (squaresToAssign === 0) continue;

        const assignedSquares: { row: number; col: number }[] = [];

        for (let i = 0; i < squaresToAssign; i++) {
          const sq = availableResult.rows[i];
          await client.query(
            `UPDATE squares
             SET player_id = $1, claim_status = 'claimed', claimed_at = NOW()
             WHERE pool_id = $2 AND row_idx = $3 AND col_idx = $4`,
            [playerId, pool.id, sq.row_idx, sq.col_idx]
          );
          assignedSquares.push({ row: sq.row_idx, col: sq.col_idx });
        }

        const amountUsed = squaresToAssign * pool.denomination;
        remainingAmount -= amountUsed;

        await client.query(
          `INSERT INTO ledger (player_id, pool_id, type, amount, description)
           VALUES ($1, $2, 'buy_in', $3, $4)`,
          [
            playerId,
            pool.id,
            -amountUsed,
            `Auto-payment (even): ${squaresToAssign} square(s) @ $${pool.denomination}/sq`
          ]
        );

        await client.query(
          `UPDATE pool_players SET paid = true, payment_status = 'confirmed'
           WHERE pool_id = $1 AND player_id = $2`,
          [pool.id, playerId]
        );

        poolsUpdated.push({
          poolId: pool.id,
          poolName: pool.name,
          denomination: pool.denomination,
          squaresAssigned: squaresToAssign,
          amountUsed,
          assignedSquares,
        });
      }
    }

    const totalSquaresAssigned = poolsUpdated.reduce((sum, p) => sum + p.squaresAssigned, 0);

    await logAudit({
      pool_id: undefined,
      actor_type: 'admin',
      actor_id: adminId,
      action: 'auto_payment_distributed',
      detail: {
        player_id: playerId,
        player_name: playerName,
        total_amount: totalAmount,
        strategy,
        total_squares_assigned: totalSquaresAssigned,
        remaining_credit: remainingAmount,
        pools: poolsUpdated.map(p => ({
          poolId: p.poolId,
          poolName: p.poolName,
          squares: p.squaresAssigned,
          amount: p.amountUsed,
        })),
      },
    });

    return {
      success: true,
      totalAmount,
      totalSquaresAssigned,
      remainingCredit: remainingAmount,
      poolsUpdated,
    };
  });
}

// Get pool payment summary
export async function getPoolPaymentSummary(poolId: string): Promise<{
  poolId: string;
  denomination: number;
  totalSquares: number;
  totalValue: number;
  paidSquares: number;
  paidAmount: number;
  unpaidSquares: number;
  unpaidAmount: number;
  players: {
    playerId: string;
    playerName: string;
    squareCount: number;
    amountOwed: number;
    amountPaid: number;
    balance: number;
    paid: boolean;
    paymentStatus: string;
  }[];
}> {
  const poolResult = await query<Pool>('SELECT * FROM pools WHERE id = $1', [poolId]);
  if (poolResult.rows.length === 0) {
    throw new Error('Pool not found');
  }
  const pool = poolResult.rows[0];

  const playersResult = await query(
    `SELECT
       pp.player_id,
       p.name as player_name,
       pp.paid,
       pp.payment_status,
       (SELECT COUNT(*) FROM squares s WHERE s.pool_id = $1 AND s.player_id = p.id AND s.claim_status = 'claimed') as square_count,
       COALESCE((SELECT SUM(ABS(amount)) FROM ledger l WHERE l.pool_id = $1 AND l.player_id = p.id AND l.type = 'buy_in'), 0) as amount_paid
     FROM pool_players pp
     JOIN players p ON pp.player_id = p.id
     WHERE pp.pool_id = $1
     ORDER BY p.name`,
    [poolId]
  );

  const players = playersResult.rows.map(row => {
    const squareCount = parseInt(row.square_count);
    const amountOwed = squareCount * pool.denomination;
    const amountPaid = parseInt(row.amount_paid);

    return {
      playerId: row.player_id,
      playerName: row.player_name,
      squareCount,
      amountOwed,
      amountPaid,
      balance: amountPaid - amountOwed,
      paid: row.paid,
      paymentStatus: row.payment_status,
    };
  });

  const totalSquares = players.reduce((sum, p) => sum + p.squareCount, 0);
  const paidSquares = players.filter(p => p.paid).reduce((sum, p) => sum + p.squareCount, 0);
  const unpaidSquares = totalSquares - paidSquares;

  return {
    poolId,
    denomination: pool.denomination,
    totalSquares,
    totalValue: totalSquares * pool.denomination,
    paidSquares,
    paidAmount: players.filter(p => p.paid).reduce((sum, p) => sum + p.amountPaid, 0),
    unpaidSquares,
    unpaidAmount: players.filter(p => !p.paid).reduce((sum, p) => sum + p.amountOwed, 0),
    players,
  };
}
