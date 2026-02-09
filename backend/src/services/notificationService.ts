import { query } from '../db/index.js';
import { sendEmail, isEmailEnabled } from './emailService.js';
import { sendSMS, isSMSEnabled, generateSquareConfirmationMessage, generateBatchConfirmationMessage, generateApprovalMessage, generateRejectionMessage } from './smsService.js';
import { config } from '../config.js';
import { Pool, Player } from '../types/index.js';

// Generate magic link for player
function generateMagicLink(playerToken: string, poolId?: string): string {
  const baseUrl = config.frontendUrl;
  if (poolId) {
    return `${baseUrl}/p/${playerToken}?pool=${poolId}`;
  }
  return `${baseUrl}/p/${playerToken}`;
}

interface NotifyResult {
  success: boolean;
  channel?: 'sms' | 'email' | 'none';
  error?: string;
}

// Send notification - SMS primary, email fallback
export async function sendNotification(
  playerId: string,
  subject: string,
  smsMessage: string,
  htmlEmail: string
): Promise<NotifyResult> {
  // Get player details
  const playerResult = await query<Player>(
    'SELECT * FROM players WHERE id = $1',
    [playerId]
  );

  if (playerResult.rows.length === 0) {
    return { success: false, error: 'Player not found' };
  }

  const player = playerResult.rows[0];

  // Try SMS first (primary)
  if (player.phone && isSMSEnabled()) {
    const smsResult = await sendSMS(player.phone, smsMessage);
    if (smsResult.success) {
      return { success: true, channel: 'sms' };
    }
    console.log(`[Notification] SMS failed for ${player.name}, trying email fallback`);
  }

  // Fallback to email
  if (player.email && isEmailEnabled()) {
    const emailResult = await sendEmail(player.email, subject, htmlEmail);
    if (emailResult.success) {
      return { success: true, channel: 'email' };
    }
  }

  // Neither worked
  if (!player.phone && !player.email) {
    return { success: false, channel: 'none', error: 'No contact info' };
  }

  return { success: false, error: 'All channels failed' };
}

