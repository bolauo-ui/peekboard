import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  zoom: number;                       // current zoom as multiplier (1 = 100%)
  onZoomIn:    () => void;
  onZoomOut:   () => void;
  onZoomTo:    (level: number) => void;
  onZoomToFit: () => void;
}

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform);
const META = isMac ? '\u2318' : 'Ctrl';

const ITEMS: { label: string; shortcut?: string; action: 'in' | 'out' | 'fit' | 0.5 | 1 | 2 }[] = [
  { label: 'Zoom in',       shortcut: `${META} +`, action: 'in'  },
  { label: 'Zoom out',      shortcut: `${META} \u2212`, action: 'out' },
  { label: 'Zoom to fit',   shortcut: '\u21E7 1',  action: 'fit' },
  { label: 'Zoom to 50%',   action: 0.5 },
  { label: 'Zoom to 100%',  shortcut: `${META} 0`, action: 1   },
  { label: 'Zoom to 200%',  action: 2 },
];

export default function ZoomControl({ zoom, onZoomIn, onZoomOut, onZoomTo, onZoomToFit }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const pct = Math.round(zoom * 100);

  const run = (action: typeof ITEMS[number]['action']) => {
    if (action === 'in')       onZoomIn();
    else if (action === 'out') onZoomOut();
    else if (action === 'fit') onZoomToFit();
    else                       onZoomTo(action);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="absolute bottom-3 right-3 select-none" style={{ zIndex: 10 }}>
      {open && (
        <div
          className="mb-1.5 rounded-lg overflow-hidden text-xs"
          style={{
            background: 'rgba(20,20,24,0.96)',
            border: '1px solid var(--border)',
            boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
            color: 'var(--text-primary)',
            minWidth: 220,
          }}
        >
          {/* Current zoom row (read-only display, mirrors Figma's style) */}
          <div
            className="px-3 py-2 m-1.5 rounded-md font-medium text-center"
            style={{
              border: '1px solid var(--accent)',
              color: 'var(--text-primary)',
            }}
          >
            {pct}%
          </div>
          <div className="h-px" style={{ background: 'var(--border)' }} />
          {ITEMS.map((it, i) => (
            <button
              key={i}
              onClick={() => run(it.action)}
              className="w-full flex items-center justify-between px-3 py-2 transition-colors"
              style={{ color: 'var(--text-primary)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span>{it.label}</span>
              {it.shortcut && (
                <span className="ml-6" style={{ color: 'var(--text-muted)' }}>{it.shortcut}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors"
        style={{
          background: 'rgba(20,20,24,0.85)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(40,40,48,0.95)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(20,20,24,0.85)')}
        title="Zoom"
      >
        {pct}%
        <ChevronDown size={12} />
      </button>
    </div>
  );
}
