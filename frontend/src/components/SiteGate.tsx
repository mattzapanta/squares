import { useState, useEffect } from 'react';

interface SiteGateProps {
  children: React.ReactNode;
}

export default function SiteGate({ children }: SiteGateProps) {
  const [checking, setChecking] = useState(true);
  const [_requiresPassword, setRequiresPassword] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    checkSiteStatus();
  }, []);

  const checkSiteStatus = async () => {
    try {
      const response = await fetch('/api/auth/site-status');
      const data = await response.json();

      if (!data.passwordRequired) {
        setAuthenticated(true);
      } else {
        // Check if we have a stored session
        const storedSession = localStorage.getItem('site_session');
        if (storedSession) {
          setAuthenticated(true);
        } else {
          setRequiresPassword(true);
        }
      }
    } catch {
      // If can't reach API, show gate just in case
      setRequiresPassword(true);
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/auth/verify-site-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (data.valid) {
        localStorage.setItem('site_session', data.sessionToken || 'valid');
        setAuthenticated(true);
      } else {
        setError('Invalid password');
      }
    } catch {
      setError('Failed to verify password');
    }
  };

  if (checking) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
      }}>
        <div style={{ color: 'var(--muted)' }}>Loading...</div>
      </div>
    );
  }

  if (authenticated) {
    return <>{children}</>;
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 40,
        maxWidth: 400,
        width: '100%',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎲</div>
        <h1 style={{
          fontSize: 28,
          fontWeight: 800,
          fontFamily: 'var(--font-mono)',
          marginBottom: 8,
          background: 'linear-gradient(135deg, #4ADE80 0%, #22D3EE 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          SQUARESHQ
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 32 }}>
          Enter the password to continue
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '14px 16px',
              color: 'var(--text)',
              fontSize: 16,
              outline: 'none',
              marginBottom: 16,
            }}
            autoFocus
          />

          {error && (
            <div style={{
              color: 'var(--red)',
              fontSize: 13,
              marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            style={{
              width: '100%',
              background: 'var(--green)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: 8,
              padding: '14px',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
