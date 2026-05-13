import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AtSign, MessageCircle, Users } from 'lucide-react';
import { notificationsApi, type AppNotification } from '@/lib/api';
import AvatarImage from '@/components/AvatarImage';
import { setFaviconDot } from '@/lib/favicon';

// Header-level notification bell with unread badge + a panel of recent
// items. Polls the API every 30 s while the tab is visible so new mentions
// surface without a page refresh.
export default function NotificationsBell() {
  const [open,    setOpen]    = useState(false);
  const [items,   setItems]   = useState<AppNotification[]>([]);
  const [unread,  setUnread]  = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try {
      const r = await notificationsApi.list();
      setItems(r.notifications);
      setUnread(r.unread);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Keep the browser-tab favicon in sync — red dot when there are unread items.
  useEffect(() => { setFaviconDot(unread); }, [unread]);

  // Close on outside-click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  // When opening, mark everything in the current list as read on the server
  // (badge zeros out; the list itself stays so users can still review).
  const togglePanel = async () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && unread > 0) {
      const ids = items.filter(n => !n.read).map(n => n.id);
      setUnread(0);
      setItems(p => p.map(n => ({ ...n, read: true })));
      try { await notificationsApi.markRead(ids); } catch { /* */ }
    }
  };

  const jumpTo = (n: AppNotification) => {
    setOpen(false);
    if (n.board_id) navigate(`/board/${n.board_id}`);
  };

  const iconFor = (t: AppNotification['type']) =>
    t === 'mention' ? <AtSign size={11} /> :
    t === 'reply'   ? <MessageCircle size={11} /> :
                      <Users size={11} />;

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={togglePanel}
        title="Notifications"
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors relative"
      >
        <Bell size={14} />
        {unread > 0 && (
          <span
            className="absolute top-0.5 right-0.5 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
            style={{
              minWidth: 14, height: 14, padding: '0 4px',
              background: 'var(--danger)',
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-9 rounded-xl overflow-hidden z-50"
          style={{
            background: '#ffffff',
            border:     '1px solid #ececef',
            boxShadow:  '0 18px 48px rgba(0,0,0,0.18)',
            width:      360,
          }}
        >
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid #f1f2f4' }}>
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            <span className="text-[11px] text-gray-400">{items.length === 0 ? '' : `${items.length} recent`}</span>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-gray-400">
                You're all caught up.
              </div>
            ) : items.map(n => (
              <button
                key={n.id}
                onClick={() => jumpTo(n)}
                className="w-full text-left px-4 py-2.5 flex items-start gap-2.5 transition-colors"
                style={{ background: n.read ? 'transparent' : 'rgba(123,104,238,0.06)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
                onMouseLeave={(e) => (e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(123,104,238,0.06)')}
              >
                <AvatarImage
                  name={n.from_name}
                  color={n.from_avatar}
                  url={n.from_avatar_url}
                  size={28}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] leading-tight" style={{ color: '#1f2024' }}>
                    <span className="font-semibold">{n.from_name}</span>{' '}
                    <span className="text-gray-500">
                      {n.type === 'mention' ? 'mentioned you in' : n.type === 'reply' ? 'replied to your comment in' : 'invited you to'}
                    </span>{' '}
                    <span className="font-medium" style={{ color: 'var(--accent)' }}>{n.board_name}</span>
                  </div>
                  {n.text && (
                    <p className="text-[12px] mt-0.5 text-gray-500 truncate" title={n.text}>{n.text}</p>
                  )}
                  <div className="flex items-center gap-1 text-[11px] text-gray-400 mt-1">
                    <span style={{ color: '#9ca3af' }}>{iconFor(n.type)}</span>
                    <span>{timeAgo(n.created_at)}</span>
                  </div>
                </div>
                {!n.read && <span className="block rounded-full mt-1" style={{ width: 7, height: 7, background: 'var(--accent)' }} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}
