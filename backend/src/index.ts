import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { checkConnection, pool } from './db/index.js';

// Routes
import authRoutes from './routes/auth.js';
import poolsRoutes from './routes/pools.js';
import squaresRoutes from './routes/squares.js';
import playersRoutes from './routes/players.js';
import scoresRoutes from './routes/scores.js';
import playerPortalRoutes from './routes/playerPortal.js';
import gamesRoutes from './routes/games.js';
import paymentsRoutes from './routes/payments.js';
import groupsRoutes from './routes/groups.js';
import allPlayersRoutes from './routes/allPlayers.js';

const app = express();

// Middleware - CORS for both local dev and production
const allowedOrigins = [
  config.frontendUrl,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // In production, be strict. In dev, allow any localhost
      if (process.env.NODE_ENV !== 'production' && origin.includes('localhost')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
}));
app.use(express.json());

// Health check with detailed error reporting
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    res.json({
      status: 'db_error',
      timestamp: new Date().toISOString(),
      error: err.message,
      code: err.code,
      dbUrlPrefix: config.database.url?.substring(0, 40),
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/pools', poolsRoutes);
app.use('/api/pools/:id/squares', squaresRoutes);
app.use('/api/pools/:id/players', playersRoutes);
app.use('/api/pools/:id/scores', scoresRoutes);
app.use('/api/p', playerPortalRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/players', allPlayersRoutes);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(config.port, () => {
  console.log(`🎲 SquaresHQ API running on port ${config.port}`);
  console.log(`   Health: http://localhost:${config.port}/health`);
});
