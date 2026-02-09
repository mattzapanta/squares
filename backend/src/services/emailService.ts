import { config } from '../config.js';
import { query } from '../db/index.js';

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Check if Resend is configured
export function isEmailEnabled(): boolean {
  return !!config.resend.apiKey;
}

// Send email via Resend
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<EmailResult> {
  if (!isEmailEnabled()) {
    console.log('[Email] Resend not configured, skipping email');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.resend.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SquaresHQ <noreply@squareshq.com>', // Update with your verified domain
        to: [to],
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      }),
    });

    const data = await response.json() as { id?: string; message?: string };

    if (response.ok) {
      console.log(`[Email] Sent to ${to}: ${data.id}`);
      return { success: true, messageId: data.id };
    } else {
      console.error(`[Email] Failed to ${to}:`, data);
      return { success: false, error: data.message || 'Failed to send' };
    }
  } catch (error) {
    console.error('[Email] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Send bulk emails
export async function sendBulkEmails(
  recipients: { email: string; playerId: string; playerName: string }[],
  subject: string,
  htmlTemplate: (name: string) => string,
  poolId?: string
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    if (!recipient.email) {
      failed++;
      continue;
    }

    const html = htmlTemplate(recipient.playerName);
    const result = await sendEmail(recipient.email, subject, html);

    if (result.success) {
      sent++;
      if (poolId) {
        await query(
          `INSERT INTO pool_invites (pool_id, player_id, channel, status, sent_at)
           VALUES ($1, $2, 'email', 'sent', NOW())
           ON CONFLICT (pool_id, player_id) DO UPDATE SET status = 'sent', sent_at = NOW()`,
          [poolId, recipient.playerId]
        );
      }
    } else {
      failed++;
      if (poolId) {
        await query(
          `INSERT INTO pool_invites (pool_id, player_id, channel, status, error)
           VALUES ($1, $2, 'email', 'failed', $3)
           ON CONFLICT (pool_id, player_id) DO UPDATE SET status = 'failed', error = $3`,
          [poolId, recipient.playerId, result.error]
        );
      }
    }

    // Rate limiting - Resend allows 10/sec on free tier
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  return { sent, failed };
}

// Email Templates
export function generatePoolInviteEmail(
  playerName: string,
  poolName: string,
  awayTeam: string,
  homeTeam: string,
  denomination: number,
  gameDate: string | null,
  gameTime: string | null,
  sport: string,
  magicLink: string
): string {
  const sportEmoji = {
    nfl: '🏈', nba: '🏀', nhl: '🏒', mlb: '⚾',
    ncaaf: '🏈', ncaab: '🏀', soccer: '⚽', custom: '🎲'
  }[sport] || '🎲';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%); border: 1px solid #2a2a2a; border-radius: 16px; padding: 32px; text-align: center;">

      <div style="font-size: 48px; margin-bottom: 16px;">${sportEmoji}</div>

      <h1 style="color: #4ADE80; font-size: 24px; margin: 0 0 8px 0; font-weight: 800;">
        You're Invited!
      </h1>

      <p style="color: #888; font-size: 14px; margin: 0 0 24px 0;">
        Hey ${playerName}, you've been invited to join a squares pool
      </p>

      <div style="background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <div style="color: #fff; font-size: 20px; font-weight: 700; margin-bottom: 8px;">
          ${awayTeam} vs ${homeTeam}
        </div>
        <div style="color: #4ADE80; font-size: 28px; font-weight: 800; margin-bottom: 8px;">
          $${denomination}/square
        </div>
        ${gameDate ? `<div style="color: #888; font-size: 14px;">${gameDate}${gameTime ? ` at ${gameTime}` : ''}</div>` : ''}
      </div>

      <a href="${magicLink}" style="display: inline-block; background: linear-gradient(135deg, #4ADE80 0%, #22D3EE 100%); color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 16px;">
        Join Pool & Pick Squares
      </a>

      <p style="color: #555; font-size: 12px; margin-top: 24px;">
        Pool: ${poolName}<br>
        Total pot: $${denomination * 100}
      </p>

    </div>

    <p style="color: #444; font-size: 11px; text-align: center; margin-top: 16px;">
      Sent by SquaresHQ
    </p>
  </div>
</body>
</html>
`;
}

export function generateWinnerEmail(
  playerName: string,
  poolName: string,
  awayTeam: string,
  homeTeam: string,
  periodLabel: string,
  awayScore: number,
  homeScore: number,
  payoutAmount: number,
  tipSuggestion: number,
  magicLink: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%); border: 1px solid #2a2a2a; border-radius: 16px; padding: 32px; text-align: center;">

      <div style="font-size: 64px; margin-bottom: 16px;">🏆</div>

      <h1 style="color: #FBBF24; font-size: 28px; margin: 0 0 8px 0; font-weight: 800;">
        YOU WON!
      </h1>

      <p style="color: #888; font-size: 14px; margin: 0 0 24px 0;">
        Congrats ${playerName}!
      </p>

      <div style="background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <div style="color: #4ADE80; font-size: 36px; font-weight: 800; margin-bottom: 8px;">
          $${payoutAmount}
        </div>
        <div style="color: #888; font-size: 14px; margin-bottom: 16px;">
          ${periodLabel} Winner
        </div>
        <div style="color: #fff; font-size: 16px;">
          ${awayTeam} <span style="color: #60A5FA;">${awayScore}</span> -
          <span style="color: #FBBF24;">${homeScore}</span> ${homeTeam}
        </div>
      </div>

      <div style="background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 24px;">
        <div style="color: #FBBF24; font-size: 12px;">Suggested tip to the house</div>
        <div style="color: #FBBF24; font-size: 20px; font-weight: 700;">$${tipSuggestion}</div>
      </div>

      <a href="${magicLink}" style="display: inline-block; background: #FBBF24; color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 16px;">
        View Details
      </a>

      <p style="color: #555; font-size: 12px; margin-top: 24px;">
        Pool: ${poolName}
      </p>

    </div>
  </div>
</body>
</html>
`;
}

export function generateReminderEmail(
  playerName: string,
  poolName: string,
  awayTeam: string,
  homeTeam: string,
  squaresRemaining: number,
  deadline: string | null,
  magicLink: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%); border: 1px solid #2a2a2a; border-radius: 16px; padding: 32px; text-align: center;">

      <div style="font-size: 48px; margin-bottom: 16px;">⏰</div>

      <h1 style="color: #FB923C; font-size: 24px; margin: 0 0 8px 0; font-weight: 800;">
        Don't Miss Out!
      </h1>

      <p style="color: #888; font-size: 14px; margin: 0 0 24px 0;">
        Hey ${playerName}, squares are filling up fast
      </p>

      <div style="background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <div style="color: #fff; font-size: 18px; font-weight: 700; margin-bottom: 8px;">
          ${awayTeam} vs ${homeTeam}
        </div>
        <div style="color: #FB923C; font-size: 32px; font-weight: 800; margin-bottom: 8px;">
          ${squaresRemaining} left
        </div>
        ${deadline ? `<div style="color: #888; font-size: 14px;">Deadline: ${deadline}</div>` : ''}
      </div>

      <a href="${magicLink}" style="display: inline-block; background: #FB923C; color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 16px;">
        Claim Your Squares
      </a>

      <p style="color: #555; font-size: 12px; margin-top: 24px;">
        Pool: ${poolName}
      </p>

    </div>
  </div>
</body>
</html>
`;
}
