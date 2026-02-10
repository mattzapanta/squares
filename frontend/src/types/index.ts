export type SportType = 'nfl' | 'nba' | 'nhl' | 'mlb' | 'ncaaf' | 'ncaab' | 'soccer' | 'custom';
export type PayoutStructure = 'standard' | 'heavy_final' | 'halftime_final' | 'reverse' | 'custom';
export type OTRule = 'include_final' | 'separate' | 'none';
export type PoolStatus = 'open' | 'locked' | 'in_progress' | 'final' | 'cancelled' | 'suspended';
export type PaymentStatus = 'pending' | 'confirmed' | 'deadbeat';
export type ClaimStatus = 'available' | 'pending' | 'claimed';

export interface Admin {
  id: string;
  email: string;
  name: string;
  phone: string;
  player_id: string;
  created_at: string;
}

export interface Player {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  auth_token?: string;
  banned: boolean;
  square_count?: number;
  pending_count?: number;
  paid?: boolean;
  payment_status?: PaymentStatus;
  amount_paid?: number;
}

export interface Pool {
  id: string;
  admin_id: string;
  name: string;
  sport: SportType;
  away_team: string;
  home_team: string;
  game_date: string | null;
  game_time: string | null;
  game_label: string | null;
  denomination: number;
  payout_structure: PayoutStructure;
  custom_payouts?: Record<string, number>;
  tip_pct: number;
  max_per_player: number;
  approval_threshold: number;
  ot_rule: OTRule;
  col_digits: number[] | null;
  row_digits: number[] | null;
  status: PoolStatus;
  locked_at: string | null;
  external_game_id: string | null;
  created_at: string;
  claimed_count?: number;
  player_count?: number;
  pending_count?: number;
  pending_squares_count?: number;
}

export interface GridCell {
  row_idx: number;
  col_idx: number;
  player_id: string | null;
  player_name?: string;
  paid?: boolean;
  payment_status?: PaymentStatus;
  claim_status?: ClaimStatus;
  requested_at?: string;
}

export interface PendingSquareRequest {
  row: number;
  col: number;
  player_id: string;
  player_name: string;
  requested_at: string;
}

export interface Score {
  id: string;
  pool_id: string;
  period_key: string;
  period_label: string;
  away_score: number | null;
  home_score: number | null;
  payout_pct: number;
}

export interface Winner {
  id: string;
  pool_id: string;
  period_key: string;
  player_id: string;
  player_name: string;
  square_row: number;
  square_col: number;
  payout_amount: number;
  tip_suggestion: number;
}

export interface PoolDetail extends Pool {
  grid: (GridCell | null)[][];
  players: Player[];
  scores: Score[];
  winners: Winner[];
  pendingRequests: PendingSquareRequest[];
}

export const SPORTS_CONFIG = {
  nfl: { name: 'NFL', icon: '🏈', color: '#4ADE80', periods: ['Q1', 'Q2', 'Q3', 'Q4'] },
  nba: { name: 'NBA', icon: '🏀', color: '#FB923C', periods: ['Q1', 'Q2', 'Q3', 'Q4'] },
  nhl: { name: 'NHL', icon: '🏒', color: '#22D3EE', periods: ['P1', 'P2', 'P3'] },
  mlb: { name: 'MLB', icon: '⚾', color: '#60A5FA', periods: ['3rd', '6th', '9th'] },
  ncaaf: { name: 'NCAAF', icon: '🏈', color: '#A78BFA', periods: ['Q1', 'Q2', 'Q3', 'Q4'] },
  ncaab: { name: 'NCAAB', icon: '🏀', color: '#FBBF24', periods: ['H1', 'H2'] },
  soccer: { name: 'Soccer', icon: '⚽', color: '#34D399', periods: ['H1', 'H2'] },
  custom: { name: 'Custom', icon: '🎲', color: '#F472B6', periods: ['Q1', 'Q2', 'Q3', 'Q4'] },
} as const;
