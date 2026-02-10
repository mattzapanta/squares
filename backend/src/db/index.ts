import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

import dns from 'dns';

// Force IPv4 DNS resolution (Render has IPv6 issues with some providers)
dns.setDefaultResultOrder('ipv4first');

// Use separate connection parameters if available (avoids $ escape issues)
const poolConfig = config.database.host ? {
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.name,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
} : {
  connectionString: config.database.url,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

export const pool = new Pool(poolConfig);

// Helper for transactions
export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Query helper with logging in dev
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'production') {
    console.log('Executed query', { text: text.substring(0, 100), duration, rows: result.rowCount });
  }
  return result;
}

// Check database connection
export async function checkConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    console.error('Database connection failed:', {
      message: err.message,
      code: err.code,
      dbUrl: config.database.url?.substring(0, 50) + '...',
    });
    return false;
  }
}

// Run pending migrations (self-healing)
export async function runMigrations(): Promise<void> {
  try {
    // Add custom_payouts column if it doesn't exist
    await pool.query(`
      ALTER TABLE pools ADD COLUMN IF NOT EXISTS custom_payouts JSONB
    `);

    // Create messaging system tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id UUID REFERENCES admins(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        category VARCHAR(20) NOT NULL,
        trigger_type VARCHAR(20) NOT NULL DEFAULT 'manual',
        sms_template TEXT,
        email_subject VARCHAR(200),
        email_template TEXT,
        variables JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT true,
        is_system BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_sends (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id UUID REFERENCES admins(id) NOT NULL,
        template_id UUID REFERENCES message_templates(id),
        pool_id UUID REFERENCES pools(id),
        group_id UUID REFERENCES player_groups(id),
        message_type VARCHAR(50) NOT NULL,
        channel VARCHAR(20) NOT NULL,
        recipient_count INTEGER NOT NULL,
        sent_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        sms_content TEXT,
        email_subject VARCHAR(200),
        email_content TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_recipients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        send_id UUID REFERENCES message_sends(id) ON DELETE CASCADE NOT NULL,
        player_id UUID REFERENCES players(id) NOT NULL,
        channel VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        sent_at TIMESTAMPTZ,
        error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pool_message_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pool_id UUID REFERENCES pools(id) ON DELETE CASCADE NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        enabled BOOLEAN DEFAULT true,
        template_id UUID REFERENCES message_templates(id),
        cooldown_minutes INTEGER DEFAULT 5,
        max_daily_per_player INTEGER DEFAULT 10,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(pool_id, event_type)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_cooldowns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        player_id UUID REFERENCES players(id) NOT NULL,
        pool_id UUID REFERENCES pools(id),
        event_type VARCHAR(50) NOT NULL,
        last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        message_count INTEGER DEFAULT 1,
        UNIQUE(player_id, pool_id, event_type)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_message_settings (
        admin_id UUID PRIMARY KEY REFERENCES admins(id) ON DELETE CASCADE,
        daily_sms_limit INTEGER DEFAULT 500,
        daily_email_limit INTEGER DEFAULT 1000,
        quiet_hours_start TIME,
        quiet_hours_end TIME,
        auto_claim_notifications BOOLEAN DEFAULT true,
        auto_payment_notifications BOOLEAN DEFAULT true,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create indexes if they don't exist
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_message_templates_admin ON message_templates(admin_id);
      CREATE INDEX IF NOT EXISTS idx_message_templates_system ON message_templates(is_system);
      CREATE INDEX IF NOT EXISTS idx_message_sends_admin ON message_sends(admin_id);
      CREATE INDEX IF NOT EXISTS idx_message_sends_pool ON message_sends(pool_id);
      CREATE INDEX IF NOT EXISTS idx_message_sends_created ON message_sends(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_message_recipients_send ON message_recipients(send_id);
      CREATE INDEX IF NOT EXISTS idx_message_recipients_player ON message_recipients(player_id);
      CREATE INDEX IF NOT EXISTS idx_pool_message_settings_pool ON pool_message_settings(pool_id);
      CREATE INDEX IF NOT EXISTS idx_cooldowns_lookup ON notification_cooldowns(player_id, pool_id, event_type);
    `);

    // Seed system templates if they don't exist
    const templateCount = await pool.query('SELECT COUNT(*) FROM message_templates WHERE is_system = true');
    if (parseInt(templateCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO message_templates (name, category, trigger_type, sms_template, email_subject, email_template, variables, is_system) VALUES
        ('Pool Invite', 'invite', 'manual',
         E'Hey {player_first_name}! New squares pool: {teams} on {game_date}. \${denomination}/sq.\\nJoin here: {pool_link}\\n\\nReply STOP to opt out',
         E'You''re Invited! {teams} Squares Pool',
         E'<h2>You''re invited to {pool_name}!</h2><p>Hey {player_first_name},</p><p>{admin_name} invited you to a squares pool for <strong>{teams}</strong>.</p><p><strong>Entry:</strong> \${denomination} per square</p><p><a href="{pool_link}">Pick Your Squares</a></p>',
         '["player_name", "player_first_name", "admin_name", "teams", "away_team", "home_team", "game_date", "game_time", "denomination", "pool_link", "pool_name"]',
         true),
        ('Payment Reminder', 'reminder', 'manual',
         E'Reminder: You owe \${amount_remaining} for {squares_count} square(s) in {teams}.\\nPay up before lock! {pool_link}\\n\\nReply STOP to opt out',
         'Payment Reminder - {teams} Squares',
         E'<h2>Payment Reminder</h2><p>Hey {player_first_name},</p><p>You have <strong>{squares_count} unpaid square(s)</strong> in <strong>{teams}</strong>.</p><p><strong>Amount owed:</strong> \${amount_remaining}</p><p><a href="{pool_link}">View Pool</a></p>',
         '["player_name", "player_first_name", "teams", "squares_count", "amount_remaining", "amount_owed", "pool_link"]',
         true),
        ('Pool Locked', 'notification', 'automatic',
         E'{teams} grid is LOCKED! Numbers are set.\\nYour squares: {squares_positions}\\nGame time: {game_date} {game_time}\\nView: {pool_link}',
         '{teams} - Grid Locked!',
         E'<h2>Grid is Locked!</h2><p>Hey {player_first_name},</p><p>The grid for <strong>{teams}</strong> is now locked!</p><p><strong>Your squares:</strong> {squares_positions}</p><p><a href="{pool_link}">View Grid</a></p>',
         '["player_name", "player_first_name", "teams", "squares_positions", "squares_count", "game_date", "game_time", "pool_link"]',
         true),
        ('Winner Notification', 'notification', 'automatic',
         E'{player_first_name}, you WON \${payout_amount} on {period}!\\n{teams}: {period_score}\\nYour square: {winning_square}\\nSuggested tip: \${tip_suggestion}',
         'You Won \${payout_amount} - {teams}!',
         E'<h2 style="color: #4ADE80;">You''re a Winner!</h2><p>Congratulations {player_first_name}!</p><p>You won <strong>\${payout_amount}</strong> on <strong>{period}</strong>!</p><p><a href="{pool_link}">View Results</a></p>',
         '["player_name", "player_first_name", "teams", "period", "period_score", "payout_amount", "winning_square", "tip_suggestion", "pool_link"]',
         true),
        ('Custom Message', 'custom', 'manual', '', '', '', '["player_name", "player_first_name", "admin_name"]', true)
      `);
      console.log('Seeded system message templates');
    }

    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration error:', error);
    // Don't throw - let the app continue even if migration fails
  }
}
