import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';

// Validation middleware factory
export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      return res.status(400).json({ error: 'Invalid request body' });
    }
  };
}

// Common validation schemas
export const schemas = {
  // Auth
  register: z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(5, 'Password must be at least 5 characters'),
    name: z.string().min(1, 'Name is required').max(100),
    phone: z.string().min(1, 'Phone is required').max(20),
  }),

  login: z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(1, 'Password is required'),
  }),

  // Pools
  createPool: z.object({
    name: z.string().min(1).max(200),
    sport: z.enum(['nfl', 'nba', 'nhl', 'mlb', 'ncaaf', 'ncaab', 'soccer', 'custom']),
    away_team: z.string().min(1).max(50),
    home_team: z.string().min(1).max(50),
    game_date: z.string().optional(),
    game_time: z.string().optional(),
    game_label: z.string().max(50).optional(),
    denomination: z.number().int().positive().refine(
      v => [1, 5, 10, 25, 50, 100].includes(v),
      'Denomination must be 1, 5, 10, 25, 50, or 100'
    ),
    payout_structure: z.enum(['standard', 'heavy_final', 'halftime_final', 'reverse', 'custom']).default('standard'),
    custom_payouts: z.record(z.string(), z.number().min(0).max(100)).optional(),
    tip_pct: z.number().int().min(0).max(100).default(10),
    max_per_player: z.number().int().min(1).max(100).default(10),
    approval_threshold: z.number().int().min(1).max(100).default(100), // 100 = effectively disabled
    ot_rule: z.enum(['include_final', 'separate', 'none']).default('include_final'),
    external_game_id: z.string().optional(),
  }).refine(
    data => {
      // If custom payout structure, validate custom_payouts adds up to 100
      if (data.payout_structure === 'custom') {
        if (!data.custom_payouts) return false;
        const total = Object.values(data.custom_payouts).reduce((sum, pct) => sum + pct, 0);
        return Math.abs(total - 100) < 0.01;
      }
      return true;
    },
    { message: 'Custom payouts must add up to 100%' }
  ),

  updatePool: z.object({
    name: z.string().min(1).max(200).optional(),
    game_date: z.string().optional(),
    game_time: z.string().optional(),
    game_label: z.string().max(50).optional(),
    denomination: z.number().int().positive().refine(
      v => [1, 5, 10, 25, 50, 100].includes(v),
      'Denomination must be 1, 5, 10, 25, 50, or 100'
    ).optional(),
    payout_structure: z.enum(['standard', 'heavy_final', 'halftime_final', 'reverse', 'custom']).optional(),
    custom_payouts: z.record(z.string(), z.number().min(0).max(100)).optional(),
    tip_pct: z.number().int().min(0).max(100).optional(),
    max_per_player: z.number().int().min(1).max(100).optional(),
    approval_threshold: z.number().int().min(1).max(100).optional(),
    ot_rule: z.enum(['include_final', 'separate', 'none']).optional(),
  }).refine(
    data => {
      // If custom payout structure, validate custom_payouts adds up to 100
      if (data.payout_structure === 'custom') {
        if (!data.custom_payouts) return false;
        const total = Object.values(data.custom_payouts).reduce((sum, pct) => sum + pct, 0);
        return Math.abs(total - 100) < 0.01;
      }
      return true;
    },
    { message: 'Custom payouts must add up to 100%' }
  ),

  // Squares
  claimSquare: z.object({
    row: z.number().int().min(0).max(9),
    col: z.number().int().min(0).max(9),
    player_id: z.string().uuid().optional(),
  }),

  releaseSquare: z.object({
    row: z.number().int().min(0).max(9),
    col: z.number().int().min(0).max(9),
  }),

  assignSquare: z.object({
    row: z.number().int().min(0).max(9),
    col: z.number().int().min(0).max(9),
    player_id: z.string().uuid(),
  }),

  swapSquares: z.object({
    square1: z.object({
      row: z.number().int().min(0).max(9),
      col: z.number().int().min(0).max(9),
    }),
    square2: z.object({
      row: z.number().int().min(0).max(9),
      col: z.number().int().min(0).max(9),
    }),
  }),

  // Players
  addPlayer: z.object({
    name: z.string().min(1).max(100),
    phone: z.string().max(20).optional(),
    email: z.string().email().optional(),
  }).refine(
    data => data.phone || data.email,
    'Either phone or email is required'
  ),

  bulkAddPlayers: z.object({
    players: z.array(z.object({
      name: z.string().min(1).max(100),
      phone: z.string().max(20).optional(),
      email: z.string().email().optional(),
    })).min(1).max(100),
  }),

  updatePaymentStatus: z.object({
    paid: z.boolean().optional(),
    payment_status: z.enum(['pending', 'confirmed', 'deadbeat']).optional(),
  }),

  // Scores
  enterScore: z.object({
    period_key: z.string().min(1).max(10),
    period_label: z.string().min(1).max(20),
    away_score: z.number().int().min(0),
    home_score: z.number().int().min(0),
    payout_pct: z.number().int().min(0).max(100),
  }),

  // Notifications
  sendNotification: z.object({
    player_ids: z.array(z.string().uuid()).optional(),
    message: z.string().optional(),
  }),

  // UUID param validation
  uuidParam: z.object({
    id: z.string().uuid(),
  }),

  playerIdParam: z.object({
    playerId: z.string().uuid(),
  }),
};

// Param validation helper
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Invalid parameters',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      return res.status(400).json({ error: 'Invalid parameters' });
    }
  };
}
