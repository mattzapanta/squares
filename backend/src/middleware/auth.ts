import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/index.js';
import { Admin, Player } from '../types/index.js';

export interface AuthRequest extends Request {
  admin?: Admin;
  player?: Player;
}

export interface JWTPayload {
  id: string;
  email: string;
  type: 'admin';
}

export function authenticateAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret) as JWTPayload;

    if (payload.type !== 'admin') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    // Get admin from database
    query<Admin>('SELECT * FROM admins WHERE id = $1', [payload.id])
      .then(result => {
        if (result.rows.length === 0) {
          return res.status(401).json({ error: 'Admin not found' });
        }
        req.admin = result.rows[0];
        next();
      })
      .catch(error => {
        console.error('Auth error:', error);
        return res.status(500).json({ error: 'Authentication failed' });
      });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export async function authenticatePlayer(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.params.token || req.query.token;

  if (!token || typeof token !== 'string') {
    return res.status(401).json({ error: 'No player token provided' });
  }

  try {
    const result = await query<Player>(
      'SELECT * FROM players WHERE auth_token = $1 AND banned = false',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or banned player token' });
    }

    req.player = result.rows[0];
    next();
  } catch (error) {
    console.error('Player auth error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

export function generateToken(admin: Admin): string {
  const payload: JWTPayload = {
    id: admin.id,
    email: admin.email,
    type: 'admin',
  };

  const options: SignOptions = { expiresIn: config.jwt.expiresIn };
  return jwt.sign(payload, config.jwt.secret, options);
}
