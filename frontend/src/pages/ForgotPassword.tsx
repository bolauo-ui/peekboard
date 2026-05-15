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
      // Backend returns success even for unknown emails (to avoid leaking
      // which addresses exist), so we always land on the confirmation panel.
      await authApi.forgot(email.trim());
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong. Try again.');
    } finally { setLoading(false); }
  };

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
          <h1 className="text-2xl" style={{ color: 'var(--text-primary)', fontFamily: '"Crimson Pro", Georgia, serif', fontWeight: 400, letterSpacing: '-0.05em' }}>Forgot password</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)', fontFamily: '"Source Serif 4", "Source Serif Pro", Georgia, serif', fontWeight: 400, letterSpacing: '-0.03em' }}>
            We'll email you a link to set a new one.
          </p>
        </div>

        {sent ? (
          <div className="rounded-xl p-6 text-center"
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: '"Source Serif 4", "Source Serif Pro", Georgia, serif', fontWeight: 400, letterSpacing: '-0.03em' }}>
              If an account exists for <strong>{email}</strong>, we just sent a reset link.
              It expires in an hour.
            </p>
            <Link to="/login" className="inline-block mt-5 text-sm font-medium" style={{ color: 'var(--accent)' }}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit}
            className="rounded-xl p-6 space-y-4"
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
            {error && (
              <div className="text-xs px-3 py-2 rounded-lg"
                style={{ background: 'rgba(240,82,82,0.1)', border: '1px solid rgba(240,82,82,0.25)', color: 'var(--danger)' }}>
                {error}
              </div>
            )}
            <div>
              <label className="panel-label">Email</label>
              <input
                type="email" required autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="panel-input" placeholder="you@company.com"
              />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg font-semibold text-sm text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              Remembered it? <Link to="/login" style={{ color: 'var(--accent)' }}>Back to sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
