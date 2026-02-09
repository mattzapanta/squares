import { Router } from 'express';
import { authenticateAdmin, AuthRequest } from '../middleware/auth.js';
import { getGames, getGameScores } from '../services/sportsApiService.js';

const router = Router();

router.use(authenticateAdmin);

// Get games for a sport
router.get('/:sport', async (req: AuthRequest, res) => {
  try {
    const { sport } = req.params;
    const { date } = req.query;

    const validSports = ['nfl', 'nba', 'nhl', 'mlb', 'ncaaf', 'ncaab', 'soccer'];
    if (!validSports.includes(sport)) {
      return res.status(400).json({ error: 'Invalid sport' });
    }

    const games = await getGames(sport, date as string);
    res.json(games);
  } catch (error) {
    console.error('Get games error:', error);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

// Get scores for a specific game
router.get('/:sport/:gameId/scores', async (req: AuthRequest, res) => {
  try {
    const { sport, gameId } = req.params;

    const scores = await getGameScores(sport, gameId);

    if (!scores) {
      return res.status(404).json({ error: 'Scores not available - use manual entry' });
    }

    res.json(scores);
  } catch (error) {
    console.error('Get scores error:', error);
    res.status(500).json({ error: 'Failed to fetch scores' });
  }
});

export default router;
