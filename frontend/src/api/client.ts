import { Pool, PoolDetail, Player, Admin, PendingSquareRequest } from '../types';

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
    custom_payouts?: Record<string, number>;
    tip_pct?: number;
    max_per_player?: number;
    approval_threshold?: number;
    ot_rule?: string;
    external_game_id?: string;
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

  // Notifications
  sendInvites: (poolId: string, playerIds?: string[]) =>
    request<{ message: string; sent: number; failed: number }>(`/pools/${poolId}/notify/invite`, {
      method: 'POST',
      body: JSON.stringify({ playerIds }),
    }),

  sendReminders: (poolId: string) =>
    request<{ message: string; sent: number; failed: number }>(`/pools/${poolId}/notify/reminder`, {
      method: 'POST',
    }),
};

// Squares
export const squares = {
  claim: (poolId: string, row: number, col: number, playerId: string) =>
    request<{ message: string; status?: string }>(`/pools/${poolId}/squares/claim`, {
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

  // Pending request management
  getPending: (poolId: string) =>
    request<PendingSquareRequest[]>(`/pools/${poolId}/squares/pending`),

  approve: (poolId: string, row: number, col: number) =>
    request<{ message: string }>(`/pools/${poolId}/squares/approve`, {
      method: 'POST',
      body: JSON.stringify({ row, col }),
    }),

  reject: (poolId: string, row: number, col: number) =>
    request<{ message: string }>(`/pools/${poolId}/squares/reject`, {
      method: 'POST',
      body: JSON.stringify({ row, col }),
    }),

  bulkApprove: (poolId: string, playerId: string) =>
    request<{ message: string; approved: number }>(`/pools/${poolId}/squares/bulk-approve/${playerId}`, {
      method: 'POST',
    }),

  bulkReject: (poolId: string, playerId: string) =>
    request<{ message: string; rejected: number }>(`/pools/${poolId}/squares/bulk-reject/${playerId}`, {
      method: 'POST',
    }),
};

// Player invite link type
export interface PlayerInviteLink {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  auth_token: string;
  paid: boolean;
  payment_status: string;
  square_count: number;
}

// Players
export const players = {
  list: (poolId: string) => request<Player[]>(`/pools/${poolId}/players`),

  getInviteLinks: (poolId: string) =>
    request<PlayerInviteLink[]>(`/pools/${poolId}/players/invite-links`),

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

  updatePayment: (poolId: string, playerId: string, paid: boolean, payment_status?: string, amount_paid?: number) =>
    request(`/pools/${poolId}/players/${playerId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        paid,
        payment_status: payment_status || (paid ? 'confirmed' : 'pending'),
        ...(amount_paid !== undefined && { amount_paid }),
      }),
    }),

  markDeadbeat: (poolId: string, playerId: string) =>
    request(`/pools/${poolId}/players/${playerId}/deadbeat`, { method: 'POST' }),

  reinstate: (poolId: string, playerId: string) =>
    request(`/pools/${poolId}/players/${playerId}/reinstate`, { method: 'POST' }),

  remove: (poolId: string, playerId: string) =>
    request(`/pools/${poolId}/players/${playerId}`, { method: 'DELETE' }),
};

// Scores
export interface LiveScoreData {
  status: string;
  statusDetail: string;
  awayScore: number;
  homeScore: number;
  clock?: string;
  period?: number;
}

export interface CurrentWinner {
  player_id: string;
  player_name: string;
  square_row: number;
  square_col: number;
  payout_amount: number;
}

export interface LiveScoreResponse {
  scores: import('../types').Score[];
  winners: import('../types').Winner[];
  liveScore: LiveScoreData | null;
  currentWinner: CurrentWinner | null;
}

export interface SyncScoreResponse {
  synced: boolean;
  gameStatus: string;
  statusDetail: string;
  awayScore: number;
  homeScore: number;
  clock?: string;
  period?: number;
  away: string;
  home: string;
}

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

  // Sync scores from ESPN
  sync: (poolId: string) =>
    request<SyncScoreResponse>(`/pools/${poolId}/scores/sync`, { method: 'POST' }),

  // Get live scores and current winner (for auto-polling)
  getLive: (poolId: string) =>
    request<LiveScoreResponse>(`/pools/${poolId}/scores/live`),
};

// Games (sports schedules)
export interface Game {
  id: string;
  sport: string;
  away: string;
  home: string;
  away_full?: string;
  home_full?: string;
  date: string;
  time: string;
  label?: string;
  status?: string;
}

export const games = {
  list: (sport: string, date?: string) =>
    request<Game[]>(`/games/${sport}${date ? `?date=${date}` : ''}`),

  getScores: (sport: string, gameId: string) =>
    request<{ away_score: number; home_score: number; status: string }>(`/games/${sport}/${gameId}/scores`),
};

// Payments
export interface SinglePoolPaymentResult {
  success: boolean;
  squaresAssigned: number;
  ledgerEntryId: string;
  totalOwed: number;
  totalPaid: number;
  remainingBalance: number;
}

export interface AutoDistributeResult {
  success: boolean;
  totalAmount: number;
  totalSquaresAssigned: number;
  remainingCredit: number;
  poolsUpdated: {
    poolId: string;
    poolName: string;
    denomination: number;
    squaresAssigned: number;
    amountUsed: number;
    existingSquares: number;
    newTotal: number;
  }[];
}

export interface PlayerPaymentSummary {
  player: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
  };
  pools: {
    poolId: string;
    poolName: string;
    squareCount: number;
    denomination: number;
    totalOwed: number;
    totalPaid: number;
    balance: number;
  }[];
  totals: {
    totalOwed: number;
    totalPaid: number;
    balance: number;
  };
}

export interface SearchedPlayer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  pool_count: number;
}

export interface PlayerWalletBalance {
  unassignedCredit: number;
  totalSpent: number;
  totalWon: number;
  netBalance: number;
}

export interface AddCreditResult {
  success: boolean;
  creditAdded: number;
  ledgerEntryId: string;
  totalBalance: number;
  playerName: string;
}

export const payments = {
  // Record payment for a single pool
  recordPoolPayment: (poolId: string, playerId: string, amount: number, autoAssign: boolean = true) =>
    request<SinglePoolPaymentResult>(`/payments/pools/${poolId}/payments`, {
      method: 'POST',
      body: JSON.stringify({ player_id: playerId, amount, auto_assign: autoAssign }),
    }),

  // Auto-distribute payment across all player's pools
  autoDistribute: (playerId: string, totalAmount: number, strategy: 'sequential' | 'even' = 'sequential') =>
    request<AutoDistributeResult>('/payments/auto', {
      method: 'POST',
      body: JSON.stringify({ player_id: playerId, amount: totalAmount, strategy }),
    }),

  // Get player's payment summary across all pools
  getPlayerSummary: (playerId: string) =>
    request<PlayerPaymentSummary>(`/payments/player/${playerId}`),

  // Search players by name, phone, or email
  searchPlayers: (query: string) =>
    request<SearchedPlayer[]>(`/payments/search-players?q=${encodeURIComponent(query)}`),

  // Add credit to player's wallet (not tied to any pool)
  addCredit: (playerId: string, amount: number, note?: string) =>
    request<AddCreditResult>('/payments/credit', {
      method: 'POST',
      body: JSON.stringify({ player_id: playerId, amount, note }),
    }),

  // Get player's wallet balance
  getPlayerBalance: (playerId: string) =>
    request<PlayerWalletBalance>(`/payments/player/${playerId}/balance`),

  // Apply player's existing credit to a specific pool
  applyCredit: (playerId: string, poolId: string, amount: number, autoAssign: boolean = true) =>
    request<SinglePoolPaymentResult & { creditUsed: number; remainingWalletBalance: number }>('/payments/apply-credit', {
      method: 'POST',
      body: JSON.stringify({ player_id: playerId, pool_id: poolId, amount, auto_assign: autoAssign }),
    }),

  // Combined payment: use existing credit + add new money
  combinedPayment: (playerId: string, poolId: string, useCredit: number, newAmount: number, autoAssign: boolean = true) =>
    request<SinglePoolPaymentResult & { creditUsed: number; newMoneyReceived: number; totalApplied: number }>('/payments/combined', {
      method: 'POST',
      body: JSON.stringify({ player_id: playerId, pool_id: poolId, use_credit: useCredit, new_amount: newAmount, auto_assign: autoAssign }),
    }),
};

// Player Groups
export interface PlayerGroup {
  id: string;
  admin_id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
  member_count: number;
}

export interface GroupMember {
  player_id: string;
  player_name: string;
  player_phone: string | null;
  player_email: string | null;
  added_at: string;
}

export interface GroupWithMembers extends PlayerGroup {
  members: GroupMember[];
}

export const groups = {
  // List all groups
  list: () => request<PlayerGroup[]>('/groups'),

  // Get group with members
  get: (id: string) => request<GroupWithMembers>(`/groups/${id}`),

  // Create group
  create: (name: string, description?: string, color?: string) =>
    request<PlayerGroup>('/groups', {
      method: 'POST',
      body: JSON.stringify({ name, description, color }),
    }),

  // Update group
  update: (id: string, data: { name?: string; description?: string; color?: string }) =>
    request<PlayerGroup>(`/groups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Delete group
  delete: (id: string) =>
    request<{ message: string }>(`/groups/${id}`, { method: 'DELETE' }),

  // Add members to group
  addMembers: (groupId: string, playerIds: string[]) =>
    request<{ message: string; added: number }>(`/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ player_ids: playerIds }),
    }),

  // Remove members from group
  removeMembers: (groupId: string, playerIds: string[]) =>
    request<{ message: string; removed: number }>(`/groups/${groupId}/members`, {
      method: 'DELETE',
      body: JSON.stringify({ player_ids: playerIds }),
    }),
};

// Global Players (not pool-specific)
export interface PlayerWithStats {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  auth_token: string;
  banned: boolean;
  sms_opted_out: boolean;
  created_at: string;
  pool_count: number;
  total_squares: number;
  total_owed: number;
  total_paid: number;
}

export interface PlayerDetail extends PlayerWithStats {
  pools: {
    id: string;
    name: string;
    sport: string;
    away_team: string;
    home_team: string;
    denomination: number;
    status: string;
    paid: boolean;
    payment_status: string;
    square_count: number;
  }[];
  groups: {
    id: string;
    name: string;
    color: string;
  }[];
}

export const allPlayers = {
  // List all players with optional search
  list: (search?: string) =>
    request<PlayerWithStats[]>(`/players${search ? `?q=${encodeURIComponent(search)}` : ''}`),

  // Get player details
  get: (id: string) => request<PlayerDetail>(`/players/${id}`),

  // Create new player (global, not tied to pool)
  create: (name: string, phone?: string, email?: string) =>
    request<Player>('/players', {
      method: 'POST',
      body: JSON.stringify({ name, phone, email }),
    }),

  // Update player
  update: (id: string, data: { name?: string; phone?: string | null; email?: string | null }) =>
    request<Player>(`/players/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Delete player
  delete: (id: string) =>
    request<{ message: string }>(`/players/${id}`, { method: 'DELETE' }),
};

// ================== Messaging System ==================

export interface MessageTemplate {
  id: string;
  admin_id: string | null;
  name: string;
  category: 'invite' | 'reminder' | 'notification' | 'custom';
  trigger_type: 'manual' | 'automatic';
  sms_template: string | null;
  email_subject: string | null;
  email_template: string | null;
  variables: string[];
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface MessageSend {
  id: string;
  admin_id: string;
  template_id: string | null;
  pool_id: string | null;
  group_id: string | null;
  message_type: string;
  channel: 'sms' | 'email' | 'both';
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  sms_content: string | null;
  email_subject: string | null;
  email_content: string | null;
  created_at: string;
  template_name?: string;
  pool_name?: string;
  group_name?: string;
}

export interface MessageRecipient {
  id: string;
  send_id: string;
  player_id: string;
  player_name: string;
  player_phone: string | null;
  player_email: string | null;
  channel: 'sms' | 'email';
  status: 'pending' | 'sent' | 'failed' | 'delivered';
  sent_at: string | null;
  error: string | null;
  created_at: string;
}

export interface SendMessageRequest {
  template_id?: string;
  sms_content?: string;
  email_subject?: string;
  email_content?: string;
  channel: 'sms' | 'email' | 'both';
  recipient_type: 'all' | 'pool' | 'group' | 'custom';
  pool_id?: string;
  group_id?: string;
  player_ids?: string[];
  filters?: {
    payment_status?: 'paid' | 'unpaid' | 'partial';
    has_squares?: boolean;
    has_phone?: boolean;
    has_email?: boolean;
  };
}

export interface SendResult {
  success: boolean;
  send_id?: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  errors?: string[];
}

export interface MessagePreview {
  sms: string;
  sms_character_count: number;
  sms_segments: number;
  email_subject: string;
  email_content: string;
  sample_player: { id: string; name: string } | null;
}

export interface DailyBudget {
  canSend: boolean;
  used: number;
  limit: number;
}

export const messages = {
  // Templates
  getTemplates: () => request<MessageTemplate[]>('/messages/templates'),

  getTemplate: (id: string) => request<MessageTemplate>(`/messages/templates/${id}`),

  createTemplate: (data: {
    name: string;
    category: 'invite' | 'reminder' | 'notification' | 'custom';
    trigger_type?: 'manual' | 'automatic';
    sms_template?: string;
    email_subject?: string;
    email_template?: string;
    variables?: string[];
  }) =>
    request<MessageTemplate>('/messages/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTemplate: (
    id: string,
    data: {
      name?: string;
      category?: 'invite' | 'reminder' | 'notification' | 'custom';
      sms_template?: string;
      email_subject?: string;
      email_template?: string;
      variables?: string[];
      is_active?: boolean;
    }
  ) =>
    request<MessageTemplate>(`/messages/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteTemplate: (id: string) =>
    request<{ message: string }>(`/messages/templates/${id}`, { method: 'DELETE' }),

  // Preview
  preview: (data: {
    template_id?: string;
    sms_content?: string;
    email_subject?: string;
    email_content?: string;
    player_id?: string;
    pool_id?: string;
  }) =>
    request<MessagePreview>('/messages/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Budget
  getBudget: () => request<DailyBudget>('/messages/budget'),

  // Send
  send: (data: SendMessageRequest) =>
    request<SendResult>('/messages/send', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // History
  getHistory: (options?: { pool_id?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (options?.pool_id) params.set('pool_id', options.pool_id);
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.offset) params.set('offset', options.offset.toString());
    const queryString = params.toString();
    return request<MessageSend[]>(`/messages/history${queryString ? `?${queryString}` : ''}`);
  },

  getSendDetails: (id: string) =>
    request<MessageSend & { recipients: MessageRecipient[] }>(`/messages/history/${id}`),

  retryFailed: (id: string) =>
    request<{ message: string; retried: number; succeeded: number; failed: number }>(
      `/messages/history/${id}/retry`,
      { method: 'POST' }
    ),

  // Quick pool actions
  quickInvite: (poolId: string, playerIds?: string[], groupId?: string) =>
    request<SendResult>(`/messages/pool/${poolId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ player_ids: playerIds, group_id: groupId }),
    }),

  quickReminder: (poolId: string) =>
    request<SendResult>(`/messages/pool/${poolId}/reminder`, {
      method: 'POST',
    }),
};
