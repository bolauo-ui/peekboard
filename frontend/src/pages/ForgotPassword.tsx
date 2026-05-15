import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '@/lib/api';

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await authApi.forgot(email.trim());
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong. Try again.');
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#e8e6e0',
      display: 'flex',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* ── Left column: form ──────────────────────────────────────────────── */}
      <div style={{
        flex: '0 0 50%',
        width: '50%',
        display: 'flex',
        flexDirection: 'column',
        padding: 'clamp(32px, 4vw, 48px) clamp(32px, 5vw, 72px)',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
      }}>
        {/* Logo */}
        <img
          src="/peekboard-logo-full.svg"
          alt="Peekboard"
          style={{ height: 24, width: 'auto', display: 'block', alignSelf: 'flex-start' }}
        />

        {/* Form area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 48, paddingBottom: 32 }}>

          {/* Heading */}
          <h1 style={{
            fontFamily: '"Crimson Pro", Georgia, serif',
            fontWeight: 400,
            fontSize: 'clamp(36px, 3.5vw, 48px)',
            letterSpacing: '-0.05em',
            lineHeight: 1.0,
            color: '#0a0a0a',
            margin: '0 0 8px 0',
          }}>
            Forgot password 🔑
          </h1>
          <p style={{
            fontFamily: '"Source Serif 4", "Source Serif Pro", Georgia, serif',
            fontWeight: 400,
            fontSize: 16,
            letterSpacing: '-0.03em',
            color: '#555',
            margin: '0 0 36px 0',
          }}>
            We'll email you a link to set a new one.
          </p>

          {/* Error */}
          {error && (
            <div style={{
              marginBottom: 16, padding: '10px 14px', borderRadius: 8,
              background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)',
              fontSize: 13, color: '#dc2626',
            }}>
              {error}
            </div>
          )}

          {sent ? (
            /* Confirmation state */
            <div style={{
              padding: '20px 24px', borderRadius: 14,
              background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <p style={{ fontSize: 14, color: '#166534', margin: 0, lineHeight: 1.5, fontFamily: '"Source Serif 4", "Source Serif Pro", Georgia, serif', letterSpacing: '-0.03em' }}>
                If an account exists for <strong>{email}</strong>, we just sent a reset link. It expires in an hour.
              </p>
              <Link to="/login" style={{ fontSize: 13, color: '#1BAFD8', fontWeight: 500, textDecoration: 'none' }}>
                ← Back to sign in
              </Link>
            </div>
          ) : (
            /* Request form */
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: '#0a0a0a' }}>Email</label>
                <input
                  type="email" required autoFocus
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: 10,
                    border: '1.5px solid #d4d2cc',
                    background: '#fff',
                    fontSize: 14,
                    color: '#0a0a0a',
                    outline: 'none',
                    fontFamily: 'Inter, sans-serif',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '13px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#0a0a0a',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                  fontFamily: 'Inter, sans-serif',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#2a2a2a'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#0a0a0a'; }}
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>

              <p style={{ margin: 0, fontSize: 14, color: '#666', textAlign: 'center' }}>
                Remembered it?{' '}
                <Link to="/login" style={{ color: '#1BAFD8', fontWeight: 500, textDecoration: 'none' }}>
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </div>

        {/* Footer */}
        <p style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          © 2026 All rights reserved
        </p>
      </div>

      {/* ── Right column: cat video ─────────────────────────────────────────── */}
      <div style={{
        flex: '0 0 50%',
        width: '50%',
        padding: 'clamp(16px, 2vw, 24px)',
        display: 'flex',
        alignItems: 'stretch',
        boxSizing: 'border-box',
      }}>
        <div style={{
          flex: 1,
          borderRadius: 24,
          overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
        }}>
          <video
            autoPlay muted loop playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          >
            <source src="/cat-login.webm" type="video/webm" />
            <source src="/cat-login.mp4"  type="video/mp4" />
          </video>
        </div>
      </div>
    </div>
  );
}
