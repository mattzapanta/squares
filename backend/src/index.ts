import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { checkConnection } from './db/index.js';

// Routes
import authRoutes from './routes/auth.js';
import poolsRoutes from './routes/pools.js';
import squaresRoutes from './routes/squares.js';
import playersRoutes from './routes/players.js';
import scoresRoutes from './routes/scores.js';
import playerPortalRoutes from './routes/playerPortal.js';
import gamesRoutes from './routes/games.js';

const app = express();

// Middleware
app.use(cors({ origin: config.frontendUrl }));
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  const dbOk = await checkConnection();
  res.json({ status: dbOk ? 'ok' : 'db_error', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/pools', poolsRoutes);
app.use('/api/pools/:id/squares', squaresRoutes);
app.use('/api/pools/:id/players', playersRoutes);
app.use('/api/pools/:id/scores', scoresRoutes);
app.use('/api/p', playerPortalRoutes);
app.use('/api/games', gamesRoutes);

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
