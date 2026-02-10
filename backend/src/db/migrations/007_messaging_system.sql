-- Migration: Comprehensive messaging system
-- Adds template-based messaging, history tracking, and spam prevention

-- Message templates (both system and custom)
CREATE TABLE message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id) ON DELETE CASCADE,  -- NULL for system templates
  name VARCHAR(100) NOT NULL,
  category VARCHAR(20) NOT NULL,  -- 'invite', 'reminder', 'notification', 'custom'
  trigger_type VARCHAR(20) NOT NULL DEFAULT 'manual',  -- 'manual', 'automatic'
  sms_template TEXT,
  email_subject VARCHAR(200),
  email_template TEXT,
  variables JSONB DEFAULT '[]',  -- Available variables for this template
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,  -- true for built-in templates
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message send history
CREATE TABLE message_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id) NOT NULL,
  template_id UUID REFERENCES message_templates(id),
  pool_id UUID REFERENCES pools(id),  -- Optional context
  group_id UUID REFERENCES player_groups(id),  -- Optional context
  message_type VARCHAR(50) NOT NULL,  -- 'invite', 'reminder', 'custom', etc.
  channel VARCHAR(20) NOT NULL,  -- 'sms', 'email', 'both'
  recipient_count INTEGER NOT NULL,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  sms_content TEXT,  -- Actual message sent
  email_subject VARCHAR(200),
  email_content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual message recipients (for tracking delivery)
CREATE TABLE message_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id UUID REFERENCES message_sends(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES players(id) NOT NULL,
  channel VARCHAR(20) NOT NULL,  -- 'sms' or 'email'
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'sent', 'failed', 'delivered'
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Automated message settings per pool
CREATE TABLE pool_message_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID REFERENCES pools(id) ON DELETE CASCADE NOT NULL,
  event_type VARCHAR(50) NOT NULL,  -- 'pool_locked', 'score_entered', 'pool_cancelled', etc.
  enabled BOOLEAN DEFAULT true,
  template_id UUID REFERENCES message_templates(id),  -- Custom template or NULL for default
  cooldown_minutes INTEGER DEFAULT 5,
  max_daily_per_player INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pool_id, event_type)
);

-- Notification cooldowns for spam prevention
CREATE TABLE notification_cooldowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) NOT NULL,
  pool_id UUID REFERENCES pools(id),
  event_type VARCHAR(50) NOT NULL,  -- 'square_claimed', 'square_released', 'payment_confirmed', etc.
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_count INTEGER DEFAULT 1,  -- Count within cooldown window
  UNIQUE(player_id, pool_id, event_type)
);

