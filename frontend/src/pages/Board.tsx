import { useEffect, useState, useRef, useCallback } from 'react';
import type React from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { fabric } from 'fabric';
import { MessageSquare } from 'lucide-react';
import { boardsApi, uploadApi, commentsApi, sharingApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { Board as BoardType, CanvasData, Tool, Comment } from '@/types';
import CanvasEditor, { type CanvasEditorHandle } from '@/components/canvas/CanvasEditor';
import Toolbar from '@/components/canvas/Toolbar';
import PropertiesPanel from '@/components/canvas/PropertiesPanel';
import LayerPanel from '@/components/LayerPanel';
import ShareModal from '@/components/ShareModal';
import CommentsPanel from '@/components/CommentsPanel';
import CommentsOverlay, { type BoardMemberLite } from '@/components/canvas/CommentsOverlay';
import ZoomControl from '@/components/canvas/ZoomControl';
import ContextMenu from '@/components/canvas/ContextMenu';
import ShortcutsOverlay from '@/components/ShortcutsOverlay';
import VersionHistoryDrawer from '@/components/VersionHistoryDrawer';
import LinkedInScorePanel from '@/components/LinkedInScorePanel';
import { History, Linkedin } from 'lucide-react';
import { setFaviconDot } from '@/lib/favicon';
import CursorEyesOverlay from '@/components/canvas/CursorEyesOverlay';

export default function Board() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();

  const [board, setBoard]       = useState<BoardType | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [activeTool, setActiveTool]   = useState<Tool>('select');
  const [selectedObj, setSelectedObj] = useState<fabric.Object | null>(null);
  const [canvas, setCanvas]           = useState<fabric.Canvas | null>(null);
  const [bgColor, setBgColor]         = useState('#f0f0f0');

  const [showShare,   setShowShare]   = useState(false);
  // Only one right panel open at a time — Figma-style mutual exclusivity.
  const [activePanel, setActivePanel] = useState<'comments' | 'history' | 'linkedin' | null>(null);
  const togglePanel = (p: 'comments' | 'history' | 'linkedin') =>
    setActivePanel(cur => cur === p ? null : p);
  const [showProps,    setShowProps]    = useState(true);
  // Open history automatically when arriving via the dashboard deep-link.
  useEffect(() => {
    if (searchParams.get('history') === '1') setActivePanel('history');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [reloadKey,    setReloadKey]    = useState(0);
  const [showLayers,   setShowLayers]   = useState(true);
  const [layerVersion, setLayerVersion] = useState(0);
  const [saveStatus,   setSaveStatus]   = useState<'saved'|'saving'|'unsaved'>('saved');
  const [zoom,         setZoom]         = useState(1);

  // ── Comments + members (lifted so overlay + sidebar share one source of truth)
  const [comments,        setComments]        = useState<Comment[]>([]);
  const [replies,         setReplies]         = useState<Comment[]>([]);
  const [members,         setMembers]         = useState<BoardMemberLite[]>([]);
  const [showResolved,    setShowResolved]    = useState(false);
  const [openPinId,       setOpenPinId]       = useState<string | null>(null);
  const [ctxMenu,         setCtxMenu]         = useState<{ x: number; y: number; target: fabric.Object } | null>(null);
  const [shortcutsOpen,   setShortcutsOpen]   = useState(false);

  // Eye placement mode — when true, next canvas clicks add eye markers to
  // the selected image instead of selecting objects.
  const [placingEyes, setPlacingEyes] = useState(false);
  const [eyeTick,     setEyeTick]     = useState(0);  // bumped after each eye is placed

  const editorRef  = useRef<CanvasEditorHandle>(null);
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable refs so keyboard handler ([] deps) always sees current values
  const canvasRef    = useRef<fabric.Canvas | null>(null);
  const toolRef      = useRef<Tool>('select');
  const boardRef     = useRef<BoardType | null>(null);

  useEffect(() => { canvasRef.current  = canvas;      }, [canvas]);
  useEffect(() => { toolRef.current    = activeTool;  }, [activeTool]);
  useEffect(() => { boardRef.current   = board;       }, [board]);

  useEffect(() => {
    if (!id) return;
    boardsApi.get(id)
      .then(({ board }) => setBoard(board))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  // Pull comments + members once the board is loaded. The owner is added as
  // a synthetic member so they appear in @mention dropdowns even though the
  // members endpoint only lists shared collaborators.
  useEffect(() => {
    if (!id || !board) return;
    commentsApi.list(id).then(({ comments, replies }) => {
      setComments(comments); setReplies(replies);
    }).catch(() => { /* silent */ });
    sharingApi.getMembers(id).then(({ members, owner }) => {
      const list: BoardMemberLite[] = [
        { id: owner.id, name: owner.name, avatar_color: owner.avatar_color },
        ...members
          .filter(m => m.user_id && m.name)
          .map(m => ({ id: m.user_id!, name: m.name!, avatar_color: m.avatar_color || '#888' })),
      ];
      // Dedupe by id
      const seen = new Set<string>();
      setMembers(list.filter(m => (seen.has(m.id) ? false : (seen.add(m.id), true))));
    }).catch(() => { /* silent */ });
  }, [id, board]);

  // Paint a red dot on the favicon whenever there are unresolved comments on
  // this board, so a backgrounded tab signals "someone needs your eyes."
  useEffect(() => {
    const open = comments.filter(c => !c.resolved).length;
    setFaviconDot(open);
    return () => setFaviconDot(0);
  }, [comments]);

  // ── Comment mutations (shared by overlay + sidebar) ──────────────────────
  const addComment = useCallback(async (x: number, y: number, content: string) => {
    if (!id) return null;
    const { comment } = await commentsApi.create(id, { x, y, content });
    setComments(p => [...p, comment]);
    return comment;
  }, [id]);

  const addReply = useCallback(async (parentId: string, content: string) => {
    if (!id) return null;
    const { comment } = await commentsApi.create(id, { x: 0, y: 0, content, parent_id: parentId });
    setReplies(p => [...p, comment]);
    return comment;
  }, [id]);

  const resolveComment = useCallback(async (commentId: string) => {
    await commentsApi.resolve(commentId);
    setComments(p => p.map(c => c.id === commentId ? { ...c, resolved: 1 } : c));
  }, []);

  // ── Right-click context menu on canvas objects ───────────────────────────
  // Fabric routes events through its own upper canvas, so attach the native
  // `contextmenu` listener there. Hits return the topmost object under the
  // pointer; misses fall through so the browser's default menu can still
  // appear over the empty background if needed.
  useEffect(() => {
    if (!canvas) return;
    const el = (canvas as any).upperCanvasEl as HTMLCanvasElement | undefined;
    if (!el) return;
    const onCtx = (e: MouseEvent) => {
      const target = canvas.findTarget(e as any, false);
      if (!target) return;
      e.preventDefault();
      canvas.setActiveObject(target);
      canvas.renderAll();
      setCtxMenu({ x: e.clientX, y: e.clientY, target });
    };
    el.addEventListener('contextmenu', onCtx);
    return () => el.removeEventListener('contextmenu', onCtx);
  }, [canvas]);

  const deleteComment = useCallback(async (commentId: string) => {
    await commentsApi.delete(commentId);
    setComments(p => p.filter(c => c.id !== commentId));
    setReplies(p => p.filter(r => r.parent_id !== commentId && r.id !== commentId));
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const prevTool  = { current: 'select' as Tool };
    const spaceHeld = { current: false };

    const onKeyDown = (e: KeyboardEvent) => {
      // Never steal keypresses from inputs / text editing
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Ignore when a contenteditable element has focus (e.g. Fabric IText hidden div)
      if ((e.target as HTMLElement)?.isContentEditable) return;

      const meta = e.metaKey || e.ctrlKey;

      // ── Space → temporary hand tool ──────────────────────────────────────
      if (e.code === 'Space' && !spaceHeld.current && !meta) {
        e.preventDefault();
        spaceHeld.current = true;
        prevTool.current  = toolRef.current;
        setActiveTool('hand');
        return;
      }

      // ── Tool shortcuts (no modifier) ─────────────────────────────────────
      if (!meta && !e.shiftKey) {
        const b = boardRef.current;
        const canEdit = b?.role === 'owner' || b?.role === 'editor';
        const map: Record<string, Tool> = { v: 'select', h: 'hand' };
        if (canEdit) { map['t'] = 'text'; map['f'] = 'frame'; }
        if (canEdit || b?.role === 'commenter') map['c'] = 'comment';

        if (map[e.key]) { setActiveTool(map[e.key]); return; }
        if (e.key === 'Escape') { setActiveTool('select'); return; }
      }

      // ── Delete / Backspace ───────────────────────────────────────────────
      if ((e.key === 'Delete' || e.key === 'Backspace') && !meta) {
        const c   = canvasRef.current;
        const obj = c?.getActiveObject();
        if (obj && c) { c.remove(obj); c.renderAll(); }
        return;
      }

      // ── Save (Cmd/Ctrl + S) ──────────────────────────────────────────────
      // Browsers default Cmd+S to "Save Page As… .html" which dumps the
      // current document to the user's desktop. We intercept it and route
      // it to our own server-side save instead.
      if (meta && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        editorRef.current?.flushSave();
        return;
      }

      // ── ? opens the keyboard-shortcut overlay ─────────────────────────────
      if (!meta && e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      // ── Shift+A toggles auto-layout on the selected frame ───────────────
      if (!meta && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        const c = canvasRef.current;
        const obj = c?.getActiveObject() as any;
        const isFrame = obj?.data?.objectType === 'frame' || obj?.data?.type === 'frame';
        if (c && isFrame) {
          e.preventDefault();
          // Lazy-load engine to avoid pulling it into the Board page bundle
          // chunk when the user never touches a frame.
          import('@/components/canvas/autoLayout').then(({ DEFAULT_AUTO_LAYOUT, setAutoLayout, applyAutoLayout, unlockChildren, getAutoLayout }) => {
            const isOn = getAutoLayout(obj);
            if (isOn) { setAutoLayout(obj, null); unlockChildren(c, obj); }
            else      { setAutoLayout(obj, DEFAULT_AUTO_LAYOUT); applyAutoLayout(c, obj); }
            c.fire('object:modified', { target: obj });
            c.requestRenderAll();
          });
        }
        return;
      }

      // ── Z-order shortcuts (Figma parity) ─────────────────────────────────
      // [  → send backward · Shift+[ → send to back
      // ]  → bring forward · Shift+] → bring to front
      if (!meta && (e.key === '[' || e.key === ']' || e.key === '{' || e.key === '}')) {
        const c = canvasRef.current;
        const obj = c?.getActiveObject();
        if (obj && c) {
          e.preventDefault();
          if (e.key === '{')      c.sendToBack(obj);
          else if (e.key === '[') c.sendBackwards(obj);
          else if (e.key === '}') c.bringToFront(obj);
          else if (e.key === ']') c.bringForward(obj);
          c.renderAll();
        }
        return;
      }

      // ── Undo / Redo ──────────────────────────────────────────────────────
      if (meta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); editorRef.current?.undo(); return;
      }
      if (meta && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault(); editorRef.current?.redo(); return;
      }

      // ── Copy ─────────────────────────────────────────────────────────────
      if (meta && e.key === 'c') {
        editorRef.current?.copy(); return;
      }

      // ── Paste — let the native paste event drive CanvasEditor ────────────
      // (image/SVG from clipboard OR internal fabric clipboard)
      // We intentionally skip meta+v here so CanvasEditor's paste handler
      // handles it exclusively, avoiding double-paste.

      // ── Zoom shortcuts ───────────────────────────────────────────────────
      // Cmd/Ctrl + '+' or '=' → zoom in
      if (meta && (e.key === '+' || e.key === '=')) {
        e.preventDefault(); editorRef.current?.zoomIn(); return;
      }
      // Cmd/Ctrl + '-' → zoom out
      if (meta && (e.key === '-' || e.key === '_')) {
        e.preventDefault(); editorRef.current?.zoomOut(); return;
      }
      // Cmd/Ctrl + '0' → 100%
      if (meta && e.key === '0') {
        e.preventDefault(); editorRef.current?.zoomTo(1); return;
      }
      // Shift + '1' → zoom to fit
      if (!meta && e.shiftKey && e.key === '!') {
        e.preventDefault(); editorRef.current?.zoomToFit(); return;
      }

      // ── Duplicate (Cmd+D) ────────────────────────────────────────────────
      if (meta && e.key === 'd') {
        e.preventDefault();
        const c   = canvasRef.current;
        const obj = c?.getActiveObject();
        if (obj && c) {
          obj.clone((cl: fabric.Object) => {
            cl.set({ left: (cl.left ?? 0) + 20, top: (cl.top ?? 0) + 20 });
            c.add(cl); c.setActiveObject(cl); c.renderAll();
          });
        }
        return;
      }

      // ── Select all (Cmd+A) ───────────────────────────────────────────────
      if (meta && e.key === 'a') {
        e.preventDefault();
        const c = canvasRef.current;
        if (c) {
          const objs = c.getObjects().filter(o => (o as any).data?.type !== 'frame-preview');
          if (!objs.length) return;
          const sel = new fabric.ActiveSelection(objs, { canvas: c });
          c.setActiveObject(sel); c.renderAll();
        }
        return;
      }

      // ── Group (Cmd+G) / Ungroup (Cmd+Shift+G) ───────────────────────────
      if (meta && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        const c = canvasRef.current;
        if (!c) return;
        const active = c.getActiveObject();
        if (e.shiftKey) {
          // Ungroup
          if (active instanceof fabric.Group && !(active instanceof fabric.ActiveSelection)) {
            (active as fabric.Group).toActiveSelection();
            c.requestRenderAll();
          }
        } else {
          // Group
          if (active instanceof fabric.ActiveSelection) {
            (active as any).toGroup();
            c.requestRenderAll();
          }
        }
        return;
      }

      // ── Rename layer (Cmd+R) ─────────────────────────────────────────────
      if (meta && (e.key === 'r' || e.key === 'R') && !e.shiftKey) {
        e.preventDefault();
        // Trigger layer rename — focus the layer panel rename input
        const c = canvasRef.current;
        const obj = c?.getActiveObject() as any;
        if (obj) {
          // Fire a custom event that LayerPanel can listen for
          window.dispatchEvent(new CustomEvent('peekboard:rename', { detail: { id: obj?.data?.id } }));
        }
        return;
      }

      // ── Flip horizontal (Shift+H) / vertical (Shift+V) ──────────────────
      if (!meta && e.shiftKey && (e.key === 'H' || e.key === 'h')) {
        e.preventDefault();
        const c = canvasRef.current;
        const obj = c?.getActiveObject();
        if (obj && c) { obj.set({ flipX: !obj.flipX }); c.renderAll(); }
        return;
      }
      if (!meta && e.shiftKey && (e.key === 'V' || e.key === 'v')) {
        e.preventDefault();
        const c = canvasRef.current;
        const obj = c?.getActiveObject();
        if (obj && c) { obj.set({ flipY: !obj.flipY }); c.renderAll(); }
        return;
      }

      // ── Opacity shortcuts (0-9 → 0%, 10%, …, 90%; 00 not feasible) ──────
      if (!meta && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        const c = canvasRef.current;
        const obj = c?.getActiveObject();
        if (obj && c) {
          obj.set({ opacity: parseInt(e.key) / 10 });
          c.renderAll();
        }
        // Don't return — let the key still do tool switching
      }
      if (!meta && !e.shiftKey && e.key === '0') {
        const c = canvasRef.current;
        const obj = c?.getActiveObject();
        if (obj && c) { obj.set({ opacity: 1 }); c.renderAll(); }
      }

      // ── Arrow nudge ──────────────────────────────────────────────────────
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        const c   = canvasRef.current;
        const obj = c?.getActiveObject();
        if (obj && c) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const delta: Record<string, Partial<{ left: number; top: number }>> = {
            ArrowUp:    { top:  (obj.top  ?? 0) - step },
            ArrowDown:  { top:  (obj.top  ?? 0) + step },
            ArrowLeft:  { left: (obj.left ?? 0) - step },
            ArrowRight: { left: (obj.left ?? 0) + step },
          };
          obj.set(delta[e.key] as any);
          obj.setCoords();
          c.fire('object:modified', { target: obj });
          c.renderAll();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && spaceHeld.current) {
        spaceHeld.current = false;
        setActiveTool(prevTool.current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
    };
  }, []); // eslint-disable-line

  const handleCanvasChange = useCallback(async (data: CanvasData) => {
    if (!id || !board || board.role === 'viewer') return;
    // CanvasEditor already debounces at 800 ms, so we send straight to the
    // server here. The extra 1 s debounce that used to live here blocked
    // visibility-change flushes from ever reaching the API.
    setSaveStatus('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await boardsApi.update(id, { canvas_data: JSON.stringify(data) });
      setSaveStatus('saved');
    } catch { setSaveStatus('unsaved'); }
  }, [id, board]);

  const handleBackgroundChange = useCallback((color: string) => {
    setBgColor(color);
    editorRef.current?.setBackground(color);
  }, []);

  const handleExport = async (format: 'png' | 'jpeg' | 'svg' | 'gif' = 'png') => {
    const baseName = board?.name ?? 'peekboard';
    const ext = format === 'jpeg' ? 'jpg' : format;

    if (format === 'gif') {
      // Animated GIF — capture live canvas frames (async, ~3 s)
      const url = await editorRef.current?.exportGif();
      if (!url) return;
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}.gif`;
      a.click();
      // Revoke the object URL after the download is triggered
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return;
    }

    const dataUrl = editorRef.current?.exportFrame(format);
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${baseName}.${ext}`;
    a.click();
  };

  if (loading) return (
    <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-toolbar)' }}>
      <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: 'var(--accent) transparent var(--accent) var(--accent)' }} />
    </div>
  );

  if (notFound || !board) return (
    <div className="h-full flex flex-col items-center justify-center" style={{ background: 'var(--bg-toolbar)' }}>
      <p className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Board not found</p>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>You may not have access to this board.</p>
      <button onClick={() => navigate('/dashboard')}
        className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
        style={{ background: 'var(--accent)' }}>
        Back to dashboard
      </button>
    </div>
  );

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--bg-toolbar)' }}>
      {/* Top toolbar — now includes save status, layers toggle, and share */}
      <Toolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        onAddText={() => { editorRef.current?.addText(); setActiveTool('select'); }}
        onMediaAdded={(url, mime, file) => editorRef.current?.addMedia(url, mime, file)}
        onExport={handleExport}
        role={board.role}
        boardName={board.name}
        onBack={() => navigate('/dashboard')}
        saveStatus={saveStatus}
        showLayers={showLayers}
        onToggleLayers={() => setShowLayers(v => !v)}
        onShare={() => setShowShare(true)}
      />


      {/* Editor area — no sub-bar */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: layers panel */}
        {showLayers && typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches && (
          <LayerPanel
            canvas={canvas}
            selectedObject={selectedObj}
            onSelect={(obj) => { setSelectedObj(obj); }}
            layerVersion={layerVersion}
            canEdit={board.role === 'owner' || board.role === 'editor'}
          />
        )}

        {/* Centre: canvas */}
        <div className="flex-1 overflow-hidden relative">
          <CanvasEditor
            key={reloadKey}
            ref={editorRef}
            board={board}
            activeTool={activeTool}
            role={board.role}
            onObjectSelect={(obj) => { setSelectedObj(obj); }}
            onCanvasChange={handleCanvasChange}
            onCanvasReady={setCanvas}
            onBackgroundChange={setBgColor}
            onToolChange={setActiveTool}
            onLayersChange={() => setLayerVersion(v => v + 1)}
            onZoomChange={setZoom}
            onCanvasChangeKeepAlive={(data) => {
              if (!id || !board || board.role === 'viewer') return;
              boardsApi.updateKeepAlive(id, { canvas_data: JSON.stringify(data) });
            }}
            uploadFn={(file) => uploadApi.upload(file)}
            onThumbnail={async (dataUrl) => {
              try { await boardsApi.thumbnail(board.id, dataUrl); }
              catch { /* best-effort */ }
            }}
          />
          <div
            className="absolute bottom-3 left-3 text-xs px-2 py-1 rounded pointer-events-none select-none"
            style={{ background: 'rgba(0,0,0,0.5)', color: 'var(--text-muted)' }}
          >
            Scroll to zoom · Space+drag to pan
          </div>
          <ZoomControl
            zoom={zoom}
            onZoomIn={()  => editorRef.current?.zoomIn()}
            onZoomOut={() => editorRef.current?.zoomOut()}
            onZoomTo={(l) => editorRef.current?.zoomTo(l)}
            onZoomToFit={() => editorRef.current?.zoomToFit()}
          />
          {user && board && (
            <CommentsOverlay
              boardId={board.id}
              currentUser={user}
              role={board.role}
              canvas={canvas}
              activeTool={activeTool}
              onToolChange={setActiveTool}
              comments={comments}
              replies={replies}
              members={members}
              showResolved={showResolved}
              openPinId={openPinId}
              onOpenPin={setOpenPinId}
              onAddComment={addComment}
              onAddReply={addReply}
              onResolve={resolveComment}
              onDelete={deleteComment}
            />
          )}
        </div>

        {/* Right panel slot — properties OR an active panel, never both */}
        {typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches && (
          activePanel === 'comments' && user ? (
            <CommentsPanel
              currentUser={user}
              role={board.role}
              canvas={canvas}
              zoom={zoom}
              activeTool={activeTool}
              onToolChange={setActiveTool}
              comments={comments}
              replies={replies}
              showResolved={showResolved}
              onToggleResolved={() => setShowResolved(v => !v)}
              onResolve={resolveComment}
              onDelete={deleteComment}
              onAddReply={addReply}
              onOpenPin={setOpenPinId}
              openPinId={openPinId}
            />
          ) : activePanel === 'linkedin' ? (
            <div className="w-72 flex-shrink-0 flex flex-col overflow-hidden" style={{ borderLeft: '1px solid var(--border)' }}>
              <LinkedInScorePanel
                onClose={() => setActivePanel(null)}
                getSnapshot={() => {
                  if (!canvas) return null;
                  try { return canvas.toDataURL({ format: 'jpeg', quality: 0.85, multiplier: 0.5 }); }
                  catch { return null; }
                }}
              />
            </div>
          ) : activePanel === 'history' && board ? (
            <VersionHistoryDrawer
              boardId={board.id}
              canEdit={board.role === 'owner' || board.role === 'editor'}
              onClose={() => setActivePanel(null)}
              onRestored={async () => {
                try {
                  const { board: refreshed } = await boardsApi.get(board.id);
                  setBoard(refreshed);
                  setReloadKey(k => k + 1);
                  setActivePanel(null);
                } catch { /* */ }
              }}
            />
          ) : (
            <PropertiesPanel
              selectedObject={selectedObj}
              canvas={canvas}
              role={board.role}
              backgroundColor={bgColor}
              onBackgroundChange={handleBackgroundChange}
            />
          )
        )}

        {/* Right icon strip — vertical Figma-style panel toggles */}
        <div
          className="hidden md:flex flex-col items-center gap-1 py-2 flex-shrink-0"
          style={{
            width: 40,
            background: 'var(--bg-toolbar)',
            borderLeft: '1px solid var(--border)',
          }}
        >
          <RightBtn
            title="Comments"
            active={activePanel === 'comments'}
            activeColor="#fbbf24"
            activeBg="rgba(245,158,11,0.15)"
            onClick={() => togglePanel('comments')}
          >
            <MessageSquare size={15} />
          </RightBtn>
          <RightBtn
            title="Version History"
            active={activePanel === 'history'}
            activeColor="var(--accent)"
            activeBg="rgba(27,175,216,0.15)"
            onClick={() => togglePanel('history')}
          >
            <History size={15} />
          </RightBtn>
          <RightBtn
            title="LinkedIn Score"
            active={activePanel === 'linkedin'}
            activeColor="#60a5fa"
            activeBg="rgba(10,102,194,0.2)"
            onClick={() => togglePanel('linkedin')}
          >
            <Linkedin size={15} />
          </RightBtn>
        </div>
      </div>

      {showShare && user && (
        <ShareModal boardId={board.id} currentUser={user} onClose={() => setShowShare(false)} />
      )}

      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}

      {ctxMenu && (
        <ContextMenu
          canvas={canvas}
          x={ctxMenu.x}
          y={ctxMenu.y}
          target={ctxMenu.target}
          canEdit={board.role === 'owner' || board.role === 'editor'}
          onClose={() => setCtxMenu(null)}
          onChange={() => { /* fabric mutations already trigger object:modified; nothing extra */ }}
        />
      )}
    </div>
  );
}

// ── Vertical icon strip button ────────────────────────────────────────────────
function RightBtn({
  children, title, active, activeColor, activeBg, onClick,
}: {
  children: React.ReactNode;
  title: string;
  active: boolean;
  activeColor: string;
  activeBg: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex items-center justify-center w-8 h-8 rounded-md transition-colors"
      style={{
        color:      active ? activeColor : 'var(--text-muted)',
        background: active ? activeBg   : 'transparent',
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
    >
      {children}
    </button>
  );
}
