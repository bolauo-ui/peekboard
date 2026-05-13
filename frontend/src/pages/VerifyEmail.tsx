import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader } from 'lucide-react';
import { authApi } from '@/lib/api';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token    = params.get('token') ?? '';
  const navigate = useNavigate();

  const [status, setStatus] = useState<'loading' | 'ok' | 'fail'>('loading');
  const [msg,    setMsg]    = useState('');

  useEffect(() => {
    if (!token) { setStatus('fail'); setMsg('Missing token.'); return; }
    authApi.verifyEmail(token)
      .then(() => setStatus('ok'))
      .catch((err) => {
        setStatus('fail');
        setMsg(err.response?.data?.error || 'This link is invalid or expired.');
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#111111' }}>
      <div className="w-full max-w-sm text-center">
        {status === 'loading' && (
          <>
            <Loader size={32} className="mx-auto animate-spin mb-3" style={{ color: 'var(--accent)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Confirming your email…</p>
          </>
        )}
        {status === 'ok' && (
          <>
            <CheckCircle2 size={48} className="mx-auto mb-3" style={{ color: '#34d399' }} />
            <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Email confirmed</h1>
            <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
              Thanks — your account is now fully active.
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white"
              style={{ background: 'var(--accent)' }}
            >
              Go to dashboard
            </button>
          </>
        )}
        {status === 'fail' && (
          <>
            <XCircle size={48} className="mx-auto mb-3" style={{ color: 'var(--danger)' }} />
            <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Verification failed</h1>
            <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>{msg}</p>
            <Link to="/dashboard" className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
              Go to dashboard
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
