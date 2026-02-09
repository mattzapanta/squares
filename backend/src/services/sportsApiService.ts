import { config } from '../config.js';

const BALLDONTLIE_BASE = 'https://api.balldontlie.io/v1';

interface BDLGame {
  id: number;
  date: string;
  time: string;
  status: string;
  home_team: { abbreviation: string; full_name: string };
  visitor_team: { abbreviation: string; full_name: string };
  home_team_score: number;
  visitor_team_score: number;
}

interface BDLResponse<T> {
  data: T[];
  meta?: { next_cursor?: number };
}

async function bdlFetch<T>(endpoint: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.ballDontLie.apiKey) {
    headers['Authorization'] = config.ballDontLie.apiKey;
  }

  const response = await fetch(`${BALLDONTLIE_BASE}${endpoint}`, { headers });

  if (!response.ok) {
    throw new Error(`BallDontLie API error: ${response.status}`);
  }

  return response.json();
}

// Get upcoming NBA games
export async function getNBAGames(date?: string): Promise<any[]> {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const response = await bdlFetch<BDLResponse<BDLGame>>(`/games?dates[]=${targetDate}`);

    return response.data.map(game => ({
      id: `nba-${game.id}`,
      external_id: game.id.toString(),
      sport: 'nba',
      away: game.visitor_team.abbreviation,
      home: game.home_team.abbreviation,
      away_full: game.visitor_team.full_name,
      home_full: game.home_team.full_name,
      date: game.date,
      time: game.time || 'TBD',
      status: game.status,
      away_score: game.visitor_team_score,
      home_score: game.home_team_score,
    }));
  } catch (error) {
    console.error('Failed to fetch NBA games:', error);
    return [];
  }
}

// For other sports, we'll use mock data since BallDontLie is NBA-focused
// In production, you'd integrate ESPN API, SportsRadar, or similar

const MOCK_GAMES: Record<string, any[]> = {
  nfl: [
    { id: 'nfl-1', away: 'KC', home: 'SF', away_full: 'Kansas City Chiefs', home_full: 'San Francisco 49ers', date: '2026-02-09', time: '6:30 PM', label: 'Super Bowl LX' },
    { id: 'nfl-2', away: 'DAL', home: 'PHI', away_full: 'Dallas Cowboys', home_full: 'Philadelphia Eagles', date: '2026-02-09', time: '4:25 PM', label: 'Week 18' },
    { id: 'nfl-3', away: 'BUF', home: 'MIA', away_full: 'Buffalo Bills', home_full: 'Miami Dolphins', date: '2026-02-09', time: '1:00 PM', label: 'Week 18' },
    { id: 'nfl-4', away: 'DET', home: 'GB', away_full: 'Detroit Lions', home_full: 'Green Bay Packers', date: '2026-02-09', time: '8:20 PM', label: 'Week 18' },
  ],
  nhl: [
    { id: 'nhl-1', away: 'EDM', home: 'VGK', away_full: 'Edmonton Oilers', home_full: 'Vegas Golden Knights', date: '2026-02-09', time: '10:00 PM' },
    { id: 'nhl-2', away: 'TOR', home: 'MTL', away_full: 'Toronto Maple Leafs', home_full: 'Montreal Canadiens', date: '2026-02-10', time: '7:00 PM' },
    { id: 'nhl-3', away: 'BOS', home: 'NYR', away_full: 'Boston Bruins', home_full: 'New York Rangers', date: '2026-02-10', time: '7:30 PM' },
  ],
  mlb: [
    { id: 'mlb-1', away: 'NYY', home: 'BOS', away_full: 'New York Yankees', home_full: 'Boston Red Sox', date: '2026-04-01', time: '1:05 PM' },
    { id: 'mlb-2', away: 'LAD', home: 'SF', away_full: 'Los Angeles Dodgers', home_full: 'San Francisco Giants', date: '2026-04-01', time: '4:15 PM' },
  ],
  ncaaf: [
    { id: 'ncaaf-1', away: 'BAMA', home: 'UGA', away_full: 'Alabama', home_full: 'Georgia', date: '2026-09-05', time: '3:30 PM', label: 'SEC Opener' },
    { id: 'ncaaf-2', away: 'OSU', home: 'MICH', away_full: 'Ohio State', home_full: 'Michigan', date: '2026-11-28', time: '12:00 PM', label: 'The Game' },
  ],
  ncaab: [
    { id: 'ncaab-1', away: 'DUKE', home: 'UNC', away_full: 'Duke', home_full: 'North Carolina', date: '2026-02-12', time: '9:00 PM' },
    { id: 'ncaab-2', away: 'UK', home: 'KU', away_full: 'Kentucky', home_full: 'Kansas', date: '2026-02-15', time: '6:00 PM' },
  ],
  soccer: [
    { id: 'soc-1', away: 'ARS', home: 'MCI', away_full: 'Arsenal', home_full: 'Manchester City', date: '2026-02-15', time: '12:30 PM', label: 'Premier League' },
    { id: 'soc-2', away: 'RMA', home: 'BAR', away_full: 'Real Madrid', home_full: 'Barcelona', date: '2026-02-20', time: '3:00 PM', label: 'El Clasico' },
  ],
};

export async function getGames(sport: string, date?: string): Promise<any[]> {
  // Use BallDontLie for NBA
  if (sport === 'nba') {
    const games = await getNBAGames(date);
    if (games.length > 0) return games;
  }

  // Return mock data for other sports (or NBA fallback)
  const games = MOCK_GAMES[sport] || [];
  return games.map(g => ({ ...g, sport }));
}

export async function getGameScores(sport: string, gameId: string): Promise<any | null> {
  // For NBA, try to get live scores
  if (sport === 'nba' && gameId.startsWith('nba-')) {
    try {
      const externalId = gameId.replace('nba-', '');
      const response = await bdlFetch<{ data: BDLGame }>(`/games/${externalId}`);
      const game = response.data;

      return {
        id: gameId,
        away: game.visitor_team.abbreviation,
        home: game.home_team.abbreviation,
        away_score: game.visitor_team_score,
        home_score: game.home_team_score,
        status: game.status,
      };
    } catch (error) {
      console.error('Failed to fetch game scores:', error);
    }
  }

  // For other sports, return null (manual entry required)
  return null;
}
