import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Pool, SPORTS_CONFIG } from '../types';
import { pools as poolsApi } from '../api/client';
import { useAuth } from '../App';

export default function Pools() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check for success message from navigation state (e.g., after deleting a pool)
    const state = location.state as { message?: string } | null;
    if (state?.message) {
      setSuccessMessage(state.message);
      // Clear the state so message doesn't show again on refresh
      window.history.replaceState({}, document.title);
      // Auto-hide after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  }, [location.state]);

  useEffect(() => {
    poolsApi.list()
      .then(setPools)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 'clamp(12px, 4vw, 24px)' }}>
      {/* Success message banner */}
      {successMessage && (
        <div style={{
          background: 'rgba(74, 222, 128, 0.15)',
          border: '1px solid var(--green)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ color: 'var(--green)', fontSize: 13, fontWeight: 600 }}>
            ✓ {successMessage}
          </span>
          <button
            onClick={() => setSuccessMessage(null)}
            style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: 16, minWidth: 44, minHeight: 44 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Header - stacks on mobile */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 'clamp(20px, 5vw, 28px)', fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0, letterSpacing: -1 }}>
              <span style={{ color: 'var(--green)' }}>■</span> SquaresHQ
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: '4px 0 0' }}>
              Hi, {admin?.name?.split(' ')[0]}
            </p>
          </div>
          <button
            onClick={logout}
            style={{
              background: 'transparent',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 12px',
              minHeight: 40,
              fontSize: 12,
            }}
          >
            Logout
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigate('/players')}
            style={{
              flex: 1,
              background: 'transparent',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '10px 12px',
              minHeight: 44,
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
            }}
          >
            Players
          </button>
          <button
            onClick={() => navigate('/pools/new')}
            style={{
              flex: 1,
              background: 'var(--green)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: 8,
              padding: '10px 16px',
              minHeight: 44,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
            }}
          >
            + New Pool
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</div>
      ) : pools.length === 0 ? (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 40,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎲</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No pools yet</h3>
          <p style={{ color: 'var(--muted)', marginBottom: 20 }}>Create your first squares pool to get started</p>
          <button
            onClick={() => navigate('/pools/new')}
            style={{
              background: 'var(--green)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Create Pool
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pools.map(pool => {
            const sc = SPORTS_CONFIG[pool.sport];
            return (
              <Link
                key={pool.id}
                to={`/pools/${pool.id}`}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 'clamp(12px, 3vw, 16px)',
                  display: 'block',
                  textDecoration: 'none',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--green)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                {/* Top row: icon + teams + status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `${sc.color}15`,
                    fontSize: 18,
                    flexShrink: 0,
                  }}>
                    {sc.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {pool.away_team} vs {pool.home_team}
                    </div>
                  </div>
                  <span style={{
                    display: 'inline-flex',
                    padding: '3px 8px',
                    borderRadius: 20,
                    fontSize: 10,
                    fontWeight: 700,
                    background: pool.status === 'open' ? 'rgba(96, 165, 250, 0.15)' : pool.status === 'locked' ? 'rgba(74, 222, 128, 0.15)' : 'rgba(136, 137, 164, 0.15)',
                    color: pool.status === 'open' ? 'var(--blue)' : pool.status === 'locked' ? 'var(--green)' : 'var(--muted)',
                    border: `1px solid ${pool.status === 'open' ? 'rgba(96, 165, 250, 0.25)' : pool.status === 'locked' ? 'rgba(74, 222, 128, 0.25)' : 'rgba(136, 137, 164, 0.25)'}`,
                    fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase',
                    flexShrink: 0,
                  }}>
                    {pool.status}
                  </span>
                </div>
                {/* Bottom row: details + stats */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 46 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {sc.name} {pool.game_label && `• ${pool.game_label}`} • ${pool.denomination}/sq
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: 'var(--dim)' }}>{pool.player_count || 0} players</span>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      color: pool.claimed_count === 100 ? 'var(--green)' : 'var(--gold)',
                    }}>
                      {pool.claimed_count || 0}/100
                    </span>
                    <span style={{ color: 'var(--dim)', fontSize: 16 }}>›</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
