import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { SportType, SPORTS_CONFIG } from '../types';
import { pools as poolsApi, games as gamesApi, Game } from '../api/client';

export default function CreatePool() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [sport, setSport] = useState<SportType | null>(null);
  const [form, setForm] = useState({
    name: '',
    away_team: '',
    home_team: '',
    game_date: '',
    game_time: '',
    game_label: '',
    denomination: 25,
    payout_structure: 'standard',
    tip_pct: 10,
    max_per_player: 10,
    ot_rule: 'include_final',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [availableGames, setAvailableGames] = useState<Game[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [useManualEntry, setUseManualEntry] = useState(false);

  const handleCreate = async () => {
    if (!sport) return;
    setLoading(true);
    setError('');

    try {
      const pool = await poolsApi.create({
        ...form,
        sport,
        name: form.name || `${form.away_team} vs ${form.home_team}`,
      });
      navigate(`/pools/${pool.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pool');
    } finally {
      setLoading(false);
    }
  };

  // Fetch available games when sport is selected
  useEffect(() => {
    if (sport && sport !== 'custom') {
      setGamesLoading(true);
      setUseManualEntry(false);
      gamesApi.list(sport)
        .then(games => {
          setAvailableGames(games);
        })
        .catch(() => {
          setAvailableGames([]);
        })
        .finally(() => setGamesLoading(false));
    } else {
      setAvailableGames([]);
      setUseManualEntry(true);
    }
  }, [sport]);

  const selectGame = (game: Game) => {
    setForm({
      ...form,
      away_team: game.away,
      home_team: game.home,
      game_date: game.date,
      game_time: game.time || '',
      game_label: game.label || '',
      name: `${game.away} vs ${game.home}`,
    });
    setStep(2);
  };

  const sc = sport ? SPORTS_CONFIG[sport] : null;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link to="/" style={{
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: 'var(--muted)',
          padding: '6px 10px',
          fontSize: 12,
          textDecoration: 'none',
        }}>
          ← Back
        </Link>
        <h2 style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0 }}>New Pool</h2>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 28 }}>
        {['Sport', 'Game', 'Settings', 'Confirm'].map((s, i) => (
          <div key={s} style={{ flex: 1 }}>
            <div style={{
              height: 3,
              borderRadius: 2,
              background: i <= step ? 'var(--green)' : 'var(--border)',
              transition: 'all 0.3s',
              marginBottom: 6,
            }} />
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: i <= step ? 'var(--green)' : 'var(--dim)',
              fontFamily: 'var(--font-mono)',
            }}>
              {s}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 8,
          padding: 12,
          marginBottom: 16,
          fontSize: 13,
          color: 'var(--red)',
        }}>
          {error}
        </div>
      )}

      {/* Step 0: Sport */}
      {step === 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>What sport?</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
            {(Object.entries(SPORTS_CONFIG) as [SportType, typeof SPORTS_CONFIG[SportType]][]).map(([id, cfg]) => (
              <div
                key={id}
                onClick={() => { setSport(id); setStep(1); }}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '18px 14px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = cfg.color)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div style={{ fontSize: 28, marginBottom: 6 }}>{cfg.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{cfg.name}</div>
                <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>
                  {cfg.periods.join(' • ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Game */}
      {step === 1 && sc && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
              {useManualEntry ? 'Enter matchup' : 'Select a game'}
            </h3>
            <button onClick={() => setStep(0)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
              ← Back
            </button>
          </div>

          {/* Games list from API */}
          {!useManualEntry && (
            <div style={{ marginBottom: 16 }}>
              {gamesLoading ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                  Loading games...
                </div>
              ) : availableGames.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {availableGames.map(game => (
                    <div
                      key={game.id}
                      onClick={() => selectGame(game)}
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: 14,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = sc.color)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: 16 }}>
                            {game.away} vs {game.home}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                            {game.away_full} @ {game.home_full}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 12, color: 'var(--text)' }}>{game.date}</div>
                          <div style={{ fontSize: 11, color: 'var(--dim)' }}>{game.time}</div>
                          {game.label && (
                            <div style={{ fontSize: 10, color: sc.color, marginTop: 2, fontWeight: 600 }}>
                              {game.label}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', background: 'var(--surface)', borderRadius: 10 }}>
                  No upcoming games found
                </div>
              )}
              <button
                onClick={() => setUseManualEntry(true)}
                style={{
                  width: '100%',
                  marginTop: 12,
                  background: 'transparent',
                  color: 'var(--muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 16px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Enter matchup manually instead
              </button>
            </div>
          )}

          {/* Manual entry form */}
          {useManualEntry && (
            <>
              {sport !== 'custom' && availableGames.length > 0 && (
                <button
                  onClick={() => setUseManualEntry(false)}
                  style={{
                    width: '100%',
                    marginBottom: 12,
                    background: 'transparent',
                    color: 'var(--muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '10px 16px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  ← Back to game list
                </button>
              )}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
                  MATCHUP
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <input
                    placeholder="Away"
                    value={form.away_team}
                    onChange={e => setForm({ ...form, away_team: e.target.value.toUpperCase() })}
                    style={{
                      flex: 1,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      color: 'var(--text)',
                      fontSize: 14,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                      textTransform: 'uppercase',
                    }}
                  />
                  <span style={{ color: 'var(--dim)', fontWeight: 700, fontSize: 12 }}>vs</span>
                  <input
                    placeholder="Home"
                    value={form.home_team}
                    onChange={e => setForm({ ...form, home_team: e.target.value.toUpperCase() })}
                    style={{
                      flex: 1,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      color: 'var(--text)',
                      fontSize: 14,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                      textTransform: 'uppercase',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                  <input
                    type="date"
                    value={form.game_date}
                    onChange={e => setForm({ ...form, game_date: e.target.value })}
                    style={{
                      flex: 1,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      color: 'var(--text)',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                    }}
                  />
                  <input
                    type="time"
                    value={form.game_time}
                    onChange={e => setForm({ ...form, game_time: e.target.value })}
                    style={{
                      flex: 1,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      color: 'var(--text)',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                    }}
                  />
                </div>
                <input
                  placeholder="Label (e.g. Week 18, Super Bowl)"
                  value={form.game_label}
                  onChange={e => setForm({ ...form, game_label: e.target.value })}
                  style={{
                    width: '100%',
                    marginTop: 12,
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    color: 'var(--text)',
                    fontSize: 12,
                    outline: 'none',
                  }}
                />
              </div>
              <button
                onClick={() => { setForm({ ...form, name: `${form.away_team} vs ${form.home_team}` }); setStep(2); }}
                disabled={!form.away_team || !form.home_team}
                style={{
                  width: '100%',
                  marginTop: 16,
                  background: 'var(--green)',
                  color: 'var(--bg)',
                  border: 'none',
                  borderRadius: 8,
                  padding: '12px 16px',
                  fontSize: 14,
                  fontWeight: 700,
                  opacity: !form.away_team || !form.home_team ? 0.5 : 1,
                  cursor: !form.away_team || !form.home_team ? 'not-allowed' : 'pointer',
                }}
              >
                Continue →
              </button>
            </>
          )}
        </div>
      )}

      {/* Step 2: Settings */}
      {step === 2 && sc && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Pool Settings</h3>
            <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
              ← Back
            </button>
          </div>

          {/* Denomination */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
              DENOMINATION
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 5, 10, 25, 50, 100].map(d => (
                <button
                  key={d}
                  onClick={() => setForm({ ...form, denomination: d })}
                  style={{
                    flex: 1,
                    padding: '12px 0',
                    borderRadius: 8,
                    fontWeight: 800,
                    fontSize: d >= 100 ? 14 : 16,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    background: form.denomination === d ? 'var(--green)' : 'var(--bg)',
                    color: form.denomination === d ? 'var(--bg)' : 'var(--muted)',
                    border: `1px solid ${form.denomination === d ? 'var(--green)' : 'var(--border)'}`,
                  }}
                >
                  ${d}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 8, textAlign: 'center' }}>
              Pool: <span style={{ color: 'var(--green)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>${form.denomination * 100}</span>
            </div>
          </div>

          {/* Tip */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
              SUGGESTED TIP %
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[0, 5, 10, 15, 20].map(t => (
                <button
                  key={t}
                  onClick={() => setForm({ ...form, tip_pct: t })}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 8,
                    fontWeight: 800,
                    fontSize: 14,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    background: form.tip_pct === t ? 'var(--gold)' : 'var(--bg)',
                    color: form.tip_pct === t ? 'var(--bg)' : 'var(--muted)',
                    border: `1px solid ${form.tip_pct === t ? 'var(--gold)' : 'var(--border)'}`,
                  }}
                >
                  {t}%
                </button>
              ))}
            </div>
          </div>

          {/* Max per player */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 1, marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
              MAX SQUARES PER PLAYER
            </div>
            <select
              value={form.max_per_player}
              onChange={e => setForm({ ...form, max_per_player: parseInt(e.target.value) })}
              style={{
                width: '100%',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '10px 12px',
                color: 'var(--text)',
                fontSize: 14,
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            >
              {[5, 10, 15, 20, 25, 50, 100].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setStep(3)}
            style={{
              width: '100%',
              background: 'var(--green)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: 8,
              padding: '12px 16px',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Review & Create →
          </button>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && sc && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Confirm & Launch</h3>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid rgba(74, 222, 128, 0.3)',
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 32 }}>{sc.icon}</span>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                  {form.away_team} vs {form.home_team}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {form.game_date || 'TBD'} • {sc.periods.length} {sc.periods.length === 1 ? 'period' : 'periods'}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>Per Square</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>${form.denomination}</div>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>Pool Total</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>${form.denomination * 100}</div>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>Tip Rate</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--orange)', fontFamily: 'var(--font-mono)' }}>{form.tip_pct}%</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setStep(2)}
              style={{
                flex: 1,
                background: 'transparent',
                color: 'var(--muted)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '12px 16px',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              ← Back
            </button>
            <button
              onClick={handleCreate}
              disabled={loading}
              style={{
                flex: 2,
                background: 'var(--green)',
                color: 'var(--bg)',
                border: 'none',
                borderRadius: 8,
                padding: '12px 16px',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {loading ? 'Creating...' : '🚀 Create Pool'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
