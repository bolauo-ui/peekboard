import { useMemo, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import {
  Frame, Type, Image as ImageIcon, Film, Video, Layers,
  Square, Eye, EyeOff, Lock, Unlock, Group, Ungroup,
  ChevronRight, ChevronDown, GripVertical,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
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

interface TreeNode {
  layer: LayerInfo;
  children: TreeNode[];
  depth: number;
}

interface Props {
  canvas: fabric.Canvas | null;
  selectedObject: fabric.Object | null;
  onSelect: (obj: fabric.Object | null) => void;
  layerVersion: number;
  canEdit: boolean;
}

// ── Layer info extractor ──────────────────────────────────────────────────────
function getLayerInfo(obj: fabric.Object, selected: fabric.Object | null, index: number): LayerInfo {
  const data = (obj as any).data ?? {};
  let name = 'Layer';
  let type: LayerInfo['type'] = 'shape';

  if (data.layerName) name = data.layerName;

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

// ── Build tree from flat canvas object list ───────────────────────────────────
// Top-of-stack objects appear first (reversed from Fabric's internal array).
// Children are grouped under their parent frame, preserving stack order within
// each level.
function buildTree(objects: fabric.Object[], selectedObj: fabric.Object | null): TreeNode[] {
  // Reverse so top-of-stack = first in list (Figma convention)
  const reversed = [...objects].reverse();
  const allLayers = reversed.map((o, i) => getLayerInfo(o, selectedObj, i));

  const nodeById = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // First pass — create all nodes
  allLayers.forEach(layer => {
    nodeById.set(layer.id, { layer, children: [], depth: 0 });
  });

  // Second pass — wire children to their parent frame/group
  allLayers.forEach(layer => {
    const node = nodeById.get(layer.id)!;
    const parentId = layer.frameId;
    if (parentId && nodeById.has(parentId)) {
      const parent = nodeById.get(parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

// ── Flatten tree for rendering (respects collapsed state) ─────────────────────
function flattenTree(
  nodes: TreeNode[],
  collapsed: Set<string>,
  result: Array<TreeNode & { hasChildren: boolean }> = [],
): Array<TreeNode & { hasChildren: boolean }> {
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    result.push({ ...node, hasChildren });
    if (hasChildren && !collapsed.has(node.layer.id)) {
      flattenTree(node.children, collapsed, result);
    }
  }
  return result;
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const TYPE_ICON: Record<string, React.ReactNode> = {
  frame:  <Frame     size={11} />,
  text:   <Type      size={11} />,
  image:  <ImageIcon size={11} />,
  gif:    <Film      size={11} />,
  video:  <Video     size={11} />,
  group:  <Layers    size={11} />,
  svg:    <ImageIcon size={11} />,
  shape:  <Square    size={11} />,
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function LayerPanel({ canvas, selectedObject, onSelect, layerVersion, canEdit }: Props) {
  const [collapsed,    setCollapsed]    = useState<Set<string>>(new Set());
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editingName,  setEditingName]  = useState('');
  const [dragging,     setDragging]     = useState<string | null>(null);
  // { id, pos: 'before'|'after' } — where the drop line is shown
  const [dropTarget,   setDropTarget]   = useState<{ id: string; pos: 'before' | 'after' } | null>(null);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Build tree → flatten for render
  const flatRows = useMemo(() => {
    if (!canvas) return [];
    const objects = canvas.getObjects().filter(
      o => (o as any).data?.type !== 'frame-preview'
    );
    const tree = buildTree(objects, selectedObject);
    return flattenTree(tree, collapsed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, selectedObject, layerVersion, collapsed]);

  if (!canvas) return null;

  // ── Commit rename ───────────────────────────────────────────────────────────
  const commitRename = (obj: fabric.Object) => {
    const trimmed = editingName.trim();
    if (trimmed) {
      const data = ((obj as any).data ??= {});
      data.layerName = trimmed;
      if (data.type === 'frame' || data.objectType === 'frame') data.frameName = trimmed;
      canvas.fire('object:modified', { target: obj });
      canvas.requestRenderAll();
    }
    setEditingId(null);
    setEditingName('');
  };

  // ── Select ──────────────────────────────────────────────────────────────────
  const selectObj = (obj: fabric.Object) => {
    canvas.setActiveObject(obj);
    canvas.requestRenderAll();
    onSelect(obj);
  };

  // ── Visibility / lock ───────────────────────────────────────────────────────
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
    obj.evented = locked;
    canvas.requestRenderAll();
  };

  // ── Group / ungroup ─────────────────────────────────────────────────────────
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
    if (active instanceof fabric.Group && !(active instanceof fabric.ActiveSelection)) {
      (active as fabric.Group).toActiveSelection();
      canvas.requestRenderAll();
    }
  };

  // ── Drag-to-reorder ──────────────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDropTarget({ id, pos });
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const pos = dropTarget?.pos ?? 'after';
    setDropTarget(null);
    setDragging(null);
    if (!canEdit || !dragging || dragging === targetId) return;

    const srcRow = flatRows.find(r => r.layer.id === dragging);
    const dstRow = flatRows.find(r => r.layer.id === targetId);
    if (!srcRow || !dstRow) return;

    // Layer panel is reversed (top-of-stack first). In Fabric _objects:
    //   'before' in panel = higher z-index = higher array index
    //   'after'  in panel = lower z-index  = lower array index
    const objs   = (canvas as any)._objects as fabric.Object[];
    const srcIdx = objs.indexOf(srcRow.layer.obj);
    let   dstIdx = objs.indexOf(dstRow.layer.obj);
    if (srcIdx === -1 || dstIdx === -1) return;

    // Remove source
    objs.splice(srcIdx, 1);
    // Recalculate dst after removal
    dstIdx = objs.indexOf(dstRow.layer.obj);

    // 'before' in panel → insert ABOVE dst in _objects (dstIdx + 1)
    // 'after'  in panel → insert BELOW dst in _objects (dstIdx)
    const insertAt = pos === 'before' ? dstIdx + 1 : dstIdx;
    objs.splice(insertAt, 0, srcRow.layer.obj);
    canvas.requestRenderAll();
    canvas.fire('object:modified', { target: srcRow.layer.obj });
  };

  const isGroup = selectedObject instanceof fabric.Group && !(selectedObject instanceof fabric.ActiveSelection);
  const isMulti = selectedObject instanceof fabric.ActiveSelection;

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
              <button onClick={groupSelected} title="Group selected" className="toolbar-btn" style={{ width: 22, height: 22, padding: 0 }}>
                <Group size={11} />
              </button>
            )}
            {isGroup && (
              <button onClick={ungroupSelected} title="Ungroup" className="toolbar-btn" style={{ width: 22, height: 22, padding: 0 }}>
                <Ungroup size={11} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto pb-3 space-y-px" style={{ paddingLeft: 4, paddingRight: 4 }}>
        {flatRows.length === 0 ? (
          <p className="text-xs text-center pt-6" style={{ color: 'var(--text-muted)' }}>
            No layers yet
          </p>
        ) : (
          flatRows.map(row => {
            const { layer, depth, hasChildren } = row;
            const isCollapsed = collapsed.has(layer.id);
            const indent = depth * 12;

            const isDropBefore = dropTarget?.id === layer.id && dropTarget.pos === 'before';
            const isDropAfter  = dropTarget?.id === layer.id && dropTarget.pos === 'after';

            return (
              <div
                key={layer.id}
                draggable={canEdit}
                onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragging(layer.id); }}
                onDragOver={e => handleDragOver(e, layer.id)}
                onDrop={e => handleDrop(e, layer.id)}
                onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                onClick={() => selectObj(layer.obj)}
                className="relative flex items-center gap-1 py-[3px] rounded cursor-pointer group select-none"
                style={{
                  paddingLeft: 4 + indent,
                  paddingRight: 4,
                  background: layer.isSelected ? 'rgba(27,175,216,0.2)' : 'transparent',
                  opacity: dragging === layer.id ? 0.4 : layer.visible ? 1 : 0.4,
                }}
              >
                {/* Drop line — before */}
                {isDropBefore && (
                  <div className="absolute left-0 right-0 top-0 h-0.5 rounded pointer-events-none z-10"
                    style={{ background: 'var(--accent)' }} />
                )}

                {/* Grip handle */}
                {canEdit && (
                  <span className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                    style={{ color: 'var(--text-muted)', lineHeight: 0 }}>
                    <GripVertical size={10} />
                  </span>
                )}

                {/* Collapse chevron — only for frames/groups with children */}
                <span
                  className="flex items-center justify-center flex-shrink-0"
                  style={{ width: 14, height: 14, color: 'var(--text-muted)' }}
                  onClick={e => {
                    if (!hasChildren) return;
                    e.stopPropagation();
                    toggleCollapse(layer.id);
                  }}
                >
                  {hasChildren
                    ? (isCollapsed
                        ? <ChevronRight size={10} />
                        : <ChevronDown  size={10} />)
                    : null}
                </span>

                {/* Type icon */}
                <span style={{ color: layer.isSelected ? '#7DD9ED' : 'var(--text-muted)', flexShrink: 0 }}>
                  {TYPE_ICON[layer.type]}
                </span>

                {/* Name — double-click to rename */}
                {editingId === layer.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onBlur={() => commitRename(layer.obj)}
                    onKeyDown={e => {
                      e.stopPropagation();
                      if (e.key === 'Enter')  commitRename(layer.obj);
                      if (e.key === 'Escape') { setEditingId(null); setEditingName(''); }
                    }}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 text-xs rounded px-1 py-0.5 outline-none min-w-0"
                    style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--accent)' }}
                  />
                ) : (
                  <span
                    className="flex-1 text-xs truncate min-w-0"
                    style={{ color: layer.isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    onDoubleClick={e => {
                      if (!canEdit) return;
                      e.stopPropagation();
                      setEditingId(layer.id);
                      setEditingName(layer.name);
                    }}
                    title={layer.name}
                  >
                    {layer.name}
                  </span>
                )}

                {/* Action buttons */}
                <div className={`flex items-center gap-0.5 flex-shrink-0 ${layer.isSelected ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                  <IconBtn title={layer.visible ? 'Hide' : 'Show'} onClick={e => toggleVisible(layer.obj, e)}>
                    {layer.visible ? <Eye size={10} /> : <EyeOff size={10} />}
                  </IconBtn>
                  {canEdit && (
                    <IconBtn title={layer.locked ? 'Unlock' : 'Lock'} onClick={e => toggleLock(layer.obj, e)}>
                      {layer.locked ? <Lock size={10} /> : <Unlock size={10} />}
                    </IconBtn>
                  )}
                </div>

                {/* Drop line — after */}
                {isDropAfter && (
                  <div className="absolute left-0 right-0 bottom-0 h-0.5 rounded pointer-events-none z-10"
                    style={{ background: 'var(--accent)' }} />
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

// ── Icon button ───────────────────────────────────────────────────────────────
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
      style={{ width: 16, height: 16, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
    >
      {children}
    </button>
  );
}
