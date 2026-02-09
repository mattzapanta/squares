-- Migration: Add approval threshold for square claims
-- When a player's claim would exceed the threshold, it requires admin approval

-- Add approval_threshold to pools (default 100 = effectively disabled)
ALTER TABLE pools ADD COLUMN approval_threshold INTEGER DEFAULT 100;

-- Add claim_status to squares
-- available: no one has claimed or requested
-- pending: player requested, awaiting admin approval
-- claimed: approved and owned by player
ALTER TABLE squares ADD COLUMN claim_status VARCHAR(20) DEFAULT 'available';

-- Add requested_at for pending tracking
ALTER TABLE squares ADD COLUMN requested_at TIMESTAMPTZ;

-- Update existing claimed squares to have 'claimed' status
UPDATE squares SET claim_status = 'claimed' WHERE player_id IS NOT NULL;

-- Update existing unclaimed squares to have 'available' status
UPDATE squares SET claim_status = 'available' WHERE player_id IS NULL;

-- Add index for finding pending squares quickly
CREATE INDEX idx_squares_pending ON squares(pool_id, claim_status) WHERE claim_status = 'pending';

-- Add comment explaining the feature
COMMENT ON COLUMN pools.approval_threshold IS 'Number of squares a player can claim without approval. Claims beyond this require admin approval. Set to 100 to effectively disable.';
COMMENT ON COLUMN squares.claim_status IS 'available = unclaimed, pending = awaiting approval, claimed = approved and owned';
