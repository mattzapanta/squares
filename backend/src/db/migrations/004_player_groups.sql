-- Migration: Player groups for targeted notifications
-- Allows admins to organize players into groups for selective invites

-- Groups table (each admin can have their own groups)
CREATE TABLE player_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255),
  color VARCHAR(20) DEFAULT '#4ADE80', -- For UI display
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(admin_id, name)
);

-- Group membership (many-to-many between players and groups)
CREATE TABLE player_group_members (
  group_id UUID REFERENCES player_groups(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, player_id)
);

-- Pool invite settings (which groups to auto-invite when pool is created)
ALTER TABLE pools ADD COLUMN auto_invite_groups UUID[] DEFAULT '{}';
ALTER TABLE pools ADD COLUMN invite_sent BOOLEAN DEFAULT false;
ALTER TABLE pools ADD COLUMN invite_sent_at TIMESTAMPTZ;

-- Track which players were invited to which pools
CREATE TABLE pool_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID REFERENCES pools(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  channel VARCHAR(20) NOT NULL, -- 'sms', 'email', 'both'
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'joined'
  sent_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pool_id, player_id)
);

-- SMS opt-out tracking
ALTER TABLE players ADD COLUMN sms_opted_out BOOLEAN DEFAULT false;
ALTER TABLE players ADD COLUMN sms_opted_out_at TIMESTAMPTZ;

-- Indexes
CREATE INDEX idx_player_groups_admin ON player_groups(admin_id);
CREATE INDEX idx_player_group_members_group ON player_group_members(group_id);
CREATE INDEX idx_player_group_members_player ON player_group_members(player_id);
CREATE INDEX idx_pool_invites_pool ON pool_invites(pool_id);
CREATE INDEX idx_pool_invites_player ON pool_invites(player_id);
CREATE INDEX idx_pool_invites_status ON pool_invites(status);

-- Comments
COMMENT ON TABLE player_groups IS 'Groups of players for targeted notifications';
COMMENT ON TABLE player_group_members IS 'Which players belong to which groups';
COMMENT ON TABLE pool_invites IS 'Tracks invitations sent for each pool';
COMMENT ON COLUMN pools.auto_invite_groups IS 'Array of group IDs to auto-invite when pool is created';
