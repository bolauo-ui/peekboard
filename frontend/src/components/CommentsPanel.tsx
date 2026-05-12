import { useState } from 'react';
import { MessageSquare, CheckCircle, Trash2, X, Eye, EyeOff } from 'lucide-react';
import type { Comment, User } from '@/types';

interface Props {
  currentUser: User;
  role: string;
  activeTool: string;
  onToolChange: (t: any) => void;
  comments: Comment[];
  replies: Comment[];
  showResolved: boolean;
  onToggleResolved: () => void;
  onResolve: (id: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onAddReply: (parentId: string, content: string) => Promise<Comment | null>;
}

function Avatar({ name, color, size = 'sm' }: { name: string; color: string; size?: 'sm'|'xs' }) {
  const sz = size === 'xs' ? 'w-5 h-5 text-[10px]' : 'w-6 h-6 text-xs';
  return (
    <div className={`${sz} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
      style={{ backgroundColor: color }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'now'; if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h/24)}d`;
}

// Render @mention spans in a comment body with a subtle highlight.
function renderWithMentions(text: string) {
  const parts = text.split(/(@[A-Za-z][\w'-]*(?:\s[A-Z][\w'-]*)?)/g);
  return parts.map((p, i) =>
    p.startsWith('@')
      ? <span key={i} className="font-semibold" style={{ color: 'var(--accent)' }}>{p}</span>
      : <span key={i}>{p}</span>
  );
}

export default function CommentsPanel({
  currentUser, role, activeTool, onToolChange,
  comments, replies, showResolved, onToggleResolved,
  onResolve, onDelete, onAddReply,
}: Props) {
  const [replyingTo, setReplyingTo] = useState<string|null>(null);
  const [replyTxt,   setReplyTxt]   = useState('');

  const canComment = role === 'owner' || role === 'editor' || role === 'commenter';

  const visible = showResolved ? comments : comments.filter(c => !c.resolved);
  const unresolvedCount = comments.filter(c => !c.resolved).length;

  const postReply = async (parentId: string) => {
    if (!replyTxt.trim()) return;
    await onAddReply(parentId, replyTxt.trim());
    setReplyTxt(''); setReplyingTo(null);
  };

  return (
    <aside className="w-64 flex flex-col flex-shrink-0" style={{ background: 'var(--bg-panel)', borderLeft: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: '1px solid var(--border-light)' }}>
        <div className="flex items-center gap-2">
          <MessageSquare size={13} style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Comments</span>
          {unresolvedCount > 0 && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
              {unresolvedCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onToggleResolved}
            title={showResolved ? 'Hide resolved' : 'Show resolved'}
            className="text-xs flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
            style={{
              background: showResolved ? 'var(--accent-dim)' : 'var(--bg-section)',
              color:      showResolved ? 'var(--accent)'    : 'var(--text-secondary)',
            }}>
            {showResolved ? <Eye size={10} /> : <EyeOff size={10} />}
            Resolved
          </button>
          {canComment && (
            <button
              onClick={() => onToolChange('comment')}
              className="text-xs px-2 py-0.5 rounded font-medium transition-colors"
              style={{
                background: activeTool === 'comment' ? 'var(--accent-dim)' : 'var(--bg-section)',
                color: activeTool === 'comment' ? 'var(--accent)' : 'var(--text-secondary)',
              }}>
              + Pin
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
            <MessageSquare size={24} style={{ color: 'var(--border)', marginBottom: 10 }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No comments yet</p>
            {canComment && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>Click "+ Pin" then click the canvas</p>}
          </div>
        ) : (
          <ul>
            {visible.map((c, idx) => {
              const threadReplies = replies.filter(r => r.parent_id === c.id);
              const pinNo = comments.filter(cc => !cc.resolved).findIndex(cc => cc.id === c.id) + 1;
              return (
                <li key={c.id} className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--border-light)', opacity: c.resolved ? 0.45 : 1 }}>
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                      style={{ background: c.resolved ? 'transparent' : 'var(--accent)', color: c.resolved ? 'var(--text-muted)' : '#fff', border: c.resolved ? '1px solid var(--border)' : 'none' }}>
                      {pinNo > 0 ? pinNo : (idx + 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <Avatar name={c.user_name} color={c.avatar_color} size="xs" />
                        <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{c.user_name}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{timeAgo(c.created_at)}</span>
                        {c.resolved ? (
                          <span className="text-xs flex items-center gap-0.5 font-medium" style={{ color: '#34d399' }}>
                            <CheckCircle size={9} /> Resolved
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs leading-relaxed break-words" style={{ color: 'var(--text-secondary)' }}>
                        {renderWithMentions(c.content)}
                      </p>

                      {!c.resolved && (
                        <div className="flex items-center gap-2 mt-1">
                          {canComment && (
                            <button onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
                              className="text-xs transition-colors" style={{ color: 'var(--text-muted)' }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                              Reply
                            </button>
                          )}
                          {(c.user_id === currentUser.id || role === 'owner') && (<>
                            <button onClick={() => onResolve(c.id)}
                              className="text-xs transition-colors" style={{ color: 'var(--text-muted)' }}
                              onMouseEnter={e => (e.currentTarget.style.color = '#34d399')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                              Resolve
                            </button>
                            <button onClick={() => onDelete(c.id)} className="ml-auto"
                              style={{ color: 'var(--text-muted)' }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                              <Trash2 size={10} />
                            </button>
                          </>)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Replies */}
                  {threadReplies.length > 0 && (
                    <ul className="mt-2 ml-8 space-y-1.5 pl-2.5" style={{ borderLeft: '2px solid var(--border)' }}>
                      {threadReplies.map(r => (
                        <li key={r.id} className="flex gap-1.5">
                          <Avatar name={r.user_name} color={r.avatar_color} size="xs" />
                          <div className="min-w-0">
                            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{r.user_name}</span>
                            <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>{timeAgo(r.created_at)}</span>
                            <p className="text-xs mt-0.5 break-words" style={{ color: 'var(--text-secondary)' }}>
                              {renderWithMentions(r.content)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {replyingTo === c.id && (
                    <div className="mt-2 ml-8 flex gap-1.5">
                      <textarea value={replyTxt} onChange={e => setReplyTxt(e.target.value)}
                        onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); postReply(c.id); } }}
                        placeholder="Reply… Enter to send" rows={2} autoFocus
                        className="flex-1 text-xs resize-none rounded px-2 py-1.5 outline-none"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                      />
                      <button onClick={() => setReplyingTo(null)} style={{ color: 'var(--text-muted)' }} className="self-start pt-1">
                        <X size={11} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
