// ESPN API Integration for real sports data
// Uses ESPN's public endpoints (unofficial but stable)

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

interface ESPNGame {
  id: string;
  date: string;
  name: string;
  shortName: string;
  status: {
    type: {
      name: string;  // STATUS_SCHEDULED, STATUS_IN_PROGRESS, STATUS_FINAL
      state: string; // pre, in, post
      completed: boolean;
      description: string;
    };
    displayClock?: string;
    period?: number;
  };
  competitions: {
    id: string;
    date: string;
    venue?: { fullName: string };
    competitors: {
      id: string;
      homeAway: 'home' | 'away';
      team: {
        id: string;
        abbreviation: string;
        displayName: string;
        shortDisplayName: string;
        logo?: string;
      };
      score?: string;
    }[];
  }[];
}

interface ESPNResponse {
  events: ESPNGame[];
}

// ESPN sport slugs
const ESPN_SPORTS: Record<string, { league: string; sport: string }> = {
  nfl: { sport: 'football', league: 'nfl' },
  nba: { sport: 'basketball', league: 'nba' },
  nhl: { sport: 'hockey', league: 'nhl' },
  mlb: { sport: 'baseball', league: 'mlb' },
  ncaaf: { sport: 'football', league: 'college-football' },
  ncaab: { sport: 'basketball', league: 'mens-college-basketball' },
  soccer: { sport: 'soccer', league: 'eng.1' }, // Premier League
  mls: { sport: 'soccer', league: 'usa.1' }, // MLS
};

async function fetchESPN(sport: string, league: string, date?: string): Promise<ESPNGame[]> {
  try {
    let url = `${ESPN_BASE}/${sport}/${league}/scoreboard`;
    if (date) {
      // ESPN expects dates in YYYYMMDD format
      const formattedDate = date.replace(/-/g, '');
      url += `?dates=${formattedDate}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`ESPN API error: ${response.status}`);
      return [];
    }

    const data = await response.json() as ESPNResponse;
    return data.events || [];
  } catch (error) {
    console.error(`Failed to fetch ESPN ${sport}/${league}:`, error);
    return [];
  }
}

function parseESPNGame(game: ESPNGame, sportKey: string): any {
  const competition = game.competitions[0];
  if (!competition) return null;

  const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
  const awayTeam = competition.competitors.find(c => c.homeAway === 'away');

  if (!homeTeam || !awayTeam) return null;

  // Parse date/time
  const gameDate = new Date(game.date);
  const dateStr = gameDate.toISOString().split('T')[0];
  const timeStr = gameDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York'
  });

  // Determine game status
  let status = 'scheduled';
  if (game.status.type.state === 'in') {
    status = 'in_progress';
  } else if (game.status.type.state === 'post' || game.status.type.completed) {
    status = 'final';
  }

  return {
    id: `${sportKey}-${game.id}`,
    external_id: game.id,
    sport: sportKey,
    away: awayTeam.team.abbreviation,
    home: homeTeam.team.abbreviation,
    away_full: awayTeam.team.displayName,
    home_full: homeTeam.team.displayName,
    date: dateStr,
    time: timeStr,
    status,
    status_detail: game.status.type.description,
    away_score: awayTeam.score ? parseInt(awayTeam.score) : null,
    home_score: homeTeam.score ? parseInt(homeTeam.score) : null,
    venue: competition.venue?.fullName,
    clock: game.status.displayClock,
    period: game.status.period,
    away_logo: awayTeam.team.logo,
    home_logo: homeTeam.team.logo,
  };
}

// Get games for any sport
export async function getGames(sport: string, date?: string): Promise<any[]> {
  const espnConfig = ESPN_SPORTS[sport];

  if (!espnConfig) {
    console.log(`Sport '${sport}' not configured for ESPN API`);
    return [];
  }

  const games = await fetchESPN(espnConfig.sport, espnConfig.league, date);

  return games
    .map(g => parseESPNGame(g, sport))
    .filter(Boolean)
    .sort((a, b) => new Date(a.date + ' ' + a.time).getTime() - new Date(b.date + ' ' + b.time).getTime());
}

// Get live scores for a specific game
export async function getGameScores(sport: string, gameId: string): Promise<any | null> {
  const espnConfig = ESPN_SPORTS[sport];

  if (!espnConfig) {
    return null;
  }

  // Extract the ESPN ID from our composite ID
  const espnId = gameId.replace(`${sport}-`, '');

  try {
    const url = `${ESPN_BASE}/${espnConfig.sport}/${espnConfig.league}/summary?event=${espnId}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`ESPN API error: ${response.status}`);
      return null;
    }

    const data = await response.json() as any;
    const competition = data.header?.competitions?.[0];

    if (!competition) return null;

    const homeTeam = competition.competitors.find((c: any) => c.homeAway === 'home');
    const awayTeam = competition.competitors.find((c: any) => c.homeAway === 'away');

    if (!homeTeam || !awayTeam) return null;

    // Get period scores if available
    const linescores = data.boxscore?.teams;
    let periodScores: { period: string; away: number; home: number }[] = [];

    if (linescores) {
      const homeLinescores = linescores.find((t: any) => t.homeAway === 'home')?.statistics;
      const awayLinescores = linescores.find((t: any) => t.homeAway === 'away')?.statistics;

      // ESPN format varies by sport - this is a simplified version
      // Period scores would need sport-specific parsing
    }

    return {
      id: gameId,
      sport,
      away: awayTeam.team.abbreviation,
      home: homeTeam.team.abbreviation,
      away_full: awayTeam.team.displayName,
      home_full: homeTeam.team.displayName,
      away_score: awayTeam.score ? parseInt(awayTeam.score) : 0,
      home_score: homeTeam.score ? parseInt(homeTeam.score) : 0,
      status: competition.status?.type?.state === 'post' ? 'final' :
              competition.status?.type?.state === 'in' ? 'in_progress' : 'scheduled',
      status_detail: competition.status?.type?.description,
      clock: competition.status?.displayClock,
      period: competition.status?.period,
    };
  } catch (error) {
    console.error('Failed to fetch game scores:', error);
    return null;
  }
}

// Get available sports
export function getAvailableSports(): { key: string; name: string; icon: string }[] {
  return [
    { key: 'nfl', name: 'NFL', icon: '🏈' },
    { key: 'nba', name: 'NBA', icon: '🏀' },
    { key: 'nhl', name: 'NHL', icon: '🏒' },
    { key: 'mlb', name: 'MLB', icon: '⚾' },
    { key: 'ncaaf', name: 'NCAAF', icon: '🏈' },
    { key: 'ncaab', name: 'NCAAB', icon: '🏀' },
    { key: 'soccer', name: 'Premier League', icon: '⚽' },
    { key: 'mls', name: 'MLS', icon: '⚽' },
  ];
}

// For backwards compatibility - get games (renamed from getGames)
export async function getNBAGames(date?: string): Promise<any[]> {
  return getGames('nba', date);
}
