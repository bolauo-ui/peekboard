import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { sharingApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) return;
    if (!user) {
      // Store token and redirect to login
      localStorage.setItem('pending_invite', token);
      navigate(`/login?invite=${token}`);
      return;
    }
    sharingApi.acceptInvite(token)
      .then(({ board_id }) => {
        setStatus('success');
        setTimeout(() => navigate(`/board/${board_id}`), 1500);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.error || 'This invite link is invalid or has expired.');
      });
  }, [token, user]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-sm w-full text-center">
        {status === 'loading' && (
          <>
            <div className="w-12 h-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-300">Accepting invite…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-white font-bold text-lg mb-2">You're in!</h2>
            <p className="text-gray-400 text-sm">Redirecting to the board…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-white font-bold text-lg mb-2">Invalid invite</h2>
            <p className="text-gray-400 text-sm mb-6">{message}</p>
            <Link to="/dashboard" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">
              Go to dashboard
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
