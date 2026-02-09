import { Pool, PoolDetail, Player, Admin } from '../types';

const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

// Auth
export const auth = {
  register: (email: string, password: string, name: string, phone: string) =>
    request<{ admin: Admin; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, phone }),
    }),

  login: (email: string, password: string) =>
    request<{ admin: Admin; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<Admin>('/auth/me'),
};

// Pools
export const pools = {
  list: () => request<Pool[]>('/pools'),

  get: (id: string) => request<PoolDetail>(`/pools/${id}`),

  create: (data: {
    name: string;
    sport: string;
    away_team: string;
    home_team: string;
    denomination: number;
    game_date?: string;
    game_time?: string;
    game_label?: string;
    payout_structure?: string;
    tip_pct?: number;
    max_per_player?: number;
    ot_rule?: string;
  }) =>
    request<Pool>('/pools', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<Pool>) =>
    request<Pool>(`/pools/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  lock: (id: string) =>
    request<Pool>(`/pools/${id}/lock`, { method: 'POST' }),

  unlock: (id: string) =>
    request<Pool>(`/pools/${id}/unlock`, { method: 'POST' }),

  delete: (id: string) =>
    request<{ message: string }>(`/pools/${id}`, { method: 'DELETE' }),
};

// Squares
export const squares = {
  claim: (poolId: string, row: number, col: number, playerId: string) =>
    request<{ message: string }>(`/pools/${poolId}/squares/claim`, {
      method: 'POST',
      body: JSON.stringify({ row, col, player_id: playerId }),
    }),

  release: (poolId: string, row: number, col: number) =>
    request<{ message: string }>(`/pools/${poolId}/squares/release`, {
      method: 'POST',
      body: JSON.stringify({ row, col }),
    }),

  assign: (poolId: string, row: number, col: number, playerId: string) =>
    request<{ message: string }>(`/pools/${poolId}/squares/assign`, {
      method: 'POST',
      body: JSON.stringify({ row, col, player_id: playerId }),
    }),
};

// Players
export const players = {
  list: (poolId: string) => request<Player[]>(`/pools/${poolId}/players`),

  add: (poolId: string, name: string, phone?: string, email?: string) =>
    request<Player>(`/pools/${poolId}/players`, {
      method: 'POST',
      body: JSON.stringify({ name, phone, email }),
    }),

  bulkAdd: (poolId: string, playerList: { name: string; phone?: string; email?: string }[]) =>
    request<{ success: Player[]; failed: { player: typeof playerList[0]; error: string }[] }>(
      `/pools/${poolId}/players/bulk`,
      {
        method: 'POST',
        body: JSON.stringify({ players: playerList }),
      }
    ),

  updatePayment: (poolId: string, playerId: string, paid: boolean) =>
    request(`/pools/${poolId}/players/${playerId}`, {
      method: 'PATCH',
      body: JSON.stringify({ paid, payment_status: paid ? 'confirmed' : 'pending' }),
    }),

  markDeadbeat: (poolId: string, playerId: string) =>
    request(`/pools/${poolId}/players/${playerId}/deadbeat`, { method: 'POST' }),

  reinstate: (poolId: string, playerId: string) =>
    request(`/pools/${poolId}/players/${playerId}/reinstate`, { method: 'POST' }),

  remove: (poolId: string, playerId: string) =>
    request(`/pools/${poolId}/players/${playerId}`, { method: 'DELETE' }),
};

// Scores
export const scores = {
  get: (poolId: string) =>
    request<{ scores: import('../types').Score[]; winners: import('../types').Winner[] }>(
      `/pools/${poolId}/scores`
    ),

  enter: (
    poolId: string,
    periodKey: string,
    periodLabel: string,
    awayScore: number,
    homeScore: number,
    payoutPct: number
  ) =>
    request(`/pools/${poolId}/scores`, {
      method: 'POST',
      body: JSON.stringify({
        period_key: periodKey,
        period_label: periodLabel,
        away_score: awayScore,
        home_score: homeScore,
        payout_pct: payoutPct,
      }),
    }),
};