-- Global admin message settings
CREATE TABLE admin_message_settings (
  admin_id UUID PRIMARY KEY REFERENCES admins(id) ON DELETE CASCADE,
  daily_sms_limit INTEGER DEFAULT 500,
  daily_email_limit INTEGER DEFAULT 1000,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  auto_claim_notifications BOOLEAN DEFAULT true,
  auto_payment_notifications BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_message_templates_admin ON message_templates(admin_id);
CREATE INDEX idx_message_templates_system ON message_templates(is_system);
CREATE INDEX idx_message_sends_admin ON message_sends(admin_id);
CREATE INDEX idx_message_sends_pool ON message_sends(pool_id);
CREATE INDEX idx_message_sends_created ON message_sends(created_at DESC);
CREATE INDEX idx_message_recipients_send ON message_recipients(send_id);
CREATE INDEX idx_message_recipients_player ON message_recipients(player_id);
CREATE INDEX idx_message_recipients_status ON message_recipients(status);
CREATE INDEX idx_pool_message_settings_pool ON pool_message_settings(pool_id);
CREATE INDEX idx_cooldowns_lookup ON notification_cooldowns(player_id, pool_id, event_type);
CREATE INDEX idx_cooldowns_recent ON notification_cooldowns(last_sent_at);

-- Comments
COMMENT ON TABLE message_templates IS 'Message templates for SMS and email notifications';
COMMENT ON TABLE message_sends IS 'History of sent message batches';
COMMENT ON TABLE message_recipients IS 'Individual recipient status for each send';
COMMENT ON TABLE pool_message_settings IS 'Per-pool notification settings';
COMMENT ON TABLE notification_cooldowns IS 'Tracks recent notifications for spam prevention';
COMMENT ON TABLE admin_message_settings IS 'Global admin messaging preferences';

-- Seed system templates
INSERT INTO message_templates (name, category, trigger_type, sms_template, email_subject, email_template, variables, is_system) VALUES
-- Pool Invite
('Pool Invite', 'invite', 'manual',
 E'Hey {player_first_name}! New squares pool: {teams} on {game_date}. ${denomination}/sq.\nJoin here: {pool_link}\n\nReply STOP to opt out',
 E'You''re Invited! {teams} Squares Pool',
 E'<h2>You''re invited to {pool_name}!</h2>\n<p>Hey {player_first_name},</p>\n<p>{admin_name} invited you to a squares pool for <strong>{teams}</strong> on {game_date} at {game_time}.</p>\n<p><strong>Entry:</strong> ${denomination} per square</p>\n<p><a href="{pool_link}" style="background: #4ADE80; color: #000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Pick Your Squares</a></p>',
 '["player_name", "player_first_name", "admin_name", "teams", "away_team", "home_team", "game_date", "game_time", "denomination", "pool_link", "pool_name"]',
 true),

-- Payment Reminder
('Payment Reminder', 'reminder', 'manual',
 E'Reminder: You owe ${amount_remaining} for {squares_count} square(s) in {teams}.\nPay up before lock! {pool_link}\n\nReply STOP to opt out',
 'Payment Reminder - {teams} Squares',
 E'<h2>Payment Reminder</h2>\n<p>Hey {player_first_name},</p>\n<p>You have <strong>{squares_count} unpaid square(s)</strong> in <strong>{teams}</strong>.</p>\n<p><strong>Amount owed:</strong> ${amount_remaining}</p>\n<p>Please pay before the grid is locked!</p>\n<p><a href="{pool_link}" style="background: #4ADE80; color: #000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">View Pool</a></p>',
 '["player_name", "player_first_name", "teams", "squares_count", "amount_remaining", "amount_owed", "pool_link"]',
 true),

-- Pool Locked
('Pool Locked', 'notification', 'automatic',
 E'{teams} grid is LOCKED! Numbers are set.\nYour squares: {squares_positions}\nGame time: {game_date} {game_time}\nView: {pool_link}',
 '{teams} - Grid Locked!',
 E'<h2>Grid is Locked!</h2>\n<p>Hey {player_first_name},</p>\n<p>The grid for <strong>{teams}</strong> is now locked and numbers have been randomized!</p>\n<p><strong>Your squares:</strong> {squares_positions}</p>\n<p><strong>Game time:</strong> {game_date} at {game_time}</p>\n<p><a href="{pool_link}" style="background: #4ADE80; color: #000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">View Grid</a></p>',
 '["player_name", "player_first_name", "teams", "squares_positions", "squares_count", "game_date", "game_time", "pool_link"]',
 true),

-- Winner Notification
('Winner Notification', 'notification', 'automatic',
 E'{player_first_name}, you WON ${payout_amount} on {period}!\n{teams}: {period_score}\nYour square: {winning_square}\nSuggested tip: ${tip_suggestion}',
 'You Won ${payout_amount} - {teams}!',
 E'<h2 style="color: #4ADE80;">You''re a Winner!</h2>\n<p>Congratulations {player_first_name}!</p>\n<p>You won <strong style="font-size: 24px;">${payout_amount}</strong> on <strong>{period}</strong>!</p>\n<p><strong>Game:</strong> {teams}</p>\n<p><strong>Score:</strong> {period_score}</p>\n<p><strong>Your square:</strong> {winning_square}</p>\n<p><em>Suggested tip: ${tip_suggestion}</em></p>\n<p><a href="{pool_link}" style="background: #4ADE80; color: #000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">View Results</a></p>',
 '["player_name", "player_first_name", "teams", "period", "period_score", "payout_amount", "winning_square", "tip_suggestion", "pool_link"]',
 true),

-- Pool Cancelled
('Pool Cancelled', 'notification', 'automatic',
 E'{pool_name} has been cancelled.\n{refund_info}\nQuestions? Contact your admin.',
 '{pool_name} - Pool Cancelled',
 E'<h2>Pool Cancelled</h2>\n<p>Hey {player_first_name},</p>\n<p>Unfortunately, <strong>{pool_name}</strong> has been cancelled.</p>\n<p>{refund_info}</p>\n<p>If you have any questions, please contact your admin.</p>',
 '["player_name", "player_first_name", "pool_name", "teams", "refund_amount", "refund_info"]',
 true),

-- Square Claimed Confirmation
('Square Claimed', 'notification', 'automatic',
 E'Claimed {squares_count} square(s) in {teams}!\nPositions: {squares_positions}\nTotal: ${amount_owed}\nView: {pool_link}',
 'Square(s) Claimed - {teams}',
 E'<h2>Squares Claimed!</h2>\n<p>Hey {player_first_name},</p>\n<p>You claimed <strong>{squares_count} square(s)</strong> in <strong>{teams}</strong>!</p>\n<p><strong>Positions:</strong> {squares_positions}</p>\n<p><strong>Total cost:</strong> ${amount_owed}</p>\n<p><a href="{pool_link}" style="background: #4ADE80; color: #000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">View Grid</a></p>',
 '["player_name", "player_first_name", "teams", "squares_count", "squares_positions", "amount_owed", "pool_link"]',
 true),

-- Wallet Deposit
('Wallet Deposit', 'notification', 'automatic',
 E'${deposit_amount} added to your SquaresHQ wallet.\nNew balance: ${wallet_balance}',
 'Wallet Deposit Confirmed',
 E'<h2>Wallet Deposit Confirmed</h2>\n<p>Hey {player_first_name},</p>\n<p><strong>${deposit_amount}</strong> has been added to your wallet.</p>\n<p><strong>New balance:</strong> ${wallet_balance}</p>',
 '["player_name", "player_first_name", "deposit_amount", "wallet_balance"]',
 true),

-- Custom Message (blank template for admin customization)
('Custom Message', 'custom', 'manual',
 '',
 '',
 '',
 '["player_name", "player_first_name", "admin_name"]',
 true);
