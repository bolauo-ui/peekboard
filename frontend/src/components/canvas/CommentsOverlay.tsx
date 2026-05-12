import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fabric } from 'fabric';
import { Send, Smile, CheckCircle, Trash2, X } from 'lucide-react';
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

  onAddComment: (x: number, y: number, content: string) => Promise<Comment | null>;
  onAddReply:   (parentId: string, content: string) => Promise<Comment | null>;
  onResolve:    (id: string) => Promise<void> | void;
  onDelete:     (id: string) => Promise<void> | void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'now'; if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h/24)}d`;
}

// Highlight @mentions inside the rendered text. Matches "@Name" or "@First Last".
function renderWithMentions(text: string) {
  const parts = text.split(/(@[A-Za-z][\w'-]*(?:\s[A-Z][\w'-]*)?)/g);
  return parts.map((p, i) =>
    p.startsWith('@')
      ? <span key={i} className="font-semibold" style={{ color: 'var(--accent)' }}>{p}</span>
      : <span key={i}>{p}</span>
  );
}

// Common emojis grouped for the lightweight picker. Keeping this static avoids
// pulling in emoji-mart (~800 KB) for the basic feature set the brief asks for.
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Smileys', emojis: ['😀','😄','😁','😊','😍','😂','🤣','😘','😎','🤩','🥳','🙂','🤔','😐','😴','😅','😆','😉'] },
  { label: 'Reactions', emojis: ['👍','👎','👏','🙌','🙏','💪','✌️','👌','✋','🤝','👀','💯','🔥','✨','⭐','💥','🎉','❤️'] },
  { label: 'Symbols', emojis: ['✅','❌','⚠️','❗','❓','💡','📌','📍','🚀','⏰','📝','💬','🗒️','📎','🔗','🎯','🏁','📊'] },
];

// ── Component ────────────────────────────────────────────────────────────────
export default function CommentsOverlay({
  currentUser, role, canvas, activeTool, onToolChange,
  comments, replies, members, showResolved,
  onAddComment, onAddReply, onResolve, onDelete,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const canComment = role === 'owner' || role === 'editor' || role === 'commenter';

  // Force re-render when the canvas pans / zooms so pins move with content.
  // `after:render` fires every Fabric paint (which can be 10+ Hz when GIFs
  // animate), so we cheaply gate it on whether the viewport transform itself
  // actually changed — otherwise nothing about the pin positions has moved
  // and re-rendering the overlay is pure waste.
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
    // Also listen to resize so pins reflow when the editor pane changes width.
    window.addEventListener('resize', bump);
    return () => {
      canvas.off('after:render', handler);
      window.removeEventListener('resize', bump);
    };
  }, [canvas, bump]);

  // ── Pending pin (click in comment mode → drop a placeholder) ───────────────
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [openPinId, setOpenPinId] = useState<string | null>(null);

  useEffect(() => {
    if (!canvas) return;
    if (activeTool !== 'comment') {
      // Switching away from comment tool dismisses any pending pin.
      setPending(null);
      return;
    }
    const onDown = (opt: fabric.IEvent) => {
      const ptr = canvas.getPointer((opt as any).e);
      setPending({ x: Math.round(ptr.x), y: Math.round(ptr.y) });
      setOpenPinId(null);                  // close any open thread
      onToolChange('select');              // one-shot: drop and return to select
    };
    canvas.on('mouse:down', onDown);
    return () => { canvas.off('mouse:down', onDown); };
  }, [canvas, activeTool, onToolChange]);

  // ── World-to-screen projection ─────────────────────────────────────────────
  // Pins are positioned relative to the canvas wrapper (which itself fills the
  // editor area). We compute the pin's pixel offset within that wrapper using
  // the live viewport transform.
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

  // ── Visible pins, numbered by creation order among unresolved ──────────────
  const numbered = useMemo(() => {
    const order = [...comments].sort((a, b) => a.created_at.localeCompare(b.created_at));
    let n = 0;
    return order.map(c => ({ ...c, pinNumber: c.resolved ? 0 : ++n }));
  }, [comments]);

  const visiblePins = useMemo(
    () => numbered.filter(c => showResolved || !c.resolved),
    [numbered, showResolved]
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
            number={c.pinNumber}
            color={c.avatar_color}
            resolved={!!c.resolved}
            preview={c.content}
            authorName={c.user_name}
            active={isOpen}
            left={pos.left}
            top={pos.top}
            onClick={() => setOpenPinId(prev => prev === c.id ? null : c.id)}
          />
        );
      })}

      {/* Pending pin (no comment yet — popover will save it). */}
      {pendingPos && (
        <PinDot
          number={comments.filter(c => !c.resolved).length + 1}
          color={currentUser.avatar_color}
          resolved={false}
          authorName={currentUser.name}
          active={true}
          left={pendingPos.left}
          top={pendingPos.top}
          onClick={() => { /* no-op */ }}
        />
      )}

      {/* Popover for an existing thread */}
      {openComment && openPinPos && (
        <ThreadPopover
          comment={openComment}
          replies={openThread}
          pinNumber={numbered.find(c => c.id === openComment.id)?.pinNumber ?? 0}
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

      {/* Popover for the pending (not-yet-saved) pin */}
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

// ── Pin dot ──────────────────────────────────────────────────────────────────
interface PinDotProps {
  number: number;
  color: string;
  resolved: boolean;
  preview?: string;
  authorName: string;
  active: boolean;
  left: number;
  top: number;
  onClick: () => void;
}

function PinDot({ number, color, resolved, preview, authorName, active, left, top, onClick }: PinDotProps) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="absolute pointer-events-auto"
      style={{ left, top, transform: 'translate(-50%, -100%)' }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="relative flex items-center justify-center text-[11px] font-bold transition-transform hover:scale-110"
        style={{
          width:        24,
          height:       24,
          borderRadius: '50% 50% 50% 0',
          transform:    'rotate(-45deg)',
          background:   resolved ? 'transparent' : (active ? '#fbbf24' : color),
          color:        resolved ? 'var(--text-muted)' : '#fff',
          border:       resolved ? '2px solid var(--border)' : (active ? '2px solid #fbbf24' : `2px solid ${color}`),
          boxShadow:    active ? '0 0 0 4px rgba(251,191,36,0.25)' : '0 2px 6px rgba(0,0,0,0.3)',
        }}
        aria-label={`Comment ${number} by ${authorName}`}
      >
        <span style={{ transform: 'rotate(45deg)' }}>{number || '✓'}</span>
      </button>

      {/* Hover preview */}
      {hover && preview && !active && (
        <div
          className="absolute text-xs rounded-md px-2 py-1.5 whitespace-nowrap"
          style={{
            left:        '50%',
            top:         -8,
            transform:   'translate(-50%, -100%)',
            background:  'rgba(20,20,24,0.95)',
            border:      '1px solid var(--border)',
            color:       'var(--text-primary)',
            maxWidth:    260,
            overflow:    'hidden',
            textOverflow: 'ellipsis',
            pointerEvents: 'none',
            zIndex:      30,
          }}
        >
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{authorName}</span>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            {preview.slice(0, 60)}{preview.length > 60 ? '…' : ''}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Reusable popover positioning ─────────────────────────────────────────────
function usePopoverPosition(
  anchor: { left: number; top: number },
  overlayRef: React.RefObject<HTMLElement>,
  size: { w: number; h: number },
) {
  // Clamp to overlay bounds so we never spill off screen on small viewports.
  const overlay = overlayRef.current;
  const ow = overlay?.clientWidth  ?? window.innerWidth;
  const oh = overlay?.clientHeight ?? window.innerHeight;
  const margin = 12;

  // Prefer placement to the right of the pin with a slight upward bias.
  let left = anchor.left + 16;
  let top  = anchor.top  - 8;

  // If we'd run off the right, flip to the left of the pin.
  if (left + size.w + margin > ow) left = Math.max(margin, anchor.left - size.w - 16);
  // Vertical clamp.
  if (top + size.h + margin > oh) top = Math.max(margin, oh - size.h - margin);
  if (top < margin) top = margin;

  return { left, top };
}

// ── New comment popover ─────────────────────────────────────────────────────
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
  const taRef = useRef<HTMLTextAreaElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 320, h: 160 });

  useEffect(() => { taRef.current?.focus(); }, []);
  useLayoutEffect(() => {
    if (popRef.current) setSize({ w: popRef.current.offsetWidth, h: popRef.current.offsetHeight });
  }, [text]);

  const pos = usePopoverPosition(anchor, overlayRef, size);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    await onSubmit(t);
  };

  return (
    <div
      ref={popRef}
      className="absolute pointer-events-auto"
      style={{ left: pos.left, top: pos.top, width: 320, zIndex: 40 }}
    >
      <Popover>
        <div className="flex items-center gap-2 mb-2">
          <Avatar name={currentUser.name} color={currentUser.avatar_color} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{currentUser.name}</span>
          <button onClick={onCancel} className="ml-auto" style={{ color: 'var(--text-muted)' }} aria-label="Cancel">
            <X size={13} />
          </button>
        </div>
        <CommentEditor
          textareaRef={taRef}
          value={text}
          onChange={setText}
          members={members}
          placeholder="Add a comment…"
          onSubmit={submit}
          onCancel={onCancel}
        />
      </Popover>
    </div>
  );
}

// ── Existing-thread popover ─────────────────────────────────────────────────
interface ThreadProps {
  comment: Comment;
  replies: Comment[];
  pinNumber: number;
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
  comment, replies, pinNumber, anchor, overlayRef,
  currentUser, role, canComment, members, onClose, onAddReply, onResolve, onDelete,
}: ThreadProps) {
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 340, h: 240 });

  useLayoutEffect(() => {
    if (popRef.current) setSize({ w: popRef.current.offsetWidth, h: popRef.current.offsetHeight });
  }, [text, replies.length]);

  const pos = usePopoverPosition(anchor, overlayRef, size);

  // Close on Escape anywhere within the popover.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    await onAddReply(comment.id, t);
    setText('');
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const isMine = comment.user_id === currentUser.id;
  return (
    <div
      ref={popRef}
      className="absolute pointer-events-auto"
      style={{ left: pos.left, top: pos.top, width: 340, zIndex: 40 }}
    >
      <Popover>
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>#{pinNumber || '✓'}</span>
          <Avatar name={comment.user_name} color={comment.avatar_color} />
          <div className="min-w-0">
            <div className="text-xs font-semibold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{comment.user_name}</div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{timeAgo(comment.created_at)}</div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {!comment.resolved && (isMine || role === 'owner') && (
              <>
                <button onClick={() => onResolve(comment.id)}
                  title="Resolve"
                  className="p-1 rounded hover:bg-white/5 transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#34d399')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                  <CheckCircle size={13} />
                </button>
                <button onClick={() => { onDelete(comment.id); onClose(); }}
                  title="Delete"
                  className="p-1 rounded hover:bg-white/5 transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                  <Trash2 size={13} />
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1 rounded hover:bg-white/5" style={{ color: 'var(--text-muted)' }} aria-label="Close">
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Resolved badge */}
        {!!comment.resolved && (
          <div className="text-[10px] font-medium flex items-center gap-1 mb-2 px-2 py-1 rounded"
            style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>
            <CheckCircle size={10} /> Resolved
          </div>
        )}

        {/* Body */}
        <p className="text-xs leading-relaxed break-words mb-2" style={{ color: 'var(--text-secondary)' }}>
          {renderWithMentions(comment.content)}
        </p>

        {/* Replies */}
        {replies.length > 0 && (
          <ul className="space-y-2 max-h-56 overflow-y-auto pr-1 mb-2 pl-2"
            style={{ borderLeft: '2px solid var(--border)' }}>
            {replies.map(r => (
              <li key={r.id} className="flex gap-1.5">
                <Avatar name={r.user_name} color={r.avatar_color} size="xs" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{r.user_name}</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{timeAgo(r.created_at)}</span>
                  </div>
                  <p className="text-xs leading-relaxed break-words" style={{ color: 'var(--text-secondary)' }}>
                    {renderWithMentions(r.content)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Reply input */}
        {!comment.resolved && canComment && (
          <CommentEditor
            textareaRef={taRef}
            value={text}
            onChange={setText}
            members={members}
            placeholder="Reply…"
            onSubmit={send}
            onCancel={onClose}
            compact
          />
        )}
      </Popover>
    </div>
  );
}

// ── Floating panel (white card with arrow) ──────────────────────────────────
function Popover({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-3 shadow-2xl"
      style={{
        background: 'var(--bg-panel, #1a1a1d)',
        border:     '1px solid var(--border)',
        boxShadow:  '0 12px 40px rgba(0,0,0,0.55)',
      }}
    >
      {children}
    </div>
  );
}

// ── Avatar ──────────────────────────────────────────────────────────────────
function Avatar({ name, color, size = 'sm' }: { name: string; color: string; size?: 'sm'|'xs' }) {
  const sz = size === 'xs' ? 'w-5 h-5 text-[10px]' : 'w-6 h-6 text-xs';
  return (
    <div className={`${sz} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
      style={{ backgroundColor: color }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Comment editor: textarea + @mentions + emoji ────────────────────────────
interface EditorProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (v: string) => void;
  members: BoardMemberLite[];
  placeholder: string;
  onSubmit: () => void;
  onCancel: () => void;
  compact?: boolean;
}
function CommentEditor({ textareaRef, value, onChange, members, placeholder, onSubmit, onCancel, compact }: EditorProps) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mention, setMention]     = useState<{ query: string; index: number } | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Detect "@xxx" being typed and surface a mention dropdown.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? value.length;
    // Look back for the last @ in the current "word" (no whitespace between).
    const before = value.slice(0, caret);
    const m = before.match(/(?:^|\s)@([\w-]{0,40})$/);
    if (m) setMention({ query: m[1].toLowerCase(), index: caret - m[1].length - 1 });
    else setMention(null);
    setSelectedIdx(0);
  }, [value, textareaRef]);

  const candidates = useMemo(() => {
    if (!mention) return [];
    const q = mention.query;
    return members
      .filter(m => m.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [members, mention]);

  const insertMention = (name: string) => {
    if (!mention) return;
    const ta = textareaRef.current;
    const before = value.slice(0, mention.index);
    const after  = value.slice((ta?.selectionStart ?? value.length));
    const cleanName = name.replace(/\s+/g, ' ');
    const insert = `@${cleanName} `;
    const next   = before + insert + after;
    onChange(next);
    // Move caret to after the inserted mention.
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
    const next = value.slice(0, caret) + emo + value.slice(caret);
    onChange(next);
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder}
        rows={compact ? 2 : 3}
        className="w-full text-xs resize-none rounded-md px-2.5 py-2 outline-none"
        style={{
          background:  'var(--bg-input)',
          border:      '1px solid var(--border)',
          color:       'var(--text-primary)',
          minHeight:   compact ? 56 : 72,
        }}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-1 mt-2">
        <button
          type="button"
          onClick={() => setEmojiOpen(v => !v)}
          title="Emoji"
          className="p-1.5 rounded transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <Smile size={14} />
        </button>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          @ to mention · Enter to send
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.trim()}
          className="ml-auto flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-semibold text-white disabled:opacity-40 transition-colors"
          style={{ background: 'var(--accent)' }}
          onMouseEnter={e => { if (value.trim()) e.currentTarget.style.background = 'var(--accent-hover)'; }}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}
        >
          <Send size={11} /> Send
        </button>
      </div>

      {/* Mention dropdown */}
      {mention && candidates.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-1 rounded-md overflow-hidden"
          style={{
            background: 'var(--bg-panel)',
            border:     '1px solid var(--border)',
            boxShadow:  '0 6px 24px rgba(0,0,0,0.4)',
            zIndex:     60,
          }}
        >
          {candidates.map((m, i) => (
            <button
              key={m.id}
              onMouseDown={(e) => { e.preventDefault(); insertMention(m.name); }}
              onMouseEnter={() => setSelectedIdx(i)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs"
              style={{
                background: i === selectedIdx ? 'var(--bg-hover)' : 'transparent',
                color:      'var(--text-primary)',
              }}
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
          style={{
            background: 'var(--bg-panel)',
            border:     '1px solid var(--border)',
            boxShadow:  '0 6px 24px rgba(0,0,0,0.4)',
            width:      260,
            zIndex:     60,
          }}
        >
          {EMOJI_GROUPS.map(g => (
            <div key={g.label} className="mb-1.5 last:mb-0">
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{g.label}</div>
              <div className="grid grid-cols-9 gap-0.5">
                {g.emojis.map(e => (
                  <button
                    key={e}
                    type="button"
                    onMouseDown={(ev) => { ev.preventDefault(); insertEmoji(e); }}
                    className="text-base p-1 rounded hover:bg-white/5"
                  >
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
