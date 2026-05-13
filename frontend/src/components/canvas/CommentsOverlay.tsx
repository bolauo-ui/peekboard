import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fabric } from 'fabric';
import { ArrowUp, Smile, AtSign, Image as ImageIcon, Check, X, MoreHorizontal, CornerDownRight } from 'lucide-react';
import type { Comment, User } from '@/types';

// ── Public types ─────────────────────────────────────────────────────────────
export interface BoardMemberLite {
  id: string;
  name: string;
  avatar_color: string;
}

interface Props {
  boardId: string;
  currentUser: User;
  role: string;
  canvas: fabric.Canvas | null;
  activeTool: string;
  onToolChange: (t: any) => void;

  comments: Comment[];
  replies:  Comment[];
  members:  BoardMemberLite[];
  showResolved: boolean;

  // Controlled: drives which pin's thread popover is open. Lifted to the
  // Board page so the sidebar can also open a thread when its card is
  // clicked.
  openPinId: string | null;
  onOpenPin: (id: string | null) => void;

  onAddComment: (x: number, y: number, content: string) => Promise<Comment | null>;
  onAddReply:   (parentId: string, content: string) => Promise<Comment | null>;
  onResolve:    (id: string) => Promise<void> | void;
  onDelete:     (id: string) => Promise<void> | void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 5)   return 'Just now';
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

// Highlight @mentions inside the rendered text. Matches "@Name" or "@First Last".
function renderWithMentions(text: string) {
  const parts = text.split(/(@[A-Za-z][\w'-]*(?:\s[A-Z][\w'-]*)?)/g);
  return parts.map((p, i) =>
    p.startsWith('@')
      ? <span key={i} className="font-semibold" style={{ color: '#2680eb' }}>{p}</span>
      : <span key={i}>{p}</span>
  );
}

const PIN_COLOR_NEW    = '#2680eb';   // blue – pending / fresh pin
const PIN_COLOR_ACTIVE = '#2680eb';   // blue – currently-open pin
const PIN_RING_ACTIVE  = '#ffffff';   // white halo when selected

// Common emojis grouped for the lightweight picker.
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Smileys',    emojis: ['😀','😄','😁','😊','😍','😂','🤣','😘','😎','🤩','🥳','🙂','🤔','😐','😴','😅','😆','😉'] },
  { label: 'Reactions',  emojis: ['👍','👎','👏','🙌','🙏','💪','✌️','👌','✋','🤝','👀','💯','🔥','✨','⭐','💥','🎉','❤️'] },
  { label: 'Symbols',    emojis: ['✅','❌','⚠️','❗','❓','💡','📌','📍','🚀','⏰','📝','💬','🗒️','📎','🔗','🎯','🏁','📊'] },
];

