import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { PoolDetail as PoolDetailType, SPORTS_CONFIG, GridCell, PayoutStructure } from '../types';
import { pools as poolsApi, squares, players as playersApi, scores as scoresApi, payments, SearchedPlayer, PlayerPaymentSummary, LiveScoreData, CurrentWinner, PlayerWalletBalance, PlayerInviteLink } from '../api/client';

// Cell Assignment Modal with inline player creation
function CellAssignmentModal({
  selectedCell,
  selectedCellData,
  pool,
  playerColors,
  onClose,
  onApprove,
  onReject,
  onRelease,
  onAssign,
  onAddPlayer: _onAddPlayer,
  onReload,
}: {
  selectedCell: { r: number; c: number };
  selectedCellData: GridCell | null;
  pool: PoolDetailType;
  playerColors: Record<string, string>;
  onClose: () => void;
  onApprove: (row: number, col: number) => void;
  onReject: (row: number, col: number) => void;
  onRelease: () => void;
  onAssign: (playerId: string) => void;
  onAddPlayer?: () => Promise<void>;
  onReload: () => void;
}) {
  const [showNewPlayer, setShowNewPlayer] = useState(false);
  const [inlinePlayer, setInlinePlayer] = useState({ name: '', phone: '', email: '' });
  const [creating, setCreating] = useState(false);

  const handleCreateAndAssign = async () => {
    if (!inlinePlayer.name || (!inlinePlayer.phone && !inlinePlayer.email)) return;

    setCreating(true);
    try {
      // First create the player in the pool
      await playersApi.add(pool.id, inlinePlayer.name, inlinePlayer.phone || undefined, inlinePlayer.email || undefined);

      // Reload pool to get the new player
      onReload();

      // Reset and close
      setInlinePlayer({ name: '', phone: '', email: '' });
      setShowNewPlayer(false);
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create player');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 400, maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0 }}>
            Square ({selectedCell.r}, {selectedCell.c})
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        {selectedCellData ? (
          <div>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 14, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${playerColors[selectedCellData.player_id!]}20`, color: playerColors[selectedCellData.player_id!], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>
                {selectedCellData.player_name?.[0]}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedCellData.player_name}</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  {selectedCellData.claim_status === 'pending' && (
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: 'rgba(167, 139, 250, 0.15)', color: '#A78BFA' }}>
                      ⏳ PENDING APPROVAL
                    </span>
                  )}
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: selectedCellData.paid ? 'rgba(74, 222, 128, 0.15)' : 'rgba(251, 146, 60, 0.15)', color: selectedCellData.paid ? 'var(--green)' : 'var(--orange)' }}>
                    {selectedCellData.paid ? 'PAID' : 'UNPAID'}
                  </span>
                </div>
              </div>
            </div>
            {selectedCellData.claim_status === 'pending' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  onClick={() => { onApprove(selectedCell.r, selectedCell.c); onClose(); }}
                  style={{ flex: 1, background: 'var(--green)', color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '10px', fontSize: 12, fontWeight: 700 }}
                >
                  ✓ Approve
                </button>
                <button
                  onClick={() => { onReject(selectedCell.r, selectedCell.c); onClose(); }}
                  style={{ flex: 1, background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px', fontSize: 12, fontWeight: 700 }}
                >
                  ✗ Reject
                </button>
              </div>
            )}
            <button
              onClick={onRelease}
              style={{ width: '100%', background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px', fontSize: 12, fontWeight: 700 }}
            >
              Release Square
            </button>
          </div>
        ) : showNewPlayer ? (
          // Inline new player form
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>New Player</div>
              <button onClick={() => setShowNewPlayer(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11 }}>
                ← Back to list
              </button>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 4, fontFamily: 'var(--font-mono)' }}>NAME *</div>
              <input
                placeholder="e.g. John Smith"
                value={inlinePlayer.name}
                onChange={e => setInlinePlayer({ ...inlinePlayer, name: e.target.value })}
                autoFocus
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 4, fontFamily: 'var(--font-mono)' }}>PHONE</div>
              <input
                placeholder="(555) 123-4567"
                value={inlinePlayer.phone}
                onChange={e => setInlinePlayer({ ...inlinePlayer, phone: e.target.value })}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 4, fontFamily: 'var(--font-mono)' }}>EMAIL</div>
              <input
                placeholder="john@email.com"
                value={inlinePlayer.email}
                onChange={e => setInlinePlayer({ ...inlinePlayer, email: e.target.value })}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
              />
            </div>
            <button
              onClick={handleCreateAndAssign}
              disabled={!inlinePlayer.name || (!inlinePlayer.phone && !inlinePlayer.email) || creating}
              style={{
                width: '100%',
                background: 'var(--green)',
                color: 'var(--bg)',
                border: 'none',
                borderRadius: 8,
                padding: '12px',
                fontSize: 13,
                fontWeight: 700,
                opacity: (!inlinePlayer.name || (!inlinePlayer.phone && !inlinePlayer.email) || creating) ? 0.5 : 1,
              }}
            >
              {creating ? 'Creating...' : 'Create Player & Add to Pool'}
            </button>
          </div>
        ) : (
          // Player selection list
          <div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>Assign to a player:</div>

            {/* Add new player button */}
            <button
              onClick={() => setShowNewPlayer(true)}
              style={{
                width: '100%',
                background: 'rgba(74, 222, 128, 0.1)',
                border: '1px dashed var(--green)',
                borderRadius: 8,
                padding: '12px 14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 10,
                color: 'var(--green)',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <span style={{ fontSize: 16 }}>+</span>
              Create New Player
            </button>

            {pool.players.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 12, color: 'var(--dim)', fontSize: 12 }}>
                No existing players. Create one above!
              </div>
            ) : (
              <>
                <div style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>EXISTING PLAYERS</div>
                {pool.players.map(p => (
                  <div
                    key={p.id}
                    onClick={() => onAssign(p.id)}
                    style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', marginBottom: 6 }}
                  >
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${playerColors[p.id]}20`, color: playerColors[p.id], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>
                      {p.name[0]}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--dim)', marginLeft: 'auto' }}>{p.square_count || 0} sq</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PoolDetail() {
  const { id } = useParams<{ id: string }>();
  const { admin } = useAuth();
  const navigate = useNavigate();
  const [pool, setPool] = useState<PoolDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'grid' | 'players' | 'audit' | 'settings'>('grid');
  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>(null);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [newPlayer, setNewPlayer] = useState({ name: '', phone: '', email: '' });
  const [scoreInputs, setScoreInputs] = useState<Record<string, { away: string; home: string }>>({});
  const [joiningPool, setJoiningPool] = useState(false);

  // Live score state
  const [liveScore, setLiveScore] = useState<LiveScoreData | null>(null);
  const [currentWinner, setCurrentWinner] = useState<CurrentWinner | null>(null);
  const [autoSync, setAutoSync] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentSearchResults, setPaymentSearchResults] = useState<SearchedPlayer[]>([]);
  const [selectedPaymentPlayer, setSelectedPaymentPlayer] = useState<SearchedPlayer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<'single' | 'auto' | 'credit'>('single');
  const [paymentStrategy, setPaymentStrategy] = useState<'sequential' | 'even'>('sequential');
  const [paymentPlayerSummary, setPaymentPlayerSummary] = useState<PlayerPaymentSummary | null>(null);
  const [paymentWalletBalance, setPaymentWalletBalance] = useState<PlayerWalletBalance | null>(null);
  const [useCredit, setUseCredit] = useState<string>(''); // Amount of credit to use

  // Settings state
  const [settingsDenomination, setSettingsDenomination] = useState<number>(0);
  const [settingsMaxPerPlayer, setSettingsMaxPerPlayer] = useState<number>(10);
  const [settingsTipPct, setSettingsTipPct] = useState<number>(10);
  const [settingsPayoutStructure, setSettingsPayoutStructure] = useState<PayoutStructure>('standard');
  const [settingsCustomPayouts, setSettingsCustomPayouts] = useState<Record<string, number>>({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ success: boolean; text: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{ success: boolean; message: string } | null>(null);

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [inviteLinks, setInviteLinks] = useState<PlayerInviteLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [notifyResult, setNotifyResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadPool = async () => {
    if (!id) return;
    try {
      const data = await poolsApi.get(id);
      setPool(data);
      // Initialize settings state
      setSettingsDenomination(data.denomination);
      setSettingsMaxPerPlayer(data.max_per_player);
      setSettingsTipPct(data.tip_pct);
      setSettingsPayoutStructure(data.payout_structure);
      // Initialize custom payouts from pool data or generate defaults based on sport
      const sportConfig = SPORTS_CONFIG[data.sport as keyof typeof SPORTS_CONFIG];
      const periods = sportConfig?.periods || ['Q1', 'Q2', 'Q3', 'Q4'];
      const defaultPayouts: Record<string, number> = {};
      periods.forEach((p, i) => {
        defaultPayouts[p.toLowerCase()] = Math.floor(100 / periods.length) + (i === periods.length - 1 ? 100 % periods.length : 0);
      });
      setSettingsCustomPayouts(data.custom_payouts || defaultPayouts);
    } catch (error) {
      console.error('Failed to load pool:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch live scores
  const fetchLiveScores = useCallback(async () => {
    if (!id || !pool?.external_game_id) return;
    try {
      setSyncing(true);
      const data = await scoresApi.getLive(id);
      setLiveScore(data.liveScore);
      setCurrentWinner(data.currentWinner);
      setLastSyncTime(new Date());
    } catch (error) {
      console.error('Failed to fetch live scores:', error);
    } finally {
      setSyncing(false);
    }
  }, [id, pool?.external_game_id]);

  // Manual sync handler
  const handleSyncScores = async () => {
    if (!id) return;
    try {
      setSyncing(true);
      const result = await scoresApi.sync(id);
      setLiveScore({
        status: result.gameStatus,
        statusDetail: result.statusDetail,
        awayScore: result.awayScore,
        homeScore: result.homeScore,
        clock: result.clock,
        period: result.period,
      });
      // Fetch full live data to get current winner
      await fetchLiveScores();
    } catch (error) {
      console.error('Sync failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to sync scores');
    } finally {
      setSyncing(false);
    }
  };

  // Auto-polling effect
  useEffect(() => {
    if (autoSync && pool?.external_game_id && pool?.status !== 'final') {
      // Poll every 30 seconds
      pollIntervalRef.current = setInterval(fetchLiveScores, 30000);
      // Also fetch immediately
      fetchLiveScores();
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [autoSync, pool?.external_game_id, pool?.status, fetchLiveScores]);

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
  const claimedCount = pool.grid.flat().filter(c => c?.player_id && c?.claim_status === 'claimed').length;
  const pendingSquaresCount = pool.grid.flat().filter(c => c?.claim_status === 'pending').length;
  const unpaidPlayersCount = pool.players.filter(p => !p.paid).length;
  const isLocked = pool.status !== 'open';
  const poolTotal = 100 * pool.denomination;

  const playerColors: Record<string, string> = {};
  const colors = ['#4ADE80', '#60A5FA', '#FBBF24', '#A78BFA', '#F472B6', '#FB923C', '#22D3EE', '#F87171', '#818CF8', '#A3E635'];
  pool.players.forEach((p, i) => {
    playerColors[p.id] = colors[i % colors.length];
  });

  const handleLock = async () => {
    if (pendingSquaresCount > 0) {
      alert(`Cannot lock grid: ${pendingSquaresCount} pending square request(s) need to be approved or rejected first.`);
      return;
    }
    try {
      await poolsApi.lock(pool.id);
      loadPool();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to lock');
    }
  };

  const handleApprove = async (row: number, col: number) => {
    try {
      await squares.approve(pool.id, row, col);
      loadPool();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to approve');
    }
  };

  const handleReject = async (row: number, col: number) => {
    try {
      await squares.reject(pool.id, row, col);
      loadPool();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to reject');
    }
  };

  const handleBulkApprove = async (playerId: string) => {
    try {
      await squares.bulkApprove(pool.id, playerId);
      loadPool();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to bulk approve');
    }
  };

  const handleBulkReject = async (playerId: string) => {
    try {
      await squares.bulkReject(pool.id, playerId);
      loadPool();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to bulk reject');
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

  const handleAdminJoinPool = async () => {
    if (!admin) return;
    setJoiningPool(true);
    try {
      await playersApi.add(pool.id, admin.name, undefined, admin.email);
      loadPool();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to join pool');
    } finally {
      setJoiningPool(false);
    }
  };

  // Check if admin is already in the pool
  const isAdminInPool = admin && pool.players.some(p => p.email === admin.email);

  const handleTogglePayment = async (playerId: string, currentPaid: boolean) => {
    try {
      // Find the player to calculate owed amount
      const player = pool.players.find(p => p.id === playerId);
      const owed = (player?.square_count || 0) * pool.denomination;
      // If marking as paid, set amount_paid to full owed amount; if unpaid, set to 0
      const newAmountPaid = !currentPaid ? owed : 0;
      await playersApi.updatePayment(pool.id, playerId, !currentPaid, undefined, newAmountPaid);
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

  // Payment handlers
  const handlePaymentSearch = async (query: string) => {
    setPaymentSearch(query);
    if (query.length < 2) {
      setPaymentSearchResults([]);
      return;
    }
    try {
      const results = await payments.searchPlayers(query);
      setPaymentSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
    }
  };

  const handleSelectPaymentPlayer = async (player: SearchedPlayer) => {
    setSelectedPaymentPlayer(player);
    setPaymentSearchResults([]);
    setPaymentSearch(player.name);
    setUseCredit(''); // Reset credit usage
    try {
      const [summary, balance] = await Promise.all([
        payments.getPlayerSummary(player.id),
        payments.getPlayerBalance(player.id),
      ]);
      setPaymentPlayerSummary(summary);
      setPaymentWalletBalance(balance);
    } catch (error) {
      console.error('Failed to load player data:', error);
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedPaymentPlayer) return;

    const newAmount = parseFloat(paymentAmount) || 0;
    const creditToUse = parseFloat(useCredit) || 0;
    const totalAmount = newAmount + creditToUse;

    // Validation
    if (totalAmount <= 0) {
      setPaymentResult({ success: false, message: 'Enter an amount to record' });
      return;
    }

    // Check if trying to use more credit than available
    if (creditToUse > 0 && paymentWalletBalance) {
      if (creditToUse > paymentWalletBalance.unassignedCredit) {
        setPaymentResult({
          success: false,
          message: `Insufficient credit. Available: $${paymentWalletBalance.unassignedCredit}, trying to use: $${creditToUse}`
        });
        return;
      }
    }

    setPaymentLoading(true);
    setPaymentResult(null);

    try {
      if (paymentMode === 'single') {
        // Check if using combined payment (credit + new money)
        if (creditToUse > 0 && newAmount > 0) {
          // Combined payment: use credit + add new money
          const result = await payments.combinedPayment(
            selectedPaymentPlayer.id,
            pool.id,
            creditToUse,
            newAmount,
            true
          );
          setPaymentResult({
            success: true,
            message: `Used $${creditToUse} credit + $${newAmount} new = $${result.totalApplied} total. ${result.squaresAssigned} square(s) auto-assigned.`
          });
        } else if (creditToUse > 0 && newAmount === 0) {
          // Only using existing credit
          const result = await payments.applyCredit(selectedPaymentPlayer.id, pool.id, creditToUse, true);
          setPaymentResult({
            success: true,
            message: `Applied $${creditToUse} credit. ${result.squaresAssigned} square(s) auto-assigned. Remaining credit: $${result.remainingWalletBalance}`
          });
        } else {
          // Only new money
          const result = await payments.recordPoolPayment(pool.id, selectedPaymentPlayer.id, newAmount, true);
          setPaymentResult({
            success: true,
            message: `Recorded $${newAmount}. ${result.squaresAssigned} square(s) auto-assigned.`
          });
        }
      } else if (paymentMode === 'auto') {
        // Distribute across all pools (only supports new money for simplicity)
        if (newAmount <= 0) {
          setPaymentResult({ success: false, message: 'Enter amount to distribute' });
          setPaymentLoading(false);
          return;
        }
        const result = await payments.autoDistribute(selectedPaymentPlayer.id, newAmount, paymentStrategy);
        const poolsMsg = result.poolsUpdated.map(p => `${p.poolName}: ${p.squaresAssigned} sq`).join(', ');
        setPaymentResult({
          success: true,
          message: `Distributed $${newAmount} across ${result.poolsUpdated.length} pool(s). Total: ${result.totalSquaresAssigned} squares. (${poolsMsg})`
        });
      } else if (paymentMode === 'credit') {
        // Add to player's wallet/credit
        if (newAmount <= 0) {
          setPaymentResult({ success: false, message: 'Enter amount to add as credit' });
          setPaymentLoading(false);
          return;
        }
        const result = await payments.addCredit(selectedPaymentPlayer.id, newAmount, `Credit from ${pool.away_team} vs ${pool.home_team} pool`);
        setPaymentResult({
          success: true,
          message: `Added $${newAmount} credit to ${result.playerName}'s wallet. Total balance: $${result.totalBalance}`
        });
      }

      // Refresh data
      loadPool();
      if (selectedPaymentPlayer) {
        const [summary, balance] = await Promise.all([
          payments.getPlayerSummary(selectedPaymentPlayer.id),
          payments.getPlayerBalance(selectedPaymentPlayer.id),
        ]);
        setPaymentPlayerSummary(summary);
        setPaymentWalletBalance(balance);
      }
      // Reset inputs after success
      setPaymentAmount('');
      setUseCredit('');
    } catch (error) {
      setPaymentResult({ success: false, message: error instanceof Error ? error.message : 'Payment failed' });
    } finally {
      setPaymentLoading(false);
    }
  };

  const resetPaymentModal = () => {
    setShowPaymentModal(false);
    setPaymentSearch('');
    setPaymentSearchResults([]);
    setSelectedPaymentPlayer(null);
    setPaymentAmount('');
    setPaymentMode('single');
    setPaymentPlayerSummary(null);
    setPaymentWalletBalance(null);
    setUseCredit('');
    setPaymentResult(null);
  };

  // Share modal handlers
  const openShareModal = async () => {
    setShowShareModal(true);
    setLoadingLinks(true);
    try {
      const links = await playersApi.getInviteLinks(pool.id);
      setInviteLinks(links);
    } catch (error) {
      console.error('Failed to load invite links:', error);
    } finally {
      setLoadingLinks(false);
    }
  };

  const copyInviteLink = (token: string, _playerName: string) => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/p/${token}?pool=${pool.id}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLink(token);
      setTimeout(() => setCopiedLink(null), 2000);
    });
  };

  const copyAllLinks = () => {
    const baseUrl = window.location.origin;
    const message = inviteLinks.map(p =>
      `${p.name}: ${baseUrl}/p/${p.auth_token}?pool=${pool.id}`
    ).join('\n');
    navigator.clipboard.writeText(message).then(() => {
      setCopiedLink('all');
      setTimeout(() => setCopiedLink(null), 2000);
    });
  };

  const getShareMessage = (player: PlayerInviteLink) => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/p/${player.auth_token}?pool=${pool.id}`;
    return `Hey ${player.name.split(' ')[0]}! You're invited to ${pool.away_team} vs ${pool.home_team} squares ($${pool.denomination}/sq). Pick your squares here: ${link}`;
  };

  const copyShareMessage = (player: PlayerInviteLink) => {
    navigator.clipboard.writeText(getShareMessage(player)).then(() => {
      setCopiedLink(player.auth_token + '-msg');
      setTimeout(() => setCopiedLink(null), 2000);
    });
  };

  const handleSendInvites = async () => {
    setSendingInvites(true);
    setNotifyResult(null);
    try {
      const result = await poolsApi.sendInvites(pool.id);
      setNotifyResult({ success: true, message: result.message });
    } catch (error) {
      setNotifyResult({ success: false, message: error instanceof Error ? error.message : 'Failed to send invites' });
    } finally {
      setSendingInvites(false);
    }
  };

  const handleSendReminders = async () => {
    setSendingReminders(true);
    setNotifyResult(null);
    try {
      const result = await poolsApi.sendReminders(pool.id);
      setNotifyResult({ success: true, message: result.message });
    } catch (error) {
      setNotifyResult({ success: false, message: error instanceof Error ? error.message : 'Failed to send reminders' });
    } finally {
      setSendingReminders(false);
    }
  };

  const getPayoutPct = (_periodIdx: number) => {
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
        <button
          onClick={openShareModal}
          style={{
            background: 'var(--blue)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          📤 Share Pool
        </button>
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
        {pendingSquaresCount > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--purple)', borderRadius: 10, padding: '14px 16px', flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: 10, color: 'var(--purple)', fontWeight: 700, letterSpacing: 1, fontFamily: 'var(--font-mono)' }}>PENDING</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--purple)', fontFamily: 'var(--font-mono)' }}>{pendingSquaresCount}</div>
          </div>
        )}
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
          { id: 'settings', label: '⚙️ SETTINGS' },
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
              {unpaidPlayersCount > 0 && (
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: 'rgba(251, 146, 60, 0.15)', color: 'var(--orange)', border: '1px solid rgba(251, 146, 60, 0.25)' }}>
                  ⚠ {unpaidPlayersCount} unpaid
                </span>
              )}
              {pendingSquaresCount > 0 && (
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: 'rgba(167, 139, 250, 0.15)', color: '#A78BFA', border: '1px solid rgba(167, 139, 250, 0.25)' }}>
                  ⏳ {pendingSquaresCount} pending
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

          {/* Pending Approvals Section */}
          {pendingSquaresCount > 0 && pool.pendingRequests && pool.pendingRequests.length > 0 && (
            <div style={{ background: 'rgba(167, 139, 250, 0.1)', border: '1px solid rgba(167, 139, 250, 0.3)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#A78BFA', letterSpacing: 1, fontFamily: 'var(--font-mono)', marginBottom: 10 }}>
                ⏳ PENDING APPROVALS ({pool.pendingRequests.length})
              </div>
              {/* Group by player */}
              {(() => {
                const byPlayer = pool.pendingRequests.reduce((acc, req) => {
                  if (!acc[req.player_id]) {
                    acc[req.player_id] = { name: req.player_name, requests: [] };
                  }
                  acc[req.player_id].requests.push(req);
                  return acc;
                }, {} as Record<string, { name: string; requests: typeof pool.pendingRequests }>);

                return Object.entries(byPlayer).map(([playerId, data]) => (
                  <div key={playerId} style={{ background: 'var(--surface)', borderRadius: 8, padding: 10, marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${playerColors[playerId]}20`, color: playerColors[playerId], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>
                          {data.name[0]}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{data.name}</span>
                        <span style={{ fontSize: 10, color: 'var(--dim)' }}>({data.requests.length} squares)</span>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => handleBulkApprove(playerId)}
                          style={{ background: 'var(--green)', color: 'var(--bg)', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 10, fontWeight: 700 }}
                        >
                          Approve All
                        </button>
                        <button
                          onClick={() => handleBulkReject(playerId)}
                          style={{ background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 4, padding: '4px 8px', fontSize: 10, fontWeight: 700 }}
                        >
                          Reject All
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {data.requests.map(req => (
                        <div key={`${req.row}-${req.col}`} style={{ fontSize: 10, background: 'var(--bg)', padding: '2px 6px', borderRadius: 4, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>
                          ({req.row},{req.col})
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}

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
                    const isPendingApproval = cell?.claim_status === 'pending';
                    const isClaimed = !!cell?.player_id;
                    const isUnpaid = isClaimed && !pool.players.find(p => p.id === cell.player_id)?.paid;
                    const playerColor = isClaimed ? (playerColors[cell!.player_id!] || 'var(--muted)') : null;
                    const winner = pool.winners.find(w => w.square_row === r && w.square_col === c);

                    // Determine border style
                    let borderStyle: string;
                    if (winner) {
                      borderStyle = '2px solid var(--gold)';
                    } else if (isSelected) {
                      borderStyle = `2px solid ${isClaimed ? playerColor : 'var(--green)'}`;
                    } else if (isPendingApproval) {
                      borderStyle = '2px dashed #A78BFA'; // purple for pending approval
                    } else if (isUnpaid && cell?.claim_status === 'claimed') {
                      borderStyle = '1px dashed var(--orange)';
                    } else if (isClaimed) {
                      borderStyle = `1px solid ${playerColor}40`;
                    } else {
                      borderStyle = '1px solid var(--border)'; // Unclaimed: subtle border
                    }

                    // Determine background
                    let bgColor: string;
                    if (winner) {
                      bgColor = 'rgba(251, 191, 36, 0.2)';
                    } else if (isPendingApproval) {
                      bgColor = 'rgba(167, 139, 250, 0.15)';
                    } else if (isClaimed && playerColor) {
                      bgColor = `${playerColor}15`;
                    } else {
                      bgColor = 'var(--surface)'; // Unclaimed: clean surface
                    }

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
                          background: bgColor,
                          border: borderStyle,
                          borderRadius: 3,
                          cursor: 'pointer',
                          position: 'relative',
                        }}
                      >
                        {isClaimed ? (
                          <span style={{ fontSize: 9, fontWeight: 800, color: isPendingApproval ? '#A78BFA' : isUnpaid ? 'var(--orange)' : playerColor || 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                            {cell.player_name?.split(' ')[0]?.substring(0, 3)?.toUpperCase()}
                          </span>
                        ) : (
                          <span style={{ fontSize: 14, color: 'var(--dim)', opacity: 0.5 }}>+</span>
                        )}
                        {winner && <div style={{ position: 'absolute', top: -3, right: -3, fontSize: 10 }}>🏆</div>}
                        {isPendingApproval && <div style={{ position: 'absolute', top: -3, right: -3, fontSize: 8 }}>⏳</div>}
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

          {/* Live Score Display */}
          {isLocked && pool.external_game_id && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, fontFamily: 'var(--font-mono)' }}>
                  LIVE SCORE
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={autoSync}
                      onChange={e => setAutoSync(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    Auto-sync (30s)
                  </label>
                  <button
                    onClick={handleSyncScores}
                    disabled={syncing}
                    style={{
                      background: 'transparent',
                      color: 'var(--blue)',
                      border: '1px solid var(--blue)',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      opacity: syncing ? 0.5 : 1,
                    }}
                  >
                    {syncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                </div>
              </div>

              {liveScore ? (
                <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 24, marginBottom: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>{pool.away_team}</div>
                      <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>{liveScore.awayScore}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: 'var(--dim)' }}>vs</div>
                      {liveScore.clock && (
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
                          {liveScore.clock}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{pool.home_team}</div>
                      <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{liveScore.homeScore}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 700,
                      background: liveScore.status === 'in_progress' ? 'rgba(74, 222, 128, 0.15)' : liveScore.status === 'final' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(136, 137, 164, 0.15)',
                      color: liveScore.status === 'in_progress' ? 'var(--green)' : liveScore.status === 'final' ? 'var(--gold)' : 'var(--muted)',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {liveScore.statusDetail || liveScore.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Current Winner */}
                  {currentWinner && liveScore.status !== 'scheduled' && (
                    <div style={{ marginTop: 16, padding: 12, background: 'rgba(74, 222, 128, 0.1)', borderRadius: 8, border: '1px solid rgba(74, 222, 128, 0.3)', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                        {liveScore.status === 'final' ? 'WINNER' : 'CURRENT LEADER'}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
                        {currentWinner.player_name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                        Square ({currentWinner.square_row}, {currentWinner.square_col}) •
                        Digits: {pool.away_team} {liveScore.awayScore % 10} - {pool.home_team} {liveScore.homeScore % 10}
                      </div>
                    </div>
                  )}

                  {lastSyncTime && (
                    <div style={{ textAlign: 'center', marginTop: 8, fontSize: 10, color: 'var(--dim)' }}>
                      Last updated: {lastSyncTime.toLocaleTimeString()}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>
                  Click "Sync Now" to fetch live scores
                </div>
              )}
            </div>
          )}

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
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
                            🏆 {winner.player_name}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>
                            ${winner.payout_amount}
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>
                            ({existingScore?.away_score} % 10 = {(existingScore?.away_score ?? 0) % 10}, {existingScore?.home_score} % 10 = {(existingScore?.home_score ?? 0) % 10})
                          </div>
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
            <CellAssignmentModal
              selectedCell={selectedCell}
              selectedCellData={selectedCellData}
              pool={pool}
              playerColors={playerColors}
              onClose={() => setSelectedCell(null)}
              onApprove={handleApprove}
              onReject={handleReject}
              onRelease={handleRelease}
              onAssign={handleAssign}
              onAddPlayer={handleAddPlayer}
              onReload={loadPool}
            />
          )}
        </div>
      )}

      {/* Players Tab */}
      {tab === 'players' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>
              {pool.players.length} PLAYERS
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {!isAdminInPool && (
                <button
                  onClick={handleAdminJoinPool}
                  disabled={joiningPool}
                  style={{
                    background: 'var(--blue)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    padding: '5px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    opacity: joiningPool ? 0.6 : 1,
                  }}
                >
                  {joiningPool ? 'Joining...' : '🎲 Join Pool Myself'}
                </button>
              )}
              <button
                onClick={() => setShowPaymentModal(true)}
                style={{ background: 'var(--green)', color: 'var(--bg)', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700 }}
              >
                💵 Record Payment
              </button>
              <button
                onClick={() => setShowAddPlayer(true)}
                style={{ background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700 }}
              >
                + Add Player
              </button>
            </div>
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
                      <div style={{ fontSize: 10, color: 'var(--dim)' }}>${(p.square_count || 0) * pool.denomination} owed</div>
                    </div>
                    {(() => {
                      const owed = (p.square_count || 0) * pool.denomination;
                      const paid = p.amount_paid || 0;
                      const remaining = owed - paid;
                      const isFullyPaid = remaining <= 0 && owed > 0;
                      const isPartial = paid > 0 && remaining > 0;
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{
                            padding: '2px 8px',
                            borderRadius: 20,
                            fontSize: 10,
                            fontWeight: 700,
                            background: isFullyPaid ? 'rgba(74, 222, 128, 0.15)' : isPartial ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 146, 60, 0.15)',
                            color: isFullyPaid ? 'var(--green)' : isPartial ? 'var(--gold)' : 'var(--orange)',
                            border: `1px solid ${isFullyPaid ? 'rgba(74, 222, 128, 0.25)' : isPartial ? 'rgba(251, 191, 36, 0.25)' : 'rgba(251, 146, 60, 0.25)'}`,
                            fontFamily: 'var(--font-mono)'
                          }}>
                            ${paid} / ${owed}
                          </div>
                          <input
                            id={`payment-${p.id}`}
                            type="number"
                            min="0"
                            max={owed}
                            placeholder={remaining > 0 ? `$${remaining}` : '$0'}
                            style={{ width: 60, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 6px', fontSize: 10, color: 'var(--fg)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter') {
                                const input = e.target as HTMLInputElement;
                                const newAmount = parseInt(input.value) || 0;
                                const totalPaid = paid + newAmount;
                                if (newAmount > 0) {
                                  try {
                                    await playersApi.updatePayment(pool.id, p.id, totalPaid >= owed, undefined, totalPaid);
                                    input.value = '';
                                    loadPool();
                                  } catch (err) {
                                    alert('Failed to update payment');
                                  }
                                }
                              }
                            }}
                          />
                          <button
                            onClick={async () => {
                              const input = document.getElementById(`payment-${p.id}`) as HTMLInputElement;
                              const newAmount = parseInt(input?.value) || 0;
                              const totalPaid = paid + newAmount;
                              if (newAmount > 0) {
                                try {
                                  await playersApi.updatePayment(pool.id, p.id, totalPaid >= owed, undefined, totalPaid);
                                  if (input) input.value = '';
                                  loadPool();
                                } catch (err) {
                                  alert('Failed to update payment');
                                }
                              }
                            }}
                            style={{ background: 'var(--blue)', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 9, color: '#fff', fontFamily: 'var(--font-mono)', cursor: 'pointer', fontWeight: 600 }}
                            title="Add this payment amount"
                          >
                            +Pay
                          </button>
                          {!isFullyPaid && owed > 0 && (
                            <button
                              onClick={() => handleTogglePayment(p.id, false)}
                              style={{ background: 'var(--green)', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 9, color: 'var(--bg)', fontFamily: 'var(--font-mono)', cursor: 'pointer', fontWeight: 600 }}
                              title="Mark as fully paid"
                            >
                              Paid✓
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    <button
                      onClick={async () => {
                        const confirmed = confirm(`Remove ${p.name} from this pool? Their squares will be released.${p.paid ? ' Any payments will be refunded to their wallet.' : ''}`);
                        if (!confirmed) return;
                        try {
                          const result = await playersApi.remove(pool.id, p.id);
                          const res = result as any;
                          if (res.refundAmount && res.refundAmount > 0) {
                            alert(`${p.name} removed. $${res.refundAmount} refunded to their wallet.`);
                          } else {
                            alert(`${p.name} removed from pool.`);
                          }
                          loadPool();
                        } catch (error) {
                          alert(error instanceof Error ? error.message : 'Failed to remove player');
                        }
                      }}
                      style={{ background: 'none', border: '1px solid var(--red)', borderRadius: 6, padding: '4px 8px', fontSize: 10, color: 'var(--red)', fontFamily: 'var(--font-mono)' }}
                    >
                      Remove
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

          {/* Payment modal */}
          {showPaymentModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={resetPaymentModal}>
              <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 500, maxHeight: '85vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0 }}>💵 Record Payment</h3>
                  <button onClick={resetPaymentModal} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
                </div>

                {/* Player search */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>PLAYER</div>
                  <input
                    placeholder="Search by name, phone, or email..."
                    value={paymentSearch}
                    onChange={e => handlePaymentSearch(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
                  />
                  {paymentSearchResults.length > 0 && (
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, maxHeight: 150, overflowY: 'auto' }}>
                      {paymentSearchResults.map(p => (
                        <div
                          key={p.id}
                          onClick={() => handleSelectPaymentPlayer(p)}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        >
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--dim)' }}>{p.phone || p.email}</div>
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.pool_count} pools</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Quick select from current pool */}
                  {!selectedPaymentPlayer && paymentSearch.length < 2 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 6 }}>Or select from this pool:</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {pool.players.slice(0, 8).map(p => (
                          <button
                            key={p.id}
                            onClick={() => handleSelectPaymentPlayer({ id: p.id, name: p.name, phone: p.phone || undefined, email: p.email || undefined, pool_count: 1 })}
                            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 10, color: 'var(--text)', cursor: 'pointer' }}
                          >
                            {p.name.split(' ')[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Selected player info */}
                {selectedPaymentPlayer && paymentPlayerSummary && (
                  <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedPaymentPlayer.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--dim)' }}>{selectedPaymentPlayer.phone || selectedPaymentPlayer.email}</div>
                      </div>
                      <button onClick={() => { setSelectedPaymentPlayer(null); setPaymentSearch(''); setPaymentPlayerSummary(null); setPaymentWalletBalance(null); setUseCredit(''); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Change</button>
                    </div>

                    {/* Current Pool Status - most important for recording payment */}
                    {(() => {
                      const currentPoolData = paymentPlayerSummary.pools.find(p => p.poolId === pool.id);
                      const playerInPool = pool.players.find(p => p.id === selectedPaymentPlayer.id);
                      const squareCount = currentPoolData?.squareCount || playerInPool?.square_count || 0;
                      const isPaidInPool = playerInPool?.paid;
                      const owedForPool = squareCount * pool.denomination;
                      const paidForPool = currentPoolData?.totalPaid || 0;
                      const remainingForPool = owedForPool - paidForPool;

                      return (
                        <div style={{ background: 'var(--surface)', borderRadius: 8, padding: 12, marginBottom: 12, border: `1px solid ${isPaidInPool ? 'var(--green)' : 'var(--orange)'}30` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>This Pool: {pool.away_team} vs {pool.home_team}</div>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: 20,
                              fontSize: 9,
                              fontWeight: 700,
                              background: isPaidInPool ? 'rgba(74, 222, 128, 0.15)' : 'rgba(251, 146, 60, 0.15)',
                              color: isPaidInPool ? 'var(--green)' : 'var(--orange)',
                            }}>
                              {isPaidInPool ? '✓ PAID' : 'UNPAID'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 10 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 9, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>SQUARES</div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>{squareCount}</div>
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 9, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>OWED</div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>${owedForPool}</div>
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 9, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>PAID</div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>${paidForPool}</div>
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 9, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>REMAINING</div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: remainingForPool > 0 ? 'var(--orange)' : 'var(--green)', fontFamily: 'var(--font-mono)' }}>
                                {remainingForPool > 0 ? `$${remainingForPool}` : '✓'}
                              </div>
                            </div>
                          </div>
                          {remainingForPool > 0 && (
                            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--orange)', background: 'rgba(251, 146, 60, 0.1)', padding: '6px 8px', borderRadius: 4 }}>
                              💡 Needs ${remainingForPool} more to be fully paid for {squareCount} square{squareCount !== 1 ? 's' : ''}
                            </div>
                          )}
                          {squareCount === 0 && (
                            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--muted)', background: 'rgba(136, 137, 164, 0.1)', padding: '6px 8px', borderRadius: 4 }}>
                              ℹ️ No squares yet. Payment will auto-assign random squares.
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Overall totals across all pools */}
                    <div style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>ALL POOLS TOTAL:</div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 70 }}>
                        <div style={{ fontSize: 9, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>OWED</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--orange)', fontFamily: 'var(--font-mono)' }}>${paymentPlayerSummary.totals.totalOwed}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 70 }}>
                        <div style={{ fontSize: 9, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>PAID</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>${paymentPlayerSummary.totals.totalPaid}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 70 }}>
                        <div style={{ fontSize: 9, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>BALANCE</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: paymentPlayerSummary.totals.balance < 0 ? 'var(--red)' : paymentPlayerSummary.totals.balance > 0 ? 'var(--orange)' : 'var(--green)', fontFamily: 'var(--font-mono)' }}>
                          {paymentPlayerSummary.totals.balance === 0 ? '✓' : (paymentPlayerSummary.totals.balance < 0 ? `+$${Math.abs(paymentPlayerSummary.totals.balance)}` : `-$${paymentPlayerSummary.totals.balance}`)}
                        </div>
                      </div>
                    </div>

                    {/* Wallet balance */}
                    {paymentWalletBalance && paymentWalletBalance.unassignedCredit > 0 && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', background: 'rgba(251, 191, 36, 0.1)', borderRadius: 8, padding: 12, marginLeft: -14, marginRight: -14, marginBottom: -14, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>💰 AVAILABLE CREDIT</div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>${paymentWalletBalance.unassignedCredit}</div>
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--dim)', textAlign: 'right', maxWidth: 150 }}>
                            Can be applied to this pool below
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Pool breakdown */}
                    {paymentPlayerSummary.pools.length > 1 && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 6 }}>Other pools ({paymentPlayerSummary.pools.length - 1}):</div>
                        {paymentPlayerSummary.pools.filter(p => p.poolId !== pool.id).map(p => (
                          <div key={p.poolId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
                            <span style={{ color: 'var(--text)' }}>{p.poolName}</span>
                            <span style={{ color: p.balance > 0 ? 'var(--orange)' : 'var(--green)' }}>
                              {p.squareCount} sq × ${p.denomination} = ${p.totalOwed} {p.balance > 0 ? `(owes $${p.balance})` : '✓'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Payment amount */}
                {selectedPaymentPlayer && (
                  <>
                    {/* Use existing credit (if available) */}
                    {paymentMode === 'single' && paymentWalletBalance && paymentWalletBalance.unassignedCredit > 0 && (
                      <div style={{ marginBottom: 16, background: 'rgba(251, 191, 36, 0.05)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: 10, padding: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, marginBottom: 8, fontFamily: 'var(--font-mono)' }}>💰 USE EXISTING CREDIT</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--gold)' }}>$</span>
                          <input
                            type="number"
                            placeholder="0"
                            max={paymentWalletBalance.unassignedCredit}
                            value={useCredit}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              if (val <= paymentWalletBalance.unassignedCredit) {
                                setUseCredit(e.target.value);
                              }
                            }}
                            style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--gold)', fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', outline: 'none' }}
                          />
                          <button
                            onClick={() => setUseCredit(paymentWalletBalance.unassignedCredit.toString())}
                            style={{ background: 'var(--gold)', color: 'var(--bg)', border: 'none', borderRadius: 6, padding: '8px 12px', fontSize: 11, fontWeight: 700 }}
                          >
                            Use All
                          </button>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 6 }}>
                          Available: ${paymentWalletBalance.unassignedCredit}
                          {useCredit && parseFloat(useCredit) > 0 && (
                            <span> → Remaining after: ${paymentWalletBalance.unassignedCredit - (parseFloat(useCredit) || 0)}</span>
                          )}
                        </div>
                      </div>
                    )}

                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
                        {paymentMode === 'single' && paymentWalletBalance && paymentWalletBalance.unassignedCredit > 0 ? '➕ ADD NEW MONEY (optional)' : 'AMOUNT RECEIVED'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>$</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={paymentAmount}
                          onChange={e => setPaymentAmount(e.target.value)}
                          style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', outline: 'none' }}
                        />
                      </div>
                      {/* Show calculation based on total (credit + new money) */}
                      {(() => {
                        const creditAmt = parseFloat(useCredit) || 0;
                        const newAmt = parseFloat(paymentAmount) || 0;
                        const total = creditAmt + newAmt;
                        if (total > 0) {
                          const squareCount = Math.floor(total / pool.denomination);
                          return (
                            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
                              {creditAmt > 0 && newAmt > 0 ? (
                                <span>${creditAmt} credit + ${newAmt} new = <strong style={{ color: 'var(--green)' }}>${total} total</strong> → </span>
                              ) : null}
                              {squareCount} square{squareCount !== 1 ? 's' : ''} @ ${pool.denomination}/sq in this pool
                              {total % pool.denomination > 0 && (
                                <span style={{ color: 'var(--orange)' }}> (${total % pool.denomination} leftover as credit)</span>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    {/* Payment mode */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 8, fontFamily: 'var(--font-mono)' }}>WHAT TO DO</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {/* Just Buy Me In - Auto assign random squares */}
                        <button
                          onClick={() => setPaymentMode('single')}
                          style={{
                            background: paymentMode === 'single' ? 'rgba(74, 222, 128, 0.15)' : 'var(--bg)',
                            color: paymentMode === 'single' ? 'var(--green)' : 'var(--muted)',
                            border: `1px solid ${paymentMode === 'single' ? 'var(--green)' : 'var(--border)'}`,
                            borderRadius: 8,
                            padding: '12px',
                            textAlign: 'left',
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700 }}>🎲 Just Buy Me In (This Pool)</div>
                          <div style={{ fontSize: 10, marginTop: 4, opacity: 0.8 }}>
                            Auto-assign random available squares. Player doesn't pick.
                          </div>
                        </button>

                        {/* Distribute across all pools */}
                        {paymentPlayerSummary && paymentPlayerSummary.pools.length > 1 && (
                          <button
                            onClick={() => setPaymentMode('auto')}
                            style={{
                              background: paymentMode === 'auto' ? 'rgba(96, 165, 250, 0.15)' : 'var(--bg)',
                              color: paymentMode === 'auto' ? 'var(--blue)' : 'var(--muted)',
                              border: `1px solid ${paymentMode === 'auto' ? 'var(--blue)' : 'var(--border)'}`,
                              borderRadius: 8,
                              padding: '12px',
                              textAlign: 'left',
                            }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 700 }}>📊 Buy Into All Pools</div>
                            <div style={{ fontSize: 10, marginTop: 4, opacity: 0.8 }}>
                              Spread payment across {paymentPlayerSummary.pools.length} pools, auto-assign squares.
                            </div>
                          </button>
                        )}

                        {/* Add to wallet/credit */}
                        <button
                          onClick={() => setPaymentMode('credit')}
                          style={{
                            background: paymentMode === 'credit' ? 'rgba(251, 191, 36, 0.15)' : 'var(--bg)',
                            color: paymentMode === 'credit' ? 'var(--gold)' : 'var(--muted)',
                            border: `1px solid ${paymentMode === 'credit' ? 'var(--gold)' : 'var(--border)'}`,
                            borderRadius: 8,
                            padding: '12px',
                            textAlign: 'left',
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700 }}>💰 Add to Player Credit</div>
                          <div style={{ fontSize: 10, marginTop: 4, opacity: 0.8 }}>
                            Store as credit. Apply to any pool later.
                          </div>
                        </button>
                      </div>
                      {paymentMode === 'auto' && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 4 }}>Strategy:</div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => setPaymentStrategy('sequential')}
                              style={{ flex: 1, background: paymentStrategy === 'sequential' ? 'var(--surface)' : 'transparent', border: `1px solid ${paymentStrategy === 'sequential' ? 'var(--blue)' : 'var(--border)'}`, borderRadius: 4, padding: '6px', fontSize: 10, color: paymentStrategy === 'sequential' ? 'var(--blue)' : 'var(--dim)' }}
                            >
                              Fill one at a time
                            </button>
                            <button
                              onClick={() => setPaymentStrategy('even')}
                              style={{ flex: 1, background: paymentStrategy === 'even' ? 'var(--surface)' : 'transparent', border: `1px solid ${paymentStrategy === 'even' ? 'var(--blue)' : 'var(--border)'}`, borderRadius: 4, padding: '6px', fontSize: 10, color: paymentStrategy === 'even' ? 'var(--blue)' : 'var(--dim)' }}
                            >
                              Spread evenly
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Result message */}
                    {paymentResult && (
                      <div style={{ background: paymentResult.success ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: `1px solid ${paymentResult.success ? 'var(--green)' : 'var(--red)'}`, borderRadius: 8, padding: 12, marginBottom: 16 }}>
                        <div style={{ fontSize: 12, color: paymentResult.success ? 'var(--green)' : 'var(--red)' }}>
                          {paymentResult.success ? '✓ ' : '✕ '}{paymentResult.message}
                        </div>
                      </div>
                    )}

                    {/* Submit */}
                    {(() => {
                      const creditAmt = parseFloat(useCredit) || 0;
                      const newAmt = parseFloat(paymentAmount) || 0;
                      const total = creditAmt + newAmt;
                      const hasAmount = total > 0;

                      let buttonText = 'Enter an amount';
                      if (paymentLoading) {
                        buttonText = 'Recording...';
                      } else if (paymentMode === 'credit' && newAmt > 0) {
                        buttonText = `Add $${newAmt} to Wallet`;
                      } else if (creditAmt > 0 && newAmt > 0) {
                        buttonText = `Apply $${creditAmt} Credit + $${newAmt} New = $${total}`;
                      } else if (creditAmt > 0) {
                        buttonText = `Apply $${creditAmt} Credit`;
                      } else if (newAmt > 0) {
                        buttonText = `Record $${newAmt} Payment`;
                      }

                      return (
                        <button
                          onClick={handleRecordPayment}
                          disabled={!hasAmount || paymentLoading}
                          style={{ width: '100%', background: 'var(--green)', color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '14px', fontSize: 14, fontWeight: 700, opacity: (!hasAmount || paymentLoading) ? 0.5 : 1 }}
                        >
                          {buttonText}
                        </button>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {tab === 'settings' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', marginBottom: 20 }}>⚙️ Pool Settings</h3>

          {settingsMessage && (
            <div style={{
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
              background: settingsMessage.success ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${settingsMessage.success ? 'var(--green)' : 'var(--red)'}`,
              color: settingsMessage.success ? 'var(--green)' : 'var(--red)',
              fontSize: 12,
            }}>
              {settingsMessage.text}
            </div>
          )}

          <div style={{ display: 'grid', gap: 16 }}>
            {/* Denomination */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 6 }}>
                DENOMINATION ($ per square)
              </label>
              <select
                value={settingsDenomination}
                onChange={e => setSettingsDenomination(parseInt(e.target.value))}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'var(--text)', fontSize: 14 }}
              >
                {[1, 5, 10, 25, 50, 100].map(d => (
                  <option key={d} value={d}>${d}</option>
                ))}
              </select>
              {settingsDenomination !== pool.denomination && (
                <div style={{ marginTop: 6, padding: 8, background: 'rgba(251, 191, 36, 0.1)', borderRadius: 6, fontSize: 11, color: 'var(--gold)' }}>
                  ⚠️ Changing denomination will auto-refund the difference to players who already paid (if lowering).
                </div>
              )}
            </div>

            {/* Max Per Player */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 6 }}>
                MAX SQUARES PER PLAYER
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={settingsMaxPerPlayer}
                onChange={e => setSettingsMaxPerPlayer(parseInt(e.target.value) || 10)}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'var(--text)', fontSize: 14 }}
              />
            </div>

            {/* Tip Percentage */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 6 }}>
                SUGGESTED TIP %
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={settingsTipPct}
                onChange={e => setSettingsTipPct(parseInt(e.target.value) || 0)}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'var(--text)', fontSize: 14 }}
              />
            </div>

            {/* Payout Structure */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 6 }}>
                PAYOUT STRUCTURE
              </label>
              <select
                value={settingsPayoutStructure}
                onChange={e => {
                  const newStructure = e.target.value as PayoutStructure;
                  setSettingsPayoutStructure(newStructure);
                  // Initialize custom payouts if switching to custom and they're empty
                  if (newStructure === 'custom' && Object.keys(settingsCustomPayouts).length === 0 && pool) {
                    const sportConfig = SPORTS_CONFIG[pool.sport as keyof typeof SPORTS_CONFIG];
                    const periods = sportConfig?.periods || ['Q1', 'Q2', 'Q3', 'Q4'];
                    const defaultPayouts: Record<string, number> = {};
                    periods.forEach((p, i) => {
                      defaultPayouts[p.toLowerCase()] = Math.floor(100 / periods.length) + (i === periods.length - 1 ? 100 % periods.length : 0);
                    });
                    setSettingsCustomPayouts(defaultPayouts);
                  }
                }}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'var(--text)', fontSize: 14 }}
              >
                <option value="standard">Standard (Equal split)</option>
                <option value="heavy_final">Heavy Final (10% each, rest to Final)</option>
                <option value="halftime_final">Halftime & Final (25% / 75%)</option>
                <option value="reverse">Reverse (40% Q1, decreasing)</option>
                <option value="custom">Custom</option>
              </select>

              {/* Custom Payouts Editor */}
              {settingsPayoutStructure === 'custom' && (
                <div style={{ marginTop: 12, padding: 12, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', marginBottom: 8 }}>
                    CUSTOM PERCENTAGES (must total 100%)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(settingsCustomPayouts).map(([period, pct]) => (
                      <div key={period} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)', width: 30 }}>
                          {period.toUpperCase()}
                        </span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={pct}
                          onChange={e => setSettingsCustomPayouts(prev => ({
                            ...prev,
                            [period]: parseInt(e.target.value) || 0
                          }))}
                          style={{ width: 50, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}
                        />
                        <span style={{ fontSize: 11, color: 'var(--dim)' }}>%</span>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const total = Object.values(settingsCustomPayouts).reduce((sum, pct) => sum + pct, 0);
                    const isValid = Math.abs(total - 100) < 0.01;
                    return (
                      <div style={{ marginTop: 8, fontSize: 11, color: isValid ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}>
                        Total: {total}% {isValid ? '✓' : '(must be 100%)'}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Save Button */}
            <button
              onClick={async () => {
                setSettingsSaving(true);
                setSettingsMessage(null);
                try {
                  // Validate custom payouts total 100% before saving
                  if (settingsPayoutStructure === 'custom') {
                    const total = Object.values(settingsCustomPayouts).reduce((sum, pct) => sum + pct, 0);
                    if (Math.abs(total - 100) >= 0.01) {
                      throw new Error(`Custom payouts must total 100% (currently ${total}%)`);
                    }
                  }

                  const result = await poolsApi.update(pool.id, {
                    denomination: settingsDenomination,
                    max_per_player: settingsMaxPerPlayer,
                    tip_pct: settingsTipPct,
                    payout_structure: settingsPayoutStructure,
                    ...(settingsPayoutStructure === 'custom' && { custom_payouts: settingsCustomPayouts }),
                  });

                  const refundsProcessed = (result as any).refundsProcessed;
                  if (refundsProcessed && refundsProcessed.length > 0) {
                    const totalRefunded = refundsProcessed.reduce((sum: number, r: any) => sum + r.refundAmount, 0);
                    setSettingsMessage({
                      success: true,
                      text: `Settings saved! ${refundsProcessed.length} player(s) refunded $${totalRefunded} total.`
                    });
                  } else {
                    setSettingsMessage({ success: true, text: 'Settings saved successfully!' });
                  }

                  loadPool();
                } catch (error) {
                  setSettingsMessage({ success: false, text: error instanceof Error ? error.message : 'Failed to save settings' });
                } finally {
                  setSettingsSaving(false);
                }
              }}
              disabled={settingsSaving}
              style={{
                background: 'var(--green)',
                color: 'var(--bg)',
                border: 'none',
                borderRadius: 8,
                padding: '14px',
                fontSize: 14,
                fontWeight: 700,
                cursor: settingsSaving ? 'not-allowed' : 'pointer',
                opacity: settingsSaving ? 0.6 : 1,
              }}
            >
              {settingsSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          {/* Danger Zone */}
          <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>
              🚨 DANGER ZONE
            </h4>

            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                background: 'transparent',
                color: 'var(--red)',
                border: '1px solid var(--red)',
                borderRadius: 8,
                padding: '12px 20px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🗑️ Delete Pool
            </button>
          </div>
        </div>
      )}

      {/* Delete Pool Modal */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--red)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 400, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🗑️</div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--red)', marginBottom: 12 }}>Delete Pool?</h3>
            <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 8 }}>
              This will permanently delete <strong>{pool.name}</strong>
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 24 }}>
              All players who have paid will be automatically refunded to their wallet. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                style={{
                  flex: 1,
                  background: 'transparent',
                  color: 'var(--muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '14px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setDeleting(true);
                  try {
                    const result = await poolsApi.delete(pool.id);
                    const res = result as any;
                    // Navigate to pools list with success message in state
                    navigate('/pools', {
                      state: {
                        message: res.refundsProcessed?.length > 0
                          ? `Pool deleted. ${res.refundsProcessed.length} player(s) refunded $${res.totalRefunded} total.`
                          : 'Pool deleted successfully.'
                      }
                    });
                  } catch (error) {
                    setShowDeleteConfirm(false);
                    setDeleting(false);
                    // Show error inline instead of alert
                    alert(error instanceof Error ? error.message : 'Failed to delete pool');
                  }
                }}
                disabled={deleting}
                style={{
                  flex: 1,
                  background: 'var(--red)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  padding: '14px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Pool Modal */}
      {showShareModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowShareModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 550, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0 }}>📤 Share Pool</h3>
              <button onClick={() => setShowShareModal(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{pool.away_team} vs {pool.home_team}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>${pool.denomination}/square • {claimedCount}/100 claimed</div>
            </div>

            {loadingLinks ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>Loading invite links...</div>
            ) : inviteLinks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
                <div style={{ color: 'var(--muted)', marginBottom: 12 }}>No players added yet.</div>
                <div style={{ fontSize: 12, color: 'var(--dim)' }}>Add players from the Players tab first, then come back here to get their invite links.</div>
              </div>
            ) : (
              <>
                {/* Bulk actions */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button
                    onClick={handleSendInvites}
                    disabled={sendingInvites}
                    style={{
                      flex: 1,
                      background: 'var(--blue)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      padding: '10px 14px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: sendingInvites ? 'not-allowed' : 'pointer',
                      opacity: sendingInvites ? 0.6 : 1,
                    }}
                  >
                    {sendingInvites ? 'Sending...' : '📨 Send Invites to All'}
                  </button>
                  <button
                    onClick={handleSendReminders}
                    disabled={sendingReminders}
                    style={{
                      flex: 1,
                      background: 'var(--orange)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      padding: '10px 14px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: sendingReminders ? 'not-allowed' : 'pointer',
                      opacity: sendingReminders ? 0.6 : 1,
                    }}
                  >
                    {sendingReminders ? 'Sending...' : '💸 Send Payment Reminders'}
                  </button>
                </div>

                {/* Notification result */}
                {notifyResult && (
                  <div style={{
                    padding: 10,
                    borderRadius: 8,
                    marginBottom: 12,
                    background: notifyResult.success ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${notifyResult.success ? 'var(--green)' : 'var(--red)'}`,
                    color: notifyResult.success ? 'var(--green)' : 'var(--red)',
                    fontSize: 12,
                  }}>
                    {notifyResult.success ? '✓ ' : '✕ '}{notifyResult.message}
                  </div>
                )}

                {/* Copy all links */}
                <button
                  onClick={copyAllLinks}
                  style={{
                    width: '100%',
                    background: copiedLink === 'all' ? 'var(--green)' : 'var(--bg)',
                    color: copiedLink === 'all' ? 'var(--bg)' : 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    marginBottom: 16,
                    cursor: 'pointer',
                  }}
                >
                  {copiedLink === 'all' ? '✓ Copied All!' : '📋 Copy All Links'}
                </button>

                {/* Individual players */}
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 8, fontFamily: 'var(--font-mono)' }}>
                  PLAYER INVITE LINKS ({inviteLinks.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {inviteLinks.map(p => (
                    <div key={p.id} style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--text)' }}>
                            {p.name[0]}
                          </div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--dim)' }}>{p.phone || p.email}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: 10,
                            fontSize: 9,
                            fontWeight: 700,
                            background: p.paid ? 'rgba(74, 222, 128, 0.15)' : 'rgba(251, 146, 60, 0.15)',
                            color: p.paid ? 'var(--green)' : 'var(--orange)',
                          }}>
                            {p.paid ? 'PAID' : 'UNPAID'}
                          </span>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: 10,
                            fontSize: 9,
                            fontWeight: 700,
                            background: 'rgba(96, 165, 250, 0.15)',
                            color: 'var(--blue)',
                          }}>
                            {p.square_count} sq
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => copyInviteLink(p.auth_token, p.name)}
                          style={{
                            flex: 1,
                            background: copiedLink === p.auth_token ? 'var(--green)' : 'var(--surface)',
                            color: copiedLink === p.auth_token ? 'var(--bg)' : 'var(--text)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            padding: '6px 10px',
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {copiedLink === p.auth_token ? '✓ Copied!' : '🔗 Copy Link'}
                        </button>
                        <button
                          onClick={() => copyShareMessage(p)}
                          style={{
                            flex: 1,
                            background: copiedLink === p.auth_token + '-msg' ? 'var(--green)' : 'var(--surface)',
                            color: copiedLink === p.auth_token + '-msg' ? 'var(--bg)' : 'var(--text)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            padding: '6px 10px',
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {copiedLink === p.auth_token + '-msg' ? '✓ Copied!' : '💬 Copy Message'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 16, padding: 12, background: 'rgba(96, 165, 250, 0.1)', borderRadius: 8, fontSize: 11, color: 'var(--blue)' }}>
                  💡 Each player has a unique link. When they open it, they can view the grid and claim squares (if the pool is still open).
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
