import { config } from '../config.js';
import { query } from '../db/index.js';

interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Check if SMS is configured (either Telnyx or Twilio)
export function isSMSEnabled(): boolean {
  if (config.sms.provider === 'telnyx') {
    return !!(config.sms.telnyxApiKey && config.sms.telnyxPhoneNumber);
  } else {
    return !!(config.sms.twilioAccountSid && config.sms.twilioAuthToken && config.sms.twilioPhoneNumber);
  }
}

// Normalize phone number for US
function normalizePhone(phone: string): string {
  let normalized = phone.replace(/\D/g, '');
  if (normalized.length === 10) {
    normalized = '1' + normalized; // Add US country code
  }
  if (!normalized.startsWith('+')) {
    normalized = '+' + normalized;
  }
  return normalized;
}

// Send SMS via Telnyx (cheaper - $0.004/msg)
async function sendViaTelnyx(to: string, body: string): Promise<SMSResult> {
  try {
    const response = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.sms.telnyxApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.sms.telnyxPhoneNumber,
        to,
        text: body,
      }),
    });

    const data = await response.json() as { data?: { id?: string }; errors?: { detail?: string }[] };

    if (response.ok) {
      console.log(`[SMS/Telnyx] Sent to ${to}: ${data.data?.id}`);
      return { success: true, messageId: data.data?.id };
    } else {
      console.error(`[SMS/Telnyx] Failed to ${to}:`, data);
      return { success: false, error: data.errors?.[0]?.detail || 'Failed to send' };
    }
  } catch (error) {
    console.error('[SMS/Telnyx] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Send SMS via Twilio (fallback - $0.0079/msg)
async function sendViaTwilio(to: string, body: string): Promise<SMSResult> {
  try {
    const auth = Buffer.from(`${config.sms.twilioAccountSid}:${config.sms.twilioAuthToken}`).toString('base64');

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.sms.twilioAccountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          From: config.sms.twilioPhoneNumber,
          Body: body,
        }),
      }
    );

    const data = await response.json() as { sid?: string; message?: string };

    if (response.ok) {
      console.log(`[SMS/Twilio] Sent to ${to}: ${data.sid}`);
      return { success: true, messageId: data.sid };
    } else {
      console.error(`[SMS/Twilio] Failed to ${to}:`, data.message);
      return { success: false, error: data.message };
    }
  } catch (error) {
    console.error('[SMS/Twilio] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Send SMS using configured provider
export async function sendSMS(to: string, body: string): Promise<SMSResult> {
  if (!isSMSEnabled()) {
    console.log('[SMS] Not configured, skipping SMS');
    return { success: false, error: 'SMS not configured' };
  }

  const phone = normalizePhone(to);

  if (config.sms.provider === 'telnyx') {
    return sendViaTelnyx(phone, body);
  } else {
    return sendViaTwilio(phone, body);
  }
}

// Send bulk SMS to multiple recipients
export async function sendBulkSMS(
  recipients: { phone: string; playerId: string; playerName?: string }[],
  messageTemplate: string | ((name: string) => string),
  poolId?: string
): Promise<{ sent: number; failed: number; results: { playerId: string; success: boolean; error?: string }[] }> {
  const results: { playerId: string; success: boolean; error?: string }[] = [];
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    if (!recipient.phone) {
      results.push({ playerId: recipient.playerId, success: false, error: 'No phone number' });
      failed++;
      continue;
    }

    // Check if player opted out
    const optedOut = await query(
      'SELECT sms_opted_out FROM players WHERE id = $1',
      [recipient.playerId]
    );

    if (optedOut.rows[0]?.sms_opted_out) {
      results.push({ playerId: recipient.playerId, success: false, error: 'Opted out' });
      failed++;
      continue;
    }

    // Get the message - either a string or a function that takes a name
    const message = typeof messageTemplate === 'function'
      ? messageTemplate(recipient.playerName || 'there')
      : messageTemplate;

    const result = await sendSMS(recipient.phone, message);

    if (result.success) {
      sent++;
      results.push({ playerId: recipient.playerId, success: true });

      if (poolId) {
        await query(
          `INSERT INTO pool_invites (pool_id, player_id, channel, status, sent_at)
           VALUES ($1, $2, 'sms', 'sent', NOW())
           ON CONFLICT (pool_id, player_id) DO UPDATE SET status = 'sent', sent_at = NOW()`,
          [poolId, recipient.playerId]
        );
      }
    } else {
      failed++;
      results.push({ playerId: recipient.playerId, success: false, error: result.error });

      if (poolId) {
        await query(
          `INSERT INTO pool_invites (pool_id, player_id, channel, status, error)
           VALUES ($1, $2, 'sms', 'failed', $3)
           ON CONFLICT (pool_id, player_id) DO UPDATE SET status = 'failed', error = $3`,
          [poolId, recipient.playerId, result.error]
        );
      }
    }

    // Rate limiting
    const delay = config.sms.provider === 'telnyx' ? 100 : 1100; // Telnyx is faster
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  return { sent, failed, results };
}

// Generate pool invite message
export function generatePoolInviteMessage(
  poolName: string,
  awayTeam: string,
  homeTeam: string,
  denomination: number,
  gameDate: string | null,
  magicLink: string
): string {
  let message = `🎲 NEW POOL: ${awayTeam} vs ${homeTeam}\n`;
  message += `💰 $${denomination}/square\n`;
  if (gameDate) {
    message += `📅 ${gameDate}\n`;
  }
  message += `\nJoin now: ${magicLink}`;
  message += `\n\nReply STOP to opt out`;

  return message;
}

// Generate square confirmation message
export function generateSquareConfirmationMessage(
  playerName: string,
  poolName: string,
  awayTeam: string,
  homeTeam: string,
  squareCount: number,
  squareList: string,
  denomination: number,
  status: 'claimed' | 'pending'
): string {
  const totalCost = squareCount * denomination;

  if (status === 'claimed') {
    return `✅ ${playerName}, your ${squareCount} square${squareCount > 1 ? 's' : ''} confirmed!\n` +
           `🎲 ${awayTeam} vs ${homeTeam}\n` +
           `📍 ${squareList}\n` +
           `💰 Total: $${totalCost}`;
  } else {
    return `⏳ ${playerName}, ${squareCount} square${squareCount > 1 ? 's' : ''} pending approval\n` +
           `🎲 ${awayTeam} vs ${homeTeam}\n` +
           `📍 ${squareList}\n` +
           `The admin will review your request.`;
  }
}

// Generate batch confirmation message (some claimed, some pending)
export function generateBatchConfirmationMessage(
  playerName: string,
  poolName: string,
  claimedCount: number,
  pendingCount: number,
  denomination: number
): string {
  let message = `Hey ${playerName}!\n\n`;

  if (claimedCount > 0) {
    message += `✅ ${claimedCount} square${claimedCount > 1 ? 's' : ''} confirmed ($${claimedCount * denomination})\n`;
  }
  if (pendingCount > 0) {
    message += `⏳ ${pendingCount} square${pendingCount > 1 ? 's' : ''} awaiting approval\n`;
  }

  message += `\nPool: ${poolName}`;
  return message;
}

// Generate approval notification
export function generateApprovalMessage(
  playerName: string,
  poolName: string,
  squareCount: number,
  denomination: number
): string {
  return `🎉 ${playerName}, ${squareCount} square${squareCount > 1 ? 's' : ''} approved!\n` +
         `💰 Total: $${squareCount * denomination}\n` +
         `Pool: ${poolName}`;
}

// Generate rejection notification
export function generateRejectionMessage(
  playerName: string,
  poolName: string,
  squareCount: number
): string {
  return `😔 ${playerName}, ${squareCount} square${squareCount > 1 ? 's' : ''} not approved.\n` +
         `These squares are now available for others.\n` +
         `Pool: ${poolName}`;
}

// Generate winner notification message
export function generateWinnerMessage(
  playerName: string,
  poolName: string,
  periodLabel: string,
  payoutAmount: number,
  tipSuggestion: number
): string {
  return `🏆 Congrats ${playerName}! You won $${payoutAmount} on ${periodLabel}!\n` +
         `Suggested tip: $${tipSuggestion}\n` +
         `Pool: ${poolName}`;
}

// Generate reminder message
export function generateReminderMessage(
  poolName: string,
  squaresRemaining: number,
  deadline: string | null,
  magicLink: string
): string {
  let message = `⏰ ${poolName}: ${squaresRemaining} squares left!\n`;
  if (deadline) {
    message += `Deadline: ${deadline}\n`;
  }
  message += `\nClaim yours: ${magicLink}`;

  return message;
}

// Handle STOP opt-out (would be called by webhook)
export async function handleOptOut(phone: string): Promise<void> {
  const normalizedPhone = phone.replace(/\D/g, '');

  await query(
    `UPDATE players
     SET sms_opted_out = true, sms_opted_out_at = NOW()
     WHERE phone LIKE $1`,
    [`%${normalizedPhone.slice(-10)}`] // Match last 10 digits
  );

  console.log(`[SMS] Player opted out: ${phone}`);
}
