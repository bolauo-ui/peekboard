import { useMemo, useState } from 'react';
import { fabric } from 'fabric';
import {
  Frame, Type, Image as ImageIcon, Film, Video, Layers,
  Square, Eye, EyeOff, Lock, Unlock, ChevronUp, ChevronDown,
  Group, Ungroup,
} from 'lucide-react';

export interface LayerInfo {
  id: string;
  obj: fabric.Object;
  name: string;
  type: 'frame' | 'text' | 'image' | 'gif' | 'video' | 'group' | 'svg' | 'shape';
  visible: boolean;
  locked: boolean;
  isSelected: boolean;
  frameId?: string;
}

interface Props {
  canvas: fabric.Canvas | null;
  selectedObject: fabric.Object | null;
  onSelect: (obj: fabric.Object | null) => void;
  layerVersion: number;
  canEdit: boolean;
}

function getLayerInfo(obj: fabric.Object, selected: fabric.Object | null, index: number): LayerInfo {
  const data = (obj as any).data ?? {};
  let name = 'Layer';
  let type: LayerInfo['type'] = 'shape';

  // A user-overridden layer name always wins over the type-derived one.
  if (data.layerName) {
    name = data.layerName;
  }

  if (data.type === 'frame' || data.objectType === 'frame') {
    if (!data.layerName) name = data.frameName ?? 'Frame';
    type = 'frame';
  } else if (obj instanceof fabric.IText || obj instanceof fabric.Text) {
    if (!data.layerName) {
      const raw = ((obj as fabric.IText).text ?? '').trim();
      name = raw.length > 22 ? raw.slice(0, 22) + '…' : raw || 'Text';
    }
    type = 'text';
  } else if (data.mediaType === 'gif') {
    if (!data.layerName) name = 'GIF';
    type = 'gif';
  } else if (data.mediaType === 'mp4' || data.mediaType === 'webm') {
    if (!data.layerName) name = 'Video';
    type = 'video';
  } else if (data.objectType === 'svg') {
    if (!data.layerName) name = 'SVG';
    type = 'svg';
  } else if (data.objectType === 'image' || obj instanceof fabric.Image) {
    if (!data.layerName) name = 'Image';
    type = 'image';
  } else if (obj instanceof fabric.Group) {
    if (!data.layerName) {
      const count = (obj as fabric.Group).getObjects().length;
      name = `Group (${count})`;
    }
    type = 'group';
  }

  return {
    id: data.id ?? `layer-${index}`,
    obj,
    name,
    type,
    visible: obj.visible !== false,
    locked: !obj.selectable,
    isSelected: obj === selected,
    frameId: data.frameId,
  };
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  frame:  <Frame   size={11} />,
  text:   <Type    size={11} />,
  image:  <ImageIcon size={11} />,
  gif:    <Film    size={11} />,
  video:  <Video   size={11} />,
  group:  <Layers  size={11} />,
  svg:    <ImageIcon size={11} />,
  shape:  <Square  size={11} />,
};

