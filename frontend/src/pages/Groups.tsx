import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { groups, payments, PlayerGroup, GroupWithMembers, SearchedPlayer } from '../api/client';

const COLORS = [
  '#4ADE80', '#60A5FA', '#FBBF24', '#A78BFA', '#F472B6',
  '#FB923C', '#22D3EE', '#F87171', '#818CF8', '#A3E635',
];

export default function Groups() {
  const [groupList, setGroupList] = useState<PlayerGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupWithMembers | null>(null);
  const [loading, setLoading] = useState(true);

  // Create group modal
  const [showCreate, setShowCreate] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '', color: '#4ADE80' });

  // Add members modal
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<SearchedPlayer[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<SearchedPlayer[]>([]);

  const loadGroups = async () => {
    try {
      const data = await groups.list();
      setGroupList(data);
    } catch (error) {
      console.error('Failed to load groups:', error);
    } finally {
      setLoading(false);
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
    loadGroups();
  }, []);

  const handleCreateGroup = async () => {
    if (!newGroup.name.trim()) return;
    try {
      await groups.create(newGroup.name, newGroup.description || undefined, newGroup.color);
      setShowCreate(false);
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

  const handleMemberSearch = async (query: string) => {
    setMemberSearch(query);
    if (query.length < 2) {
      setMemberSearchResults([]);
      return;
    }
    try {
      const results = await payments.searchPlayers(query);
      // Filter out players already in the group
      const existingIds = selectedGroup?.members.map(m => m.player_id) || [];
      setMemberSearchResults(results.filter(p => !existingIds.includes(p.id)));
    } catch (error) {
      console.error('Search failed:', error);
    }
  };

  const handleAddMembers = async () => {
    if (!selectedGroup || selectedMembers.length === 0) return;
    try {
      await groups.addMembers(selectedGroup.id, selectedMembers.map(m => m.id));
      setShowAddMembers(false);
      setSelectedMembers([]);
      setMemberSearch('');
      loadGroupDetails(selectedGroup.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to add members');
    }
  };

  const handleRemoveMember = async (playerId: string) => {
    if (!selectedGroup) return;
    try {
      await groups.removeMembers(selectedGroup.id, [playerId]);
      loadGroupDetails(selectedGroup.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to remove member');
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>;
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
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
              Player Groups
            </h1>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
              Organize players for targeted invites
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ background: 'var(--green)', color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          + New Group
        </button>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Groups list */}
        <div style={{ width: 280, flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, fontFamily: 'var(--font-mono)', marginBottom: 12 }}>
            GROUPS ({groupList.length})
          </div>
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
                    onClick={() => setShowAddMembers(true)}
                    style={{ background: selectedGroup.color, color: 'var(--bg)', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    + Add Members
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
                  No members yet. Add some players to this group.
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
                      <button
                        onClick={() => handleRemoveMember(m.player_id)}
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}
                      >
                        ✕
                      </button>
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

      {/* Create Group Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowCreate(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0 }}>Create Group</h3>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>NAME *</div>
              <input
                placeholder="e.g. NFL Regulars"
                value={newGroup.name}
                onChange={e => setNewGroup({ ...newGroup, name: e.target.value })}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>DESCRIPTION</div>
              <input
                placeholder="e.g. Players who join every NFL pool"
                value={newGroup.description}
                onChange={e => setNewGroup({ ...newGroup, description: e.target.value })}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 8, fontFamily: 'var(--font-mono)' }}>COLOR</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewGroup({ ...newGroup, color: c })}
                    style={{
                      width: 28,
                      height: 28,
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
              style={{ width: '100%', background: newGroup.color, color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: newGroup.name.trim() ? 1 : 0.5 }}
            >
              Create Group
            </button>
          </div>
        </div>
      )}

      {/* Add Members Modal */}
      {showAddMembers && selectedGroup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => { setShowAddMembers(false); setSelectedMembers([]); setMemberSearch(''); }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 450, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0 }}>Add Members to {selectedGroup.name}</h3>
              <button onClick={() => { setShowAddMembers(false); setSelectedMembers([]); setMemberSearch(''); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            {/* Search */}
            <div style={{ marginBottom: 16 }}>
              <input
                placeholder="Search players by name, phone, or email..."
                value={memberSearch}
                onChange={e => handleMemberSearch(e.target.value)}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
              />
              {memberSearchResults.length > 0 && (
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {memberSearchResults.map(p => (
                    <div
                      key={p.id}
                      onClick={() => {
                        if (!selectedMembers.find(m => m.id === p.id)) {
                          setSelectedMembers([...selectedMembers, p]);
                        }
                        setMemberSearch('');
                        setMemberSearchResults([]);
                      }}
                      style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--dim)' }}>{p.phone || p.email}</div>
                      </div>
                      <span style={{ color: 'var(--green)' }}>+</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected members */}
            {selectedMembers.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', marginBottom: 8 }}>SELECTED ({selectedMembers.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedMembers.map(p => (
                    <div key={p.id} style={{ background: `${selectedGroup.color}20`, border: `1px solid ${selectedGroup.color}`, borderRadius: 20, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: selectedGroup.color }}>{p.name}</span>
                      <button
                        onClick={() => setSelectedMembers(selectedMembers.filter(m => m.id !== p.id))}
                        style={{ background: 'none', border: 'none', color: selectedGroup.color, cursor: 'pointer', padding: 0, fontSize: 12 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleAddMembers}
              disabled={selectedMembers.length === 0}
              style={{ width: '100%', background: selectedGroup.color, color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: selectedMembers.length > 0 ? 1 : 0.5 }}
            >
              Add {selectedMembers.length} Member{selectedMembers.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