// Send confirmation when squares are claimed
export async function sendSquareClaimedNotification(
  playerId: string,
  poolId: string,
  squares: { row: number; col: number }[],
  status: 'claimed' | 'pending'
): Promise<NotifyResult> {
  try {
    // Get player details
    const playerResult = await query<Player>(
      'SELECT * FROM players WHERE id = $1',
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      return { success: false, error: 'Player not found' };
    }

    const player = playerResult.rows[0];

    // Get pool details
    const poolResult = await query<Pool>(
      'SELECT * FROM pools WHERE id = $1',
      [poolId]
    );

    if (poolResult.rows.length === 0) {
      return { success: false, error: 'Pool not found' };
    }

    const pool = poolResult.rows[0];
    const magicLink = generateMagicLink(player.auth_token, poolId);

    // Format square positions
    const squareList = squares.map(s => `R${s.row + 1}C${s.col + 1}`).join(', ');
    const squareCount = squares.length;

    // SMS message (primary)
    const smsMessage = generateSquareConfirmationMessage(
      player.name,
      pool.name,
      pool.away_team,
      pool.home_team,
      squareCount,
      squareList,
      pool.denomination,
      status
    );

    // Email HTML (fallback)
    const subject = status === 'claimed'
      ? `Squares Confirmed - ${pool.name}`
      : `Squares Pending Approval - ${pool.name}`;

    const html = generateSquareEmailHtml(
      player.name,
      pool.name,
      pool.away_team,
      pool.home_team,
      squareCount,
      squareList,
      pool.denomination,
      pool.approval_threshold,
      status,
      magicLink
    );

    return sendNotification(playerId, subject, smsMessage, html);
  } catch (error) {
    console.error('[Notification] Error sending square notification:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Send batch notification for multiple squares claimed at once
export async function sendBatchSquareNotification(
  playerId: string,
  poolId: string,
  claimedSquares: { row: number; col: number }[],
  pendingSquares: { row: number; col: number }[]
): Promise<NotifyResult> {
  try {
    const playerResult = await query<Player>('SELECT * FROM players WHERE id = $1', [playerId]);
    if (playerResult.rows.length === 0) {
      return { success: false, error: 'Player not found' };
    }

    const player = playerResult.rows[0];
    const poolResult = await query<Pool>('SELECT * FROM pools WHERE id = $1', [poolId]);
    if (poolResult.rows.length === 0) {
      return { success: false, error: 'Pool not found' };
    }

    const pool = poolResult.rows[0];
    const magicLink = generateMagicLink(player.auth_token, poolId);

    // SMS message
    const smsMessage = generateBatchConfirmationMessage(
      player.name,
      pool.name,
      claimedSquares.length,
      pendingSquares.length,
      pool.denomination
    );

    // Email HTML
    const subject = `Squares Update - ${pool.name}`;
    const html = generateBatchSquareEmailHtml(
      player.name,
      pool.name,
      pool.away_team,
      pool.home_team,
      claimedSquares,
      pendingSquares,
      pool.approval_threshold,
      pool.denomination,
      magicLink
    );

    return sendNotification(playerId, subject, smsMessage, html);
  } catch (error) {
    console.error('[Notification] Batch notification error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Send notification when squares are approved
export async function sendSquareApprovedNotification(
  playerId: string,
  poolId: string,
  squares: { row: number; col: number }[]
): Promise<NotifyResult> {
  try {
    const playerResult = await query<Player>('SELECT * FROM players WHERE id = $1', [playerId]);
    if (playerResult.rows.length === 0) {
      return { success: false, error: 'Player not found' };
    }

    const player = playerResult.rows[0];
    const poolResult = await query<Pool>('SELECT * FROM pools WHERE id = $1', [poolId]);
    if (poolResult.rows.length === 0) {
      return { success: false, error: 'Pool not found' };
    }

    const pool = poolResult.rows[0];
    const magicLink = generateMagicLink(player.auth_token, poolId);
    const squareList = squares.map(s => `R${s.row + 1}C${s.col + 1}`).join(', ');

    // SMS message
    const smsMessage = generateApprovalMessage(
      player.name,
      pool.name,
      squares.length,
      pool.denomination
    );

    // Email
    const subject = `Squares Approved! - ${pool.name}`;
    const html = generateApprovalEmailHtml(
      player.name,
      pool,
      squares.length,
      squareList,
      magicLink
    );

    return sendNotification(playerId, subject, smsMessage, html);
  } catch (error) {
    console.error('[Notification] Approval notification error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Send notification when squares are rejected
export async function sendSquareRejectedNotification(
  playerId: string,
  poolId: string,
  squares: { row: number; col: number }[]
): Promise<NotifyResult> {
  try {
    const playerResult = await query<Player>('SELECT * FROM players WHERE id = $1', [playerId]);
    if (playerResult.rows.length === 0) {
      return { success: false, error: 'Player not found' };
    }

    const player = playerResult.rows[0];
    const poolResult = await query<Pool>('SELECT * FROM pools WHERE id = $1', [poolId]);
    if (poolResult.rows.length === 0) {
      return { success: false, error: 'Pool not found' };
    }

    const pool = poolResult.rows[0];
    const magicLink = generateMagicLink(player.auth_token, poolId);

    // SMS message
    const smsMessage = generateRejectionMessage(
      player.name,
      pool.name,
      squares.length
    );

    // Email
    const subject = `Squares Not Approved - ${pool.name}`;
    const html = generateRejectionEmailHtml(
      player.name,
      pool,
      squares.length,
      magicLink
    );

    return sendNotification(playerId, subject, smsMessage, html);
  } catch (error) {
    console.error('[Notification] Rejection notification error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ================== HTML Email Templates ==================

function generateSquareEmailHtml(
  playerName: string,
  poolName: string,
  awayTeam: string,
  homeTeam: string,
  squareCount: number,
  squareList: string,
  denomination: number,
  approvalThreshold: number,
  status: 'claimed' | 'pending',
  magicLink: string
): string {
  const totalCost = squareCount * denomination;
  const emoji = status === 'claimed' ? '✅' : '⏳';
  const color = status === 'claimed' ? '#4ADE80' : '#A855F7';
  const title = status === 'claimed' ? 'Squares Confirmed!' : 'Squares Pending Approval';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%); border: 1px solid #2a2a2a; border-radius: 16px; padding: 32px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">${emoji}</div>
      <h1 style="color: ${color}; font-size: 24px; margin: 0 0 8px 0; font-weight: 800;">${title}</h1>
      <p style="color: #888; font-size: 14px; margin: 0 0 24px 0;">Hey ${playerName}!</p>
      <div style="background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <div style="color: #fff; font-size: 18px; font-weight: 700; margin-bottom: 12px;">${awayTeam} vs ${homeTeam}</div>
        <div style="color: ${color}; font-size: 28px; font-weight: 800; margin-bottom: 8px;">${squareCount} Square${squareCount > 1 ? 's' : ''}</div>
        <div style="color: #888; font-size: 13px; margin-bottom: 12px;">${squareList}</div>
        ${status === 'claimed' ? `<div style="color: #FBBF24; font-size: 16px; font-weight: 600;">Total: $${totalCost}</div>` : ''}
      </div>
      ${status === 'pending' ? `<div style="background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 24px;"><div style="color: #A855F7; font-size: 12px;">Squares beyond your first ${approvalThreshold} require admin approval.</div></div>` : ''}
      <a href="${magicLink}" style="display: inline-block; background: ${status === 'claimed' ? 'linear-gradient(135deg, #4ADE80 0%, #22D3EE 100%)' : '#A855F7'}; color: ${status === 'claimed' ? '#000' : '#fff'}; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 16px;">View Your Squares</a>
      <p style="color: #555; font-size: 12px; margin-top: 24px;">Pool: ${poolName}</p>
    </div>
  </div>
</body>
</html>`;
}

function generateBatchSquareEmailHtml(
  playerName: string,
  poolName: string,
  awayTeam: string,
  homeTeam: string,
  claimedSquares: { row: number; col: number }[],
  pendingSquares: { row: number; col: number }[],
  approvalThreshold: number,
  denomination: number,
  magicLink: string
): string {
  const claimedList = claimedSquares.map(s => `R${s.row + 1}C${s.col + 1}`).join(', ');
  const pendingList = pendingSquares.map(s => `R${s.row + 1}C${s.col + 1}`).join(', ');
  const totalCost = claimedSquares.length * denomination;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%); border: 1px solid #2a2a2a; border-radius: 16px; padding: 32px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">🎲</div>
      <h1 style="color: #fff; font-size: 24px; margin: 0 0 8px 0; font-weight: 800;">Squares Update</h1>
      <p style="color: #888; font-size: 14px; margin: 0 0 24px 0;">Hey ${playerName}!</p>
      <div style="background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <div style="color: #fff; font-size: 18px; font-weight: 700; margin-bottom: 16px;">${awayTeam} vs ${homeTeam}</div>
        ${claimedSquares.length > 0 ? `<div style="margin-bottom: 16px;"><div style="color: #4ADE80; font-size: 14px; font-weight: 600; margin-bottom: 4px;">✅ ${claimedSquares.length} Confirmed</div><div style="color: #888; font-size: 12px;">${claimedList}</div><div style="color: #FBBF24; font-size: 14px; margin-top: 8px;">Total: $${totalCost}</div></div>` : ''}
        ${pendingSquares.length > 0 ? `<div><div style="color: #A855F7; font-size: 14px; font-weight: 600; margin-bottom: 4px;">⏳ ${pendingSquares.length} Pending Approval</div><div style="color: #888; font-size: 12px;">${pendingList}</div></div>` : ''}
      </div>
      ${pendingSquares.length > 0 ? `<div style="background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 24px;"><div style="color: #A855F7; font-size: 12px;">Squares beyond your first ${approvalThreshold} require admin approval.</div></div>` : ''}
      <a href="${magicLink}" style="display: inline-block; background: linear-gradient(135deg, #4ADE80 0%, #22D3EE 100%); color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 16px;">View Your Squares</a>
      <p style="color: #555; font-size: 12px; margin-top: 24px;">Pool: ${poolName}</p>
    </div>
  </div>
</body>
</html>`;
}

function generateApprovalEmailHtml(
  playerName: string,
  pool: Pool,
  squareCount: number,
  squareList: string,
  magicLink: string
): string {
  const totalCost = squareCount * pool.denomination;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%); border: 1px solid #2a2a2a; border-radius: 16px; padding: 32px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
      <h1 style="color: #4ADE80; font-size: 24px; margin: 0 0 8px 0; font-weight: 800;">Squares Approved!</h1>
      <p style="color: #888; font-size: 14px; margin: 0 0 24px 0;">Great news ${playerName}!</p>
      <div style="background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <div style="color: #fff; font-size: 18px; font-weight: 700; margin-bottom: 12px;">${pool.away_team} vs ${pool.home_team}</div>
        <div style="color: #4ADE80; font-size: 28px; font-weight: 800; margin-bottom: 8px;">${squareCount} Square${squareCount > 1 ? 's' : ''} Approved</div>
        <div style="color: #888; font-size: 13px; margin-bottom: 12px;">${squareList}</div>
        <div style="color: #FBBF24; font-size: 16px; font-weight: 600;">Total Due: $${totalCost}</div>
      </div>
      <a href="${magicLink}" style="display: inline-block; background: linear-gradient(135deg, #4ADE80 0%, #22D3EE 100%); color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 16px;">View Your Squares</a>
      <p style="color: #555; font-size: 12px; margin-top: 24px;">Pool: ${pool.name}</p>
    </div>
  </div>
</body>
</html>`;
}

function generateRejectionEmailHtml(
  playerName: string,
  pool: Pool,
  squareCount: number,
  magicLink: string
): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%); border: 1px solid #2a2a2a; border-radius: 16px; padding: 32px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">😔</div>
      <h1 style="color: #EF4444; font-size: 24px; margin: 0 0 8px 0; font-weight: 800;">Squares Not Approved</h1>
      <p style="color: #888; font-size: 14px; margin: 0 0 24px 0;">Sorry ${playerName}</p>
      <div style="background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <div style="color: #fff; font-size: 18px; font-weight: 700; margin-bottom: 12px;">${pool.away_team} vs ${pool.home_team}</div>
        <div style="color: #EF4444; font-size: 18px; font-weight: 600; margin-bottom: 8px;">${squareCount} Square${squareCount > 1 ? 's' : ''} Released</div>
      </div>
      <p style="color: #888; font-size: 13px; margin-bottom: 24px;">These squares are now available for others. Contact the admin if you have questions.</p>
      <a href="${magicLink}" style="display: inline-block; background: #333; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 16px;">View Pool</a>
      <p style="color: #555; font-size: 12px; margin-top: 24px;">Pool: ${pool.name}</p>
    </div>
  </div>
</body>
</html>`;
}
