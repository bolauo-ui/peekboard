import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { boardsApi } from '@/lib/api';
import { fabric } from 'fabric';
import PeekboardLogo from '@/components/PeekboardLogo';

interface PublicBoard {
  id: string; name: string; canvas_data: string;
  width: number; height: number; thumbnail_url?: string;
  owner_name: string; updated_at: string;
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const colors = ['#1BAFD8', '#7C3AED', '#059669', '#DC2626', '#D97706'];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div style={{ width: 26, height: 26, borderRadius: '50%', background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {initials}
    </div>
  );
}

export default function PublicBoardView() {
  const { token } = useParams<{ token: string }>();
  const [board,        setBoard]        = useState<PublicBoard | null>(null);
  const [error,        setError]        = useState('');
  const [loaded,       setLoaded]       = useState(false);
  const [canvasReady,  setCanvasReady]  = useState(false);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef   = useRef<fabric.Canvas | null>(null);

  // ── OG meta tags ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!board) return;
    const set = (prop: string, content: string) => {
      let el = document.querySelector<HTMLMetaElement>(`meta[property="${prop}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', prop);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    document.title = `${board.name} — Peekboard`;
    set('og:title',       board.name);
    set('og:description', `View this board by ${board.owner_name} on Peekboard`);
    set('og:url',         window.location.href);
    set('og:type',        'website');
    if (board.thumbnail_url) set('og:image', board.thumbnail_url);
  }, [board]);

  // ── Fetch board data ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    boardsApi.getPublic(token)
      .then(d => { setBoard(d.board); setLoaded(true); })
      .catch(() => setError('This link is invalid or has been disabled.'));
  }, [token]);

  // ── Initialise read-only canvas ──────────────────────────────────────────────
  useEffect(() => {
    if (!board || !canvasElRef.current) return;

    const parsed = board.canvas_data ? JSON.parse(board.canvas_data) : { fabricData: {}, mediaItems: [] };
    const bg = parsed.fabricData?.background ?? '#f0f0f0';

    const c = new fabric.Canvas(canvasElRef.current, {
      width:           board.width  || 1200,
      height:          board.height || 800,
      backgroundColor: bg,
      selection:       false,
      interactive:     false,
    });
    fabricRef.current = c;

    const finalize = () => {
      c.getObjects().forEach(obj => {
        obj.selectable  = false;
        obj.evented     = false;
        obj.hoverCursor = 'default';
      });
      c.renderAll();
      setCanvasReady(true);
    };

    if (parsed.fabricData?.objects?.length) {
      c.loadFromJSON(parsed.fabricData, finalize);
    } else {
      finalize();
    }

    const scale = () => {
      const container = canvasElRef.current?.parentElement;
      if (!container) return;
      const zoom = Math.min(container.clientWidth / c.getWidth(), 1);
      c.setZoom(zoom);
      c.setWidth(c.getWidth() * zoom);
      c.setHeight(c.getHeight() * zoom);
    };
    scale();
    window.addEventListener('resize', scale);
    return () => { window.removeEventListener('resize', scale); c.dispose(); };
  }, [board]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d0d', display: 'flex',
      flexDirection: 'column', fontFamily: '"Inter",system-ui,sans-serif' }}>

      {/* ── Top bar ── */}
      <div style={{ height: 54, background: '#111', borderBottom: '1px solid #222',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12,
        flexShrink: 0, position: 'sticky', top: 0, zIndex: 10 }}>
        <Link to="/" style={{ display: 'flex', textDecoration: 'none' }}>
          <PeekboardLogo height={20} />
        </Link>

        <div style={{ width: 1, height: 20, background: '#2a2a2a', flexShrink: 0 }} />

        {board ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Avatar name={board.owner_name} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8e8',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                {board.name}
              </div>
              <div style={{ fontSize: 11, color: '#555', marginTop: 1 }}>
                by {board.owner_name} · {fmt(board.updated_at)}
              </div>
            </div>
          </div>
        ) : !error ? (
          <div style={{ height: 16, width: 140, borderRadius: 4, background: '#222',
            animation: 'pulse 1.5s ease-in-out infinite' }} />
        ) : null}

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 11, color: '#555', padding: '3px 10px', borderRadius: 5,
          border: '1px solid #222', background: '#181818', flexShrink: 0 }}>
          View only
        </span>

        <Link to="/signup" style={{ padding: '7px 16px', borderRadius: 8,
          background: 'linear-gradient(135deg,#1BAFD8,#0e8fb5)', color: '#fff',
          fontSize: 13, fontWeight: 600, textDecoration: 'none', flexShrink: 0,
          boxShadow: '0 2px 8px rgba(27,175,216,0.35)' }}>
          Try Peekboard free →
        </Link>
      </div>

      {/* ── Canvas area ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start',
        justifyContent: 'center', padding: '48px 32px 120px', overflow: 'auto' }}>

        {/* Error state */}
        {error && (
          <div style={{ marginTop: 80, textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 20 }}>🔒</div>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#e0e0e0', marginBottom: 8 }}>
              Link unavailable
            </p>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 32 }}>{error}</p>
            <Link to="/" style={{ display: 'inline-block', padding: '10px 22px', borderRadius: 8,
              background: '#1BAFD8', color: '#fff', fontSize: 13, fontWeight: 600,
              textDecoration: 'none' }}>
              Go to Peekboard →
            </Link>
          </div>
        )}

        {/* Loading skeleton */}
        {!error && !loaded && (
          <div style={{ width: '100%', maxWidth: 960 }}>
            <div style={{ height: 540, borderRadius: 14, background: '#161616',
              border: '1px solid #1e1e1e', display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%',
                border: '3px solid #1BAFD8', borderTopColor: 'transparent',
                animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: 13, color: '#444' }}>Loading board…</span>
            </div>
          </div>
        )}

        {/* Board canvas (with thumbnail fade) */}
        {loaded && board && (
          <div style={{ position: 'relative', maxWidth: '100%' }}>
            {/* Thumbnail shown until canvas is ready */}
            {board.thumbnail_url && !canvasReady && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 2, borderRadius: 14,
                overflow: 'hidden', background: '#161616' }}>
                <img src={board.thumbnail_url} alt={board.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.25)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%',
                    border: '3px solid #fff', borderTopColor: 'transparent',
                    animation: 'spin 0.8s linear infinite' }} />
                </div>
              </div>
            )}

            {/* Actual canvas */}
            <div style={{ background: '#161616', borderRadius: 14, overflow: 'hidden',
              boxShadow: '0 40px 120px rgba(0,0,0,0.7)',
              opacity: canvasReady ? 1 : 0,
              transition: 'opacity 0.4s ease' }}>
              <canvas ref={canvasElRef} />
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom CTA bar ── */}
      {!error && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20,
          background: 'linear-gradient(to top, rgba(13,13,13,0.98) 0%, rgba(13,13,13,0.85) 100%)',
          backdropFilter: 'blur(12px)', borderTop: '1px solid #1e1e1e',
          padding: '14px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0', margin: 0 }}>
              Want to create boards like this?
            </p>
            <p style={{ fontSize: 12, color: '#555', margin: '2px 0 0' }}>
              Peekboard is free to get started — no credit card needed.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <Link to="/login" style={{ padding: '8px 18px', borderRadius: 8,
              border: '1px solid #2a2a2a', background: 'transparent', color: '#aaa',
              fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
              Log in
            </Link>
            <Link to="/signup" style={{ padding: '8px 20px', borderRadius: 8,
              background: 'linear-gradient(135deg,#1BAFD8,#0e8fb5)', color: '#fff',
              fontSize: 13, fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 2px 12px rgba(27,175,216,0.4)' }}>
              Sign up free →
            </Link>
          </div>
        </div>
      )}

      {/* Keyframes */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%,100% { opacity: 0.4; }
          50%      { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
