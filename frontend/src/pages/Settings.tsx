import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, KeyRound, User as UserIcon } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

const AVATAR_COLORS = ['#6366f1','#7b68ee','#8b5cf6','#ec4899','#f97316','#10b981','#3b82f6','#f59e0b','#ef4444','#14b8a6'];

export default function Settings() {
  const { user, setAuth, token, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const [name,         setName]         = useState(user?.name ?? '');
  const [color,        setColor]        = useState(user?.avatar_color ?? '#7b68ee');
  const [profileMsg,   setProfileMsg]   = useState<string | null>(null);
  const [profileBusy,  setProfileBusy]  = useState(false);

  const [current,      setCurrent]      = useState('');
  const [next,         setNext]         = useState('');
  const [confirm,      setConfirm]      = useState('');
  const [passwordMsg,  setPasswordMsg]  = useState<string | null>(null);
  const [passwordErr,  setPasswordErr]  = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !token) return;
    setProfileBusy(true); setProfileMsg(null);
    try {
      const { user: updated } = await authApi.updateMe({ name: name.trim(), avatar_color: color });
      setAuth(updated, token);
      setProfileMsg('Saved');
      setTimeout(() => setProfileMsg(null), 2000);
    } catch (err: any) {
      setProfileMsg(err.response?.data?.error || 'Could not save');
    } finally { setProfileBusy(false); }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordErr(null); setPasswordMsg(null);
    if (next.length < 6)      { setPasswordErr('New password must be at least 6 characters.'); return; }
    if (next !== confirm)     { setPasswordErr('New password and confirmation must match.');   return; }

    setPasswordBusy(true);
    try {
      await authApi.changePassword({ current, next });
      setPasswordMsg('Password updated');
      setCurrent(''); setNext(''); setConfirm('');
      setTimeout(() => setPasswordMsg(null), 2500);
    } catch (err: any) {
      setPasswordErr(err.response?.data?.error || 'Could not change password');
    } finally { setPasswordBusy(false); }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-toolbar)' }}>
      {/* Top bar */}
      <header className="flex items-center px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 text-sm font-medium px-2 py-1 rounded transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <ArrowLeft size={14} /> Back to boards
        </button>
        <span className="ml-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Settings</span>
        <button
          onClick={() => { clearAuth(); navigate('/login'); }}
          className="ml-auto text-xs font-medium px-2.5 py-1 rounded transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          Sign out
        </button>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-10 space-y-8">
        {/* Profile card */}
        <section className="rounded-xl p-6"
          style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <UserIcon size={14} style={{ color: 'var(--text-muted)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Profile</h2>
          </div>

          <form onSubmit={saveProfile} className="space-y-4">
            <div>
              <label className="panel-label">Display name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="panel-input"
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="panel-label">Avatar colour</label>
              <div className="flex items-center gap-2 flex-wrap">
                {AVATAR_COLORS.map(c => (
                  <button
                    type="button" key={c}
                    onClick={() => setColor(c)}
                    className="rounded-full flex items-center justify-center transition-transform hover:scale-110"
                    style={{
                      width: 30, height: 30,
                      background: c,
                      border: c === color ? '2px solid var(--text-primary)' : '2px solid transparent',
                    }}
                  >
                    {c === color && <Check size={13} className="text-white" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit" disabled={profileBusy}
                className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                {profileBusy ? 'Saving…' : 'Save profile'}
              </button>
              {profileMsg && <span className="text-xs" style={{ color: '#34d399' }}>{profileMsg}</span>}
            </div>
          </form>
        </section>

        {/* Password card */}
        <section className="rounded-xl p-6"
          style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <KeyRound size={14} style={{ color: 'var(--text-muted)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Password</h2>
          </div>

          <form onSubmit={savePassword} className="space-y-4">
            {passwordErr && (
              <div className="text-xs px-3 py-2 rounded-lg"
                style={{ background: 'rgba(240,82,82,0.1)', border: '1px solid rgba(240,82,82,0.25)', color: 'var(--danger)' }}>
                {passwordErr}
              </div>
            )}
            <div>
              <label className="panel-label">Current password</label>
              <input
                type="password" value={current}
                onChange={e => setCurrent(e.target.value)}
                placeholder="Leave blank if signed up via Google"
                className="panel-input"
              />
            </div>
            <div>
              <label className="panel-label">New password</label>
              <input
                type="password" value={next} required minLength={6}
                onChange={e => setNext(e.target.value)}
                placeholder="At least 6 characters"
                className="panel-input"
              />
            </div>
            <div>
              <label className="panel-label">Confirm new password</label>
              <input
                type="password" value={confirm} required minLength={6}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Re-type it"
                className="panel-input"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit" disabled={passwordBusy}
                className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                {passwordBusy ? 'Updating…' : 'Change password'}
              </button>
              {passwordMsg && <span className="text-xs" style={{ color: '#34d399' }}>{passwordMsg}</span>}
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
