import { useMemo, useState } from 'react';
import { Search, ListFilter, MoreHorizontal, Trash2, Check } from 'lucide-react';
import { fabric } from 'fabric';
import type { Comment, User } from '@/types';

interface Props {
  currentUser: User;
  role: string;
  canvas: fabric.Canvas | null;
  zoom: number;
  activeTool: string;
  onToolChange: (t: any) => void;

  comments: Comment[];
  replies: Comment[];
  showResolved: boolean;
  onToggleResolved: () => void;
  onResolve: (id: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onAddReply: (parentId: string, content: string) => Promise<Comment | null>;

  openPinId: string | null;
  onOpenPin: (id: string | null) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 5)   return 'Just now';
  if (s < 60)  return `${s} seconds ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m} minute${m !== 1 ? 's' : ''} ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} hour${h !== 1 ? 's' : ''} ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function renderWithMentions(text: string) {
  const parts = text.split(/(@[A-Za-z][\w'-]*(?:\s[A-Z][\w'-]*)?)/g);
  return parts.map((p, i) =>
    p.startsWith('@')
      ? <span key={i} className="font-medium" style={{ color: '#2680eb' }}>{p}</span>
      : <span key={i}>{p}</span>
  );
}

// Find which frame (if any) a comment's x/y sits inside. Returns the frame
// name or "Page 1" as the default container label, mirroring Figma's
// "#13 · Art Direction" style.
function getContainerLabel(canvas: fabric.Canvas | null, x: number, y: number): string {
  if (!canvas) return 'Page 1';
  let best: { name: string; area: number } | null = null;
  for (const obj of canvas.getObjects()) {
    const data = (obj as any).data;
    if (data?.type !== 'frame') continue;
    const fw = (obj.width  ?? 0) * (obj.scaleX ?? 1);
    const fh = (obj.height ?? 0) * (obj.scaleY ?? 1);
    const fx = obj.left ?? 0;
    const fy = obj.top  ?? 0;
    if (x >= fx && x <= fx + fw && y >= fy && y <= fy + fh) {
      const area = fw * fh;
      // Pick the smallest enclosing frame so nested frames win.
      if (!best || area < best.area) best = { name: data.frameName ?? 'Frame', area };
    }
  }
  return best?.name ?? 'Page 1';
}

// ── Avatar (light theme) ─────────────────────────────────────────────────────
function Avatar({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{
        width: size, height: size,
        backgroundColor: color,
        fontSize: size <= 22 ? 10 : 12,
        boxShadow: '0 0 0 2px #fff',
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
export default function CommentsPanel({
  currentUser, role, canvas, zoom, activeTool, onToolChange,
  comments, replies, showResolved, onToggleResolved,
  onResolve, onDelete, onAddReply, openPinId, onOpenPin,
}: Props) {
  const canComment = role === 'owner' || role === 'editor' || role === 'commenter';
  const [search,        setSearch]        = useState('');
  const [moreMenuOpen,  setMoreMenuOpen]  = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [replyDraft,    setReplyDraft]    = useState<Record<string, string>>({});

  // Number pins in creation order (only unresolved ones get a number).
  const numbered = useMemo(() => {
    const sorted = [...comments].sort((a, b) => a.created_at.localeCompare(b.created_at));
    let n = 0;
    const out: Record<string, number> = {};
    sorted.forEach(c => { if (!c.resolved) out[c.id] = ++n; });
    return out;
  }, [comments]);

  const filtered = useMemo(() => {
    let list = showResolved ? comments : comments.filter(c => !c.resolved);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.content.toLowerCase().includes(q) ||
        c.user_name.toLowerCase().includes(q) ||
        replies.some(r => r.parent_id === c.id && r.content.toLowerCase().includes(q))
      );
    }
    // Most recent at top, like Figma.
    return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [comments, replies, search, showResolved]);

  const handleAddReply = async (parentId: string) => {
    const text = (replyDraft[parentId] || '').trim();
    if (!text) return;
    await onAddReply(parentId, text);
    setReplyDraft(d => ({ ...d, [parentId]: '' }));
  };

  return (
    <aside
      className="w-80 flex flex-col flex-shrink-0"
      style={{ background: '#ffffff', borderLeft: '1px solid #e5e7eb', color: '#1f2024' }}
    >
      {/* Title row */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #f1f2f4' }}>
        <span className="text-sm font-semibold">Comments</span>
        <span className="text-xs font-medium flex items-center gap-0.5" style={{ color: '#6b7280' }}>
          {Math.round(zoom * 100)}%
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </div>

      {/* Search + filter + more */}
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid #f1f2f4' }}>
        <div className="flex-1 relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#9ca3af' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="w-full text-[13px] rounded-md pl-7 pr-2 py-1.5 outline-none"
            style={{ background: '#f3f4f6', color: '#1f2024' }}
          />
        </div>
        <button
          onClick={onToggleResolved}
          title={showResolved ? 'Hide resolved' : 'Show resolved'}
          className="rounded-full p-1.5 transition-colors"
          style={{
            background: showResolved ? '#eef2ff' : 'transparent',
            color:      showResolved ? '#2680eb' : '#1f2024',
            border:     '1px solid ' + (showResolved ? '#c7d2fe' : '#e5e7eb'),
          }}
        >
          <ListFilter size={14} />
        </button>
        <div className="relative">
          <button
            onClick={() => setMoreMenuOpen(v => !v)}
            className="rounded-full p-1.5 transition-colors"
            style={{ color: '#1f2024' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <MoreHorizontal size={14} />
          </button>
          {moreMenuOpen && (
            <div
              className="absolute right-0 top-9 rounded-md py-1 z-50"
              style={{ background: '#fff', boxShadow: '0 10px 28px rgba(0,0,0,0.18)', border: '1px solid #ececef', minWidth: 180 }}
              onMouseLeave={() => setMoreMenuOpen(false)}
            >
              <button onClick={() => { onToggleResolved(); setMoreMenuOpen(false); }}
                className="w-full text-left text-[12.5px] px-3 py-1.5 hover:bg-gray-50">
                {showResolved ? 'Hide resolved' : 'Show resolved'}
              </button>
              {canComment && (
                <button onClick={() => { onToolChange('comment'); setMoreMenuOpen(false); }}
                  className="w-full text-left text-[12.5px] px-3 py-1.5 hover:bg-gray-50">
                  Add a pin
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
            <span className="text-sm font-medium" style={{ color: '#9ca3af' }}>
              {search.trim() ? 'No matches' : 'No comments yet'}
            </span>
            {canComment && !search.trim() && (
              <span className="text-xs mt-1" style={{ color: '#9ca3af' }}>
                Pick the comment tool, then click the canvas.
              </span>
            )}
          </div>
        ) : (
          <ul>
            {filtered.map(c => {
              const threadReplies = replies.filter(r => r.parent_id === c.id);
              const isActive   = openPinId === c.id;
              const isExpanded = !!expandedReplies[c.id];
              const lastReplier = threadReplies[threadReplies.length - 1];
              const containerLabel = getContainerLabel(canvas, c.x, c.y);
              const pinNum = numbered[c.id];
              const truncated = c.content.length > 130;
              const body = truncated && !isActive ? c.content.slice(0, 130).trimEnd() + '…' : c.content;

              return (
                <li
                  key={c.id}
                  className="px-4 py-3 cursor-pointer transition-colors"
                  style={{
                    background: isActive ? '#eaf2ff' : 'transparent',
                    opacity:    c.resolved ? 0.55 : 1,
                  }}
                  onClick={() => onOpenPin(isActive ? null : c.id)}
                >
                  {/* Avatars + unread dot */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="flex -space-x-2">
                      <Avatar name={c.user_name} color={c.avatar_color} />
                      {lastReplier && lastReplier.user_id !== c.user_id && (
                        <Avatar name={lastReplier.user_name} color={lastReplier.avatar_color} />
                      )}
                    </div>
                    {!c.resolved && (
                      <span
                        className="ml-auto block rounded-full"
                        style={{ width: 7, height: 7, background: isActive ? '#2680eb' : '#2680eb' }}
                      />
                    )}
                    {c.resolved && (
                      <span
                        className="ml-auto inline-flex items-center justify-center rounded-full"
                        style={{ width: 14, height: 14, border: '1px solid #10b981', color: '#10b981' }}
                        title="Resolved"
                      >
                        <Check size={9} strokeWidth={3} />
                      </span>
                    )}
                  </div>

                  {/* Frame label: #N · Frame name */}
                  <div className="text-[12px] mb-0.5" style={{ color: '#9ca3af' }}>
                    {pinNum ? `#${pinNum} · ${containerLabel}` : containerLabel}
                  </div>

