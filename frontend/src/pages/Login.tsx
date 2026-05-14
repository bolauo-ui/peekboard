import { useState, useCallback, useEffect, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import GoogleSignInButton from '@/components/GoogleSignInButton';

// After any successful auth, check for a pending invite token and redirect
// back to the invite acceptance page instead of the dashboard.
function getPostAuthRedirect(): string {
  const pending = localStorage.getItem('pending_invite');
  if (pending) return `/invite/${pending}`;
  return '/dashboard';
}

export default function Login() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  // 2FA step state — populated when login returns requires_2fa.
  const [preToken, setPreToken] = useState<string | null>(null);
  const [twoCode,  setTwoCode]  = useState('');
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // If user arrived via an invite link, store the token so it survives
  // the login flow and show a contextual banner.
  const inviteToken = searchParams.get('invite');
  useEffect(() => {
    if (inviteToken) localStorage.setItem('pending_invite', inviteToken);
  }, [inviteToken]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const r: any = await authApi.login({ email, password });
      if (r.requires_2fa) {
        // 2FA step-up: backend handed us a short-lived pre-auth token; flip
        // the form to the code-entry view.
        setPreToken(r.token);
      } else {
        setAuth(r.user, r.token);
        navigate(getPostAuthRedirect());
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally { setLoading(false); }
  };

  const verify2fa = async (e: FormEvent) => {
    e.preventDefault();
    if (!preToken || !twoCode.trim()) return;
    setError(''); setLoading(true);
    try {
      const { token, user } = await authApi.twoFaLogin(preToken, twoCode.trim());
      setAuth(user, token);
      navigate(getPostAuthRedirect());
    } catch (err: any) {
      setError(err.response?.data?.error || 'Code is incorrect.');
    } finally { setLoading(false); }
  };

  // Request a passwordless magic-link email. Backend always returns success
  // so we always show the same confirmation regardless of whether the
  // address is registered.
  const sendMagicLink = async () => {
    if (!email.trim()) { setError('Enter your email first.'); return; }
    setLoading(true); setError('');
    try {
      await authApi.magicRequest(email.trim());
      setMagicSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not send the link.');
    } finally { setLoading(false); }
  };

  // Google Sign-In callback — exchanges Google's ID token for our JWT.
  const handleGoogle = useCallback(async (credential: string) => {
    setError(''); setLoading(true);
    try {
      const { token, user } = await authApi.google(credential);
      setAuth(user, token);
      navigate(getPostAuthRedirect());
    } catch (err: any) {
      setError(err.response?.data?.error || 'Google sign-in failed.');
    } finally { setLoading(false); }
  }, [navigate, setAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#111111' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4"
            style={{ background: 'var(--accent)' }}>
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Peekboard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {inviteToken ? 'Sign in to accept your board invite' : 'Sign in to your workspace'}
          </p>
        </div>

        {/* Invite context banner */}
        {inviteToken && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm text-center"
            style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: 'rgba(255,255,255,0.8)' }}>
            🎉 You've been invited to a board — sign in to join it.
          </div>
        )}

        {preToken ? (
          <form onSubmit={verify2fa}
            className="rounded-xl p-6 space-y-4"
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
            {error && (
              <div className="text-xs px-3 py-2 rounded-lg"
                style={{ background: 'rgba(240,82,82,0.1)', border: '1px solid rgba(240,82,82,0.2)', color: 'var(--danger)' }}>
                {error}
              </div>
            )}
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Open your authenticator app and enter the 6-digit code.
            </p>
            <Field label="Authenticator code">
              <input value={twoCode} onChange={e => setTwoCode(e.target.value.replace(/\D/g,'').slice(0, 10))}
                inputMode="numeric" autoFocus
                className="panel-input text-center tracking-[0.4em] text-lg" placeholder="123 456" />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Lost your phone? Paste a backup code in the same field.
              </p>
            </Field>
            <button type="submit" disabled={loading || twoCode.length < 6}
              className="w-full py-2.5 rounded-lg font-semibold text-sm text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}>
              {loading ? 'Verifying…' : 'Verify and sign in'}
            </button>
            <button type="button" onClick={() => { setPreToken(null); setTwoCode(''); setError(''); }}
              className="w-full text-xs" style={{ color: 'var(--text-muted)' }}>
              Use a different account
            </button>
          </form>
        ) : (
        <form onSubmit={handleSubmit}
          className="rounded-xl p-6 space-y-4"
          style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          {error && (
            <div className="text-xs px-3 py-2 rounded-lg"
              style={{ background: 'rgba(240,82,82,0.1)', border: '1px solid rgba(240,82,82,0.2)', color: 'var(--danger)' }}>
              {error}
            </div>
          )}
          <Field label="Email">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="panel-input" placeholder="you@company.com" required autoFocus />
          </Field>
          <Field label="Password">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="panel-input" placeholder="••••••••" required />
            <div className="text-right mt-1">
              <Link to="/forgot-password" className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Forgot password?
              </Link>
            </div>
          </Field>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-lg font-semibold text-sm text-white disabled:opacity-50 transition-colors mt-1"
            style={{ background: 'var(--accent)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          {/* Magic-link alternative — no password needed. */}
          {magicSent ? (
            <p className="text-xs text-center mt-1" style={{ color: '#34d399' }}>
              Magic link sent. Check <strong>{email}</strong>.
            </p>
          ) : (
            <button
              type="button"
              onClick={sendMagicLink}
              disabled={loading}
              className="w-full text-xs py-1.5 mt-1 rounded-lg transition-colors disabled:opacity-50"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              Or send me a sign-in link by email
            </button>
          )}

          {/* Google Sign-In — only renders when VITE_GOOGLE_CLIENT_ID is set. */}
          <GoogleDivider />
          <GoogleSignInButton onCredential={handleGoogle} onError={(err) => setError(err.message)} />
        </form>
        )}

        <p className="text-center text-sm mt-4" style={{ color: 'var(--text-muted)' }}>
          No account?{' '}
          <Link to={inviteToken ? `/signup?invite=${inviteToken}` : '/signup'}
            className="font-medium" style={{ color: 'var(--accent)' }}>Sign up</Link>
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="panel-label">{label}</label>
      {children}
    </div>
  );
}

// "or" separator above the Google button. Hides itself when Google is not
// configured (the GoogleSignInButton below it renders nothing in that case).
function GoogleDivider() {
  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) return null;
  return (
    <div className="flex items-center gap-3 mt-2">
      <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>or</span>
      <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
    </div>
  );
}