// ── Component ────────────────────────────────────────────────────────────────
export default function CommentsOverlay({
  currentUser, role, canvas, activeTool, onToolChange,
  comments, replies, members, showResolved,
  openPinId, onOpenPin,
  onAddComment, onAddReply, onResolve, onDelete,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const canComment = role === 'owner' || role === 'editor' || role === 'commenter';

  // Re-render on viewport change only (not on every Fabric paint).
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick(t => t + 1), []);
  const lastVptRef = useRef<string>('');
  useEffect(() => {
    if (!canvas) return;
    const handler = () => {
      const v = canvas.viewportTransform;
      const key = v ? `${v[0]}|${v[3]}|${v[4]}|${v[5]}` : '';
      if (key !== lastVptRef.current) { lastVptRef.current = key; bump(); }
    };
    canvas.on('after:render', handler);
    window.addEventListener('resize', bump);
    return () => {
      canvas.off('after:render', handler);
      window.removeEventListener('resize', bump);
    };
  }, [canvas, bump]);

  // ── Pin + popover state ───────────────────────────────────────────────────
  // openPinId is controlled from the parent so the sidebar can also drive it.
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const setOpenPinId = onOpenPin;

  // When the sidebar opens a pin that's off-screen, gently pan the viewport
  // so the pin is centred. Only triggers when the pin is actually outside
  // the visible canvas area — clicks on visible pins don't snap the view.
  useEffect(() => {
    if (!canvas || !openPinId) return;
    const c = comments.find(cc => cc.id === openPinId);
    if (!c) return;
    const canvasEl = canvas.getElement?.() as HTMLCanvasElement | undefined;
    if (!canvasEl) return;
    const w = canvas.getWidth();
    const h = canvas.getHeight();
    const vpt = canvas.viewportTransform!;
    const zoom = canvas.getZoom();
    const sx = c.x * zoom + vpt[4];
    const sy = c.y * zoom + vpt[5];
    const margin = 40;
    const outside = sx < margin || sy < margin || sx > w - margin || sy > h - margin;
    if (!outside) return;
    // Centre the pin in the viewport without changing zoom.
    const tx = w / 2 - c.x * zoom;
    const ty = h / 2 - c.y * zoom;
    canvas.setViewportTransform([zoom, 0, 0, zoom, tx, ty]);
    canvas.requestRenderAll();
  }, [openPinId, comments, canvas]);

  useEffect(() => {
    if (!canvas || activeTool !== 'comment') return;
    // Only attach the click-to-drop handler while comment mode is active.
    // We deliberately do NOT clear `pending` when activeTool flips away from
    // 'comment' — dropping a pin auto-switches to 'select', and that
    // transition used to nuke the pending pin and its popover before the
    // user could type anything. The pending pin is cleared only by submit
    // or by the popover's explicit cancel (X / Escape).
    const onDown = (opt: fabric.IEvent) => {
      const ptr = canvas.getPointer((opt as any).e);
      setPending({ x: Math.round(ptr.x), y: Math.round(ptr.y) });
      setOpenPinId(null);
      onToolChange('select');
    };
    canvas.on('mouse:down', onDown);
    return () => { canvas.off('mouse:down', onDown); };
  }, [canvas, activeTool, onToolChange]);

  // ── World-to-screen projection ────────────────────────────────────────────
  const project = useCallback((wx: number, wy: number): { left: number; top: number } | null => {
    if (!canvas) return null;
    const canvasEl = canvas.getElement?.() as HTMLCanvasElement | undefined;
    const overlay  = overlayRef.current;
    if (!canvasEl || !overlay) return null;
    const cRect = canvasEl.getBoundingClientRect();
    const oRect = overlay.getBoundingClientRect();
    const vpt   = canvas.viewportTransform!;
    const zoom  = canvas.getZoom();
    return {
      left: (cRect.left - oRect.left) + wx * zoom + vpt[4],
      top:  (cRect.top  - oRect.top)  + wy * zoom + vpt[5],
    };
  }, [canvas]);

  // ── Visible pins ──────────────────────────────────────────────────────────
  const visiblePins = useMemo(
    () => comments.filter(c => showResolved || !c.resolved),
    [comments, showResolved]
  );

  const openComment = openPinId ? comments.find(c => c.id === openPinId) ?? null : null;
  const openThread  = openComment ? replies.filter(r => r.parent_id === openComment.id) : [];
  const openPinPos  = openComment ? project(openComment.x, openComment.y) : null;
  const pendingPos  = pending ? project(pending.x, pending.y) : null;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 20 }}
    >
      {/* Existing pins */}
      {visiblePins.map(c => {
        const pos = project(c.x, c.y);
        if (!pos) return null;
        const isOpen = openPinId === c.id;
        return (
          <PinDot
            key={c.id}
            avatarInitial={c.user_name.charAt(0).toUpperCase()}
            avatarColor={c.avatar_color}
            authorName={c.user_name}
            previewText={c.content}
            resolved={!!c.resolved}
            active={isOpen}
            left={pos.left}
            top={pos.top}
            onClick={() => setOpenPinId(openPinId === c.id ? null : c.id)}
          />
        );
      })}

      {/* Pending (not-yet-saved) pin */}
      {pendingPos && (
        <PinDot
          avatarInitial={currentUser.name.charAt(0).toUpperCase()}
          avatarColor={currentUser.avatar_color}
          authorName={currentUser.name}
          resolved={false}
          active
          left={pendingPos.left}
          top={pendingPos.top}
          onClick={() => { /* no-op; popover handles cancel */ }}
        />
      )}

      {/* Popover for an existing thread */}
      {openComment && openPinPos && (
        <ThreadPopover
          comment={openComment}
          replies={openThread}
          anchor={openPinPos}
          overlayRef={overlayRef}
          currentUser={currentUser}
          role={role}
          canComment={canComment}
          members={members}
          onClose={() => setOpenPinId(null)}
          onAddReply={onAddReply}
          onResolve={onResolve}
          onDelete={onDelete}
        />
      )}

      {/* Popover for the pending pin */}
      {pending && pendingPos && (
        <NewCommentPopover
          anchor={pendingPos}
          overlayRef={overlayRef}
          currentUser={currentUser}
          members={members}
          onCancel={() => setPending(null)}
          onSubmit={async (text) => {
            const c = await onAddComment(pending.x, pending.y, text);
            setPending(null);
            if (c) setOpenPinId(c.id);
          }}
        />
      )}
    </div>
  );
}

