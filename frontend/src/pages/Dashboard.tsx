import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, LogOut, Clock, Users, Trash2, MoreVertical, Copy, Settings as SettingsIcon,
  Sparkles, Search, Star, Command, AlertCircle, Folder, FolderPlus, FolderOpen,
  Home, MoveRight,
} from 'lucide-react';
import { authApi, boardsApi, projectsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { Board, Project } from '@/types';
import CommandPalette from '@/components/CommandPalette';
import ShortcutsOverlay from '@/components/ShortcutsOverlay';
import UseCaseModal from '@/components/UseCaseModal';
import AvatarImage from '@/components/AvatarImage';
import NotificationsBell from '@/components/NotificationsBell';

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

const ROLE_PILL: Record<string, { bg: string; text: string }> = {
  owner:     { bg: 'rgba(123,104,238,0.12)', text: '#a89cf7' },
  editor:    { bg: 'rgba(52,211,153,0.12)',  text: '#34d399' },
  commenter: { bg: 'rgba(251,191,36,0.12)',  text: '#fbbf24' },
  viewer:    { bg: 'rgba(255,255,255,0.07)', text: '#888' },
};

export default function Dashboard() {
  const { user, clearAuth, token, setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [boards,       setBoards]       = useState<Board[]>([]);
  const [projects,     setProjects]     = useState<Project[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [creating,     setCreating]     = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [showModal,    setShowModal]    = useState(false);
  const [activeMenu,   setActiveMenu]   = useState<string|null>(null);
  const [search,       setSearch]       = useState('');
  const [paletteOpen,  setPaletteOpen]  = useState(false);
  const [shortcutsOpen,setShortcutsOpen]= useState(false);
  const [verifyState,  setVerifyState]  = useState<'idle'|'sent'>('idle');

  // null = "All boards", else a specific project id.
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [newProjectMode, setNewProjectMode] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  // Show the use-case modal exactly once per browser, only if it isn't
  // already saved. Dismissals are remembered in localStorage so we don't
  // re-prompt forever — they can revisit via Settings.
  const [showUseCase, setShowUseCase] = useState(false);
  useEffect(() => {
    if (!user) return;
    if (user.use_case) return;
    if (localStorage.getItem('mb_use_case_dismissed') === '1') return;
    setShowUseCase(true);
  }, [user]);

  useEffect(() => {
    Promise.all([
      boardsApi.list(),
      projectsApi.list(),
    ])
    .then(([b, p]) => { setBoards(b.boards); setProjects(p.projects); })
    .finally(() => setLoading(false));
  }, []);

  // Dashboard-level keyboard shortcuts: ⌘K opens the command palette, ?
  // opens the shortcuts sheet (skipped while typing in inputs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
      if (!inField && e.key === '?')             { e.preventDefault(); setShortcutsOpen(true); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setPaletteOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Toggle starred on a board (optimistic, with rollback on error).
  const toggleStar = async (b: Board, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !b.starred;
    setBoards(p => p.map(x => x.id === b.id ? { ...x, starred: next } : x));
    try {
      if (next) await boardsApi.star(b.id);
      else      await boardsApi.unstar(b.id);
    } catch {
      setBoards(p => p.map(x => x.id === b.id ? { ...x, starred: !next } : x));
    }
  };

  const resendVerify = async () => {
    try { await authApi.resendVerifyEmail(); setVerifyState('sent'); }
    catch { /* swallow */ }
  };

  // ── Use-case capture ─────────────────────────────────────────────────────
  type UseCase = NonNullable<NonNullable<typeof user>['use_case']>;
  const saveUseCase = async (key: UseCase) => {
    if (!user || !token) return;
    try {
      const { user: updated } = await authApi.updateMe({ use_case: key });
      setAuth(updated, token);
    } catch { /* fall through */ }
    setShowUseCase(false);
  };
  const skipUseCase = () => {
    localStorage.setItem('mb_use_case_dismissed', '1');
    setShowUseCase(false);
  };

  // ── Projects (folders) ───────────────────────────────────────────────────
  const createProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    const { project } = await projectsApi.create({ name });
    setProjects(p => [...p, project]);
    setNewProjectName('');
    setNewProjectMode(false);
    setActiveProject(project.id);
  };

  const renameProject = async (id: string, name: string) => {
    const t = name.trim(); if (!t) return;
    const { project } = await projectsApi.rename(id, { name: t });
    setProjects(p => p.map(x => x.id === id ? project : x));
  };

  const deleteProject = async (id: string) => {
    if (!confirm('Delete this project? Boards inside move to "All boards".')) return;
    await projectsApi.delete(id);
    setProjects(p => p.filter(x => x.id !== id));
    setBoards(p => p.map(b => b.project_id === id ? { ...b, project_id: null } : b));
    if (activeProject === id) setActiveProject(null);
  };

  const moveBoardToProject = async (boardId: string, project_id: string | null) => {
    await boardsApi.move(boardId, project_id);
    setBoards(p => p.map(b => b.id === boardId ? { ...b, project_id } : b));
    setActiveMenu(null);
  };

  const createBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;
    setCreating(true);
    try {
      const { board } = await boardsApi.create({ name: newBoardName.trim() });
      navigate(`/board/${board.id}`);
    } finally { setCreating(false); }
  };

  // Welcome-panel template creator — same path as normal create, just lets
  // the user pick a sensible starting name in one click.
  const createBoardFromTemplate = async (name: string) => {
    setCreating(true);
    try {
      const { board } = await boardsApi.create({ name });
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

  // Apply the dashboard search + project filter, then split into owned vs.
  // shared and bubble starred boards to the top of each list (Figma-style).
  const visibleBoards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return boards.filter(b => {
      if (activeProject !== null && b.project_id !== activeProject) return false;
      if (!q) return true;
      return b.name.toLowerCase().includes(q) || (b.owner_name ?? '').toLowerCase().includes(q);
    });
  }, [boards, search, activeProject]);

  const starSort = (a: Board, b: Board) =>
    Number(!!b.starred) - Number(!!a.starred) ||
    (b.updated_at).localeCompare(a.updated_at);

  const starredBoards = useMemo(() => visibleBoards.filter(b => b.starred).sort(starSort), [visibleBoards]);
  const ownedBoards   = useMemo(() => visibleBoards.filter(b => b.role === 'owner' && !b.starred).sort(starSort), [visibleBoards]);
  const sharedBoards  = useMemo(() => visibleBoards.filter(b => b.role !== 'owner' && !b.starred).sort(starSort), [visibleBoards]);

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
          <NotificationsBell />
          <AvatarImage name={user?.name || '?'} color={user?.avatar_color || '#7b68ee'} url={user?.avatar_url} size={28} />
          <span className="text-sm font-medium text-gray-700 hidden sm:block">{user?.name}</span>
          <button onClick={() => navigate('/settings')}
            title="Account settings"
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors">
            <SettingsIcon size={14} /><span className="hidden sm:inline">Settings</span>
          </button>
          <button onClick={() => { clearAuth(); navigate('/login'); }}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors">
            <LogOut size={14} /><span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Projects sidebar (folders à la Figma) */}
        <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200 py-4 px-3 hidden md:flex flex-col gap-1">
          <SidebarLink
            active={activeProject === null}
            onClick={() => setActiveProject(null)}
            icon={<Home size={13} />}
            label="All boards"
          />
          <SidebarLink
            active={false}
            onClick={() => navigate('/settings')}
            icon={<SettingsIcon size={13} />}
            label="Settings"
          />

          <div className="mt-4 flex items-center justify-between px-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Projects
            </span>
            <button
              onClick={() => setNewProjectMode(true)}
              title="New project"
              className="rounded p-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            >
              <FolderPlus size={12} />
            </button>
          </div>

          <ul className="flex flex-col gap-0.5 mt-1">
            {projects.map(p => (
              <li key={p.id}>
                <SidebarLink
                  active={activeProject === p.id}
                  onClick={() => setActiveProject(p.id)}
                  icon={
                    <span className="block rounded-sm" style={{ width: 9, height: 9, background: p.color }} />
                  }
                  label={p.name}
                  onDelete={() => deleteProject(p.id)}
                  onRename={(name) => renameProject(p.id, name)}
                />
              </li>
            ))}
            {newProjectMode && (
              <li>
                <input
                  autoFocus
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')  createProject();
                    if (e.key === 'Escape') { setNewProjectMode(false); setNewProjectName(''); }
                  }}
                  onBlur={() => { if (newProjectName.trim()) createProject(); else setNewProjectMode(false); }}
                  placeholder="Project name"
                  className="w-full text-xs px-2 py-1 rounded bg-gray-50 border border-gray-300 outline-none"
                />
              </li>
            )}
          </ul>
        </aside>

      <main className="flex-1 min-w-0 max-w-6xl mx-auto w-full px-6 py-8">
        {/* Profile-completeness nudge — only when there's something worth nudging
            about, dismissed for this browser via localStorage. */}
        {user && !user.avatar_url && localStorage.getItem('mb_nudge_dismissed') !== '1' && (
          <div className="mb-5 rounded-lg px-3 py-2 flex items-center gap-2 text-xs"
            style={{ background: 'rgba(123,104,238,0.06)', border: '1px solid rgba(123,104,238,0.25)', color: '#5b4edc' }}>
            <Sparkles size={13} />
            <span className="flex-1">
              Round out your profile so teammates recognise you — <strong>add a photo</strong> in settings.
            </span>
            <button onClick={() => navigate('/settings')}
              className="font-semibold underline">Open settings</button>
            <button onClick={() => { localStorage.setItem('mb_nudge_dismissed', '1'); window.location.reload(); }}
              className="text-[11px]" style={{ color: '#5b4edc', opacity: 0.6 }}>Dismiss</button>
          </div>
        )}

        {/* Email-verification banner — auto-hides once verified or dismissed. */}
        {user && user.email_verified === false && (
          <div className="mb-5 rounded-lg px-3 py-2 flex items-center gap-2 text-xs"
            style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#92400e' }}>
            <AlertCircle size={13} />
            <span className="flex-1">
              {verifyState === 'sent'
                ? 'Verification email re-sent — check your inbox.'
                : <>Please verify your email — we sent a link to <strong>{user.email}</strong>.</>}
            </span>
            {verifyState !== 'sent' && (
              <button onClick={resendVerify}
                className="font-semibold underline" style={{ color: '#92400e' }}>
                Resend
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mb-6 gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900">My Boards</h2>
            <p className="text-sm text-gray-400 mt-0.5">Upload motion assets and add text overlays</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search boards"
                className="text-sm rounded-md pl-7 pr-2 py-1.5 outline-none w-48 bg-white border border-gray-200 focus:border-gray-300"
              />
            </div>
            <button
              onClick={() => setPaletteOpen(true)}
              title="Quick switcher (⌘K)"
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
            >
              <Command size={12} /> K
            </button>
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
        ) : starredBoards.length === 0 && ownedBoards.length === 0 && sharedBoards.length === 0 ? (
          search.trim() ? (
            <div className="text-center py-16">
              <p className="text-sm text-gray-500">No boards match "{search}".</p>
            </div>
          ) : activeProject !== null ? (
            <div className="text-center py-16">
              <FolderOpen size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-500">This project is empty.</p>
              <p className="text-xs text-gray-400 mt-1">Move a board into it using the ⋮ menu.</p>
            </div>
          ) : (
            <WelcomePanel
              firstName={(user?.name ?? 'there').split(' ')[0]}
              onCreate={(name) => createBoardFromTemplate(name)}
            />
          )
        ) : (
          <>
            {starredBoards.length > 0 && (
              <BoardGrid title="Starred" boards={starredBoards}
                onOpen={id => navigate(`/board/${id}`)}
                onDelete={deleteBoard} onDuplicate={duplicateBoard}
                onToggleStar={toggleStar}
                onMoveToProject={moveBoardToProject}
                projects={projects}
                activeMenu={activeMenu} onMenuToggle={setActiveMenu} showDelete />
            )}
            {ownedBoards.length > 0 && (
              <BoardGrid title="Your boards" boards={ownedBoards}
                onOpen={id => navigate(`/board/${id}`)}
                onDelete={deleteBoard} onDuplicate={duplicateBoard}
                onToggleStar={toggleStar}
                onMoveToProject={moveBoardToProject}
                projects={projects}
                activeMenu={activeMenu} onMenuToggle={setActiveMenu} showDelete />
            )}
            {sharedBoards.length > 0 && (
              <BoardGrid title="Shared with you" boards={sharedBoards}
                onOpen={id => navigate(`/board/${id}`)}
                onDelete={deleteBoard} onDuplicate={duplicateBoard}
                onToggleStar={toggleStar}
                onMoveToProject={moveBoardToProject}
                projects={projects}
                activeMenu={activeMenu} onMenuToggle={setActiveMenu} showDelete={false} />
            )}
          </>
        )}
      </main>
      </div>

      {showUseCase && user && (
        <UseCaseModal user={user} onSave={saveUseCase} onSkip={skipUseCase} />
      )}

      {paletteOpen && (
        <CommandPalette
          boards={boards}
          onClose={() => setPaletteOpen(false)}
          onNewBoard={() => { setPaletteOpen(false); setShowModal(true); }}
        />
      )}
      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}

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

// ── Projects sidebar link ────────────────────────────────────────────────────
// Single row in the dashboard's left rail. Double-click to inline-rename
// (projects only; built-in entries pass `onRename={undefined}` so the
// handler simply no-ops). Trash icon appears on hover for deletable rows.
interface SidebarLinkProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  onRename?: (next: string) => void;
  onDelete?: () => void;
}
function SidebarLink({ active, onClick, icon, label, onRename, onDelete }: SidebarLinkProps) {
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState(label);
  return (
    <div
      onClick={onClick}
      onDoubleClick={(e) => {
        if (!onRename) return;
        e.stopPropagation();
        setValue(label);
        setEditing(true);
      }}
      className="group flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer text-[13px]"
      style={{
        background: active ? 'rgba(123,104,238,0.12)' : 'transparent',
        color:      active ? 'var(--accent)' : '#4b5563',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#f3f4f6'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <span className="flex-shrink-0">{icon}</span>
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => { if (value.trim() && value !== label && onRename) onRename(value.trim()); setEditing(false); }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter')  { if (value.trim() && onRename) onRename(value.trim()); setEditing(false); }
            if (e.key === 'Escape') { setEditing(false); }
          }}
          className="flex-1 text-[13px] bg-white border border-gray-300 rounded px-1 py-0 outline-none"
        />
      ) : (
        <span className="flex-1 truncate">{label}</span>
      )}
      {onDelete && !editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="rounded opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500"
          title="Delete project"
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}

