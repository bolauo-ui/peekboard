import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader, CheckCircle2, XCircle } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export default function MagicLink() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const [status, setStatus] = useState<'loading'|'ok'|'fail'>('loading');
  const [msg,    setMsg]    = useState('');

  useEffect(() => {
    if (!token) { setStatus('fail'); setMsg('Missing token.'); return; }
    authApi.magicVerify(token)
      .then(({ token: jwt, user }) => {
        setAuth(user, jwt);
        setStatus('ok');
        // Honour any pending invite; otherwise go to the dashboard.
        const pending = localStorage.getItem('pending_invite');
        const dest = pending ? `/invite/${pending}` : '/dashboard';
        setTimeout(() => navigate(dest), 600);
      })
      .catch(err => {
        setStatus('fail');
        setMsg(err.response?.data?.error || 'This sign-in link is invalid or expired.');
      });
  // setAuth is stable from zustand; we explicitly ignore it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#111111' }}>
      <div className="w-full max-w-sm text-center">
        {status === 'loading' && (
          <>
            <Loader size={32} className="mx-auto animate-spin mb-3" style={{ color: 'var(--accent)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Signing you in…</p>
          </>
        )}
        {status === 'ok' && (
          <>
            <CheckCircle2 size={48} className="mx-auto mb-3" style={{ color: '#34d399' }} />
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Signed in. Redirecting…</p>
          </>
        )}
        {status === 'fail' && (
          <>
            <XCircle size={48} className="mx-auto mb-3" style={{ color: 'var(--danger)' }} />
            <p className="text-sm mb-4" style={{ color: 'var(--text-primary)' }}>{msg}</p>
            <Link to="/login" className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