                  {/* Author + time */}
                  <div className="text-[13px] leading-tight">
                    <span className="font-semibold" style={{ color: '#1f2024' }}>{c.user_name}</span>
                    <span className="ml-2" style={{ color: '#9ca3af' }}>{timeAgo(c.created_at)}</span>
                  </div>

                  {/* Body */}
                  <p className="text-[13.5px] leading-snug mt-1 break-words" style={{ color: '#1f2024' }}>
                    {renderWithMentions(body)}
                  </p>

                  {/* N reply(ies) link */}
                  {threadReplies.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedReplies(p => ({ ...p, [c.id]: !p[c.id] }));
                      }}
                      className="text-[12.5px] mt-1.5 font-medium"
                      style={{ color: '#2680eb' }}
                    >
                      {isExpanded
                        ? 'Hide replies'
                        : `${threadReplies.length} ${threadReplies.length === 1 ? 'reply' : 'replies'}`}
                    </button>
                  )}

                  {/* Expanded replies (collapse-only when not active so the
                      hover state doesn't get cluttered) */}
                  {(isExpanded || isActive) && threadReplies.length > 0 && (
                    <ul className="mt-2 ml-1 space-y-2 pl-2.5" style={{ borderLeft: '2px solid #e5e7eb' }} onClick={(e) => e.stopPropagation()}>
                      {threadReplies.map(r => (
                        <li key={r.id} className="flex gap-1.5">
                          <Avatar name={r.user_name} color={r.avatar_color} size={20} />
                          <div className="min-w-0">
                            <div className="text-[12px]">
                              <span className="font-semibold" style={{ color: '#1f2024' }}>{r.user_name}</span>
                              <span className="ml-1.5" style={{ color: '#9ca3af' }}>{timeAgo(r.created_at)}</span>
                            </div>
                            <p className="text-[13px] leading-snug mt-0.5 break-words" style={{ color: '#1f2024' }}>
                              {renderWithMentions(r.content)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Action row (only on the active card to mirror Figma) */}
                  {isActive && !c.resolved && (
                    <div className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                      {canComment && (
                        <input
                          type="text"
                          value={replyDraft[c.id] || ''}
                          onChange={(e) => setReplyDraft(d => ({ ...d, [c.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleAddReply(c.id); }
                          }}
                          placeholder="Reply…"
                          className="flex-1 text-[13px] rounded-full px-3 py-1.5 outline-none"
                          style={{ background: '#f3f4f6', color: '#1f2024' }}
                        />
                      )}
                      {(c.user_id === currentUser.id || role === 'owner') && (
                        <>
                          <button
                            onClick={() => onResolve(c.id)}
                            title="Resolve"
                            className="p-1.5 rounded-full"
                            style={{ color: '#1f2024' }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = '#10b981')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = '#1f2024')}
                          >
                            <span className="inline-flex items-center justify-center rounded-full"
                              style={{ width: 18, height: 18, border: '1.5px solid currentColor' }}>
                              <Check size={10} strokeWidth={3} />
                            </span>
                          </button>
                          <button
                            onClick={() => onDelete(c.id)}
                            title="Delete"
                            className="p-1.5 rounded-full"
                            style={{ color: '#1f2024' }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = '#dc2626')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = '#1f2024')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
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
