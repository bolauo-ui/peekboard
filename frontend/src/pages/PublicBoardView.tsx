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

export default function PublicBoardView() {
  const { token } = useParams<{ token: string }>();
  const [board,  setBoard]  = useState<PublicBoard | null>(null);
  const [error,  setError]  = useState('');
  const [loaded, setLoaded] = useState(false);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef   = useRef<fabric.Canvas | null>(null);

  // Fetch board data
  useEffect(() => {
    if (!token) return;
    boardsApi.getPublic(token)
      .then(d => { setBoard(d.board); setLoaded(true); })
      .catch(() => setError('This link is invalid or has been disabled.'));
  }, [token]);

  // Initialise read-only canvas
  useEffect(() => {
    if (!board || !canvasElRef.current) return;

    const parsed = board.canvas_data ? JSON.parse(board.canvas_data) : { fabricData: {}, mediaItems: [] };
    const bg = parsed.fabricData?.background ?? '#f0f0f0';

    const c = new fabric.Canvas(canvasElRef.current, {
      width:             board.width  || 1200,
      height:            board.height || 800,
      backgroundColor:   bg,
      selection:         false,
      interactive:       false,
    });
    fabricRef.current = c;

    // Load objects
    if (parsed.fabricData?.objects?.length) {
      c.loadFromJSON(parsed.fabricData, () => {
        c.getObjects().forEach(obj => {
          obj.selectable  = false;
          obj.evented     = false;
          obj.hoverCursor = 'default';
        });
        c.renderAll();
      });
    }

    // Scale canvas to fit viewport
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

  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div style={{ minHeight: '100vh', background: '#111', display: 'flex', flexDirection: 'column',
      fontFamily: '"Inter",system-ui,sans-serif' }}>

      {/* Top bar */}
      <div style={{ height: 52, background: '#1a1a1a', borderBottom: '1px solid #2a2a2a',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0 }}>
        <Link to="/" style={{ display: 'flex', textDecoration: 'none' }}>
          <PeekboardLogo height={20} />
        </Link>
        <div style={{ width: 1, height: 20, background: '#333' }} />
        {board && (
          <>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0' }}>{board.name}</span>
            <span style={{ fontSize: 12, color: '#666' }}>by {board.owner_name}</span>
            <span style={{ fontSize: 12, color: '#555' }}>· {fmt(board.updated_at)}</span>
          </>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#555', padding: '3px 10px', borderRadius: 5,
          border: '1px solid #2a2a2a', background: '#222' }}>View only</span>
        <Link to="/signup"
          style={{ padding: '6px 14px', borderRadius: 7, background: '#1BAFD8', color: '#fff',
            fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          Sign up free
        </Link>
      </div>

      {/* Canvas area */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 40, overflow: 'auto' }}>
        {error && (
          <div style={{ marginTop: 100, textAlign: 'center', color: '#888' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#ccc', marginBottom: 8 }}>Link unavailable</p>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 24 }}>{error}</p>
            <Link to="/" style={{ color: '#1BAFD8', fontSize: 13, textDecoration: 'none' }}>Go to Peekboard →</Link>
          </div>
        )}
        {!error && !loaded && (
          <div style={{ marginTop: 100, color: '#555', fontSize: 13 }}>Loading…</div>
        )}
        {loaded && board && (
          <div style={{ background: '#1a1a1a', borderRadius: 12, overflow: 'hidden',
            boxShadow: '0 40px 120px rgba(0,0,0,0.6)', maxWidth: '100%' }}>
            <canvas ref={canvasElRef} />
          </div>
        )}
      </div>
    </div>
  );
}
