-- Migration: Add partial payment tracking
-- Adds amount_paid column to track actual dollars paid vs total owed

ALTER TABLE pool_players ADD COLUMN IF NOT EXISTS amount_paid INTEGER DEFAULT 0;

-- Update existing records: if paid=true, set amount_paid to full amount based on player's square count
-- This will be handled in application code since we need to calculate per-player
