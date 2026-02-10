import { query, withTransaction } from '../db/index.js';
import { sendEmail, isEmailEnabled } from './emailService.js';
import { sendSMS, isSMSEnabled } from './smsService.js';
import { config } from '../config.js';
import {
  MessageTemplate,
  MessageSend,
  MessageRecipient,
  Player,
  Pool,
  SendMessageRequest,
  MessageChannel,
} from '../types/index.js';

// ================== Template Variable Substitution ==================

interface VariableContext {
  player?: Player;
  pool?: Pool;
  admin?: { name: string; email: string };
  squares?: { row: number; col: number }[];
  amount_owed?: number;
  amount_paid?: number;
  amount_remaining?: number;
  deposit_amount?: number;
  wallet_balance?: number;
  payout_amount?: number;
  period?: string;
  period_score?: string;
  winning_square?: string;
  tip_suggestion?: number;
  refund_amount?: number;
  refund_info?: string;
}

// Generate magic link for player
function generateMagicLink(playerToken: string, poolId?: string): string {
  const baseUrl = config.frontendUrl;
  if (poolId) {
    return `${baseUrl}/p/${playerToken}?pool=${poolId}`;
  }
  return `${baseUrl}/p/${playerToken}`;
}

// Format square positions
function formatSquarePositions(squares: { row: number; col: number }[]): string {
  return squares.map(s => `R${s.row + 1}C${s.col + 1}`).join(', ');
}

// Format game date
function formatGameDate(date: Date | null): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Substitute variables in template
export function substituteVariables(template: string, context: VariableContext): string {
  const variables: Record<string, string> = {
    // Universal variables
    '{player_name}': context.player?.name || '',
    '{player_first_name}': context.player?.name?.split(' ')[0] || '',
    '{player_phone}': context.player?.phone || '',
    '{player_email}': context.player?.email || '',
    '{admin_name}': context.admin?.name || '',
    '{app_name}': 'SquaresHQ',

    // Pool variables
    '{pool_name}': context.pool ? `${context.pool.away_team} vs ${context.pool.home_team}` : '',
    '{pool_link}': context.player && context.pool
      ? generateMagicLink(context.player.auth_token, context.pool.id)
      : '',
    '{away_team}': context.pool?.away_team || '',
    '{home_team}': context.pool?.home_team || '',
    '{teams}': context.pool ? `${context.pool.away_team} vs ${context.pool.home_team}` : '',
    '{game_date}': formatGameDate(context.pool?.game_date || null),
    '{game_time}': context.pool?.game_time || '',
    '{game_label}': context.pool?.game_label || '',
    '{denomination}': context.pool?.denomination?.toString() || '',
    '{pool_total}': context.pool ? (context.pool.denomination * 100).toString() : '',

    // Player-Pool variables
    '{squares_count}': context.squares?.length?.toString() || '0',
    '{squares_positions}': context.squares ? formatSquarePositions(context.squares) : '',
    '{amount_owed}': context.amount_owed?.toString() || '0',
    '{amount_paid}': context.amount_paid?.toString() || '0',
    '{amount_remaining}': context.amount_remaining?.toString() || '0',

    // Wallet variables
    '{wallet_balance}': context.wallet_balance?.toString() || '0',
    '{deposit_amount}': context.deposit_amount?.toString() || '0',

    // Winner variables
    '{period}': context.period || '',
    '{period_score}': context.period_score || '',
    '{payout_amount}': context.payout_amount?.toString() || '0',
    '{winning_square}': context.winning_square || '',
    '{tip_suggestion}': context.tip_suggestion?.toString() || '0',

    // Refund variables
    '{refund_amount}': context.refund_amount?.toString() || '0',
    '{refund_info}': context.refund_info || '',
  };

  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }

  return result;
}

// ================== Cooldown & Spam Prevention ==================

interface CooldownConfig {
  event_type: string;
  cooldown_minutes: number;
}

const DEFAULT_COOLDOWNS: Record<string, number> = {
  'square_claimed': 5,
  'square_released': 5,
  'payment_confirmed': 60,
  'pool_invite': 1440, // 24 hours
  'payment_reminder': 240, // 4 hours
  'pool_locked': 0, // One-time
  'winner_notification': 0, // One-time
};

