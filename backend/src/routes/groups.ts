import { Router, Response } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/index.js';
import { authenticateAdmin, AuthRequest } from '../middleware/auth.js';
import { Player } from '../types/index.js';

const router = Router();

// All routes require admin auth
router.use(authenticateAdmin);

// Types
interface PlayerGroup {
  id: string;
  admin_id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: Date;
  member_count?: number;
}

interface GroupMember {
  player_id: string;
  player_name: string;
  player_phone: string | null;
  player_email: string | null;
  added_at: Date;
}

// Validation schemas
const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(255).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(255).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

const addMembersSchema = z.object({
  player_ids: z.array(z.string().uuid()).min(1),
});

const removeMembersSchema = z.object({
  player_ids: z.array(z.string().uuid()).min(1),
});

// GET /api/groups - List all groups for the admin
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;

    const result = await query<PlayerGroup & { member_count: string }>(
      `SELECT g.*,
        (SELECT COUNT(*) FROM player_group_members pgm WHERE pgm.group_id = g.id) as member_count
       FROM player_groups g
       WHERE g.admin_id = $1
       ORDER BY g.name ASC`,
      [admin.id]
    );

    res.json(result.rows.map(g => ({
      ...g,
      member_count: parseInt(g.member_count) || 0,
    })));
  } catch (error) {
    console.error('List groups error:', error);
    res.status(500).json({ error: 'Failed to list groups' });
  }
});

// POST /api/groups - Create a new group
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const parsed = createGroupSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.errors.map(e => ({ field: e.path[0], message: e.message }))
      });
    }

    const { name, description, color } = parsed.data;

    // Check for duplicate name
    const existing = await query(
      'SELECT id FROM player_groups WHERE admin_id = $1 AND LOWER(name) = LOWER($2)',
      [admin.id, name]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'A group with this name already exists' });
    }

    const result = await query<PlayerGroup>(
      `INSERT INTO player_groups (admin_id, name, description, color)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [admin.id, name, description || null, color || '#4ADE80']
    );

    res.status(201).json({ ...result.rows[0], member_count: 0 });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// GET /api/groups/:id - Get group details with members
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const groupId = req.params.id;

    // Get group
    const groupResult = await query<PlayerGroup>(
      `SELECT * FROM player_groups WHERE id = $1 AND admin_id = $2`,
      [groupId, admin.id]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Get members
    const membersResult = await query<GroupMember>(
      `SELECT p.id as player_id, p.name as player_name, p.phone as player_phone, p.email as player_email, pgm.added_at
       FROM player_group_members pgm
       JOIN players p ON pgm.player_id = p.id
       WHERE pgm.group_id = $1
       ORDER BY p.name ASC`,
      [groupId]
    );

    res.json({
      ...groupResult.rows[0],
      member_count: membersResult.rows.length,
      members: membersResult.rows,
    });
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Failed to get group' });
  }
});

// PATCH /api/groups/:id - Update group
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const groupId = req.params.id;
    const parsed = updateGroupSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.errors.map(e => ({ field: e.path[0], message: e.message }))
      });
    }

    // Check group exists and belongs to admin
    const existing = await query(
      'SELECT id FROM player_groups WHERE id = $1 AND admin_id = $2',
      [groupId, admin.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const { name, description, color } = parsed.data;
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      // Check for duplicate name (excluding current group)
      const duplicate = await query(
        'SELECT id FROM player_groups WHERE admin_id = $1 AND LOWER(name) = LOWER($2) AND id != $3',
        [admin.id, name, groupId]
      );
      if (duplicate.rows.length > 0) {
        return res.status(400).json({ error: 'A group with this name already exists' });
      }
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }

    if (color !== undefined) {
      updates.push(`color = $${paramIndex++}`);
      values.push(color);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(groupId);

    const result = await query<PlayerGroup>(
      `UPDATE player_groups SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// DELETE /api/groups/:id - Delete group
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const groupId = req.params.id;

    const result = await query(
      'DELETE FROM player_groups WHERE id = $1 AND admin_id = $2 RETURNING id',
      [groupId, admin.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json({ message: 'Group deleted' });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// POST /api/groups/:id/members - Add members to group
router.post('/:id/members', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const groupId = req.params.id;
    const parsed = addMembersSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.errors.map(e => ({ field: e.path[0], message: e.message }))
      });
    }

    // Check group exists and belongs to admin
    const groupCheck = await query(
      'SELECT id FROM player_groups WHERE id = $1 AND admin_id = $2',
      [groupId, admin.id]
    );

    if (groupCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const { player_ids } = parsed.data;

    // Add members (ignore duplicates)
    let added = 0;
    for (const playerId of player_ids) {
      try {
        await query(
          `INSERT INTO player_group_members (group_id, player_id)
           VALUES ($1, $2)
           ON CONFLICT (group_id, player_id) DO NOTHING`,
          [groupId, playerId]
        );
        added++;
      } catch (e) {
        // Ignore invalid player IDs
      }
    }

    res.json({ message: `Added ${added} member(s)`, added });
  } catch (error) {
    console.error('Add members error:', error);
    res.status(500).json({ error: 'Failed to add members' });
  }
});

// DELETE /api/groups/:id/members - Remove members from group
router.delete('/:id/members', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const groupId = req.params.id;
    const parsed = removeMembersSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.errors.map(e => ({ field: e.path[0], message: e.message }))
      });
    }

    // Check group exists and belongs to admin
    const groupCheck = await query(
      'SELECT id FROM player_groups WHERE id = $1 AND admin_id = $2',
      [groupId, admin.id]
    );

    if (groupCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const { player_ids } = parsed.data;

    const result = await query(
      `DELETE FROM player_group_members
       WHERE group_id = $1 AND player_id = ANY($2::uuid[])`,
      [groupId, player_ids]
    );

    res.json({ message: `Removed ${result.rowCount} member(s)`, removed: result.rowCount });
  } catch (error) {
    console.error('Remove members error:', error);
    res.status(500).json({ error: 'Failed to remove members' });
  }
});

// GET /api/groups/players/available - Get all players not in any group (or available to add)
router.get('/players/available', async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.query.exclude_group as string | undefined;

    let result;
    if (groupId) {
      // Get players not in this specific group
      result = await query<Player>(
        `SELECT p.* FROM players p
         WHERE p.id NOT IN (
           SELECT player_id FROM player_group_members WHERE group_id = $1
         )
         ORDER BY p.name ASC`,
        [groupId]
      );
    } else {
      // Get all players
      result = await query<Player>(
        'SELECT * FROM players ORDER BY name ASC'
      );
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Get available players error:', error);
    res.status(500).json({ error: 'Failed to get players' });
  }
});

export default router;
