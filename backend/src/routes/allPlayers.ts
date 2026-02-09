import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { authenticateAdmin, AuthRequest } from '../middleware/auth.js';
import { Player } from '../types/index.js';
import crypto from 'crypto';

const router = Router();

// All routes require admin auth
router.use(authenticateAdmin);

// Validation schemas
const createPlayerSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().optional(),
  email: z.string().email().optional(),
}).refine(data => data.phone || data.email, {
  message: 'Either phone or email is required',
});

const updatePlayerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
});

interface PlayerWithStats extends Player {
  pool_count: number;
  total_squares: number;
  total_owed: number;
  total_paid: number;
}

// GET /api/players - List all players with stats
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const search = req.query.q as string | undefined;

    let whereClause = '';
    const params: any[] = [];

    if (search) {
      whereClause = `WHERE p.name ILIKE $1 OR p.phone ILIKE $1 OR p.email ILIKE $1`;
      params.push(`%${search}%`);
    }

    const result = await query<PlayerWithStats>(
      `SELECT p.*,
        (SELECT COUNT(DISTINCT pool_id) FROM pool_players WHERE player_id = p.id) as pool_count,
        (SELECT COUNT(*) FROM squares WHERE player_id = p.id AND claim_status = 'claimed') as total_squares,
        COALESCE((
          SELECT SUM(s.cnt * po.denomination)
          FROM (
            SELECT pool_id, COUNT(*) as cnt
            FROM squares
            WHERE player_id = p.id AND claim_status = 'claimed'
            GROUP BY pool_id
          ) s
          JOIN pools po ON s.pool_id = po.id
        ), 0) as total_owed,
        COALESCE((SELECT SUM(amount) FROM ledger WHERE player_id = p.id AND type = 'buy_in'), 0) as total_paid
       FROM players p
       ${whereClause}
       ORDER BY p.name ASC`,
      params
    );

    res.json(result.rows.map(p => ({
      ...p,
      pool_count: parseInt(p.pool_count as any) || 0,
      total_squares: parseInt(p.total_squares as any) || 0,
      total_owed: parseInt(p.total_owed as any) || 0,
      total_paid: parseInt(p.total_paid as any) || 0,
    })));
  } catch (error) {
    console.error('List players error:', error);
    res.status(500).json({ error: 'Failed to list players' });
  }
});

// POST /api/players - Create a new player (not tied to any pool)
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createPlayerSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.errors.map(e => ({ field: e.path[0], message: e.message }))
      });
    }

    const { name, phone, email } = parsed.data;

    // Check for existing player with same phone or email
    if (phone) {
      const existing = await query('SELECT id FROM players WHERE phone = $1', [phone]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'A player with this phone number already exists' });
      }
    }

    if (email) {
      const existing = await query('SELECT id FROM players WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'A player with this email already exists' });
      }
    }

    // Generate auth token for magic links
    const authToken = crypto.randomBytes(32).toString('hex');

    const result = await query<Player>(
      `INSERT INTO players (name, phone, email, auth_token)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, phone || null, email || null, authToken]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create player error:', error);
    res.status(500).json({ error: 'Failed to create player' });
  }
});

// GET /api/players/:id - Get player details with pools
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const playerId = req.params.id;

    const playerResult = await query<Player>(
      'SELECT * FROM players WHERE id = $1',
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Get pools this player is in
    const poolsResult = await query(
      `SELECT p.id, p.name, p.sport, p.away_team, p.home_team, p.denomination, p.status,
        pp.paid, pp.payment_status,
        (SELECT COUNT(*) FROM squares WHERE pool_id = p.id AND player_id = $1 AND claim_status = 'claimed') as square_count
       FROM pools p
       JOIN pool_players pp ON p.id = pp.pool_id
       WHERE pp.player_id = $1
       ORDER BY p.created_at DESC`,
      [playerId]
    );

    // Get groups this player is in
    const groupsResult = await query(
      `SELECT g.id, g.name, g.color
       FROM player_groups g
       JOIN player_group_members pgm ON g.id = pgm.group_id
       WHERE pgm.player_id = $1`,
      [playerId]
    );

    res.json({
      ...playerResult.rows[0],
      pools: poolsResult.rows.map(p => ({
        ...p,
        square_count: parseInt(p.square_count) || 0,
      })),
      groups: groupsResult.rows,
    });
  } catch (error) {
    console.error('Get player error:', error);
    res.status(500).json({ error: 'Failed to get player' });
  }
});

// PATCH /api/players/:id - Update player
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const playerId = req.params.id;
    const parsed = updatePlayerSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.errors.map(e => ({ field: e.path[0], message: e.message }))
      });
    }

    // Check player exists
    const existing = await query('SELECT id FROM players WHERE id = $1', [playerId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const { name, phone, email } = parsed.data;
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }

    if (phone !== undefined) {
      // Check for duplicates
      if (phone) {
        const dup = await query('SELECT id FROM players WHERE phone = $1 AND id != $2', [phone, playerId]);
        if (dup.rows.length > 0) {
          return res.status(400).json({ error: 'Another player has this phone number' });
        }
      }
      updates.push(`phone = $${paramIndex++}`);
      values.push(phone);
    }

    if (email !== undefined) {
      // Check for duplicates
      if (email) {
        const dup = await query('SELECT id FROM players WHERE email = $1 AND id != $2', [email, playerId]);
        if (dup.rows.length > 0) {
          return res.status(400).json({ error: 'Another player has this email' });
        }
      }
      updates.push(`email = $${paramIndex++}`);
      values.push(email);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(playerId);

    const result = await query<Player>(
      `UPDATE players SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update player error:', error);
    res.status(500).json({ error: 'Failed to update player' });
  }
});

// DELETE /api/players/:id - Delete player (only if not in any pools)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const playerId = req.params.id;

    // Check if player is in any pools
    const poolCheck = await query(
      'SELECT COUNT(*) as count FROM pool_players WHERE player_id = $1',
      [playerId]
    );

    if (parseInt(poolCheck.rows[0].count) > 0) {
      return res.status(400).json({
        error: 'Cannot delete player who is in pools. Remove them from all pools first.'
      });
    }

    const result = await query(
      'DELETE FROM players WHERE id = $1 RETURNING id',
      [playerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json({ message: 'Player deleted' });
  } catch (error) {
    console.error('Delete player error:', error);
    res.status(500).json({ error: 'Failed to delete player' });
  }
});

export default router;
