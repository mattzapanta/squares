import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { allPlayers, PlayerWithStats, PlayerDetail } from '../api/client';

export default function Players() {
  const [playerList, setPlayerList] = useState<PlayerWithStats[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Create player modal
  const [showCreate, setShowCreate] = useState(false);
  const [newPlayer, setNewPlayer] = useState({ name: '', phone: '', email: '' });
  const [createError, setCreateError] = useState('');

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({ name: '', phone: '', email: '' });

  const loadPlayers = async (searchQuery?: string) => {
    try {
      const data = await allPlayers.list(searchQuery);
      setPlayerList(data);
    } catch (error) {
      console.error('Failed to load players:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPlayerDetails = async (playerId: string) => {
    try {
      const data = await allPlayers.get(playerId);
      setSelectedPlayer(data);
      setEditData({
        name: data.name,
        phone: data.phone || '',
        email: data.email || '',
      });
    } catch (error) {
      console.error('Failed to load player:', error);
    }
  };

  useEffect(() => {
    loadPlayers();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPlayers(search || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleCreatePlayer = async () => {
    if (!newPlayer.name.trim()) return;
    if (!newPlayer.phone.trim() && !newPlayer.email.trim()) {
      setCreateError('Phone or email is required');
      return;
    }
    setCreateError('');
    try {
      await allPlayers.create(
        newPlayer.name,
        newPlayer.phone || undefined,
        newPlayer.email || undefined
      );
      setShowCreate(false);
      setNewPlayer({ name: '', phone: '', email: '' });
      loadPlayers(search || undefined);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create player');
    }
  };

  const handleUpdatePlayer = async () => {
    if (!selectedPlayer) return;
    try {
      await allPlayers.update(selectedPlayer.id, {
        name: editData.name,
        phone: editData.phone || null,
        email: editData.email || null,
      });
      setEditMode(false);
      loadPlayerDetails(selectedPlayer.id);
      loadPlayers(search || undefined);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update player');
    }
  };

  const handleDeletePlayer = async (playerId: string) => {
    if (!confirm('Are you sure you want to delete this player? They must not be in any pools.')) return;
    try {
      await allPlayers.delete(playerId);
      setSelectedPlayer(null);
      loadPlayers(search || undefined);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete player');
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>;
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
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
            <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0 }}>
              All Players
            </h1>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
              {playerList.length} player{playerList.length !== 1 ? 's' : ''} total
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ background: 'var(--green)', color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          + New Player
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <input
          placeholder="Search by name, phone, or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: 400, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Players list */}
        <div style={{ width: 380, flexShrink: 0 }}>
          {playerList.length === 0 ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 30, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>👤</div>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                {search ? 'No players found' : 'No players yet'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {playerList.map(p => (
                <div
                  key={p.id}
                  onClick={() => loadPlayerDetails(p.id)}
                  style={{
                    background: selectedPlayer?.id === p.id ? 'var(--surface)' : 'transparent',
                    border: `1px solid ${selectedPlayer?.id === p.id ? 'var(--green)' : 'var(--border)'}`,
                    borderRadius: 10,
                    padding: 14,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                        {p.phone || p.email || 'No contact'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>
                        {p.pool_count} pool{p.pool_count !== 1 ? 's' : ''}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--dim)' }}>
                        {p.total_squares} sq
                      </div>
                    </div>
                  </div>
                  {p.total_owed > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: p.total_paid >= p.total_owed ? 'rgba(74, 222, 128, 0.15)' : 'rgba(251, 146, 60, 0.15)', color: p.total_paid >= p.total_owed ? 'var(--green)' : 'var(--orange)' }}>
                        ${p.total_paid}/${p.total_owed}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Player details */}
        <div style={{ flex: 1 }}>
          {selectedPlayer ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
              {editMode ? (
                // Edit form
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Edit Player</h3>
                    <button onClick={() => setEditMode(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>Cancel</button>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', marginBottom: 6 }}>NAME</div>
                    <input
                      value={editData.name}
                      onChange={e => setEditData({ ...editData, name: e.target.value })}
                      style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', marginBottom: 6 }}>PHONE</div>
                    <input
                      value={editData.phone}
                      onChange={e => setEditData({ ...editData, phone: e.target.value })}
                      style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
                    />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', marginBottom: 6 }}>EMAIL</div>
                    <input
                      value={editData.email}
                      onChange={e => setEditData({ ...editData, email: e.target.value })}
                      style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
                    />
                  </div>
                  <button
                    onClick={handleUpdatePlayer}
                    style={{ width: '100%', background: 'var(--green)', color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '12px', fontSize: 14, fontWeight: 700 }}
                  >
                    Save Changes
                  </button>
                </div>
              ) : (
                // View mode
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(74, 222, 128, 0.15)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800 }}>
                        {selectedPlayer.name[0]}
                      </div>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedPlayer.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>
                          {selectedPlayer.phone && <span>{selectedPlayer.phone}</span>}
                          {selectedPlayer.phone && selectedPlayer.email && <span> • </span>}
                          {selectedPlayer.email && <span>{selectedPlayer.email}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => setEditMode(true)}
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeletePlayer(selectedPlayer.id)}
                        style={{ background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                    <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>POOLS</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>{selectedPlayer.pool_count}</div>
                    </div>
                    <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>SQUARES</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>{selectedPlayer.total_squares}</div>
                    </div>
                    <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>OWED</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--orange)', fontFamily: 'var(--font-mono)' }}>${selectedPlayer.total_owed}</div>
                    </div>
                    <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>PAID</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>${selectedPlayer.total_paid}</div>
                    </div>
                  </div>

                  {/* Groups */}
                  {selectedPlayer.groups.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, fontFamily: 'var(--font-mono)', marginBottom: 8 }}>GROUPS</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {selectedPlayer.groups.map(g => (
                          <span key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: `${g.color}15`, border: `1px solid ${g.color}40`, borderRadius: 20, padding: '4px 10px', fontSize: 11, color: g.color }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: g.color }} />
                            {g.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pools */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                    POOLS ({selectedPlayer.pools.length})
                  </div>
                  {selectedPlayer.pools.length === 0 ? (
                    <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
                      Not in any pools yet
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {selectedPlayer.pools.map(p => (
                        <Link key={p.id} to={`/pools/${p.id}`} style={{ textDecoration: 'none' }}>
                          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{p.name}</div>
                              <div style={{ fontSize: 10, color: 'var(--dim)' }}>{p.away_team} vs {p.home_team}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>
                                {p.square_count} sq
                              </div>
                              <div style={{ fontSize: 10, color: p.paid ? 'var(--green)' : 'var(--orange)' }}>
                                {p.paid ? 'Paid' : 'Unpaid'}
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>👈</div>
              <div style={{ color: 'var(--muted)' }}>Select a player to view details</div>
            </div>
          )}
        </div>
      </div>

      {/* Create Player Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowCreate(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0 }}>New Player</h3>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            {createError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--red)', borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 12, color: 'var(--red)' }}>
                {createError}
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>NAME *</div>
              <input
                placeholder="John Smith"
                value={newPlayer.name}
                onChange={e => setNewPlayer({ ...newPlayer, name: e.target.value })}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>PHONE</div>
              <input
                placeholder="555-123-4567"
                value={newPlayer.phone}
                onChange={e => setNewPlayer({ ...newPlayer, phone: e.target.value })}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>EMAIL</div>
              <input
                placeholder="john@example.com"
                value={newPlayer.email}
                onChange={e => setNewPlayer({ ...newPlayer, email: e.target.value })}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
              />
            </div>

            <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 16 }}>
              * Either phone or email is required
            </div>

            <button
              onClick={handleCreatePlayer}
              disabled={!newPlayer.name.trim()}
              style={{ width: '100%', background: 'var(--green)', color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: newPlayer.name.trim() ? 1 : 0.5 }}
            >
              Create Player
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
