import { useEffect, useState } from 'react';
import { History, X, RotateCcw, Loader } from 'lucide-react';
import { boardsApi, type BoardSnapshot } from '@/lib/api';
import AvatarImage from '@/components/AvatarImage';

interface Props {
  boardId:  string;
  canEdit:  boolean;        // owner / editor can actually click Restore
  onClose:  () => void;
  onRestored: () => void;   // parent reloads the canvas after restore
}

// Right-side drawer over the canvas listing time-stamped snapshots that the
// server captured on each save (throttled to once a minute). Selecting a row
// re-loads the board state from that point in time.
export default function VersionHistoryDrawer({ boardId, canEdit, onClose, onRestored }: Props) {
  const [items,   setItems]   = useState<BoardSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    boardsApi.history(boardId)
      .then(r => setItems(r.snapshots))
      .catch(() => setError('Could not load history.'))
      .finally(() => setLoading(false));
  }, [boardId]);

  const restore = async (id: string) => {
    if (!canEdit) return;
    if (!confirm('Restore the board to this version? Your current state will be saved as a snapshot first.')) return;
    setRestoring(id); setError(null);
    try {
      await boardsApi.restore(boardId, id);
      onRestored();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Restore failed.');
    } finally { setRestoring(null); }
  };

  return (
    <aside
      className="flex flex-col flex-shrink-0"
      style={{
        width: 280,
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border)',
        color:      'var(--text-primary)',
      }}
    >
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
        <div className="flex items-center gap-2">
          <History size={13} style={{ color: 'var(--text-muted)' }} />
          <span className="text-sm font-semibold">Version history</span>
        </div>
        <button onClick={onClose} className="rounded-full p-1" style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
          <X size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : error ? (
          <div className="text-center px-4 py-8 text-xs" style={{ color: 'var(--danger)' }}>{error}</div>
        ) : items.length === 0 ? (
          <div className="text-center px-4 py-10 text-xs" style={{ color: 'var(--text-muted)' }}>
            No snapshots yet. Keep editing — we save one every minute or so.
          </div>
        ) : (
          <ul>
            {items.map(s => (
              <li
                key={s.id}
                className="px-4 py-2.5 flex items-center gap-3"
                style={{ borderBottom: '1px solid var(--border-light)' }}
              >
                <AvatarImage name={s.by_name} color={s.by_avatar_color} size={26} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                    {formatTime(s.created_at)}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    by {s.by_name}
                  </div>
                </div>
                {canEdit && (
                  <button
                    onClick={() => restore(s.id)}
                    disabled={restoring === s.id}
                    title="Restore this version"
                    className="rounded p-1 disabled:opacity-50"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                  >
                    {restoring === s.id ? <Loader size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `Today, ${time}`;
    const yest = new Date(today); yest.setDate(today.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return `Yesterday, ${time}`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + `, ${time}`;
  } catch { return iso; }
}
