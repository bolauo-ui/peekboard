import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, LogOut, Clock, Users, Trash2, MoreVertical, Copy } from 'lucide-react';
import { boardsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { Board } from '@/types';

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

function Avatar({ name, color, size = 'sm' }: { name: string; color: string; size?: 'sm'|'md' }) {
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-8 h-8 text-sm';
  return (
    <div className={`${sz} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
      style={{ backgroundColor: color }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

const ROLE_PILL: Record<string, { bg: string; text: string }> = {
  owner:     { bg: 'rgba(123,104,238,0.12)', text: '#a89cf7' },
  editor:    { bg: 'rgba(52,211,153,0.12)',  text: '#34d399' },
  commenter: { bg: 'rgba(251,191,36,0.12)',  text: '#fbbf24' },
  viewer:    { bg: 'rgba(255,255,255,0.07)', text: '#888' },
};

export default function Dashboard() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const [boards,       setBoards]       = useState<Board[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [creating,     setCreating]     = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [showModal,    setShowModal]    = useState(false);
  const [activeMenu,   setActiveMenu]   = useState<string|null>(null);

  useEffect(() => {
    boardsApi.list().then(({ boards }) => setBoards(boards)).finally(() => setLoading(false));
  }, []);

  const createBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;
    setCreating(true);
    try {
      const { board } = await boardsApi.create({ name: newBoardName.trim() });
      navigate(`/board/${board.id}`);
    } finally { setCreating(false); }
  };

  const deleteBoard = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this board? This cannot be undone.')) return;
    await boardsApi.delete(id);
    setBoards(p => p.filter(b => b.id !== id));
    setActiveMenu(null);
  };

  // Duplicate clones the canvas (objects + media) into a brand-new board you
  // own. Works on both your boards and ones shared with you (the copy lands
  // in "Your boards" since you become the owner of the duplicate).
  const duplicateBoard = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenu(null);
    try {
      const { board } = await boardsApi.duplicate(id);
      setBoards(p => [{ ...board, owner_name: user?.name ?? '', role: 'owner' as const }, ...p]);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Duplicate failed');
    }
  };

  const ownedBoards  = boards.filter(b => b.role === 'owner');
  const sharedBoards = boards.filter(b => b.role !== 'owner');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-base font-bold text-gray-900">Peekboard</span>
        </div>
        <div className="flex items-center gap-3">
          <Avatar name={user?.name || '?'} color={user?.avatar_color || '#7b68ee'} />
          <span className="text-sm font-medium text-gray-700 hidden sm:block">{user?.name}</span>
          <button onClick={() => { clearAuth(); navigate('/login'); }}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors">
            <LogOut size={14} /><span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-bold text-gray-900">My Boards</h2>
            <p className="text-sm text-gray-400 mt-0.5">Upload motion assets and add text overlays</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg text-white transition-colors"
            style={{ background: 'var(--accent)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}>
            <Plus size={15} /> New board
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-200 h-44 animate-pulse" />)}
          </div>
        ) : ownedBoards.length === 0 && sharedBoards.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 text-base mb-1">No boards yet</h3>
            <p className="text-sm text-gray-400 mb-6">Create your first board to start reviewing motion assets.</p>
            <button onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-lg text-white"
              style={{ background: 'var(--accent)' }}>
              <Plus size={15} /> Create board
            </button>
          </div>
        ) : (
          <>
            {ownedBoards.length > 0 && (
              <BoardGrid title="Your boards" boards={ownedBoards} onOpen={id => navigate(`/board/${id}`)}
                onDelete={deleteBoard} onDuplicate={duplicateBoard}
                activeMenu={activeMenu} onMenuToggle={setActiveMenu} showDelete />
            )}
            {sharedBoards.length > 0 && (
              <BoardGrid title="Shared with you" boards={sharedBoards} onOpen={id => navigate(`/board/${id}`)}
                onDelete={deleteBoard} onDuplicate={duplicateBoard}
                activeMenu={activeMenu} onMenuToggle={setActiveMenu} showDelete={false} />
            )}
          </>
        )}
      </main>

      {/* New board modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 text-base mb-4">New board</h3>
            <form onSubmit={createBoard} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Board name</label>
                <input type="text" value={newBoardName} onChange={e => setNewBoardName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': 'var(--accent)' } as any}
                  placeholder="e.g. Summer Campaign" autoFocus required />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={creating}
                  className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors"
                  style={{ background: 'var(--accent)' }}>
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface BoardGridProps {
  title: string; boards: Board[];
  onOpen: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onDuplicate: (id: string, e: React.MouseEvent) => void;
  activeMenu: string|null; onMenuToggle: (id: string|null) => void; showDelete: boolean;
}

function BoardGrid({ title, boards, onOpen, onDelete, onDuplicate, activeMenu, onMenuToggle, showDelete }: BoardGridProps) {
  return (
    <section className="mb-10">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {boards.map(board => (
          <div key={board.id} onClick={() => onOpen(board.id)}
            className="bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer group overflow-hidden">
            {/* Thumbnail */}
            <div className="h-28 flex items-center justify-center relative" style={{ background: '#f5f5f5' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(123,104,238,0.08)' }}>
                <svg className="w-5 h-5" style={{ color: 'var(--accent)', opacity: 0.5 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="absolute top-2 right-2">
                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{ background: ROLE_PILL[board.role]?.bg, color: ROLE_PILL[board.role]?.text }}>
                  {board.role}
                </span>
              </div>
            </div>
            {/* Info */}
            <div className="px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{board.name}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <Clock size={10} />{timeAgo(board.updated_at)}
                    {board.role !== 'owner' && <span className="flex items-center gap-0.5 ml-1"><Users size={10} />{board.owner_name}</span>}
                  </p>
                </div>
                <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={e => { e.stopPropagation(); onMenuToggle(activeMenu===board.id ? null : board.id); }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreVertical size={13} />
                  </button>
                  {activeMenu === board.id && (
                    <div className="absolute right-0 top-6 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-36">
                      <button onClick={e => onDuplicate(board.id, e)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100">
                        <Copy size={12} /> Duplicate
                      </button>
                      {showDelete && (
                        <button onClick={e => onDelete(board.id, e)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50">
                          <Trash2 size={12} /> Delete board
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
