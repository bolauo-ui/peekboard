import { useState, useCallback, useEffect, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import PeekboardLogo from '@/components/PeekboardLogo';

function getPostAuthRedirect(): string {
  const pending = localStorage.getItem('pending_invite');
  if (pending) return `/invite/${pending}`;
  return '/dashboard';
}

export default function Signup() {
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const inviteToken = searchParams.get('invite');
  useEffect(() => {
    if (inviteToken) localStorage.setItem('pending_invite', inviteToken);
  }, [inviteToken]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      const { token, user } = await authApi.register({ name, email, password });
      setAuth(user, token);
      navigate(getPostAuthRedirect());
    } catch (err: any) {
      setError(err.response?.data?.error || 'Sign up failed. Please try again.');
    } finally { setLoading(false); }
  };

  const handleGoogle = useCallback(async (credential: string) => {
    setError(''); setLoading(true);
    try {
      const { token, user } = await authApi.google(credential);
      setAuth(user, token);
      navigate(getPostAuthRedirect());
    } catch (err: any) {
      setError(err.response?.data?.error || 'Google sign-up failed.');
    } finally { setLoading(false); }
  }, [navigate, setAuth]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#e8e6e0',
      display: 'flex',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* ── Left column: form ──────────────────────────────────────────────── */}
      <div className="auth-form-col">
        {/* Logo */}
        <PeekboardLogo height={24} />

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
            Create account ✨
          </h1>
          <p style={{
            fontFamily: '"Source Serif 4", "Source Serif Pro", Georgia, serif',
            fontWeight: 400,
            fontSize: 16,
            letterSpacing: '-0.03em',
            color: '#555',
            margin: '0 0 36px 0',
          }}>
            {inviteToken ? 'Create an account to accept your board invite' : 'Start previewing your motion creatives'}
          </p>

          {/* Invite banner */}
          {inviteToken && (
            <div style={{
              marginBottom: 20, padding: '10px 16px', borderRadius: 10,
              background: 'rgba(27,175,216,0.08)', border: '1px solid rgba(27,175,216,0.2)',
              fontSize: 13, color: '#1BAFD8',
            }}>
              🎉 You've been invited to a board — create an account to join it.
            </div>
          )}

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

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <LField label="Full name">
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                style={inputStyle} placeholder="Alex Smith" required autoFocus />
            </LField>

            <LField label="Email">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                style={inputStyle} placeholder="you@company.com" required />
            </LField>

            <LField label="Password">
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                style={inputStyle} placeholder="Min. 6 characters" required />
            </LField>

            <SubmitBtn disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </SubmitBtn>

            <GoogleDivider />
            <GoogleSignInButton onCredential={handleGoogle} onError={err => setError(err.message)} />

            <p style={{ margin: 0, fontSize: 12, textAlign: 'center', color: '#aaa' }}>
              By signing up, you agree to our Terms of Service.
            </p>
          </form>

          <p style={{ marginTop: 28, fontSize: 14, color: '#666' }}>
            Already have an account?{' '}
            <Link
              to={inviteToken ? `/login?invite=${inviteToken}` : '/login'}
              style={{ color: '#3a3a3a', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: '2px' }}
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          © 2026 All rights reserved
        </p>
      </div>

      {/* ── Right column: cat video ─────────────────────────────────────────── */}
      <div className="auth-video-col">
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

// ── Small helpers ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
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
};

function LField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: '#0a0a0a' }}>{label}</label>
      {children}
    </div>
  );
}

function SubmitBtn({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      style={{
        width: '100%',
        padding: '13px',
        borderRadius: 10,
        border: 'none',
        background: '#0a0a0a',
        color: '#fff',
        fontSize: 15,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'Inter, sans-serif',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#2a2a2a'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#0a0a0a'; }}
    >
      {children}
    </button>
  );
}

function GoogleDivider() {
  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, height: 1, background: '#d4d2cc' }} />
      <span style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em' }}>or</span>
      <div style={{ flex: 1, height: 1, background: '#d4d2cc' }} />
    </div>
  );
}
