import { useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export default function ResetPassword() {
  const [params]   = useSearchParams();
  const token      = params.get('token') ?? '';
  const navigate   = useNavigate();
  const { setAuth } = useAuthStore();

  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.');                 return; }
    if (!token)               { setError('Missing reset token in the link.');        return; }

    setLoading(true);
    try {
      // Backend hands back a fresh JWT so the user is signed in immediately.
      const { token: jwt, user } = await authApi.reset({ token, password });
      setAuth(user, jwt);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'This reset link is invalid or has expired.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#111111' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Set a new password</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Choose something you'll remember. We'll sign you in right after.
          </p>
        </div>

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
            <label className="panel-label">New password</label>
            <input type="password" required minLength={6} autoFocus
              value={password} onChange={e => setPassword(e.target.value)}
              className="panel-input" placeholder="At least 6 characters" />
          </div>
          <div>
            <label className="panel-label">Confirm password</label>
            <input type="password" required minLength={6}
              value={confirm} onChange={e => setConfirm(e.target.value)}
              className="panel-input" placeholder="Re-type it" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-lg font-semibold text-sm text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}>
            {loading ? 'Updating…' : 'Set password & sign in'}
          </button>
          <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            <Link to="/login" style={{ color: 'var(--accent)' }}>Back to sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
