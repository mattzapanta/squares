-- SquaresHQ Initial Schema
-- Run with: psql -d squareshq -f 001_initial_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Admin users (pool creators)
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Players (across all pools, identified by phone/email)
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  auth_token VARCHAR(64) UNIQUE NOT NULL,
  banned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT player_contact CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

-- Pools (one per game/event)
CREATE TABLE pools (
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
CREATE TABLE pool_players (
  pool_id UUID REFERENCES pools(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  paid BOOLEAN DEFAULT false,
  payment_status VARCHAR(20) DEFAULT 'pending',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (pool_id, player_id)
);

-- Squares (the 10x10 grid)
CREATE TABLE squares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID REFERENCES pools(id) ON DELETE CASCADE NOT NULL,
  row_idx INTEGER NOT NULL CHECK (row_idx >= 0 AND row_idx <= 9),
  col_idx INTEGER NOT NULL CHECK (col_idx >= 0 AND col_idx <= 9),
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  is_admin_override BOOLEAN DEFAULT false,
  UNIQUE (pool_id, row_idx, col_idx)
);

-- Scores per period
CREATE TABLE scores (
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
CREATE TABLE winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID REFERENCES pools(id) ON DELETE CASCADE NOT NULL,
  period_key VARCHAR(10) NOT NULL,
  player_id UUID REFERENCES players(id) NOT NULL,
  square_row INTEGER NOT NULL,
  square_col INTEGER NOT NULL,
  payout_amount INTEGER NOT NULL,
  tip_suggestion INTEGER NOT NULL,
  notified BOOLEAN DEFAULT false,
  notified_at TIMESTAMPTZ,
  UNIQUE (pool_id, period_key)
);

-- Ledger (running balance across pools)
CREATE TABLE ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  pool_id UUID REFERENCES pools(id) ON DELETE CASCADE NOT NULL,
  type VARCHAR(20) NOT NULL,
  amount INTEGER NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log (every single action)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID REFERENCES pools(id) ON DELETE CASCADE,
  actor_type VARCHAR(20) NOT NULL,
  actor_id UUID,
  action VARCHAR(50) NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification queue
CREATE TABLE notifications (
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

-- Indexes for performance
CREATE INDEX idx_squares_pool ON squares(pool_id);
CREATE INDEX idx_squares_player ON squares(player_id);
CREATE INDEX idx_pool_players_pool ON pool_players(pool_id);
CREATE INDEX idx_pool_players_player ON pool_players(player_id);
CREATE INDEX idx_ledger_player ON ledger(player_id);
CREATE INDEX idx_ledger_pool ON ledger(pool_id);
CREATE INDEX idx_audit_pool ON audit_log(pool_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_player ON notifications(player_id);
CREATE INDEX idx_pools_admin ON pools(admin_id);
CREATE INDEX idx_pools_status ON pools(status);
CREATE INDEX idx_players_token ON players(auth_token);
CREATE INDEX idx_winners_pool ON winners(pool_id);
CREATE INDEX idx_scores_pool ON scores(pool_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for pools updated_at
CREATE TRIGGER update_pools_updated_at
    BEFORE UPDATE ON pools
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
