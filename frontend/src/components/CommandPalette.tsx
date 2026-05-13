import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Settings as SettingsIcon, LogOut, Folder, Star } from 'lucide-react';
import type { Board } from '@/types';
import { useAuthStore } from '@/stores/authStore';

interface Props {
  boards:  Board[];
  onClose: () => void;
  onNewBoard?: () => void;
}

// Figma-style ⌘K command palette. Fuzzy-searches boards by name, plus a
// few global commands. Arrow keys + Enter to pick.
export default function CommandPalette({ boards, onClose, onNewBoard }: Props) {
  const [q,        setQ]        = useState('');
  const [cursor,   setCursor]   = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { clearAuth } = useAuthStore();

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Items: starred boards first, then everything else, then global commands.
  const items = useMemo(() => {
    const ql = q.toLowerCase().trim();
    const filtered = boards
      .filter(b => !ql || b.name.toLowerCase().includes(ql))
      .sort((a, b) => Number(!!b.starred) - Number(!!a.starred) || b.updated_at.localeCompare(a.updated_at));

    const boardItems = filtered.slice(0, 12).map(b => ({
      key:    `board:${b.id}`,
      label:  b.name,
      hint:   b.starred ? 'Starred' : (b.role === 'owner' ? 'Owned' : 'Shared'),
      icon:   b.starred ? <Star size={12} fill="currentColor" /> : <Folder size={12} />,
      run:    () => navigate(`/board/${b.id}`),
    }));

    const commands: typeof boardItems = [];
    if ((!ql || 'new board create'.includes(ql)) && onNewBoard) {
      commands.push({
        key: 'cmd:new', label: 'New board', hint: '',
        icon: <Plus size={12} />,
        run:  () => { onNewBoard(); },
      });
    }
    if (!ql || 'settings'.includes(ql)) {
      commands.push({
        key: 'cmd:settings', label: 'Open settings', hint: '',
        icon: <SettingsIcon size={12} />,
        run:  () => navigate('/settings'),
      });
    }
    if (!ql || 'sign out logout'.includes(ql)) {
      commands.push({
        key: 'cmd:signout', label: 'Sign out', hint: '',
        icon: <LogOut size={12} />,
        run:  () => { clearAuth(); navigate('/login'); },
      });
    }

    return [...boardItems, ...commands];
  }, [q, boards, navigate, clearAuth, onNewBoard]);

  // Keep cursor in bounds whenever the filtered list changes.
  useEffect(() => { setCursor(0); }, [q, items.length]);

  const run = (i: number) => {
    const it = items[i];
    if (!it) return;
    it.run();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[210] flex items-start justify-center pt-24 p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-xl w-full max-w-xl overflow-hidden"
        style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.55)', color: 'var(--text-primary)' }}
      >
        {/* Search row */}
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape')      { e.preventDefault(); onClose(); }
              else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c+1, items.length-1)); }
              else if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c-1, 0)); }
              else if (e.key === 'Enter')     { e.preventDefault(); run(cursor); }
            }}
            placeholder="Search boards or run a command…"
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>esc</span>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="text-center py-6 text-xs" style={{ color: 'var(--text-muted)' }}>
              No matches
            </div>
          ) : items.map((it, i) => (
            <button
              key={it.key}
              onMouseEnter={() => setCursor(i)}
              onClick={() => run(i)}
              className="w-full flex items-center gap-2 px-4 py-2 text-left text-[13px]"
              style={{
                background: i === cursor ? 'var(--bg-hover)' : 'transparent',
                color:      'var(--text-primary)',
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>{it.icon}</span>
              <span className="flex-1 truncate">{it.label}</span>
              {it.hint && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{it.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