// ── Teardrop pin with avatar inside ─────────────────────────────────────────
interface PinDotProps {
  avatarInitial: string;
  avatarColor: string;
  authorName: string;
  previewText?: string;
  resolved: boolean;
  active: boolean;
  left: number;
  top: number;
  onClick: () => void;
}

function PinDot({ avatarInitial, avatarColor, authorName, previewText, resolved, active, left, top, onClick }: PinDotProps) {
  const [hover, setHover] = useState(false);

  // Outer teardrop colour: blue when active/pending, neutral when resolved,
  // otherwise the same blue as Figma uses for unresolved threads.
  const teardropBg = resolved ? '#ffffff' : PIN_COLOR_NEW;
  const teardropBorder = resolved ? '#cfd2d6' : PIN_COLOR_NEW;

  return (
    <div
      className="absolute pointer-events-auto"
      style={{ left, top, transform: 'translate(-50%, -100%)' }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="relative block transition-transform hover:scale-110"
        style={{
          width:        34,
          height:       34,
          padding:      0,
          background:   'transparent',
          border:       'none',
          cursor:       'pointer',
          filter:       active
            ? 'drop-shadow(0 0 0 3px ' + PIN_RING_ACTIVE + ') drop-shadow(0 4px 10px rgba(0,0,0,0.35))'
            : 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))',
        }}
        aria-label={`Comment by ${authorName}`}
      >
        {/* Teardrop SVG: pointed at bottom-left, rounded top-right. */}
        <svg viewBox="0 0 40 40" width="34" height="34" style={{ display: 'block' }}>
          <path
            d="M20 2
               C 30 2 38 10 38 20
               C 38 30 30 38 20 38
               L 2 38
               L 2 20
               C 2 10 10 2 20 2 Z"
            fill={teardropBg}
            stroke={active ? PIN_RING_ACTIVE : teardropBorder}
            strokeWidth={active ? 2.5 : 1}
          />
        </svg>
        {/* Avatar inside */}
        <span
          style={{
            position:      'absolute',
            left:          '50%',
            top:           '50%',
            transform:     'translate(-50%, -50%)',
            width:         20,
            height:        20,
            borderRadius:  '50%',
            background:    avatarColor,
            color:         '#fff',
            fontSize:      10,
            fontWeight:    700,
            display:       'flex',
            alignItems:    'center',
            justifyContent:'center',
            // Slight offset to nest in the rounded part of the teardrop.
            marginTop:     -3,
            marginLeft:    1,
          }}
        >
          {resolved ? <Check size={12} strokeWidth={3} /> : avatarInitial}
        </span>
      </button>

      {/* Hover preview */}
      {hover && previewText && !active && (
        <div
          className="absolute text-xs rounded-md px-2.5 py-1.5"
          style={{
            left:        '50%',
            top:         -10,
            transform:   'translate(-50%, -100%)',
            background:  'rgba(20,20,24,0.96)',
            border:      '1px solid rgba(255,255,255,0.08)',
            color:       '#fff',
            maxWidth:    280,
            whiteSpace:  'nowrap',
            overflow:    'hidden',
            textOverflow:'ellipsis',
            pointerEvents: 'none',
            zIndex:      30,
            boxShadow:   '0 6px 22px rgba(0,0,0,0.4)',
          }}
        >
          <span className="font-semibold">{authorName}</span>
          <span style={{ opacity: 0.6 }}> · </span>
          <span style={{ opacity: 0.85 }}>
            {previewText.slice(0, 60)}{previewText.length > 60 ? '…' : ''}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Popover positioning ─────────────────────────────────────────────────────
function usePopoverPosition(
  anchor: { left: number; top: number },
  overlayRef: React.RefObject<HTMLElement>,
  size: { w: number; h: number },
) {
  const overlay = overlayRef.current;
  const ow = overlay?.clientWidth  ?? window.innerWidth;
  const oh = overlay?.clientHeight ?? window.innerHeight;
  const margin = 12;

  // Default: to the right of the pin, vertically centred on it.
  let left = anchor.left + 22;
  let top  = anchor.top  - size.h / 2;

  // Flip to the left if we'd run off the right edge.
  if (left + size.w + margin > ow) left = Math.max(margin, anchor.left - size.w - 22);
  // Vertical clamp.
  if (top + size.h + margin > oh) top = Math.max(margin, oh - size.h - margin);
  if (top < margin) top = margin;

  return { left, top };
}

// ── Light card wrapper (matches the Figma screenshots) ──────────────────────
function LightCard({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={'rounded-2xl ' + className}
      style={{
        background:  '#ffffff',
        color:       '#1f2024',
        boxShadow:   '0 20px 60px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.08)',
        border:      '1px solid rgba(0,0,0,0.04)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── New comment popover (expanding pill) ────────────────────────────────────
interface NewProps {
  anchor: { left: number; top: number };
  overlayRef: React.RefObject<HTMLDivElement>;
  currentUser: User;
  members: BoardMemberLite[];
  onCancel: () => void;
  onSubmit: (text: string) => void | Promise<void>;
}
function NewCommentPopover({ anchor, overlayRef, currentUser, members, onCancel, onSubmit }: NewProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 380, h: 56 });

  useEffect(() => { taRef.current?.focus(); }, []);
  useLayoutEffect(() => {
    if (popRef.current) setSize({ w: popRef.current.offsetWidth, h: popRef.current.offsetHeight });
  }, [text, focused]);

  const pos = usePopoverPosition(anchor, overlayRef, size);
  const expanded = focused || text.length > 0;

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    await onSubmit(t);
  };

  // Esc dismisses the empty pending pin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      ref={popRef}
      className="absolute pointer-events-auto"
      style={{ left: pos.left, top: pos.top, width: 380, zIndex: 40 }}
    >
      <LightCard className={expanded ? 'p-3' : 'px-3 py-2'}>
        {expanded ? (
          <CommentComposer
            textareaRef={taRef}
            value={text}
            onChange={setText}
            members={members}
            placeholder="Add a comment…"
            onSubmit={submit}
            onCancel={onCancel}
            onBlur={() => setFocused(false)}
            onFocus={() => setFocused(true)}
          />
        ) : (
          /* Collapsed pill: textarea looks like a single input row with arrow */
          <div className="flex items-center gap-2">
            <textarea
              ref={taRef}
              rows={1}
              value={text}
              onChange={e => setText(e.target.value)}
              onFocus={() => setFocused(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
                else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
              }}
              placeholder="Add a comment"
              className="flex-1 text-sm resize-none outline-none bg-transparent"
              style={{ color: '#1f2024', lineHeight: '20px', maxHeight: 28 }}
            />
            <SendButton enabled={text.trim().length > 0} onClick={submit} />
          </div>
        )}
      </LightCard>
    </div>
  );
}

// ── Existing-thread popover ─────────────────────────────────────────────────
interface ThreadProps {
  comment: Comment;
  replies: Comment[];
  anchor: { left: number; top: number };
  overlayRef: React.RefObject<HTMLDivElement>;
  currentUser: User;
  role: string;
  canComment: boolean;
  members: BoardMemberLite[];
  onClose: () => void;
  onAddReply: (parentId: string, content: string) => Promise<Comment | null>;
  onResolve: (id: string) => Promise<void> | void;
  onDelete:  (id: string) => Promise<void> | void;
}
function ThreadPopover({
  comment, replies, anchor, overlayRef,
  currentUser, role, canComment, members, onClose, onAddReply, onResolve, onDelete,
}: ThreadProps) {
  const [reply, setReply]       = useState('');
  const [replyOpen, setReplyOpen] = useState(false);
  const [menuFor,  setMenuFor]  = useState<string | null>(null);
  const [headerMenu, setHeaderMenu] = useState(false);
  const replyTaRef = useRef<HTMLTextAreaElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 380, h: 240 });

  useLayoutEffect(() => {
    if (popRef.current) setSize({ w: popRef.current.offsetWidth, h: popRef.current.offsetHeight });
  }, [reply, replyOpen, replies.length]);

  const pos = usePopoverPosition(anchor, overlayRef, size);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async () => {
    const t = reply.trim();
    if (!t) return;
    await onAddReply(comment.id, t);
    setReply('');
    setReplyOpen(false);
    setTimeout(() => replyTaRef.current?.focus(), 0);
  };

  const canResolve = !comment.resolved && (comment.user_id === currentUser.id || role === 'owner');
  const canDelete  = comment.user_id === currentUser.id || role === 'owner';

  return (
    <div
      ref={popRef}
      className="absolute pointer-events-auto"
      style={{ left: pos.left, top: pos.top, width: 380, zIndex: 40 }}
    >
      <LightCard>
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: '#ececef' }}>
          <span className="text-[13px] font-semibold" style={{ color: '#1f2024' }}>Comment</span>
          <div className="flex items-center gap-0.5">
            {/* Header overflow menu placeholder — kept for visual parity */}
            <IconBtn title="More" onClick={() => setHeaderMenu(v => !v)}>
              <MoreHorizontal size={15} />
            </IconBtn>
            {canResolve && (
              <IconBtn title={comment.resolved ? 'Resolved' : 'Mark as resolved'} onClick={() => onResolve(comment.id)}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: '50%',
                  border: '1.5px solid #1f2024',
                }}>
                  <Check size={10} strokeWidth={3} />
                </span>
              </IconBtn>
            )}
            <IconBtn title="Close" onClick={onClose}>
              <X size={15} />
            </IconBtn>
          </div>
        </div>

        {/* Resolved chip */}
        {!!comment.resolved && (
          <div className="px-4 pt-3">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md"
              style={{ background: 'rgba(52,211,153,0.12)', color: '#0f9d58' }}>
              <Check size={11} strokeWidth={3} /> Resolved
            </span>
          </div>
        )}

        {/* Root message */}
        <div className="px-4 py-3">
          <MessageRow
            authorName={comment.user_name}
            avatarColor={comment.avatar_color}
            createdAt={comment.created_at}
            content={comment.content}
            showMenu={canDelete}
            menuOpen={menuFor === comment.id}
            onToggleMenu={() => setMenuFor(menuFor === comment.id ? null : comment.id)}
            onDelete={() => { onDelete(comment.id); onClose(); }}
          />

          {/* Replies */}
          {replies.length > 0 && (
            <div className="mt-3 space-y-3">
              {replies.map(r => (
                <MessageRow
                  key={r.id}
                  authorName={r.user_name}
                  avatarColor={r.avatar_color}
                  createdAt={r.created_at}
                  content={r.content}
                  showMenu={r.user_id === currentUser.id || role === 'owner'}
                  menuOpen={menuFor === r.id}
                  onToggleMenu={() => setMenuFor(menuFor === r.id ? null : r.id)}
                  onDelete={() => onDelete(r.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Reply input — compact pill that expands on focus */}
        {!comment.resolved && canComment && (
          <div className="px-4 pb-3">
            {replyOpen ? (
              <CommentComposer
                textareaRef={replyTaRef}
                value={reply}
                onChange={setReply}
                members={members}
                placeholder="Reply"
                onSubmit={send}
                onCancel={() => { setReplyOpen(false); setReply(''); }}
                compact
              />
            ) : (
              <div className="flex items-center gap-2 rounded-full px-3 py-1.5"
                style={{ background: '#f3f4f6' }}>
                <Avatar name={currentUser.name} color={currentUser.avatar_color} size="xs" />
                <button
                  onClick={() => { setReplyOpen(true); setTimeout(() => replyTaRef.current?.focus(), 30); }}
                  className="flex-1 text-left text-sm bg-transparent outline-none"
                  style={{ color: '#9ca3af' }}
                >
                  Reply
                </button>
                <SendButton enabled={false} onClick={() => { /* unused; expands first */ }} small />
              </div>
            )}
          </div>
        )}
      </LightCard>
    </div>
  );
}

// ── Single message row (author + name + time + … menu + body) ───────────────
interface MessageRowProps {
  authorName: string;
  avatarColor: string;
  createdAt: string;
  content: string;
  showMenu: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onDelete: () => void;
}
function MessageRow({ authorName, avatarColor, createdAt, content, showMenu, menuOpen, onToggleMenu, onDelete }: MessageRowProps) {
  return (
    <div className="flex gap-2.5">
      <Avatar name={authorName} color={avatarColor} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold" style={{ color: '#1f2024' }}>{authorName}</span>
          <span className="text-[12px]" style={{ color: '#9ca3af' }}>{timeAgo(createdAt)}</span>
          {showMenu && (
            <div className="ml-auto relative">
              <IconBtn title="More" onClick={onToggleMenu}>
                <MoreHorizontal size={14} />
              </IconBtn>
              {menuOpen && (
                <div className="absolute right-0 top-7 rounded-md py-1 z-50"
                  style={{ background: '#fff', boxShadow: '0 10px 28px rgba(0,0,0,0.18)', border: '1px solid #ececef', minWidth: 140 }}>
                  <button onClick={onDelete}
                    className="w-full text-left text-[12.5px] px-3 py-1.5 hover:bg-gray-50"
                    style={{ color: '#dc2626' }}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-[13.5px] leading-snug mt-1 break-words" style={{ color: '#1f2024' }}>
          {renderWithMentions(content)}
        </p>
      </div>
    </div>
  );
}

// ── Avatar (light theme) ────────────────────────────────────────────────────
function Avatar({ name, color, size = 'sm' }: { name: string; color: string; size?: 'sm'|'xs' }) {
  const dim = size === 'xs' ? 22 : 28;
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{
        width: dim, height: dim,
        backgroundColor: color,
        fontSize: size === 'xs' ? 10 : 12,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="rounded-full p-1.5 transition-colors"
      style={{ color: '#3a3b3f' }}
      onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  );
}

// ── Send button (blue circle with up-arrow) ─────────────────────────────────
function SendButton({ enabled, onClick, small }: { enabled: boolean; onClick: () => void; small?: boolean }) {
  const dim = small ? 26 : 30;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      aria-label="Send"
      className="rounded-full flex items-center justify-center transition-colors disabled:cursor-not-allowed"
      style={{
        width: dim, height: dim,
        background: enabled ? '#2680eb' : '#d6d8dc',
        color: '#fff',
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (enabled) e.currentTarget.style.background = '#1f6bd8'; }}
      onMouseLeave={e => { if (enabled) e.currentTarget.style.background = '#2680eb'; }}
    >
      <ArrowUp size={small ? 13 : 15} strokeWidth={2.5} />
    </button>
  );
}

// ── Comment composer (textarea + emoji/@/image toolbar + send) ──────────────
interface ComposerProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (v: string) => void;
  members: BoardMemberLite[];
  placeholder: string;
  onSubmit: () => void;
  onCancel: () => void;
  onFocus?: () => void;
  onBlur?:  () => void;
  compact?: boolean;
}
function CommentComposer({
  textareaRef, value, onChange, members, placeholder, onSubmit, onCancel, onFocus, onBlur, compact,
}: ComposerProps) {
  const [emojiOpen, setEmojiOpen]   = useState(false);
  const [mention,   setMention]     = useState<{ query: string; index: number } | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const m = before.match(/(?:^|\s)@([\w-]{0,40})$/);
    if (m) setMention({ query: m[1].toLowerCase(), index: caret - m[1].length - 1 });
    else setMention(null);
    setSelectedIdx(0);
  }, [value, textareaRef]);

  const candidates = useMemo(() => {
    if (!mention) return [];
    const q = mention.query;
    return members.filter(m => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [members, mention]);

  const insertMention = (name: string) => {
    if (!mention) return;
    const ta = textareaRef.current;
    const before = value.slice(0, mention.index);
    const after  = value.slice((ta?.selectionStart ?? value.length));
    const cleanName = name.replace(/\s+/g, ' ');
    const insert = `@${cleanName} `;
    onChange(before + insert + after);
    requestAnimationFrame(() => {
      ta?.focus();
      const caret = (before + insert).length;
      ta?.setSelectionRange(caret, caret);
    });
    setMention(null);
  };

  const insertEmoji = (emo: string) => {
    const ta = textareaRef.current;
    const caret = ta?.selectionStart ?? value.length;
    onChange(value.slice(0, caret) + emo + value.slice(caret));
    requestAnimationFrame(() => {
      ta?.focus();
      const c = caret + emo.length;
      ta?.setSelectionRange(c, c);
    });
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && candidates.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i+1, candidates.length-1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIdx(i => Math.max(i-1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(candidates[selectedIdx].name); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); }
    else if (e.key === 'Escape')          { e.preventDefault(); onCancel(); }
  };

  const triggerMention = () => {
    const ta = textareaRef.current;
    const caret = ta?.selectionStart ?? value.length;
    const needsSpace = caret > 0 && !/\s$/.test(value.slice(0, caret));
    const insert = (needsSpace ? ' ' : '') + '@';
    onChange(value.slice(0, caret) + insert + value.slice(caret));
    requestAnimationFrame(() => {
      ta?.focus();
      const c = caret + insert.length;
      ta?.setSelectionRange(c, c);
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKey}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={compact ? 2 : 2}
        className="w-full text-sm resize-none outline-none bg-transparent"
        style={{ color: '#1f2024', minHeight: compact ? 48 : 56 }}
      />

      {/* Divider + toolbar */}
      <div className="flex items-center mt-1 pt-2" style={{ borderTop: '1px solid #ececef' }}>
        <div className="flex items-center gap-1">
          <IconBtn title="Emoji" onClick={() => setEmojiOpen(v => !v)}>
            <Smile size={16} />
          </IconBtn>
          <IconBtn title="Mention" onClick={triggerMention}>
            <AtSign size={16} />
          </IconBtn>
          <IconBtn title="Attach (coming soon)" onClick={() => { /* placeholder for parity */ }}>
            <ImageIcon size={16} />
          </IconBtn>
        </div>
        <div className="ml-auto">
          <SendButton enabled={value.trim().length > 0} onClick={onSubmit} />
        </div>
      </div>

      {/* Mention dropdown */}
      {mention && candidates.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-1 rounded-md overflow-hidden"
          style={{ background: '#fff', border: '1px solid #ececef', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 60 }}
        >
          {candidates.map((m, i) => (
            <button
              key={m.id}
              onMouseDown={(e) => { e.preventDefault(); insertMention(m.name); }}
              onMouseEnter={() => setSelectedIdx(i)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px]"
              style={{ background: i === selectedIdx ? '#f3f4f6' : 'transparent', color: '#1f2024' }}
            >
              <Avatar name={m.name} color={m.avatar_color} size="xs" />
              <span className="truncate">{m.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Emoji picker */}
      {emojiOpen && (
        <div
          className="absolute left-0 top-full mt-1 rounded-md p-2"
          style={{ background: '#fff', border: '1px solid #ececef', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 280, zIndex: 60 }}
        >
          {EMOJI_GROUPS.map(g => (
            <div key={g.label} className="mb-1.5 last:mb-0">
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#9ca3af' }}>{g.label}</div>
              <div className="grid grid-cols-9 gap-0.5">
                {g.emojis.map(e => (
                  <button key={e} type="button"
                    onMouseDown={(ev) => { ev.preventDefault(); insertEmoji(e); }}
                    className="text-base p-1 rounded hover:bg-gray-100">
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