export default function LayerPanel({ canvas, selectedObject, onSelect, layerVersion, canEdit }: Props) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Commit a renamed layer: write to data.layerName (and also data.frameName
  // for frames so the canvas-rendered label stays in sync) and force the
  // panel to re-render through the existing layerVersion bus.
  const commitRename = (obj: fabric.Object) => {
    const trimmed = editingName.trim();
    if (trimmed) {
      const data = ((obj as any).data ??= {});
      data.layerName = trimmed;
      if (data.type === 'frame' || data.objectType === 'frame') data.frameName = trimmed;
      canvas?.fire('object:modified', { target: obj });
      canvas?.requestRenderAll();
    }
    setEditingId(null);
    setEditingName('');
  };

  const layers = useMemo(() => {
    if (!canvas) return [] as LayerInfo[];
    const objs = canvas.getObjects().filter(
      o => (o as any).data?.type !== 'frame-preview'
    );
    return [...objs].reverse().map((o, i) => getLayerInfo(o, selectedObject, i));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, selectedObject, layerVersion]);

  if (!canvas) return null;

  /* ── helpers ──────────────────────────────────────────────────────────────── */
  const selectObj = (obj: fabric.Object) => {
    canvas.setActiveObject(obj);
    canvas.requestRenderAll();
    onSelect(obj);
  };

  const moveUp = (obj: fabric.Object, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    canvas.bringForward(obj);
    canvas.requestRenderAll();
  };

  const moveDown = (obj: fabric.Object, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    canvas.sendBackwards(obj);
    canvas.requestRenderAll();
  };

  const toggleVisible = (obj: fabric.Object, e: React.MouseEvent) => {
    e.stopPropagation();
    (obj as any).visible = !(obj.visible !== false);
    canvas.requestRenderAll();
  };

  const toggleLock = (obj: fabric.Object, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    const locked = !obj.selectable;
    obj.selectable = locked;
    obj.evented     = locked;
    canvas.requestRenderAll();
  };

  const groupSelected = () => {
    if (!canEdit) return;
    const active = canvas.getActiveObject();
    if (active instanceof fabric.ActiveSelection) {
      (active as any).toGroup();
      canvas.requestRenderAll();
    }
  };

  const ungroupSelected = () => {
    if (!canEdit) return;
    const active = canvas.getActiveObject();
    if (
      active instanceof fabric.Group &&
      !(active instanceof fabric.ActiveSelection)
    ) {
      (active as fabric.Group).toActiveSelection();
      canvas.requestRenderAll();
    }
  };

  /* ── drag-and-drop reorder ──────────────────────────────────────────────── */
  const handleDragStart = (id: string) => setDragging(id);
  const handleDragOver  = (e: React.DragEvent, id: string) => {
    e.preventDefault(); setDragOver(id);
  };
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOver(null); setDragging(null);
    if (!canEdit || !dragging || dragging === targetId) return;

    const srcLayer = layers.find(l => l.id === dragging);
    const dstLayer = layers.find(l => l.id === targetId);
    if (!srcLayer || !dstLayer) return;

    const objs     = canvas.getObjects();
    const srcIdx   = objs.indexOf(srcLayer.obj);
    const dstIdx   = objs.indexOf(dstLayer.obj);
    if (srcIdx === -1 || dstIdx === -1) return;

    // Remove from current position and insert at target
    (canvas as any)._objects.splice(srcIdx, 1);
    const newIdx = (canvas as any)._objects.indexOf(dstLayer.obj);
    (canvas as any)._objects.splice(
      srcIdx > dstIdx ? newIdx + 1 : newIdx,
      0,
      srcLayer.obj
    );
    canvas.requestRenderAll();
  };

  const isGroup  = selectedObject instanceof fabric.Group &&
                   !(selectedObject instanceof fabric.ActiveSelection);
  const isMulti  = selectedObject instanceof fabric.ActiveSelection;

  return (
    <aside
      className="w-52 flex flex-col overflow-hidden flex-shrink-0"
      style={{ background: 'var(--bg-panel)', borderRight: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 flex-shrink-0">
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Layers</span>
        {canEdit && (
          <div className="flex gap-1">
            {isMulti && (
              <button
                onClick={groupSelected}
                title="Group selected (Ctrl+G)"
                className="toolbar-btn"
                style={{ width: 22, height: 22, padding: 0 }}
              >
                <Group size={11} />
              </button>
            )}
            {isGroup && (
              <button
                onClick={ungroupSelected}
                title="Ungroup"
                className="toolbar-btn"
                style={{ width: 22, height: 22, padding: 0 }}
              >
                <Ungroup size={11} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-px">
        {layers.length === 0 ? (
          <p className="text-xs text-center pt-6" style={{ color: 'var(--text-muted)' }}>
            No layers yet
          </p>
        ) : (
          layers.map(layer => (
            <div
              key={layer.id}
              draggable={canEdit}
              onDragStart={() => handleDragStart(layer.id)}
              onDragOver={e => handleDragOver(e, layer.id)}
              onDrop={e => handleDrop(e, layer.id)}
              onDragEnd={() => { setDragging(null); setDragOver(null); }}
              onClick={() => selectObj(layer.obj)}
              className="flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer group select-none"
              style={{
                background: layer.isSelected
                  ? 'rgba(123,104,238,0.2)'
                  : dragOver === layer.id
                  ? 'rgba(123,104,238,0.1)'
                  : 'transparent',
                opacity:  layer.visible ? 1 : 0.45,
                paddingLeft: layer.frameId ? 16 : undefined,
              }}
            >
              {/* Type icon */}
              <span style={{ color: layer.isSelected ? '#a89cf7' : 'var(--text-muted)', flexShrink: 0 }}>
                {TYPE_ICON[layer.type]}
              </span>

              {/* Name (double-click to rename inline) */}
              {editingId === layer.id ? (
                <input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => commitRename(layer.obj)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter')  commitRename(layer.obj);
                    if (e.key === 'Escape') { setEditingId(null); setEditingName(''); }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 text-xs rounded px-1 py-0.5 outline-none"
                  style={{
                    background:  'var(--bg-input)',
                    color:       'var(--text-primary)',
                    border:      '1px solid var(--accent)',
                  }}
                />
              ) : (
                <span
                  className="flex-1 text-xs truncate"
                  style={{ color: layer.isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                  onDoubleClick={(e) => {
                    if (!canEdit) return;
                    e.stopPropagation();
                    setEditingId(layer.id);
                    setEditingName(layer.name);
                  }}
                  title={canEdit ? 'Double-click to rename' : undefined}
                >
                  {layer.name}
                </span>
              )}

              {/* Action buttons — always visible on selected, hover otherwise */}
              <div className={`flex items-center gap-0.5 ${layer.isSelected ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                {canEdit && (
                  <>
                    <IconBtn title="Move up"   onClick={e => moveUp(layer.obj, e)}>
                      <ChevronUp size={9} />
                    </IconBtn>
                    <IconBtn title="Move down" onClick={e => moveDown(layer.obj, e)}>
                      <ChevronDown size={9} />
                    </IconBtn>
                  </>
                )}
                <IconBtn title={layer.visible ? 'Hide' : 'Show'} onClick={e => toggleVisible(layer.obj, e)}>
                  {layer.visible ? <Eye size={10} /> : <EyeOff size={10} />}
                </IconBtn>
                {canEdit && (
                  <IconBtn title={layer.locked ? 'Unlock' : 'Lock'} onClick={e => toggleLock(layer.obj, e)}>
                    {layer.locked ? <Lock size={10} /> : <Unlock size={10} />}
                  </IconBtn>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function IconBtn({ children, onClick, title }: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex items-center justify-center rounded"
      style={{
        width: 16, height: 16,
        color: 'var(--text-muted)',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        flexShrink: 0,
      }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
    >
      {children}
    </button>
  );
}
