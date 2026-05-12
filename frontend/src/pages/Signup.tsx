import { useState, useCallback, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import GoogleSignInButton from '@/components/GoogleSignInButton';

export default function Signup() {
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      const { token, user } = await authApi.register({ name, email, password });
      setAuth(user, token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Sign up failed. Please try again.');
    } finally { setLoading(false); }
  };

  const handleGoogle = useCallback(async (credential: string) => {
    setError(''); setLoading(true);
    try {
      const { token, user } = await authApi.google(credential);
      setAuth(user, token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Google sign-up failed.');
    } finally { setLoading(false); }
  }, [navigate, setAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#111111' }}>
      <div className="w-full max-w-sm">
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
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Create your account</p>
        </div>

        <form onSubmit={handleSubmit}
          className="rounded-xl p-6 space-y-4"
          style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          {error && (
            <div className="text-xs px-3 py-2 rounded-lg"
              style={{ background: 'rgba(240,82,82,0.1)', border: '1px solid rgba(240,82,82,0.2)', color: 'var(--danger)' }}>
              {error}
            </div>
          )}
          <Field label="Full name">
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="panel-input" placeholder="Alex Smith" required autoFocus />
          </Field>
          <Field label="Email">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="panel-input" placeholder="you@company.com" required />
          </Field>
          <Field label="Password">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="panel-input" placeholder="Min. 6 characters" required />
          </Field>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-lg font-semibold text-sm text-white disabled:opacity-50 transition-colors mt-1"
            style={{ background: 'var(--accent)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>

          <GoogleDivider />
          <GoogleSignInButton onCredential={handleGoogle} onError={(err) => setError(err.message)} />

          <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>By signing up, you agree to our Terms of Service.</p>
        </form>

        <p className="text-center text-sm mt-4" style={{ color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" className="font-medium" style={{ color: 'var(--accent)' }}>Sign in</Link>
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
