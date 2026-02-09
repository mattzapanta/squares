import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query, withTransaction } from '../db/index.js';
import { validate, schemas } from '../middleware/validation.js';
import { generateToken, authenticateAdmin, AuthRequest } from '../middleware/auth.js';
import { Admin, Player } from '../types/index.js';
import { config } from '../config.js';

const router = Router();

// Check if site password is required
router.get('/site-status', (req, res) => {
  res.json({
    passwordRequired: !!config.sitePassword,
  });
});

// Verify site password
router.post('/verify-site-password', (req, res) => {
  const { password } = req.body;

  if (!config.sitePassword) {
    // No site password configured, allow access
    return res.json({ valid: true });
  }

  if (password === config.sitePassword) {
    // Generate a simple token for the session (just a hash of the password + timestamp)
    const sessionToken = crypto
      .createHash('sha256')
      .update(config.sitePassword + Date.now().toString())
      .digest('hex');
    return res.json({ valid: true, sessionToken });
  }

  return res.status(401).json({ valid: false, error: 'Invalid password' });
});

// Register admin
router.post('/register', validate(schemas.register), async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    // Check if email exists
    const existing = await query('SELECT id FROM admins WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const result = await withTransaction(async (client) => {
      const passwordHash = await bcrypt.hash(password, 10);

      // Create a player record for the admin so they can play in their own pools
      const authToken = crypto.randomBytes(32).toString('hex');
      const playerResult = await client.query<Player>(
        `INSERT INTO players (name, phone, email, auth_token)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [name, phone, email, authToken]
      );
      const player = playerResult.rows[0];

      // Create admin linked to player
      const adminResult = await client.query<Admin>(
        `INSERT INTO admins (email, password_hash, name, phone, player_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, name, phone, player_id, created_at`,
        [email, passwordHash, name, phone, player.id]
      );

      return { admin: adminResult.rows[0], player };
    });

    const token = generateToken(result.admin as Admin);

    res.status(201).json({ admin: result.admin, token });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', validate(schemas.login), async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await query<Admin>(
      'SELECT * FROM admins WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = result.rows[0];
    const valid = await bcrypt.compare(password, admin.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(admin);

    res.json({
      admin: { id: admin.id, email: admin.email, name: admin.name, phone: (admin as any).phone, player_id: (admin as any).player_id },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current admin
router.get('/me', authenticateAdmin, (req: AuthRequest, res) => {
  const admin = req.admin! as any;
  res.json({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    phone: admin.phone,
    player_id: admin.player_id,
    created_at: admin.created_at,
  });
});

export default router;