// Check if we should send a notification based on cooldown
export async function checkCooldown(
  playerId: string,
  poolId: string | null,
  eventType: string
): Promise<boolean> {
  const cooldownMinutes = DEFAULT_COOLDOWNS[eventType] ?? 5;

  // One-time events (cooldown = 0) should check if already sent
  if (cooldownMinutes === 0) {
    const existing = await query(
      `SELECT id FROM notification_cooldowns
       WHERE player_id = $1 AND ($2::uuid IS NULL OR pool_id = $2) AND event_type = $3`,
      [playerId, poolId, eventType]
    );
    return existing.rows.length === 0;
  }

  // Check cooldown period
  const result = await query(
    `SELECT id FROM notification_cooldowns
     WHERE player_id = $1 AND ($2::uuid IS NULL OR pool_id = $2) AND event_type = $3
     AND last_sent_at > NOW() - INTERVAL '${cooldownMinutes} minutes'`,
    [playerId, poolId, eventType]
  );

  return result.rows.length === 0;
}

// Record that a notification was sent
export async function recordCooldown(
  playerId: string,
  poolId: string | null,
  eventType: string
): Promise<void> {
  await query(
    `INSERT INTO notification_cooldowns (player_id, pool_id, event_type, last_sent_at, message_count)
     VALUES ($1, $2, $3, NOW(), 1)
     ON CONFLICT (player_id, pool_id, event_type)
     DO UPDATE SET last_sent_at = NOW(), message_count = notification_cooldowns.message_count + 1`,
    [playerId, poolId, eventType]
  );
}

// Check daily SMS budget for admin
export async function checkDailyBudget(adminId: string): Promise<{ canSend: boolean; used: number; limit: number }> {
  // Get admin settings
  const settingsResult = await query(
    `SELECT daily_sms_limit FROM admin_message_settings WHERE admin_id = $1`,
    [adminId]
  );

  const limit = settingsResult.rows[0]?.daily_sms_limit ?? 500;

  // Count today's sent messages
  const today = new Date().toISOString().split('T')[0];
  const countResult = await query(
    `SELECT COUNT(*) as count FROM message_recipients mr
     JOIN message_sends ms ON mr.send_id = ms.id
     WHERE ms.admin_id = $1 AND mr.channel = 'sms' AND mr.status = 'sent'
     AND mr.sent_at::date = $2`,
    [adminId, today]
  );

  const used = parseInt(countResult.rows[0]?.count || '0', 10);

  return { canSend: used < limit, used, limit };
}

// ================== Template Management ==================

// Get all templates (system + admin's custom)
export async function getTemplates(adminId: string): Promise<MessageTemplate[]> {
  const result = await query<MessageTemplate>(
    `SELECT * FROM message_templates
     WHERE is_system = true OR admin_id = $1
     ORDER BY is_system DESC, name ASC`,
    [adminId]
  );
  return result.rows;
}

// Get a single template
export async function getTemplate(templateId: string, adminId: string): Promise<MessageTemplate | null> {
  const result = await query<MessageTemplate>(
    `SELECT * FROM message_templates
     WHERE id = $1 AND (is_system = true OR admin_id = $2)`,
    [templateId, adminId]
  );
  return result.rows[0] || null;
}

// Create a custom template
export async function createTemplate(
  adminId: string,
  data: {
    name: string;
    category: string;
    trigger_type?: string;
    sms_template?: string;
    email_subject?: string;
    email_template?: string;
    variables?: string[];
  }
): Promise<MessageTemplate> {
  const result = await query<MessageTemplate>(
    `INSERT INTO message_templates (admin_id, name, category, trigger_type, sms_template, email_subject, email_template, variables, is_system)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
     RETURNING *`,
    [
      adminId,
      data.name,
      data.category,
      data.trigger_type || 'manual',
      data.sms_template || null,
      data.email_subject || null,
      data.email_template || null,
      JSON.stringify(data.variables || []),
    ]
  );
  return result.rows[0];
}

