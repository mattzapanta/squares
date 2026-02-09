import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PoolDetail as PoolDetailType, Player, SPORTS_CONFIG, GridCell } from '../types';
import { pools as poolsApi, squares, players as playersApi, scores as scoresApi } from '../api/client';

export default function PoolDetail() {
  const { id } = useParams<{ id: string }>();
  const [pool, setPool] = useState<PoolDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'grid' | 'players' | 'audit'>('grid');
  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>(null);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [newPlayer, setNewPlayer] = useState({ name: '', phone: '', email: '' });
  const [scoreInputs, setScoreInputs] = useState<Record<string, { away: string; home: string }>>({});

  const loadPool = async () => {
    if (!id) return;
    try {
      const data = await poolsApi.get(id);
      setPool(data);
    } catch (error) {
      console.error('Failed to load pool:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPool();
  }, [id]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>;
  }

  if (!pool) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>Pool not found</div>;
  }

  const sc = SPORTS_CONFIG[pool.sport];
  const claimedCount = pool.grid.flat().filter(c => c?.player_id).length;
  const pendingCount = pool.players.filter(p => !p.paid).length;
  const isLocked = pool.status !== 'open';
  const poolTotal = 100 * pool.denomination;

  const playerColors: Record<string, string> = {};
  const colors = ['#4ADE80', '#60A5FA', '#FBBF24', '#A78BFA', '#F472B6', '#FB923C', '#22D3EE', '#F87171', '#818CF8', '#A3E635'];
  pool.players.forEach((p, i) => {
    playerColors[p.id] = colors[i % colors.length];
  });

  const handleLock = async () => {
    try {
      await poolsApi.lock(pool.id);
      loadPool();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to lock');
    }
  };

  const handleUnlock = async () => {
    if (!confirm('Unlocking will RE-RANDOMIZE digits on next lock. Continue?')) return;
    try {
      await poolsApi.unlock(pool.id);
      loadPool();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to unlock');
    }
  };

  const handleCellClick = (r: number, c: number) => {
    setSelectedCell({ r, c });
  };

  const handleAssign = async (playerId: string) => {
    if (!selectedCell) return;
    try {
      await squares.assign(pool.id, selectedCell.r, selectedCell.c, playerId);
      setSelectedCell(null);
      loadPool();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to assign');
    }
  };

  const handleRelease = async () => {
    if (!selectedCell) return;
    try {
      await squares.release(pool.id, selectedCell.r, selectedCell.c);
      setSelectedCell(null);
      loadPool();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to release');
    }
  };

  const handleAddPlayer = async () => {
    if (!newPlayer.name || (!newPlayer.phone && !newPlayer.email)) return;
    try {
      await playersApi.add(pool.id, newPlayer.name, newPlayer.phone || undefined, newPlayer.email || undefined);
      setNewPlayer({ name: '', phone: '', email: '' });
      setShowAddPlayer(false);
      loadPool();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to add player');
    }
  };

  const handleTogglePayment = async (playerId: string, currentPaid: boolean) => {
    try {
      await playersApi.updatePayment(pool.id, playerId, !currentPaid);
      loadPool();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update');
    }
  };

  const handleEnterScore = async (periodKey: string, periodLabel: string, payoutPct: number) => {
    const input = scoreInputs[periodKey];
    if (!input?.away || !input?.home) return;
    try {
      await scoresApi.enter(pool.id, periodKey, periodLabel, parseInt(input.away), parseInt(input.home), payoutPct);
      loadPool();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to enter score');
    }
  };

  const getWinner = (periodKey: string) => {
    return pool.winners.find(w => w.period_key === periodKey);
  };

  const getPayoutPct = (periodIdx: number) => {
    const n = sc.periods.length;
    return Math.floor(100 / n);
  };

  const selectedCellData = selectedCell ? pool.grid[selectedCell.r]?.[selectedCell.c] : null;

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--muted)',
            padding: '6px 10px',
            fontSize: 12,
            textDecoration: 'none',
          }}>
            ← Pools
          </Link>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--green)' }}>■</span> {pool.away_team} vs {pool.home_team}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {sc.name} • ${pool.denomination}/sq • {sc.periods.length} periods
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', flex: 1, minWidth: 100 }}>
          <div style={{ fontSize: 10, color: 'var(--dim)', fontWeight: 700, letterSpacing: 1, fontFamily: 'var(--font-mono)' }}>POOL</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>${poolTotal}</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', flex: 1, minWidth: 100 }}>
          <div style={{ fontSize: 10, color: 'var(--dim)', fontWeight: 700, letterSpacing: 1, fontFamily: 'var(--font-mono)' }}>CLAIMED</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: claimedCount === 100 ? 'var(--green)' : 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{claimedCount}%</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', flex: 1, minWidth: 100 }}>
          <div style={{ fontSize: 10, color: 'var(--dim)', fontWeight: 700, letterSpacing: 1, fontFamily: 'var(--font-mono)' }}>PLAYERS</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>{pool.players.length}</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', flex: 1, minWidth: 100 }}>
          <div style={{ fontSize: 10, color: 'var(--dim)', fontWeight: 700, letterSpacing: 1, fontFamily: 'var(--font-mono)' }}>STATUS</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: isLocked ? 'var(--green)' : 'var(--gold)', fontFamily: 'var(--font-mono)' }}>
            {isLocked ? 'Locked' : 'Open'}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        {[
          { id: 'grid', label: 'GRID' },
          { id: 'players', label: `PLAYERS (${pool.players.length})` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            style={{
              background: tab === t.id ? 'var(--green)' : 'transparent',
              color: tab === t.id ? 'var(--bg)' : 'var(--muted)',
              border: `1px solid ${tab === t.id ? 'var(--green)' : 'var(--border)'}`,
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              letterSpacing: 0.5,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Grid Tab */}
      {tab === 'grid' && (
        <div>
          {/* Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: 'rgba(74, 222, 128, 0.15)', color: 'var(--green)', border: '1px solid rgba(74, 222, 128, 0.25)' }}>
                {pool.players.filter(p => p.paid).length} paid
              </span>
              {pendingCount > 0 && (
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: 'rgba(251, 146, 60, 0.15)', color: 'var(--orange)', border: '1px solid rgba(251, 146, 60, 0.25)' }}>
                  ⚠ {pendingCount} unpaid
                </span>
              )}
              {isLocked && (
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: 'rgba(74, 222, 128, 0.15)', color: 'var(--green)', border: '1px solid rgba(74, 222, 128, 0.25)' }}>
                  🔒 LOCKED
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {claimedCount === 100 && !isLocked && (
                <button onClick={handleLock} style={{ background: 'var(--green)', color: 'var(--bg)', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700 }}>
                  🎲 Lock & Randomize
                </button>
              )}
              {isLocked && (
                <button onClick={handleUnlock} style={{ background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700 }}>
                  🔓 Unlock
                </button>
              )}
            </div>
          </div>

          {/* Grid */}
          <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
            <div style={{ display: 'inline-block', minWidth: 500 }}>
              {/* Column header - Away team */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6, marginLeft: 40 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--blue)', letterSpacing: 2, fontFamily: 'var(--font-mono)' }}>
                  ← {pool.away_team} →
                </span>
              </div>
              {/* Column digits */}
              <div style={{ display: 'flex', marginLeft: 40 }}>
                {(pool.col_digits || Array(10).fill('?')).map((d, i) => (
                  <div key={i} style={{ width: 44, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: pool.col_digits ? 'var(--blue)' : 'var(--dim)', fontFamily: 'var(--font-mono)' }}>
                    {d}
                  </div>
                ))}
              </div>
              {/* Grid with row header */}
              <div style={{ display: 'flex' }}>
                {/* Row header - Home team */}
                <div style={{ display: 'flex', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginRight: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--gold)', letterSpacing: 2, fontFamily: 'var(--font-mono)', writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>
                      ← {pool.home_team} →
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {(pool.row_digits || Array(10).fill('?')).map((d, i) => (
                      <div key={i} style={{ width: 20, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: pool.row_digits ? 'var(--gold)' : 'var(--dim)', fontFamily: 'var(--font-mono)' }}>
                        {d}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Grid cells */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 44px)', gap: 2, background: 'var(--border)', padding: 2, borderRadius: 8 }}>
                  {pool.grid.map((row, r) => row.map((cell, c) => {
                    const isSelected = selectedCell?.r === r && selectedCell?.c === c;
                    const isPending = cell && !pool.players.find(p => p.id === cell.player_id)?.paid;
                    const color = cell?.player_id ? playerColors[cell.player_id] || 'var(--muted)' : 'transparent';
                    const winner = pool.winners.find(w => w.square_row === r && w.square_col === c);

                    return (
                      <div
                        key={`${r}-${c}`}
                        onClick={() => handleCellClick(r, c)}
                        style={{
                          width: 44,
                          height: 44,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: winner ? 'rgba(251, 191, 36, 0.2)' : cell ? `${color}15` : 'var(--surface)',
                          border: winner ? '2px solid var(--gold)' : isSelected ? `2px solid ${color}` : isPending ? '1px dashed var(--orange)' : `1px solid ${cell ? `${color}30` : 'transparent'}`,
                          borderRadius: 3,
                          cursor: 'pointer',
                          position: 'relative',
                        }}
                      >
                        {cell ? (
                          <span style={{ fontSize: 9, fontWeight: 800, color: isPending ? 'var(--orange)' : color, fontFamily: 'var(--font-mono)' }}>
                            {cell.player_name?.split(' ')[0].substring(0, 3).toUpperCase()}
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: 'var(--dim)' }}>+</span>
                        )}
                        {winner && <div style={{ position: 'absolute', top: -3, right: -3, fontSize: 10 }}>🏆</div>}
                      </div>
                    );
                  }))}
                </div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {pool.players.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: `${playerColors[p.id]}50`, border: `1px solid ${playerColors[p.id]}` }} />
                <span style={{ fontSize: 10, color: p.paid ? 'var(--muted)' : 'var(--orange)' }}>
                  {p.name.split(' ')[0]} ({p.square_count || 0}){!p.paid && ' 💸'}
                </span>
              </div>
            ))}
          </div>

          {/* Score entry */}
          {isLocked && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, fontFamily: 'var(--font-mono)', marginBottom: 12 }}>
                SCORES & PAYOUTS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sc.periods.length}, 1fr)`, gap: 8 }}>
                {sc.periods.map((period, i) => {
                  const key = `p${i}`;
                  const existingScore = pool.scores.find(s => s.period_key === key);
                  const winner = getWinner(key);
                  const pct = getPayoutPct(i);
                  const payout = Math.round(poolTotal * pct / 100);

                  return (
                    <div key={key} style={{ background: 'var(--bg)', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', fontFamily: 'var(--font-mono)', marginBottom: 6, textAlign: 'center' }}>
                        {period} <span style={{ color: 'var(--green)' }}>({pct}%)</span>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input
                          placeholder={pool.away_team}
                          value={existingScore?.away_score?.toString() || scoreInputs[key]?.away || ''}
                          onChange={e => setScoreInputs({ ...scoreInputs, [key]: { ...scoreInputs[key], away: e.target.value } })}
                          style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 4px', color: 'var(--blue)', fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', outline: 'none', textAlign: 'center' }}
                        />
                        <input
                          placeholder={pool.home_team}
                          value={existingScore?.home_score?.toString() || scoreInputs[key]?.home || ''}
                          onChange={e => setScoreInputs({ ...scoreInputs, [key]: { ...scoreInputs[key], home: e.target.value } })}
                          style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 4px', color: 'var(--gold)', fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', outline: 'none', textAlign: 'center' }}
                        />
                      </div>
                      {!existingScore && (scoreInputs[key]?.away && scoreInputs[key]?.home) && (
                        <button
                          onClick={() => handleEnterScore(key, period, pct)}
                          style={{ width: '100%', marginTop: 6, background: 'var(--green)', color: 'var(--bg)', border: 'none', borderRadius: 4, padding: '4px', fontSize: 10, fontWeight: 700 }}
                        >
                          Save
                        </button>
                      )}
                      {winner ? (
                        <div style={{ textAlign: 'center', marginTop: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>🏆 {winner.player_name}</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>${winner.payout_amount}</div>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', marginTop: 6, fontSize: 10, color: 'var(--dim)' }}>
                          Payout: ${payout}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cell selection modal */}
          {selectedCell && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setSelectedCell(null)}>
              <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 400, maxHeight: '80vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0 }}>
                    Square ({selectedCell.r}, {selectedCell.c})
                  </h3>
                  <button onClick={() => setSelectedCell(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
                </div>

                {selectedCellData ? (
                  <div>
                    <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 14, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${playerColors[selectedCellData.player_id!]}20`, color: playerColors[selectedCellData.player_id!], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>
                        {selectedCellData.player_name?.[0]}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedCellData.player_name}</div>
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: selectedCellData.paid ? 'rgba(74, 222, 128, 0.15)' : 'rgba(251, 146, 60, 0.15)', color: selectedCellData.paid ? 'var(--green)' : 'var(--orange)' }}>
                          {selectedCellData.paid ? 'PAID' : 'UNPAID'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={handleRelease}
                      style={{ width: '100%', background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px', fontSize: 12, fontWeight: 700 }}
                    >
                      Release Square
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>Assign to a player:</div>
                    {pool.players.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 20, color: 'var(--dim)' }}>
                        No players yet. Add players first.
                      </div>
                    ) : (
                      pool.players.map(p => (
                        <div
                          key={p.id}
                          onClick={() => handleAssign(p.id)}
                          style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', marginBottom: 6 }}
                        >
                          <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${playerColors[p.id]}20`, color: playerColors[p.id], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>
                            {p.name[0]}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</span>
                          <span style={{ fontSize: 10, color: 'var(--dim)', marginLeft: 'auto' }}>{p.square_count || 0} sq</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Players Tab */}
      {tab === 'players' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>
              {pool.players.length} PLAYERS
            </span>
            <button
              onClick={() => setShowAddPlayer(true)}
              style={{ background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700 }}
            >
              + Add Player
            </button>
          </div>

          {pool.players.length === 0 ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
              <div style={{ color: 'var(--muted)' }}>No players yet. Add some players to get started.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pool.players.map(p => (
                <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${playerColors[p.id]}20`, color: playerColors[p.id], fontSize: 11, fontWeight: 800 }}>
                      {p.name[0]}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>{p.phone || p.email}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ textAlign: 'right', marginRight: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: playerColors[p.id] }}>{p.square_count || 0} sq</div>
                      <div style={{ fontSize: 10, color: 'var(--dim)' }}>${(p.square_count || 0) * pool.denomination}</div>
                    </div>
                    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: p.paid ? 'rgba(74, 222, 128, 0.15)' : 'rgba(251, 146, 60, 0.15)', color: p.paid ? 'var(--green)' : 'var(--orange)', border: `1px solid ${p.paid ? 'rgba(74, 222, 128, 0.25)' : 'rgba(251, 146, 60, 0.25)'}` }}>
                      {p.paid ? 'PAID' : 'UNPAID'}
                    </span>
                    <button
                      onClick={() => handleTogglePayment(p.id, !!p.paid)}
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}
                    >
                      {p.paid ? 'Mark Unpaid' : 'Mark Paid'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add player modal */}
          {showAddPlayer && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowAddPlayer(false)}>
              <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 400 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0 }}>Add Player</h3>
                  <button onClick={() => setShowAddPlayer(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>NAME *</div>
                  <input
                    placeholder="e.g. John Smith"
                    value={newPlayer.name}
                    onChange={e => setNewPlayer({ ...newPlayer, name: e.target.value })}
                    style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>PHONE</div>
                  <input
                    placeholder="(555) 123-4567"
                    value={newPlayer.phone}
                    onChange={e => setNewPlayer({ ...newPlayer, phone: e.target.value })}
                    style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>EMAIL</div>
                  <input
                    placeholder="john@email.com"
                    value={newPlayer.email}
                    onChange={e => setNewPlayer({ ...newPlayer, email: e.target.value })}
                    style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
                  />
                </div>
                <button
                  onClick={handleAddPlayer}
                  disabled={!newPlayer.name || (!newPlayer.phone && !newPlayer.email)}
                  style={{ width: '100%', background: 'var(--green)', color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '12px', fontSize: 14, fontWeight: 700 }}
                >
                  Add Player
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
