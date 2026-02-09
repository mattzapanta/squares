-- Add custom_payouts column to pools table
-- This stores custom payout percentages as JSONB: {"q1": 10, "q2": 20, "q3": 20, "q4": 50}

ALTER TABLE pools ADD COLUMN IF NOT EXISTS custom_payouts JSONB;

-- Update payout_structure constraint to allow 'custom'
-- (If you have a constraint, you'd need to drop/recreate it)

-- Comment explaining the field
COMMENT ON COLUMN pools.custom_payouts IS 'Custom payout percentages by period key (q1, q2, etc). Only used when payout_structure = custom';