// Update a custom template
export async function updateTemplate(
  templateId: string,
  adminId: string,
  data: {
    name?: string;
    category?: string;
    sms_template?: string;
    email_subject?: string;
    email_template?: string;
    variables?: string[];
    is_active?: boolean;
  }
): Promise<MessageTemplate | null> {
  // Build update query
  const updates: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.category !== undefined) {
    updates.push(`category = $${paramIndex++}`);
    values.push(data.category);
  }
  if (data.sms_template !== undefined) {
    updates.push(`sms_template = $${paramIndex++}`);
    values.push(data.sms_template);
  }
  if (data.email_subject !== undefined) {
    updates.push(`email_subject = $${paramIndex++}`);
    values.push(data.email_subject);
  }
  if (data.email_template !== undefined) {
    updates.push(`email_template = $${paramIndex++}`);
    values.push(data.email_template);
  }
  if (data.variables !== undefined) {
    updates.push(`variables = $${paramIndex++}`);
    values.push(JSON.stringify(data.variables));
  }
  if (data.is_active !== undefined) {
    updates.push(`is_active = $${paramIndex++}`);
    values.push(data.is_active);
  }

  values.push(templateId, adminId);

  const result = await query<MessageTemplate>(
    `UPDATE message_templates
     SET ${updates.join(', ')}
     WHERE id = $${paramIndex++} AND admin_id = $${paramIndex} AND is_system = false
     RETURNING *`,
    values
  );

  return result.rows[0] || null;
}

