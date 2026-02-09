import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { SPORTS_CONFIG } from '../types';

const API_BASE = '/api';

interface PlayerData {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

interface PoolSummary {
  id: string;
  name: string;
  sport: string;
  away_team: string;
  home_team: string;
  denomination: number;
  status: string;
  game_date: string | null;
  game_time: string | null;
  my_squares: number;
  claimed_count: number;
  paid: boolean;
  payment_status: string;
}

interface GridCell {
  player_id: string | null;
  player_name: string | null;
  claim_status: 'available' | 'pending' | 'claimed';
}

interface PoolDetailView {
  pool: {
    id: string;
    name: string;
    sport: string;
    away_team: string;
    home_team: string;
    denomination: number;
    status: string;
    col_digits: number[] | null;
    row_digits: number[] | null;
    max_per_player: number;
    game_date: string | null;
    game_time: string | null;
  };
  grid: (GridCell | null)[][];
  scores: { period_key: string; period_label: string; away_score: number; home_score: number; payout_pct: number }[];
  winners: { period_key: string; player_id: string; player_name: string; square_row: number; square_col: number; payout_amount: number }[];
  mySquares: { row_idx: number; col_idx: number }[];
  membership: { paid: boolean; payment_status: string };
}

async function fetchPlayerData(token: string): Promise<{ player: PlayerData; pools: PoolSummary[]; balance: number }> {
  const res = await fetch(`${API_BASE}/p/${token}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Invalid or expired link' }));
    throw new Error(err.error || 'Failed to load');
  }
  return res.json();
}

async function fetchPoolDetail(token: string, poolId: string): Promise<PoolDetailView> {
  const res = await fetch(`${API_BASE}/p/${token}/pools/${poolId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to load pool' }));
    throw new Error(err.error || 'Failed to load pool');
  }
  return res.json();
}

async function claimSquare(token: string, poolId: string, row: number, col: number): Promise<{ message: string; status: string }> {
  const res = await fetch(`${API_BASE}/p/${token}/pools/${poolId}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row, col }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to claim' }));
    throw new Error(err.error || 'Failed to claim square');
  }
  return res.json();
}

async function releaseSquare(token: string, poolId: string, row: number, col: number): Promise<{ message: string; refundAmount: number; refundedToWallet: boolean }> {
  const res = await fetch(`${API_BASE}/p/${token}/pools/${poolId}/release`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row, col }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to release' }));
    throw new Error(err.error || 'Failed to release square');
  }
  return res.json();
}

export default function PlayerPortal() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const initialPoolId = searchParams.get('pool');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [pools, setPools] = useState<PoolSummary[]>([]);
  const [balance, setBalance] = useState(0);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(initialPoolId);
  const [poolDetail, setPoolDetail] = useState<PoolDetailView | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [releasing, setReleasing] = useState<string | null>(null); // "row-col" of square being released
  const [claimMessage, setClaimMessage] = useState<{ success: boolean; text: string } | null>(null);
  const [showLedger, setShowLedger] = useState(false);
  const [ledgerEntries, setLedgerEntries] = useState<{ id: string; type: string; amount: number; description: string; pool_name: string; created_at: string }[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Load player data
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchPlayerData(token)
      .then(data => {
        setPlayer(data.player);
        setPools(data.pools);
        setBalance(data.balance);
        // Auto-select first pool or the one from URL
        if (data.pools.length > 0 && !selectedPoolId) {
          setSelectedPoolId(data.pools[0].id);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  // Load pool detail when selected
  useEffect(() => {
    if (!token || !selectedPoolId) return;
    fetchPoolDetail(token, selectedPoolId)
      .then(setPoolDetail)
      .catch(err => console.error('Failed to load pool detail:', err));
  }, [token, selectedPoolId]);

  const handleClaimSquare = async (row: number, col: number) => {
    if (!token || !selectedPoolId || claiming) return;
    setClaiming(true);
    setClaimMessage(null);
    try {
      const result = await claimSquare(token, selectedPoolId, row, col);
      setClaimMessage({ success: true, text: result.message });
      // Reload pool detail
      const updated = await fetchPoolDetail(token, selectedPoolId);
      setPoolDetail(updated);
      // Reload pools list
      const data = await fetchPlayerData(token);
      setPools(data.pools);
    } catch (err) {
      setClaimMessage({ success: false, text: err instanceof Error ? err.message : 'Failed to claim' });
    } finally {
      setClaiming(false);
    }
  };

  const handleReleaseSquare = async (row: number, col: number) => {
    if (!token || !selectedPoolId || releasing) return;
    if (!confirm(`Release this square? ${poolDetail?.membership.paid ? 'You will receive a refund to your wallet.' : ''}`)) return;

    setReleasing(`${row}-${col}`);
    setClaimMessage(null);
    try {
      const result = await releaseSquare(token, selectedPoolId, row, col);
      const msg = result.refundedToWallet
        ? `Square released! $${result.refundAmount} credited to your wallet.`
        : result.message;
      setClaimMessage({ success: true, text: msg });
      // Reload pool detail
      const updated = await fetchPoolDetail(token, selectedPoolId);
      setPoolDetail(updated);
      // Reload pools list and balance
      const data = await fetchPlayerData(token);
      setPools(data.pools);
      setBalance(data.balance);
    } catch (err) {
      setClaimMessage({ success: false, text: err instanceof Error ? err.message : 'Failed to release' });
    } finally {
      setReleasing(null);
    }
  };

  const handleShowLedger = async () => {
    if (!token) return;
    setShowLedger(true);
    setLoadingLedger(true);
    try {
      const res = await fetch(`${API_BASE}/p/${token}/ledger`);
      if (!res.ok) throw new Error('Failed to load ledger');
      const data = await res.json();
      setLedgerEntries(data.entries || []);
    } catch (err) {
      console.error('Failed to load ledger:', err);
    } finally {
      setLoadingLedger(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎲</div>
          <div>Loading your squares...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
          <h2 style={{ color: 'var(--text)', marginBottom: 8 }}>Link Not Valid</h2>
          <p style={{ color: 'var(--muted)' }}>{error}</p>
          <p style={{ color: 'var(--dim)', fontSize: 12, marginTop: 16 }}>
            This link may have expired or is incorrect. Contact the pool admin for a new invite.
          </p>
        </div>
      </div>
    );
  }

  const sc = poolDetail ? SPORTS_CONFIG[poolDetail.pool.sport as keyof typeof SPORTS_CONFIG] : null;
  const isLocked = poolDetail?.pool.status !== 'open';
  const mySquareCount = poolDetail?.mySquares.length || 0;
  const maxReached = poolDetail && mySquareCount >= poolDetail.pool.max_per_player;

  // Player colors for grid
  const playerColors: Record<string, string> = {};
  const colors = ['#4ADE80', '#60A5FA', '#FBBF24', '#A78BFA', '#F472B6', '#FB923C', '#22D3EE', '#F87171', '#818CF8', '#A3E635'];
  if (poolDetail) {
    const uniquePlayers = new Set<string>();
    poolDetail.grid.flat().forEach(cell => {
      if (cell && cell.player_id) uniquePlayers.add(cell.player_id);
    });
    Array.from(uniquePlayers).forEach((id, i) => {
      playerColors[id] = colors[i % colors.length];
    });
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '16px 24px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
              SquaresHQ
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Welcome, {player?.name}
            </div>
          </div>
          <div
            onClick={handleShowLedger}
            style={{ textAlign: 'right', cursor: 'pointer', padding: '4px 8px', borderRadius: 8, transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>BALANCE ▼</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: balance >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}>
              ${balance}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
        {/* Pool tabs */}
        {pools.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
            {pools.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPoolId(p.id)}
                style={{
                  background: selectedPoolId === p.id ? 'var(--green)' : 'var(--surface)',
                  color: selectedPoolId === p.id ? 'var(--bg)' : 'var(--muted)',
                  border: `1px solid ${selectedPoolId === p.id ? 'var(--green)' : 'var(--border)'}`,
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                {p.away_team} vs {p.home_team}
                <span style={{ marginLeft: 6, opacity: 0.7 }}>({p.my_squares} sq)</span>
              </button>
            ))}
          </div>
        )}

        {/* Pool detail */}
        {poolDetail && (
          <>
            {/* Pool header */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, fontFamily: 'var(--font-mono)' }}>
                    {poolDetail.pool.away_team} vs {poolDetail.pool.home_team}
                  </h2>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    {sc?.name} • ${poolDetail.pool.denomination}/square
                    {poolDetail.pool.game_date && ` • ${new Date(poolDetail.pool.game_date).toLocaleDateString()}`}
                    {poolDetail.pool.game_time && ` ${poolDetail.pool.game_time}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    background: isLocked ? 'rgba(74, 222, 128, 0.15)' : 'rgba(251, 191, 36, 0.15)',
                    color: isLocked ? 'var(--green)' : 'var(--gold)',
                  }}>
                    {isLocked ? '🔒 LOCKED' : '🟢 PICKING'}
                  </span>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    background: poolDetail.membership.paid ? 'rgba(74, 222, 128, 0.15)' : 'rgba(251, 146, 60, 0.15)',
                    color: poolDetail.membership.paid ? 'var(--green)' : 'var(--orange)',
                  }}>
                    {poolDetail.membership.paid ? '✓ PAID' : '💸 UNPAID'}
                  </span>
                </div>
              </div>

              {/* My stats */}
              <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
                <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>MY SQUARES</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>{mySquareCount}</div>
                </div>
                <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>I OWE</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: poolDetail.membership.paid ? 'var(--green)' : 'var(--orange)', fontFamily: 'var(--font-mono)' }}>
                    ${mySquareCount * poolDetail.pool.denomination}
                  </div>
                </div>
                <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>MAX ALLOWED</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>{poolDetail.pool.max_per_player}</div>
                </div>
              </div>

              {/* Claim message */}
              {claimMessage && (
                <div style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 8,
                  background: claimMessage.success ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${claimMessage.success ? 'var(--green)' : 'var(--red)'}`,
                  color: claimMessage.success ? 'var(--green)' : 'var(--red)',
                  fontSize: 12,
                }}>
                  {claimMessage.text}
                </div>
              )}

              {/* Instructions */}
              {!isLocked && !maxReached && (
                <div style={{ marginTop: 12, padding: 10, background: 'rgba(96, 165, 250, 0.1)', borderRadius: 8, fontSize: 12, color: 'var(--blue)' }}>
                  👆 Tap an empty square below to claim it!
                </div>
              )}
              {maxReached && !isLocked && (
                <div style={{ marginTop: 12, padding: 10, background: 'rgba(251, 146, 60, 0.1)', borderRadius: 8, fontSize: 12, color: 'var(--orange)' }}>
                  You've reached the max of {poolDetail.pool.max_per_player} squares. Contact admin if you need more.
                </div>
              )}
            </div>

            {/* Grid */}
            <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
              <div style={{ display: 'inline-block', minWidth: 420 }}>
                {/* Column header - Away team */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6, marginLeft: 36 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--blue)', letterSpacing: 2, fontFamily: 'var(--font-mono)' }}>
                    ← {poolDetail.pool.away_team} →
                  </span>
                </div>
                {/* Column digits */}
                <div style={{ display: 'flex', marginLeft: 36 }}>
                  {(poolDetail.pool.col_digits || Array(10).fill('?')).map((d, i) => (
                    <div key={i} style={{ width: 38, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: poolDetail.pool.col_digits ? 'var(--blue)' : 'var(--dim)', fontFamily: 'var(--font-mono)' }}>
                      {d}
                    </div>
                  ))}
                </div>
                {/* Grid with row header */}
                <div style={{ display: 'flex' }}>
                  {/* Row header - Home team */}
                  <div style={{ display: 'flex', alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginRight: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--gold)', letterSpacing: 2, fontFamily: 'var(--font-mono)', writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>
                        ← {poolDetail.pool.home_team} →
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {(poolDetail.pool.row_digits || Array(10).fill('?')).map((d, i) => (
                        <div key={i} style={{ width: 18, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: poolDetail.pool.row_digits ? 'var(--gold)' : 'var(--dim)', fontFamily: 'var(--font-mono)' }}>
                          {d}
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Grid cells */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 38px)', gap: 2, background: 'var(--border)', padding: 2, borderRadius: 8 }}>
                    {poolDetail.grid.map((row, r) => row.map((cellData, c) => {
                      // Handle null cells (unclaimed squares)
                      const cell = cellData || { player_id: null, player_name: null, claim_status: 'available' as const };
                      const isMine = poolDetail.mySquares.some(s => s.row_idx === r && s.col_idx === c);
                      const isAvailable = !cell.player_id && cell.claim_status === 'available';
                      const isPending = cell.claim_status === 'pending';
                      const canClaim = isAvailable && !isLocked && !maxReached && !claiming;
                      const color = cell.player_id ? (playerColors[cell.player_id] || 'var(--muted)') : 'transparent';
                      const winner = poolDetail.winners.find(w => w.square_row === r && w.square_col === c);

                      return (
                        <div
                          key={`${r}-${c}`}
                          onClick={() => canClaim && handleClaimSquare(r, c)}
                          style={{
                            width: 38,
                            height: 38,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: winner ? 'rgba(251, 191, 36, 0.2)' : isMine ? 'rgba(74, 222, 128, 0.25)' : isPending ? 'rgba(167, 139, 250, 0.15)' : cell.player_id ? `${color}15` : 'var(--surface)',
                            border: isMine ? '2px solid var(--green)' : winner ? '2px solid var(--gold)' : isPending ? '2px dashed #A78BFA' : `1px solid ${cell.player_id ? `${color}30` : 'var(--border)'}`,
                            borderRadius: 3,
                            cursor: canClaim ? 'pointer' : 'default',
                            position: 'relative',
                            transition: 'transform 0.1s',
                          }}
                          onMouseEnter={e => canClaim && (e.currentTarget.style.transform = 'scale(1.1)')}
                          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          {cell.player_id ? (
                            <span style={{ fontSize: 8, fontWeight: 800, color: isMine ? 'var(--green)' : isPending ? '#A78BFA' : color, fontFamily: 'var(--font-mono)' }}>
                              {isMine ? 'YOU' : cell.player_name?.split(' ')[0].substring(0, 3).toUpperCase()}
                            </span>
                          ) : (
                            <span style={{ fontSize: 14, color: canClaim ? 'var(--green)' : 'var(--dim)' }}>
                              {canClaim ? '+' : '·'}
                            </span>
                          )}
                          {winner && <div style={{ position: 'absolute', top: -4, right: -4, fontSize: 10 }}>🏆</div>}
                          {isMine && !winner && <div style={{ position: 'absolute', top: -4, right: -4, fontSize: 8 }}>⭐</div>}
                        </div>
                      );
                    }))}
                  </div>
                </div>
              </div>
            </div>

            {/* Scores & Winners */}
            {poolDetail.scores.length > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginTop: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--dim)', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>SCORES & WINNERS</h3>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(poolDetail.scores.length, 4)}, 1fr)`, gap: 12 }}>
                  {poolDetail.scores.map(score => {
                    const winner = poolDetail.winners.find(w => w.period_key === score.period_key);
                    const isMyWin = winner && poolDetail.mySquares.some(s => s.row_idx === winner.square_row && s.col_idx === winner.square_col);
                    return (
                      <div key={score.period_key} style={{ background: isMyWin ? 'rgba(74, 222, 128, 0.1)' : 'var(--bg)', borderRadius: 8, padding: 12, border: isMyWin ? '1px solid var(--green)' : '1px solid transparent' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', textAlign: 'center', marginBottom: 6 }}>
                          {score.period_label}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                          <span style={{ color: 'var(--blue)' }}>{score.away_score}</span>
                          <span style={{ color: 'var(--dim)' }}>-</span>
                          <span style={{ color: 'var(--gold)' }}>{score.home_score}</span>
                        </div>
                        {winner && (
                          <div style={{ textAlign: 'center', marginTop: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: isMyWin ? 'var(--green)' : 'var(--text)' }}>
                              {isMyWin ? '🎉 YOU WON!' : `🏆 ${winner.player_name}`}
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>
                              ${winner.payout_amount}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* My squares list */}
            {poolDetail.mySquares.length > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--dim)', fontFamily: 'var(--font-mono)', margin: 0 }}>MY SQUARES</h3>
                  {!isLocked && (
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>Tap a square to release it</span>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {poolDetail.mySquares.map(sq => {
                    const rowDigit = poolDetail.pool.row_digits?.[sq.row_idx] ?? '?';
                    const colDigit = poolDetail.pool.col_digits?.[sq.col_idx] ?? '?';
                    const winner = poolDetail.winners.find(w => w.square_row === sq.row_idx && w.square_col === sq.col_idx);
                    const isReleasing = releasing === `${sq.row_idx}-${sq.col_idx}`;
                    const canRelease = !isLocked && !winner && !isReleasing;
                    return (
                      <div
                        key={`${sq.row_idx}-${sq.col_idx}`}
                        onClick={() => canRelease && handleReleaseSquare(sq.row_idx, sq.col_idx)}
                        style={{
                          background: winner ? 'rgba(251, 191, 36, 0.2)' : isReleasing ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg)',
                          border: winner ? '1px solid var(--gold)' : isReleasing ? '1px solid var(--red)' : '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '8px 12px',
                          textAlign: 'center',
                          cursor: canRelease ? 'pointer' : 'default',
                          opacity: isReleasing ? 0.6 : 1,
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => canRelease && (e.currentTarget.style.borderColor = 'var(--red)')}
                        onMouseLeave={e => !winner && (e.currentTarget.style.borderColor = 'var(--border)')}
                      >
                        <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                          <span style={{ color: 'var(--blue)' }}>{colDigit}</span>
                          <span style={{ color: 'var(--dim)' }}> - </span>
                          <span style={{ color: 'var(--gold)' }}>{rowDigit}</span>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--dim)' }}>
                          ({sq.row_idx}, {sq.col_idx})
                        </div>
                        {winner && (
                          <div style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 700, marginTop: 4 }}>
                            🏆 Won ${winner.payout_amount}!
                          </div>
                        )}
                        {!isLocked && !winner && (
                          <div style={{ fontSize: 9, color: 'var(--red)', marginTop: 4, opacity: 0.7 }}>
                            {isReleasing ? 'Releasing...' : '× Release'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* No pools message */}
        {pools.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎲</div>
            <h2 style={{ color: 'var(--text)' }}>No Pools Yet</h2>
            <p style={{ color: 'var(--muted)' }}>You haven't been added to any pools yet. Ask the admin to invite you!</p>
          </div>
        )}
      </div>

      {/* Ledger Modal */}
      {showLedger && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowLedger(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 500, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0 }}>📒 Transaction History</h3>
              <button onClick={() => setShowLedger(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>CURRENT BALANCE</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: balance >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}>
                ${balance}
              </div>
            </div>

            {loadingLedger ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>Loading transactions...</div>
            ) : ledgerEntries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>No transactions yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ledgerEntries.map(entry => (
                  <div key={entry.id} style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{entry.description}</div>
                      <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>
                        {entry.pool_name && `${entry.pool_name} • `}
                        {new Date(entry.created_at).toLocaleDateString()} {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 14,
                      fontWeight: 800,
                      fontFamily: 'var(--font-mono)',
                      color: entry.amount >= 0 ? 'var(--green)' : 'var(--red)',
                    }}>
                      {entry.amount >= 0 ? '+' : ''}${entry.amount}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
