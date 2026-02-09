-- Add phone to admins table
ALTER TABLE admins ADD COLUMN phone VARCHAR(20);

-- Add admin_player_id to link admin to their player record
ALTER TABLE admins ADD COLUMN player_id UUID REFERENCES players(id);
