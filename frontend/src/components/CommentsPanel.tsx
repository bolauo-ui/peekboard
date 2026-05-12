import { useEffect, useState, useRef } from 'react';
import { MessageSquare, CheckCircle, Trash2, X } from 'lucide-react';
import { commentsApi } from '@/lib/api';
import type { Comment, User } from '@/types';
import { fabric } from 'fabric';

interface Props {
  boardId: string;
  currentUser: User;
  role: string;
  canvas: fabric.Canvas | null;
  activeTool: string;
  onToolChange: (t: any) => void;
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

export default function CommentsPanel({ boardId, currentUser, role, canvas, activeTool, onToolChange }: Props) {
  const [comments,  setComments]  = useState<Comment[]>([]);
  const [replies,   setReplies]   = useState<Comment[]>([]);
  const [pending,   setPending]   = useState<{ x:number; y:number } | null>(null);
  const [pendingTxt, setPendingTxt] = useState('');
  const [replyingTo, setReplyingTo] = useState<string|null>(null);
  const [replyTxt,   setReplyTxt]   = useState('');
  const [loading, setLoading] = useState(true);
  const pendingRef = useRef<HTMLTextAreaElement>(null);
  const canComment = role === 'owner' || role === 'editor' || role === 'commenter';

  useEffect(() => {
    commentsApi.list(boardId)
      .then(({ comments, replies }) => { setComments(comments); setReplies(replies); })
      .finally(() => setLoading(false));
  }, [boardId]);

  useEffect(() => {
    if (!canvas || activeTool !== 'comment') return;
    const onClick = (opt: fabric.IEvent) => {
      const ptr = canvas.getPointer((opt as any).e);
      setPending({ x: Math.round(ptr.x), y: Math.round(ptr.y) });
      onToolChange('select');
      setTimeout(() => pendingRef.current?.focus(), 80);
    };
    canvas.on('mouse:down', onClick);
    return () => { canvas.off('mouse:down', onClick); };
  }, [canvas, activeTool, onToolChange]);

  const postComment = async () => {
    if (!pendingTxt.trim() || !pending) return;
    const { comment } = await commentsApi.create(boardId, { x: pending.x, y: pending.y, content: pendingTxt.trim() });
    setComments(p => [comment, ...p]);
    setPendingTxt(''); setPending(null);
  };

  const postReply = async (parentId: string) => {
    if (!replyTxt.trim()) return;
    const { comment } = await commentsApi.create(boardId, { x:0, y:0, content: replyTxt.trim(), parent_id: parentId });
    setReplies(p => [...p, comment]);
    setReplyTxt(''); setReplyingTo(null);
  };

  const resolve = async (id: string) => {
    await commentsApi.resolve(id);
    setComments(p => p.map(c => c.id === id ? { ...c, resolved: 1 } : c));
  };

  const del = async (id: string) => {
    await commentsApi.delete(id);
    setComments(p => p.filter(c => c.id !== id));
  };

  const unresolvedCount = comments.filter(c => !c.resolved).length;

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
        {canComment && (
          <button
            onClick={() => onToolChange('comment')}
            className="text-xs px-2 py-0.5 rounded font-medium transition-colors"
            style={{
              background: activeTool === 'comment' ? 'var(--accent-dim)' : 'var(--bg-section)',
              color: activeTool === 'comment' ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            + Pin
          </button>
        )}
      </div>

      {/* Pending comment form */}
      {pending && (
        <div className="p-3 animate-fade-in" style={{ background: 'rgba(245,158,11,0.06)', borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
          <p className="text-xs mb-1.5 font-medium" style={{ color: '#fbbf24' }}>
            At ({pending.x}, {pending.y})
          </p>
          <textarea ref={pendingRef} value={pendingTxt}
            onChange={e => setPendingTxt(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); postComment(); } }}
            placeholder="Write a comment… Enter to send"
            rows={3}
            className="w-full text-xs resize-none rounded-md px-2.5 py-2 outline-none"
            style={{ background: 'var(--bg-input)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--text-primary)' }}
          />
          <div className="flex gap-2 mt-1.5">
            <button onClick={postComment} disabled={!pendingTxt.trim()}
              className="flex-1 text-xs py-1.5 rounded font-semibold text-white disabled:opacity-40 transition-colors"
              style={{ background: '#d97706' }}>Post</button>
            <button onClick={() => { setPending(null); setPendingTxt(''); }}
              className="text-xs px-2" style={{ color: 'var(--text-muted)' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-12 rounded animate-pulse" style={{ background: 'var(--bg-section)' }} />)}
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
            <MessageSquare size={24} style={{ color: 'var(--border)', marginBottom: 10 }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No comments yet</p>
            {canComment && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>Click "+ Pin" then click the canvas</p>}
          </div>
        ) : (
          <ul style={{ borderTop: 'none' }}>
            {comments.map(c => {
              const threadReplies = replies.filter(r => r.parent_id === c.id);
              return (
                <li key={c.id} className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--border-light)', opacity: c.resolved ? 0.45 : 1 }}>
                  <div className="flex gap-2">
                    <Avatar name={c.user_name} color={c.avatar_color} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{c.user_name}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{timeAgo(c.created_at)}</span>
                        {c.resolved ? (
                          <span className="text-xs flex items-center gap-0.5 font-medium" style={{ color: '#34d399' }}>
                            <CheckCircle size={9} /> Resolved
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{c.content}</p>

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
                            <button onClick={() => resolve(c.id)}
                              className="text-xs transition-colors" style={{ color: 'var(--text-muted)' }}
                              onMouseEnter={e => (e.currentTarget.style.color = '#34d399')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                              Resolve
                            </button>
                            <button onClick={() => del(c.id)} className="ml-auto"
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
                          <div>
                            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{r.user_name}</span>
                            <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>{timeAgo(r.created_at)}</span>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{r.content}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {replyingTo === c.id && (
                    <div className="mt-2 ml-8 animate-fade-in flex gap-1.5">
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
