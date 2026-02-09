-- SquaresHQ Full Schema
-- Run this in Supabase SQL Editor for initial setup

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Admin users (just the pool creator for now)
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Players (across all pools, identified by phone/email)
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  auth_token VARCHAR(64) UNIQUE NOT NULL,
  banned BOOLEAN DEFAULT false,
  sms_opted_out BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pools (one per game/event)
CREATE TABLE IF NOT EXISTS pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id) NOT NULL,
  name VARCHAR(200) NOT NULL,
  sport VARCHAR(20) NOT NULL,
  away_team VARCHAR(50) NOT NULL,
  home_team VARCHAR(50) NOT NULL,
  game_date DATE,
  game_time VARCHAR(20),
  game_label VARCHAR(50),
  denomination INTEGER NOT NULL,
  payout_structure VARCHAR(20) NOT NULL DEFAULT 'standard',
  tip_pct INTEGER DEFAULT 10,
  max_per_player INTEGER DEFAULT 10,
  approval_threshold INTEGER DEFAULT 0,
  ot_rule VARCHAR(20) DEFAULT 'include_final',
  col_digits INTEGER[],
  row_digits INTEGER[],
  status VARCHAR(20) DEFAULT 'open',
  locked_at TIMESTAMPTZ,
  external_game_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pool-player membership
CREATE TABLE IF NOT EXISTS pool_players (
  pool_id UUID REFERENCES pools(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  paid BOOLEAN DEFAULT false,
  payment_status VARCHAR(20) DEFAULT 'pending',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (pool_id, player_id)
);

-- Squares (the 10x10 grid)
CREATE TABLE IF NOT EXISTS squares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID REFERENCES pools(id) ON DELETE CASCADE NOT NULL,
  row_idx INTEGER NOT NULL CHECK (row_idx >= 0 AND row_idx <= 9),
  col_idx INTEGER NOT NULL CHECK (col_idx >= 0 AND col_idx <= 9),
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  claim_status VARCHAR(20) DEFAULT 'available',
  claimed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  is_admin_override BOOLEAN DEFAULT false,
  UNIQUE (pool_id, row_idx, col_idx)
);

-- Scores per period
CREATE TABLE IF NOT EXISTS scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID REFERENCES pools(id) ON DELETE CASCADE NOT NULL,
  period_key VARCHAR(10) NOT NULL,
  period_label VARCHAR(20) NOT NULL,
  away_score INTEGER,
  home_score INTEGER,
  payout_pct INTEGER NOT NULL,
  entered_at TIMESTAMPTZ DEFAULT NOW(),
  entered_by UUID REFERENCES admins(id),
  UNIQUE (pool_id, period_key)
);

-- Winners (derived from scores + grid + digits)
CREATE TABLE IF NOT EXISTS winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID REFERENCES pools(id) ON DELETE CASCADE NOT NULL,
  period_key VARCHAR(10) NOT NULL,
  player_id UUID REFERENCES players(id) ON DELETE SET NULL NOT NULL,
  square_row INTEGER NOT NULL,
  square_col INTEGER NOT NULL,
  payout_amount INTEGER NOT NULL,
  tip_suggestion INTEGER NOT NULL,
  notified BOOLEAN DEFAULT false,
  notified_at TIMESTAMPTZ,
  UNIQUE (pool_id, period_key)
);

-- Ledger (running balance across pools)
CREATE TABLE IF NOT EXISTS ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  pool_id UUID REFERENCES pools(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
  amount INTEGER NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log (every single action)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID REFERENCES pools(id) ON DELETE CASCADE,
  actor_type VARCHAR(20) NOT NULL,
  actor_id UUID,
  action VARCHAR(50) NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification queue
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  pool_id UUID REFERENCES pools(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL,
  type VARCHAR(30) NOT NULL,
  subject VARCHAR(200),
  body TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Player groups (for organizing players)
CREATE TABLE IF NOT EXISTS player_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (admin_id, name)
);

-- Player group memberships
CREATE TABLE IF NOT EXISTS player_group_members (
  group_id UUID REFERENCES player_groups(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, player_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_squares_pool ON squares(pool_id);
CREATE INDEX IF NOT EXISTS idx_squares_player ON squares(player_id);
CREATE INDEX IF NOT EXISTS idx_pool_players_pool ON pool_players(pool_id);
CREATE INDEX IF NOT EXISTS idx_ledger_player ON ledger(player_id);
CREATE INDEX IF NOT EXISTS idx_audit_pool ON audit_log(pool_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_players_admin ON players(admin_id);
CREATE INDEX IF NOT EXISTS idx_player_groups_admin ON player_groups(admin_id);
