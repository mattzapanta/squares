import { SportType, PayoutStructure, OTRule, PoolStatus, PaymentStatus, LedgerType, ActorType, NotificationChannel, NotificationType } from '../config.js';

export interface Admin {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  created_at: Date;
}

export interface Player {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  auth_token: string;
  banned: boolean;
  created_at: Date;
}

export interface Pool {
  id: string;
  admin_id: string;
  name: string;
  sport: SportType;
  away_team: string;
  home_team: string;
  game_date: Date | null;
  game_time: string | null;
  game_label: string | null;
  denomination: number;
  payout_structure: PayoutStructure;
  tip_pct: number;
  max_per_player: number;
  approval_threshold: number;
  ot_rule: OTRule;
  col_digits: number[] | null;
  row_digits: number[] | null;
  status: PoolStatus;
  locked_at: Date | null;
  external_game_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PoolPlayer {
  pool_id: string;
  player_id: string;
  paid: boolean;
  payment_status: PaymentStatus;
  joined_at: Date;
}

export type ClaimStatus = 'available' | 'pending' | 'claimed';

export interface Square {
  id: string;
  pool_id: string;
  row_idx: number;
  col_idx: number;
  player_id: string | null;
  claim_status: ClaimStatus;
  claimed_at: Date | null;
  requested_at: Date | null;
  released_at: Date | null;
  is_admin_override: boolean;
}

export interface Score {
  id: string;
  pool_id: string;
  period_key: string;
  period_label: string;
  away_score: number | null;
  home_score: number | null;
  payout_pct: number;
  entered_at: Date;
  entered_by: string | null;
}

export interface Winner {
  id: string;
  pool_id: string;
  period_key: string;
  player_id: string;
  square_row: number;
  square_col: number;
  payout_amount: number;
  tip_suggestion: number;
  notified: boolean;
  notified_at: Date | null;
}

export interface LedgerEntry {
  id: string;
  player_id: string;
  pool_id: string;
  type: LedgerType;
  amount: number;
  description: string | null;
  created_at: Date;
}

export interface AuditLogEntry {
  id: string;
  pool_id: string | null;
  actor_type: ActorType;
  actor_id: string | null;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: Date;
}

export interface Notification {
  id: string;
  player_id: string;
  pool_id: string | null;
  channel: NotificationChannel;
  type: NotificationType;
  subject: string | null;
  body: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  sent_at: Date | null;
  error: string | null;
  created_at: Date;
}

// API Request/Response types
export interface CreatePoolRequest {
  name: string;
  sport: SportType;
  away_team: string;
  home_team: string;
  game_date?: string;
  game_time?: string;
  game_label?: string;
  denomination: number;
  payout_structure?: PayoutStructure;
  tip_pct?: number;
  max_per_player?: number;
  approval_threshold?: number;
  ot_rule?: OTRule;
  external_game_id?: string;
}

export interface PendingSquareRequest {
  row: number;
  col: number;
  player_id: string;
  player_name: string;
  requested_at: Date;
}

export interface ClaimSquareRequest {
  row: number;
  col: number;
  player_id?: string; // For admin claiming on behalf of player
}

export interface AddPlayerRequest {
  name: string;
  phone?: string;
  email?: string;
}

export interface EnterScoreRequest {
  period_key: string;
  period_label: string;
  away_score: number;
  home_score: number;
  payout_pct: number;
}

export interface PoolWithStats extends Pool {
  claimed_count: number;
  player_count: number;
  pending_count: number;
}

export interface GridCell {
  row: number;
  col: number;
  player: {
    id: string;
    name: string;
    color: string;
    paid: boolean;
  } | null;
}

export interface PoolDetail extends Pool {
  grid: GridCell[][];
  players: (Player & { square_count: number; paid: boolean; payment_status: PaymentStatus })[];
  scores: Score[];
  winners: (Winner & { player_name: string })[];
}

// Player Groups
export interface PlayerGroup {
  id: string;
  admin_id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: Date;
  member_count?: number;
}

export interface PlayerGroupMember {
  group_id: string;
  player_id: string;
  added_at: Date;
}

export interface PoolInvite {
  id: string;
  pool_id: string;
  player_id: string;
  channel: 'sms' | 'email' | 'both';
  status: 'pending' | 'sent' | 'failed' | 'joined';
  sent_at: Date | null;
  joined_at: Date | null;
  error: string | null;
  created_at: Date;
}