// Delete a custom template
export async function deleteTemplate(templateId: string, adminId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM message_templates
     WHERE id = $1 AND admin_id = $2 AND is_system = false
     RETURNING id`,
    [templateId, adminId]
  );
  return result.rows.length > 0;
}

// ================== Message Sending ==================

interface SendResult {
  success: boolean;
  send_id?: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  errors?: string[];
}

// Send message to selected recipients
export async function sendMessage(
  adminId: string,
  request: SendMessageRequest,
  adminName: string
): Promise<SendResult> {
  const errors: string[] = [];

  // Get recipients based on recipient_type
  let players: Player[] = [];

  if (request.recipient_type === 'all') {
    const result = await query<Player>(
      `SELECT * FROM players WHERE sms_opted_out = false OR sms_opted_out IS NULL`
    );
    players = result.rows;
  } else if (request.recipient_type === 'pool' && request.pool_id) {
    const result = await query<Player>(
      `SELECT p.* FROM players p
       JOIN pool_players pp ON p.id = pp.player_id
       WHERE pp.pool_id = $1 AND (p.sms_opted_out = false OR p.sms_opted_out IS NULL)`,
      [request.pool_id]
    );
    players = result.rows;
  } else if (request.recipient_type === 'group' && request.group_id) {
    const result = await query<Player>(
      `SELECT p.* FROM players p
       JOIN player_group_members pgm ON p.id = pgm.player_id
       WHERE pgm.group_id = $1 AND (p.sms_opted_out = false OR p.sms_opted_out IS NULL)`,
      [request.group_id]
    );
    players = result.rows;
  } else if (request.recipient_type === 'custom' && request.player_ids) {
    const result = await query<Player>(
      `SELECT * FROM players WHERE id = ANY($1::uuid[]) AND (sms_opted_out = false OR sms_opted_out IS NULL)`,
      [request.player_ids]
    );
    players = result.rows;
  }

  // Apply filters
  if (request.filters) {
    if (request.filters.has_phone) {
      players = players.filter(p => p.phone);
    }
    if (request.filters.has_email) {
      players = players.filter(p => p.email);
    }
    // Payment status filtering requires pool context
    if (request.filters.payment_status && request.pool_id) {
      const ppResult = await query(
        `SELECT player_id, payment_status FROM pool_players WHERE pool_id = $1`,
        [request.pool_id]
      );
      const statusMap = new Map(ppResult.rows.map(r => [r.player_id, r.payment_status]));
      players = players.filter(p => {
        const status = statusMap.get(p.id);
        if (request.filters!.payment_status === 'paid') return status === 'confirmed';
        if (request.filters!.payment_status === 'unpaid') return status === 'pending';
        if (request.filters!.payment_status === 'partial') return status === 'partial';
        return true;
      });
    }
  }

  if (players.length === 0) {
    return { success: false, recipient_count: 0, sent_count: 0, failed_count: 0, skipped_count: 0, errors: ['No recipients found'] };
  }

  // Get pool if needed
  let pool: Pool | null = null;
  if (request.pool_id) {
    const poolResult = await query<Pool>('SELECT * FROM pools WHERE id = $1', [request.pool_id]);
    pool = poolResult.rows[0] || null;
  }

  // Get template if provided
  let template: MessageTemplate | null = null;
  if (request.template_id) {
    template = await getTemplate(request.template_id, adminId);
  }

  // Determine message content
  const smsContent = request.sms_content || template?.sms_template || '';
  const emailSubject = request.email_subject || template?.email_subject || '';
  const emailContent = request.email_content || template?.email_template || '';

  // Create message send record
  const sendResult = await query<MessageSend>(
    `INSERT INTO message_sends (admin_id, template_id, pool_id, group_id, message_type, channel, recipient_count, sms_content, email_subject, email_content)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      adminId,
      request.template_id || null,
      request.pool_id || null,
      request.group_id || null,
      template?.category || 'custom',
      request.channel,
      players.length,
      smsContent,
      emailSubject,
      emailContent,
    ]
  );

  const sendId = sendResult.rows[0].id;
  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  // Send to each recipient
  for (const player of players) {
    // Build context for variable substitution
    const context: VariableContext = {
      player,
      pool: pool || undefined,
      admin: { name: adminName, email: '' },
    };

    // Get player's squares if pool context exists
    if (pool) {
      const squaresResult = await query<{ row: number; col: number }>(
        `SELECT row_idx as row, col_idx as col FROM squares WHERE pool_id = $1 AND player_id = $2`,
        [pool.id, player.id]
      );
      context.squares = squaresResult.rows;
      context.amount_owed = squaresResult.rows.length * pool.denomination;
    }

    const personalizedSms = substituteVariables(smsContent, context);
    const personalizedEmailSubject = substituteVariables(emailSubject, context);
    const personalizedEmailContent = substituteVariables(emailContent, context);

    // Send based on channel preference
    let smsSent = false;
    let emailSent = false;
    let smsError: string | null = null;
    let emailError: string | null = null;

    if ((request.channel === 'sms' || request.channel === 'both') && player.phone && isSMSEnabled()) {
      const smsResult = await sendSMS(player.phone, personalizedSms);
      if (smsResult.success) {
        smsSent = true;
        // Record recipient
        await query(
          `INSERT INTO message_recipients (send_id, player_id, channel, status, sent_at)
           VALUES ($1, $2, 'sms', 'sent', NOW())`,
          [sendId, player.id]
        );
      } else {
        smsError = smsResult.error || 'SMS failed';
        await query(
          `INSERT INTO message_recipients (send_id, player_id, channel, status, error)
           VALUES ($1, $2, 'sms', 'failed', $3)`,
          [sendId, player.id, smsError]
        );
      }
    }

    if ((request.channel === 'email' || request.channel === 'both') && player.email && isEmailEnabled()) {
      const emailResult = await sendEmail(player.email, personalizedEmailSubject, personalizedEmailContent);
      if (emailResult.success) {
        emailSent = true;
        await query(
          `INSERT INTO message_recipients (send_id, player_id, channel, status, sent_at)
           VALUES ($1, $2, 'email', 'sent', NOW())`,
          [sendId, player.id]
        );
      } else {
        emailError = emailResult.error || 'Email failed';
        await query(
          `INSERT INTO message_recipients (send_id, player_id, channel, status, error)
           VALUES ($1, $2, 'email', 'failed', $3)`,
          [sendId, player.id, emailError]
        );
      }
    }

    // Track results
    if (smsSent || emailSent) {
      sentCount++;
    } else if (smsError || emailError) {
      failedCount++;
      if (smsError) errors.push(`${player.name}: ${smsError}`);
      if (emailError) errors.push(`${player.name}: ${emailError}`);
    } else {
      skippedCount++;
    }
  }

  // Update send record with counts
  await query(
    `UPDATE message_sends SET sent_count = $1, failed_count = $2 WHERE id = $3`,
    [sentCount, failedCount, sendId]
  );

  return {
    success: failedCount === 0,
    send_id: sendId,
    recipient_count: players.length,
    sent_count: sentCount,
    failed_count: failedCount,
    skipped_count: skippedCount,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ================== Message History ==================

export interface MessageSendWithDetails extends MessageSend {
  template_name?: string;
  pool_name?: string;
  group_name?: string;
}

// Get message history for admin
export async function getMessageHistory(
  adminId: string,
  options: { pool_id?: string; limit?: number; offset?: number }
): Promise<MessageSendWithDetails[]> {
  const limit = options.limit || 50;
  const offset = options.offset || 0;

  let whereClause = 'ms.admin_id = $1';
  const values: unknown[] = [adminId];

  if (options.pool_id) {
    whereClause += ` AND ms.pool_id = $${values.length + 1}`;
    values.push(options.pool_id);
  }

  values.push(limit, offset);

  const result = await query<MessageSendWithDetails>(
    `SELECT ms.*,
       mt.name as template_name,
       CASE WHEN p.id IS NOT NULL THEN p.away_team || ' vs ' || p.home_team ELSE NULL END as pool_name,
       pg.name as group_name
     FROM message_sends ms
     LEFT JOIN message_templates mt ON ms.template_id = mt.id
     LEFT JOIN pools p ON ms.pool_id = p.id
     LEFT JOIN player_groups pg ON ms.group_id = pg.id
     WHERE ${whereClause}
     ORDER BY ms.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  return result.rows;
}

// Get recipients for a specific send
export interface MessageRecipientWithPlayer extends MessageRecipient {
  player_name: string;
  player_phone: string | null;
  player_email: string | null;
}

export async function getMessageRecipients(
  sendId: string,
  adminId: string
): Promise<MessageRecipientWithPlayer[]> {
  const result = await query<MessageRecipientWithPlayer>(
    `SELECT mr.*, p.name as player_name, p.phone as player_phone, p.email as player_email
     FROM message_recipients mr
     JOIN message_sends ms ON mr.send_id = ms.id
     JOIN players p ON mr.player_id = p.id
     WHERE mr.send_id = $1 AND ms.admin_id = $2
     ORDER BY p.name ASC`,
    [sendId, adminId]
  );
  return result.rows;
}

// Retry failed recipients
export async function retryFailedRecipients(
  sendId: string,
  adminId: string
): Promise<{ retried: number; succeeded: number; failed: number }> {
  // Get the original send
  const sendResult = await query<MessageSend>(
    `SELECT * FROM message_sends WHERE id = $1 AND admin_id = $2`,
    [sendId, adminId]
  );

  if (sendResult.rows.length === 0) {
    return { retried: 0, succeeded: 0, failed: 0 };
  }

  const send = sendResult.rows[0];

  // Get failed recipients
  const failedResult = await query<MessageRecipientWithPlayer>(
    `SELECT mr.*, p.name as player_name, p.phone as player_phone, p.email as player_email
     FROM message_recipients mr
     JOIN players p ON mr.player_id = p.id
     WHERE mr.send_id = $1 AND mr.status = 'failed'`,
    [sendId]
  );

  let succeeded = 0;
  let stillFailed = 0;

  for (const recipient of failedResult.rows) {
    let success = false;

    if (recipient.channel === 'sms' && recipient.player_phone && send.sms_content) {
      const result = await sendSMS(recipient.player_phone, send.sms_content);
      success = result.success;
    } else if (recipient.channel === 'email' && recipient.player_email && send.email_content) {
      const result = await sendEmail(recipient.player_email, send.email_subject || '', send.email_content);
      success = result.success;
    }

    if (success) {
      await query(
        `UPDATE message_recipients SET status = 'sent', sent_at = NOW(), error = NULL WHERE id = $1`,
        [recipient.id]
      );
      succeeded++;
    } else {
      stillFailed++;
    }
  }

  // Update send counts
  await query(
    `UPDATE message_sends
     SET sent_count = sent_count + $1, failed_count = failed_count - $1
     WHERE id = $2`,
    [succeeded, sendId]
  );

  return { retried: failedResult.rows.length, succeeded, failed: stillFailed };
}
