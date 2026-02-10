import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { allPlayers, groups, PlayerWithStats, PlayerDetail, PlayerGroup, GroupWithMembers } from '../api/client';

const GROUP_COLORS = [
  '#4ADE80', '#60A5FA', '#FBBF24', '#A78BFA', '#F472B6',
  '#FB923C', '#22D3EE', '#F87171', '#818CF8', '#A3E635',
];

export default function Players() {
  const [activeTab, setActiveTab] = useState<'players' | 'groups'>('players');

  // Players state
  const [playerList, setPlayerList] = useState<PlayerWithStats[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newPlayer, setNewPlayer] = useState({ name: '', phone: '', email: '' });
  const [createError, setCreateError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({ name: '', phone: '', email: '' });

  // Groups state
  const [groupList, setGroupList] = useState<PlayerGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupWithMembers | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '', color: '#4ADE80' });
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [memberSelection, setMemberSelection] = useState<Set<string>>(new Set());

  // Load players
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

  // Load groups
  const loadGroups = async () => {
    try {
      const data = await groups.list();
      setGroupList(data);
    } catch (error) {
      console.error('Failed to load groups:', error);
    } finally {
      setGroupsLoading(false);
    }
  };

  const loadGroupDetails = async (groupId: string) => {
    try {
      const data = await groups.get(groupId);
      setSelectedGroup(data);
    } catch (error) {
      console.error('Failed to load group:', error);
    }
  };

  useEffect(() => {
    loadPlayers();
    loadGroups();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPlayers(search || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Check if name has at least first and last name
  const isValidFullName = (name: string) => name.trim().split(/\s+/).length >= 2;

  // Player handlers
  const handleCreatePlayer = async () => {
    if (!newPlayer.name.trim()) return;
    if (!isValidFullName(newPlayer.name)) {
      setCreateError('Please enter full name (first and last)');
      return;
    }
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

  // Group handlers
  const handleCreateGroup = async () => {
    if (!newGroup.name.trim()) return;
    try {
      await groups.create(newGroup.name, newGroup.description || undefined, newGroup.color);
      setShowCreateGroup(false);
      setNewGroup({ name: '', description: '', color: '#4ADE80' });
      loadGroups();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create group');
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Are you sure you want to delete this group?')) return;
    try {
      await groups.delete(groupId);
      setSelectedGroup(null);
      loadGroups();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete group');
    }
  };

  const handleOpenAddMembers = () => {
    if (!selectedGroup) return;
    // Pre-select existing members
    const existingIds = new Set(selectedGroup.members.map(m => m.player_id));
    setMemberSelection(existingIds);
    setShowAddMembers(true);
  };

  const handleSaveMembers = async () => {
    if (!selectedGroup) return;
    const existingIds = new Set(selectedGroup.members.map(m => m.player_id));

    // Find players to add (in selection but not in existing)
    const toAdd = Array.from(memberSelection).filter(id => !existingIds.has(id));
    // Find players to remove (in existing but not in selection)
    const toRemove = Array.from(existingIds).filter(id => !memberSelection.has(id));

    try {
      if (toAdd.length > 0) {
        await groups.addMembers(selectedGroup.id, toAdd);
      }
      if (toRemove.length > 0) {
        await groups.removeMembers(selectedGroup.id, toRemove);
      }
      setShowAddMembers(false);
      loadGroupDetails(selectedGroup.id);
      loadGroups();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update members');
    }
  };

  const toggleMember = (playerId: string) => {
    const newSelection = new Set(memberSelection);
    if (newSelection.has(playerId)) {
      newSelection.delete(playerId);
    } else {
      newSelection.add(playerId);
    }
    setMemberSelection(newSelection);
  };

  if (loading && groupsLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>;
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'clamp(12px, 4vw, 24px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/" style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--muted)',
            padding: '8px 12px',
            fontSize: 12,
            textDecoration: 'none',
            minHeight: 40,
            display: 'flex',
            alignItems: 'center',
          }}>
            ← Pools
          </Link>
          <button
            onClick={() => activeTab === 'players' ? setShowCreate(true) : setShowCreateGroup(true)}
            style={{ background: 'var(--green)', color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '10px 16px', minHeight: 44, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            + New {activeTab === 'players' ? 'Player' : 'Group'}
          </button>
        </div>
        <div>
          <h1 style={{ fontSize: 'clamp(18px, 5vw, 24px)', fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0 }}>
            Players & Groups
          </h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>
            {playerList.length} players • {groupList.length} groups
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--surface)', borderRadius: 10, padding: 4 }}>
        <button
          onClick={() => { setActiveTab('players'); setSelectedPlayer(null); }}
          style={{
            flex: 1,
            background: activeTab === 'players' ? 'var(--bg)' : 'transparent',
            border: 'none',
            borderRadius: 8,
            padding: '10px 12px',
            minHeight: 44,
            fontSize: 13,
            fontWeight: activeTab === 'players' ? 700 : 400,
            color: activeTab === 'players' ? 'var(--text)' : 'var(--muted)',
            cursor: 'pointer',
          }}
        >
          👤 Players ({playerList.length})
        </button>
        <button
          onClick={() => { setActiveTab('groups'); setSelectedGroup(null); }}
          style={{
            flex: 1,
            background: activeTab === 'groups' ? 'var(--bg)' : 'transparent',
            border: 'none',
            borderRadius: 8,
            padding: '10px 12px',
            minHeight: 44,
            fontSize: 13,
            fontWeight: activeTab === 'groups' ? 700 : 400,
            color: activeTab === 'groups' ? 'var(--text)' : 'var(--muted)',
            cursor: 'pointer',
          }}
        >
          👥 Groups ({groupList.length})
        </button>
      </div>

      {activeTab === 'players' ? (
        <>
          {/* Search */}
          <div style={{ marginBottom: 16 }}>
            <input
              placeholder="Search by name, phone, or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', minHeight: 44, color: 'var(--text)', fontSize: 16, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Players list */}
            <div>
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
            <div>
              {selectedPlayer ? (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
                  {editMode ? (
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
        </>
      ) : (
        /* Groups Tab */
        <div style={{ display: 'flex', gap: 20 }}>
          {/* Groups list */}
          <div style={{ width: 280, flexShrink: 0 }}>
            {groupList.length === 0 ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 30, textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>No groups yet</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {groupList.map(g => (
                  <div
                    key={g.id}
                    onClick={() => loadGroupDetails(g.id)}
                    style={{
                      background: selectedGroup?.id === g.id ? 'var(--surface)' : 'transparent',
                      border: `1px solid ${selectedGroup?.id === g.id ? g.color : 'var(--border)'}`,
                      borderRadius: 10,
                      padding: 14,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: g.color }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{g.name}</div>
                        {g.description && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{g.description}</div>
                        )}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: g.color, fontFamily: 'var(--font-mono)' }}>
                        {g.member_count}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Group details */}
          <div style={{ flex: 1 }}>
            {selectedGroup ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${selectedGroup.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', background: selectedGroup.color }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedGroup.name}</div>
                      {selectedGroup.description && (
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{selectedGroup.description}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleOpenAddMembers}
                      style={{ background: selectedGroup.color, color: 'var(--bg)', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                    >
                      ☑ Edit Members
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(selectedGroup.id)}
                      style={{ background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Members list */}
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, fontFamily: 'var(--font-mono)', marginBottom: 12 }}>
                  MEMBERS ({selectedGroup.member_count})
                </div>
                {selectedGroup.members.length === 0 ? (
                  <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
                    No members yet. Click "Edit Members" to add players.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedGroup.members.map(m => (
                      <div key={m.player_id} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${selectedGroup.color}20`, color: selectedGroup.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>
                            {m.player_name[0]}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{m.player_name}</div>
                            <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>
                              {m.player_phone || m.player_email || 'No contact'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>👈</div>
                <div style={{ color: 'var(--muted)' }}>Select a group to view members</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Player Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }} onClick={() => setShowCreate(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 'clamp(16px, 4vw, 24px)', width: '100%', maxWidth: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0 }}>New Player</h3>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            {createError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--red)', borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 12, color: 'var(--red)' }}>
                {createError}
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>NAME *</div>
              <input
                placeholder="John Smith"
                value={newPlayer.name}
                onChange={e => setNewPlayer({ ...newPlayer, name: e.target.value })}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', minHeight: 44, color: 'var(--text)', fontSize: 16, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>PHONE</div>
              <input
                placeholder="555-123-4567"
                type="tel"
                value={newPlayer.phone}
                onChange={e => setNewPlayer({ ...newPlayer, phone: e.target.value })}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', minHeight: 44, color: 'var(--text)', fontSize: 16, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>EMAIL</div>
              <input
                placeholder="john@example.com"
                type="email"
                value={newPlayer.email}
                onChange={e => setNewPlayer({ ...newPlayer, email: e.target.value })}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', minHeight: 44, color: 'var(--text)', fontSize: 16, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 16 }}>
              * Either phone or email is required
            </div>

            <button
              onClick={handleCreatePlayer}
              disabled={!newPlayer.name.trim()}
              style={{ width: '100%', background: 'var(--green)', color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '12px 14px', minHeight: 48, fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: newPlayer.name.trim() ? 1 : 0.5 }}
            >
              Create Player
            </button>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }} onClick={() => setShowCreateGroup(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 'clamp(16px, 4vw, 24px)', width: '100%', maxWidth: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0 }}>Create Group</h3>
              <button onClick={() => setShowCreateGroup(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>NAME *</div>
              <input
                placeholder="e.g. NFL Regulars"
                value={newGroup.name}
                onChange={e => setNewGroup({ ...newGroup, name: e.target.value })}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', minHeight: 44, color: 'var(--text)', fontSize: 16, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>DESCRIPTION</div>
              <input
                placeholder="e.g. Players who join every NFL pool"
                value={newGroup.description}
                onChange={e => setNewGroup({ ...newGroup, description: e.target.value })}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', minHeight: 44, color: 'var(--text)', fontSize: 16, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 8, fontFamily: 'var(--font-mono)' }}>COLOR</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {GROUP_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewGroup({ ...newGroup, color: c })}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: c,
                      border: newGroup.color === c ? '3px solid var(--text)' : '3px solid transparent',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={handleCreateGroup}
              disabled={!newGroup.name.trim()}
              style={{ width: '100%', background: newGroup.color, color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '12px 14px', minHeight: 48, fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: newGroup.name.trim() ? 1 : 0.5 }}
            >
              Create Group
            </button>
          </div>
        </div>
      )}

      {/* Edit Members Modal - Checkbox based */}
      {showAddMembers && selectedGroup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }} onClick={() => setShowAddMembers(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 'clamp(16px, 4vw, 24px)', width: '100%', maxWidth: 500, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0 }}>Edit Members</h3>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>Select players for {selectedGroup.name}</p>
              </div>
              <button onClick={() => setShowAddMembers(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            {/* Selection stats */}
            <div style={{ background: `${selectedGroup.color}15`, border: `1px solid ${selectedGroup.color}40`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: selectedGroup.color, fontWeight: 600 }}>
                {memberSelection.size} player{memberSelection.size !== 1 ? 's' : ''} selected
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setMemberSelection(new Set(playerList.map(p => p.id)))}
                  style={{ background: 'none', border: 'none', color: selectedGroup.color, cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}
                >
                  Select All
                </button>
                <button
                  onClick={() => setMemberSelection(new Set())}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Player list with checkboxes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20 }}>
              {playerList.map(p => (
                <label
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    background: memberSelection.has(p.id) ? `${selectedGroup.color}10` : 'var(--bg)',
                    border: `1px solid ${memberSelection.has(p.id) ? selectedGroup.color : 'var(--border)'}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={memberSelection.has(p.id)}
                    onChange={() => toggleMember(p.id)}
                    style={{ width: 18, height: 18, accentColor: selectedGroup.color, cursor: 'pointer' }}
                  />
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${selectedGroup.color}20`, color: selectedGroup.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>
                    {p.name[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>
                      {p.phone || p.email || 'No contact'} • {p.pool_count} pools
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <button
              onClick={handleSaveMembers}
              style={{ width: '100%', background: selectedGroup.color, color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              Save Members
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
