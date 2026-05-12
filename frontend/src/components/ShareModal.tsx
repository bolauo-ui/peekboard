import { useEffect, useState } from 'react';
import { X, Link, Copy, Check, Trash2, ChevronDown } from 'lucide-react';
import { sharingApi } from '@/lib/api';
import type { BoardMember, User } from '@/types';

interface Props { boardId: string; currentUser: User; onClose: () => void; }

function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
      style={{ backgroundColor: color }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function ShareModal({ boardId, currentUser, onClose }: Props) {
  const [members,  setMembers]  = useState<BoardMember[]>([]);
  const [owner,    setOwner]    = useState<(User & { role: string }) | null>(null);
  const [email,    setEmail]    = useState('');
  const [role,     setRole]     = useState<'viewer'|'commenter'|'editor'>('viewer');
  const [sharing,  setSharing]  = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied,   setCopied]   = useState(false);

  useEffect(() => {
    sharingApi.getMembers(boardId)
      .then(({ members, owner }) => { setMembers(members); setOwner(owner); })
      .finally(() => setLoading(false));
  }, [boardId]);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSharing(true);
    try {
      const res = await sharingApi.share(boardId, { email: email.trim(), role });
      if (res.share_url) setInviteUrl(res.share_url);
      const updated = await sharingApi.getMembers(boardId);
      setMembers(updated.members);
      setEmail('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not share board');
    } finally { setSharing(false); }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const isOwner = owner?.id === currentUser.id;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl flex flex-col max-h-[88vh] shadow-2xl"
        style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-light)' }}>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Share board</h2>
          <button onClick={onClose}
            className="flex items-center justify-center w-6 h-6 rounded transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
            <X size={14} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {/* Invite form */}
          {isOwner && (
            <form onSubmit={handleShare} className="space-y-3">
              <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Invite people</p>
              {error && <p className="text-xs rounded-md px-3 py-2" style={{ background: 'rgba(240,82,82,0.1)', color: 'var(--danger)', border: '1px solid rgba(240,82,82,0.2)' }}>{error}</p>}
              <div className="flex gap-2">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="name@email.com" required
                  className="flex-1 text-sm rounded-md px-3 py-2 outline-none"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
                <RoleSelect value={role} onChange={v => setRole(v as any)} />
              </div>
              <button type="submit" disabled={sharing}
                className="w-full text-sm font-semibold py-2 rounded-md text-white disabled:opacity-50 transition-colors"
                style={{ background: 'var(--accent)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}>
                {sharing ? 'Sharing…' : 'Share'}
              </button>
            </form>
          )}

          {/* Invite link */}
          {inviteUrl && (
            <div className="rounded-lg p-3" style={{ background: 'var(--bg-section)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <Link size={11} style={{ color: 'var(--text-muted)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Invite link</span>
              </div>
              <div className="flex gap-2">
                <input readOnly value={inviteUrl}
                  className="flex-1 text-xs rounded px-2 py-1.5 truncate"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                />
                <button onClick={copyLink}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded font-medium text-white transition-colors"
                  style={{ background: copied ? '#059669' : '#374151' }}>
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          {/* Members */}
          <div>
            <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>People with access</p>
            {loading ? (
              <div className="space-y-2">
                {[1,2].map(i => <div key={i} className="h-9 rounded animate-pulse" style={{ background: 'var(--bg-section)' }} />)}
              </div>
            ) : (
              <ul className="space-y-2">
                {owner && (
                  <li className="flex items-center gap-2.5">
                    <Avatar name={owner.name} color={owner.avatar_color} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {owner.name}
                        {owner.id === currentUser.id && <span style={{ color: 'var(--text-muted)' }}> (you)</span>}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{owner.email}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>Owner</span>
                  </li>
                )}
                {members.map(m => (
                  <li key={m.id} className="flex items-center gap-2.5">
                    <Avatar name={m.name || m.email} color={m.avatar_color || '#555'} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{m.name || m.email}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {m.name ? m.email : ''}
                        {!m.accepted && <span style={{ color: '#fbbf24' }}>{m.name ? ' · ' : ''}Invite pending</span>}
                      </p>
                    </div>
                    {isOwner ? (
                      <div className="flex items-center gap-1">
                        <RoleSelect value={m.role} onChange={v => sharingApi.updateRole(boardId, m.id, v).then(() => setMembers(p => p.map(x => x.id===m.id ? {...x,role:v as any} : x)))} />
                        <button onClick={() => sharingApi.removeMember(boardId, m.id).then(() => setMembers(p => p.filter(x => x.id!==m.id)))}
                          className="p-1 rounded transition-colors" style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ background: 'var(--bg-section)', color: 'var(--text-secondary)' }}>{m.role}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="appearance-none text-xs rounded px-2.5 py-1.5 pr-6 outline-none"
        style={{ background: 'var(--bg-section)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
        <option value="viewer">Can view</option>
        <option value="commenter">Can comment</option>
        <option value="editor">Can edit</option>
      </select>
      <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
    </div>
  );
}
