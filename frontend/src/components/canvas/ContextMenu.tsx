import { useEffect, useRef } from 'react';
import { fabric } from 'fabric';
import { ChevronsUp, ChevronUp, ChevronDown, ChevronsDown, Copy, Trash2 } from 'lucide-react';

interface Props {
  canvas: fabric.Canvas | null;
  x: number;
  y: number;
  target: fabric.Object;
  canEdit: boolean;
  onClose: () => void;
  onChange: () => void;        // notify parent so it can schedule save / re-render
  onDuplicate?: () => void;    // uses editor's duplicateActive() so GIFs stay animated
}

// Compact dark-themed context menu, opened by right-clicking any canvas
// object. Mirrors the standard design-tool z-order + copy / delete menu.
export default function ContextMenu({ canvas, x, y, target, canEdit, onClose, onChange, onDuplicate }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside-click or Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown',   onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown',   onKey);
    };
  }, [onClose]);

  const run = (fn: () => void) => {
    fn();
    canvas?.renderAll();
    onChange();
    onClose();
  };

  return (
    <div
      ref={rootRef}
      className="fixed rounded-md py-1 text-[13px]"
      style={{
        left: x, top: y,
        background:  'var(--bg-panel)',
        border:      '1px solid var(--border)',
        color:       'var(--text-primary)',
        boxShadow:   '0 12px 32px rgba(0,0,0,0.45)',
        minWidth:    220,
        zIndex:      100,
      }}
    >
      {canEdit && <>
        <MenuItem
          icon={<ChevronsUp size={13} />} label="Bring to front" hint="⇧]"
          onClick={() => run(() => canvas?.bringToFront(target))}
        />
        <MenuItem
          icon={<ChevronUp size={13} />} label="Bring forward" hint="]"
          onClick={() => run(() => canvas?.bringForward(target))}
        />
        <MenuItem
          icon={<ChevronDown size={13} />} label="Send backward" hint="["
          onClick={() => run(() => canvas?.sendBackwards(target))}
        />
        <MenuItem
          icon={<ChevronsDown size={13} />} label="Send to back" hint="⇧["
          onClick={() => run(() => canvas?.sendToBack(target))}
        />
        <Divider />
        <MenuItem
          icon={<Copy size={13} />} label="Duplicate" hint="⌘D"
          onClick={() => {
            if (onDuplicate) {
              onDuplicate();
              onClose();
            } else {
              run(() => {
                target.clone((clone: fabric.Object) => {
                  clone.set({ left: (clone.left ?? 0) + 20, top: (clone.top ?? 0) + 20 });
                  canvas?.add(clone); canvas?.setActiveObject(clone);
                });
              });
            }
          }}
        />
        <MenuItem
          icon={<Trash2 size={13} />} label="Delete" hint="Del"
          danger
          onClick={() => run(() => canvas?.remove(target))}
        />
      </>}
      {!canEdit && (
        <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Read-only view
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon, label, hint, danger, onClick,
}: { icon: React.ReactNode; label: string; hint?: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
      style={{ color: danger ? 'var(--danger)' : 'var(--text-primary)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ width: 14, opacity: 0.85 }}>{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{hint}</span>}
    </button>
  );
}

function Divider() {
  return <div className="my-1" style={{ height: 1, background: 'var(--border-light)' }} />;
}