// ── Welcome panel (shown when the user has no boards) ────────────────────────
// Figma-flavoured empty state: friendly greeting, three starter templates,
// and a tiny "what's next" checklist so a brand-new account doesn't land on
// a blank page wondering what to do.
const TEMPLATES = [
  { name: 'Untitled board',  emoji: '✏️',  caption: 'Start from a blank canvas' },
  { name: 'Design review',   emoji: '🎨',  caption: 'Pin comments on shared work' },
  { name: 'Moodboard',       emoji: '🌈',  caption: 'Drop in GIFs + references' },
];

function WelcomePanel({ firstName, onCreate }: { firstName: string; onCreate: (name: string) => void }) {
  return (
    <div className="rounded-2xl p-10 mx-auto max-w-3xl"
      style={{ background: '#ffffff', border: '1px solid #ececef', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={16} style={{ color: 'var(--accent)' }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
          Welcome
        </span>
      </div>
      <h2 className="text-2xl font-bold text-gray-900">Hi {firstName} 👋 — let's get you set up.</h2>
      <p className="text-sm text-gray-500 mt-1.5 max-w-xl">
        Peekboard is a collaborative canvas for motion + design reviews. Pick a template to start with, or open a blank board.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
        {TEMPLATES.map(t => (
          <button
            key={t.name}
            onClick={() => onCreate(t.name)}
            className="text-left rounded-xl p-4 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
            style={{ background: '#fafbfc' }}
          >
            <span className="text-2xl block mb-1.5">{t.emoji}</span>
            <span className="block text-sm font-semibold text-gray-900">{t.name}</span>
            <span className="block text-xs text-gray-500 mt-0.5">{t.caption}</span>
          </button>
        ))}
      </div>

      <ul className="mt-8 space-y-1.5 text-sm text-gray-500">
        <li>① Create a board → drop in GIFs, images, or videos.</li>
        <li>② Click the speech-bubble icon to leave pinned comments.</li>
        <li>③ Hit <em>Share</em> to invite teammates by email.</li>
      </ul>
    </div>
  );
}

interface BoardGridProps {
  title: string; boards: Board[];
  onOpen: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onDuplicate: (id: string, e: React.MouseEvent) => void;
  onToggleStar: (b: Board, e: React.MouseEvent) => void;
  onMoveToProject: (boardId: string, project_id: string | null) => void;
  projects: Project[];
  activeMenu: string|null; onMenuToggle: (id: string|null) => void; showDelete: boolean;
}

function BoardGrid({ title, boards, onOpen, onDelete, onDuplicate, onToggleStar, onMoveToProject, projects, activeMenu, onMenuToggle, showDelete }: BoardGridProps) {
  return (
    <section className="mb-10">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {boards.map(board => (
          <div key={board.id} onClick={() => onOpen(board.id)}
            className="bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer group overflow-hidden">
            {/* Thumbnail — real canvas snapshot if available, else generic icon */}
            <div className="h-28 flex items-center justify-center relative overflow-hidden" style={{ background: '#f5f5f5' }}>
              {board.thumbnail_url ? (
                <img
                  src={board.thumbnail_url}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(123,104,238,0.08)' }}>
                  <svg className="w-5 h-5" style={{ color: 'var(--accent)', opacity: 0.5 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              )}
              {/* Star button — always visible if starred, on hover otherwise */}
              <button
                onClick={(e) => onToggleStar(board, e)}
                title={board.starred ? 'Unstar' : 'Star'}
                className={`absolute top-2 left-2 rounded-full p-1 transition-opacity ${board.starred ? '' : 'opacity-0 group-hover:opacity-100'}`}
                style={{
                  background: 'rgba(255,255,255,0.9)',
                  color:      board.starred ? '#f59e0b' : '#9ca3af',
                }}
              >
                <Star size={13} fill={board.starred ? '#f59e0b' : 'none'} />
              </button>

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
                    <Clock size={10} />{timeAgo(board.last_edited_at ?? board.updated_at)}
                    {board.last_edited_by_name && (
                      <span className="flex items-center gap-1 ml-1">
                        <span className="rounded-full flex items-center justify-center text-white font-bold"
                          style={{
                            width: 14, height: 14, fontSize: 8,
                            background: board.last_edited_by_color || '#888',
                          }}
                        >
                          {board.last_edited_by_name.charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate">{board.last_edited_by_name}</span>
                      </span>
                    )}
                  </p>
                </div>
                <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={e => { e.stopPropagation(); onMenuToggle(activeMenu===board.id ? null : board.id); }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreVertical size={13} />
                  </button>
                  {activeMenu === board.id && (
                    <div className="absolute right-0 top-6 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-44">
                      <button onClick={e => onDuplicate(board.id, e)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100">
                        <Copy size={12} /> Duplicate
                      </button>

                      {/* Move to project */}
                      {showDelete && (
                        <div className="border-t border-gray-100 mt-1 pt-1">
                          <div className="px-3 pt-1 pb-0.5 text-[9px] uppercase tracking-wider text-gray-400">Move to</div>
                          <button
                            onClick={(e) => { e.stopPropagation(); onMoveToProject(board.id, null); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                          >
                            <Home size={12} /> All boards
                          </button>
                          {projects.map(p => (
                            <button
                              key={p.id}
                              onClick={(e) => { e.stopPropagation(); onMoveToProject(board.id, p.id); }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                            >
                              <span className="rounded-sm flex-shrink-0" style={{ width: 9, height: 9, background: p.color }} />
                              <span className="truncate">{p.name}</span>
                              {board.project_id === p.id && <MoveRight size={10} className="ml-auto text-gray-400" />}
                            </button>
                          ))}
                          <div className="border-t border-gray-100 my-1" />
                        </div>
                      )}

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
