import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pool, SPORTS_CONFIG } from '../types';
import { pools as poolsApi } from '../api/client';
import { useAuth } from '../App';

export default function Pools() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const { admin, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    poolsApi.list()
      .then(setPools)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0, letterSpacing: -1 }}>
            <span style={{ color: 'var(--green)' }}>■</span> SquaresHQ
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 0' }}>
            Welcome, {admin?.name}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigate('/pools/new')}
            style={{
              background: 'var(--green)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
            }}
          >
            + NEW POOL
          </button>
          <button
            onClick={logout}
            style={{
              background: 'transparent',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 12,
            }}
          >
            Logout
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
                  padding: '16px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  textDecoration: 'none',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--green)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `${sc.color}15`,
                    fontSize: 22,
                  }}>
                    {sc.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                      {pool.away_team} vs {pool.home_team}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {sc.name} {pool.game_label && `• ${pool.game_label}`} • ${pool.denomination}/sq • {pool.player_count || 0} players
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      color: pool.claimed_count === 100 ? 'var(--green)' : 'var(--gold)',
                    }}>
                      {pool.claimed_count || 0}/100
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--dim)' }}>claimed</div>
                  </div>
                  <span style={{
                    display: 'inline-flex',
                    padding: '2px 8px',
                    borderRadius: 20,
                    fontSize: 10,
                    fontWeight: 700,
                    background: pool.status === 'open' ? 'rgba(96, 165, 250, 0.15)' : pool.status === 'locked' ? 'rgba(74, 222, 128, 0.15)' : 'rgba(136, 137, 164, 0.15)',
                    color: pool.status === 'open' ? 'var(--blue)' : pool.status === 'locked' ? 'var(--green)' : 'var(--muted)',
                    border: `1px solid ${pool.status === 'open' ? 'rgba(96, 165, 250, 0.25)' : pool.status === 'locked' ? 'rgba(74, 222, 128, 0.25)' : 'rgba(136, 137, 164, 0.25)'}`,
                    fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase',
                  }}>
                    {pool.status}
                  </span>
                  <span style={{ color: 'var(--dim)', fontSize: 18 }}>›</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
