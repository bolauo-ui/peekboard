import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useState } from 'react';
import { fabric } from 'fabric';
import type { Board, MediaItem, CanvasData, Tool } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export interface CanvasEditorHandle {
  addMedia:      (url: string, mimeType: string, file?: File) => void;
  addText:       () => void;
  exportFrame:   () => string;
  getCanvas:     () => fabric.Canvas | null;
  setBackground: (color: string) => void;
  getBackground: () => string;
  undo:  () => void;
  redo:  () => void;
  copy:  () => void;
  paste: () => void;
}

interface Props {
  board:   Board;
  activeTool: Tool;
  role:    string;
  onObjectSelect:      (obj: fabric.Object | null) => void;
  onCanvasChange:      (data: CanvasData) => void;
  onCanvasReady?:      (canvas: fabric.Canvas) => void;
  onBackgroundChange?: (color: string) => void;
  onToolChange?:       (t: Tool) => void;
  onLayersChange?:     () => void;
  uploadFn?:           (file: File) => Promise<{ url: string; mimetype: string }>;
}

const DEFAULT_BG = '#f0f0f0';

const CanvasEditor = forwardRef<CanvasEditorHandle, Props>(
  ({ board, activeTool, role, onObjectSelect, onCanvasChange, onCanvasReady,
     onBackgroundChange, onToolChange, onLayersChange, uploadFn }, ref) => {

    const canvasElRef   = useRef<HTMLCanvasElement>(null);
    const wrapperRef    = useRef<HTMLDivElement>(null);
    const fabricRef     = useRef<fabric.Canvas | null>(null);
    const mediaItemsRef = useRef<MediaItem[]>([]);
    const blobUrls       = useRef<string[]>([]);      // tracked for cleanup
    const gifStoppers    = useRef(new Map<string, () => void>()); // cancel GIF loops
    const isPanning     = useRef(false);
    const lastPtr       = useRef({ x: 0, y: 0 });
    const activeToolRef = useRef<Tool>(activeTool);
    const changeTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Frame drawing
    const frameCount      = useRef(0);
    const isDrawingFrame  = useRef(false);
    const frameOrigin     = useRef({ x: 0, y: 0 });
    const tempFrame       = useRef<fabric.Rect | null>(null);
    const drawTooltip     = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

    // Frame child tracking — maps frameId → last known canvas position
    const framePosRef = useRef(new Map<string, { left: number; top: number }>());

    // History
    const history    = useRef<string[]>([]);
    const historyIdx = useRef(-1);
    const isRestoring = useRef(false);

    // Internal clipboard
    const internalClip = useRef<fabric.Object | null>(null);

    // Frame name edit overlay
    const [editingFrame, setEditingFrame] = useState<{
      id: string; name: string; sx: number; sy: number;
    } | null>(null);

    // Drag-over highlight
    const [isDragOver, setIsDragOver] = useState(false);

    // Stable refs for late-binding callbacks
    const onToolChangeRef   = useRef(onToolChange);
    const onLayersChangeRef = useRef(onLayersChange);
    const uploadFnRef       = useRef(uploadFn);
    const canEditRef        = useRef(role !== 'viewer');
    const scheduleRef       = useRef<() => void>(() => {});

    useEffect(() => { onToolChangeRef.current   = onToolChange;   }, [onToolChange]);
    useEffect(() => { onLayersChangeRef.current = onLayersChange; }, [onLayersChange]);
    useEffect(() => { uploadFnRef.current       = uploadFn;       }, [uploadFn]);
    useEffect(() => { canEditRef.current        = role !== 'viewer'; }, [role]);

    // ── History ──────────────────────────────────────────────────────────────
    const pushHistory = useCallback(() => {
      if (isRestoring.current) return;
      const canvas = fabricRef.current;
      if (!canvas) return;
      const snap = JSON.stringify(canvas.toJSON(['data', 'id', 'selectable', 'evented']));
      history.current = history.current.slice(0, historyIdx.current + 1);
      history.current.push(snap);
      if (history.current.length > 60) history.current.shift();
      else historyIdx.current++;
    }, []);

    // ── Debounced save ───────────────────────────────────────────────────────
    const scheduleChange = useCallback(() => {
      if (changeTimer.current) clearTimeout(changeTimer.current);
      changeTimer.current = setTimeout(() => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const json = canvas.toJSON(['data', 'id', 'selectable', 'evented']);
        const filtered = (json.objects as any[]).filter(
          (o: any) => !['gif', 'mp4', 'webm'].includes(o?.data?.mediaType)
        );
        onCanvasChange({ fabricData: { ...json, objects: filtered }, mediaItems: mediaItemsRef.current });
      }, 800);
    }, [onCanvasChange]);

    useEffect(() => { scheduleRef.current = scheduleChange; }, [scheduleChange]);

    // ── Frame clip helper ────────────────────────────────────────────────────
    const makeClipRect = (frame: fabric.Object): fabric.Rect =>
      new fabric.Rect({
        left:   frame.left ?? 0,
        top:    frame.top  ?? 0,
        width:  (frame.width  ?? 0) * (frame.scaleX ?? 1),
        height: (frame.height ?? 0) * (frame.scaleY ?? 1),
        absolutePositioned: true,
      } as any);

    // ── Re-parenting ─────────────────────────────────────────────────────────
    const reparentObject = useCallback((obj: fabric.Object, newFrame: fabric.Object | null) => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const currentFrameId = (obj as any).data?.frameId ?? null;
      const newFrameId     = (newFrame as any)?.data?.id ?? null;
      if (currentFrameId === newFrameId) return;

      // Remove from old frame
      if (currentFrameId) {
        const oldFrame = canvas.getObjects().find(o => (o as any).data?.id === currentFrameId);
        if (oldFrame) {
          (oldFrame as any).data = {
            ...(oldFrame as any).data,
            children: ((oldFrame as any).data.children ?? []).filter(
              (id: string) => id !== (obj as any).data?.id
            ),
          };
        }
        (obj as any).clipPath = null;
      }

      if (newFrame) {
        const objId   = (obj as any).data?.id ?? uuidv4();
        const kids    = (newFrame as any).data.children ?? [];
        (newFrame as any).data = {
          ...(newFrame as any).data,
          children: kids.includes(objId) ? kids : [...kids, objId],
        };
        (obj as any).data = {
          ...(obj as any).data,
          id:      objId,
          frameId: newFrameId,
          localX:  (obj.left ?? 0) - (newFrame.left ?? 0),
          localY:  (obj.top  ?? 0) - (newFrame.top  ?? 0),
        };
        (obj as any).clipPath = makeClipRect(newFrame);
      } else {
        (obj as any).data = {
          ...(obj as any).data,
          frameId: null, localX: undefined, localY: undefined,
        };
        (obj as any).clipPath = null;
      }

      canvas.renderAll();
    }, []);

    // ── Center-point drop-target resolver ─────────────────────────────────
    const getDropTarget = useCallback((obj: fabric.Object): fabric.Object | null => {
      const canvas = fabricRef.current;
      if (!canvas) return null;
      const cx = (obj.left ?? 0) + obj.getScaledWidth()  / 2;
      const cy = (obj.top  ?? 0) + obj.getScaledHeight() / 2;
      const frames = canvas.getObjects().filter(
        o => (o as any).data?.type === 'frame' && o !== obj
      );
      return [...frames].reverse().find(f => {
        const fw = (f.width  ?? 0) * (f.scaleX ?? 1);
        const fh = (f.height ?? 0) * (f.scaleY ?? 1);
        return cx >= (f.left ?? 0) && cx <= (f.left ?? 0) + fw
            && cy >= (f.top  ?? 0) && cy <= (f.top  ?? 0) + fh;
      }) ?? null;
    }, []);

    // ── Frame name overlay ───────────────────────────────────────────────────
    const showFrameNameEdit = useCallback((frame: fabric.Object) => {
      const canvas  = fabricRef.current;
      const wrapper = wrapperRef.current;
      if (!canvas || !wrapper) return;
      const zoom = canvas.getZoom();
      const vpt  = canvas.viewportTransform!;
      const cRect = canvas.getElement().getBoundingClientRect();
      const wRect = wrapper.getBoundingClientRect();
      const sx = (frame.left ?? 0) * zoom + vpt[4] + (cRect.left - wRect.left);
      const sy = (frame.top  ?? 0) * zoom + vpt[5] + (cRect.top  - wRect.top) - 22;
      setEditingFrame({
        id:   (frame as any).data?.id,
        name: (frame as any).data?.frameName ?? 'Frame',
        sx, sy,
      });
    }, []);

    // ── Create finalised frame ────────────────────────────────────────────────
    const createFrameObject = useCallback(
      (canvas: fabric.Canvas, x: number, y: number, w: number, h: number): fabric.Rect => {
        const id   = uuidv4();
        const name = `Frame ${frameCount.current + 1}`;
        const frame = new fabric.Rect({
          left: x, top: y, width: w, height: h,
          fill: 'rgba(255,255,255,0)',
          stroke: 'rgba(100,100,255,0.6)', strokeWidth: 1,
          selectable: true, evented: true,
          data: { id, type: 'frame', objectType: 'frame', frameName: name, children: [], clipContent: true },
        } as any);
        canvas.add(frame);
        canvas.setActiveObject(frame);
        frameCount.current++;
        framePosRef.current.set(id, { left: x, top: y });
        canvas.renderAll();
        scheduleRef.current();
        pushHistory();
        return frame;
      },
      [pushHistory]
    );

    // ── Imperative handle ────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      addMedia: (url, mimeType, file) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        if (mimeType === 'image/gif') {
          addGif(canvas, url, undefined, undefined, file);
        } else if (mimeType === 'video/mp4' || mimeType === 'video/webm') {
          addVideo(canvas, url, mimeType === 'video/webm' ? 'webm' : 'mp4');
        } else {
          // PNG, JPG, WebP, SVG, data URLs — add as static image
          addImageUrl(canvas, url);
        }
      },
      addText:     () => { if (fabricRef.current) addTextAtCenter(fabricRef.current); },
      exportFrame: () => fabricRef.current?.toDataURL({ format: 'png', multiplier: 1 }) ?? '',
      getCanvas:   () => fabricRef.current,
      setBackground: (color) => {
        const c = fabricRef.current; if (!c) return;
        c.setBackgroundColor(color, () => c.renderAll());
        onBackgroundChange?.(color); scheduleRef.current();
      },
      getBackground: () => (fabricRef.current?.backgroundColor as string) ?? DEFAULT_BG,
      undo: () => {
        if (historyIdx.current <= 0) return;
        historyIdx.current--;
        isRestoring.current = true;
        fabricRef.current?.loadFromJSON(JSON.parse(history.current[historyIdx.current]), () => {
          fabricRef.current?.renderAll();
          isRestoring.current = false;
          onObjectSelect(null);
        });
      },
      redo: () => {
        if (historyIdx.current >= history.current.length - 1) return;
        historyIdx.current++;
        isRestoring.current = true;
        fabricRef.current?.loadFromJSON(JSON.parse(history.current[historyIdx.current]), () => {
          fabricRef.current?.renderAll();
          isRestoring.current = false;
          onObjectSelect(null);
        });
      },
      copy: () => {
        const obj = fabricRef.current?.getActiveObject();
        if (obj) obj.clone((c: fabric.Object) => { internalClip.current = c; });
      },
      paste: () => {
        const canvas = fabricRef.current;
        if (!canvas || !internalClip.current) return;
        internalClip.current.clone((c: fabric.Object) => {
          c.set({ left: (c.left ?? 0) + 20, top: (c.top ?? 0) + 20 });
          canvas.add(c); canvas.setActiveObject(c); canvas.renderAll();
          internalClip.current = c;
          scheduleRef.current(); pushHistory();
        });
      },
    }));

    // ── Add static image by URL ──────────────────────────────────────────────
    const addImageUrl = useCallback((
      canvas: fabric.Canvas, url: string, pos?: { x: number; y: number }
    ) => {
      fabric.Image.fromURL(url, (img) => {
        if (!img) { console.error('Image failed to load:', url.slice(0, 80)); return; }
        // Use natural dimensions — no size cap
        const sw = (img.width  ?? 0) * (img.scaleX ?? 1);
        const sh = (img.height ?? 0) * (img.scaleY ?? 1);
        img.set({
          left: pos?.x ?? canvas.width!  / 2 - sw / 2,
          top:  pos?.y ?? canvas.height! / 2 - sh / 2,
          data: { id: uuidv4(), objectType: 'image' },
        } as any);
        canvas.add(img); canvas.setActiveObject(img);
        canvas.renderAll(); scheduleRef.current(); pushHistory();
      }, { crossOrigin: 'anonymous' });
    }, [pushHistory]);

    // ── Canvas init ──────────────────────────────────────────────────────────
    useEffect(() => {
      const el = canvasElRef.current;
      if (!el) return;

      const canvas = new fabric.Canvas(el, {
        width: board.width, height: board.height,
        backgroundColor: DEFAULT_BG,
        preserveObjectStacking: true, selection: true, renderOnAddRemove: true,
      });
      fabricRef.current = canvas;
      onCanvasReady?.(canvas);

      // Load saved state
      try {
        const saved: CanvasData = board.canvas_data
          ? JSON.parse(board.canvas_data)
          : { fabricData: {}, mediaItems: [] };

        if (saved.fabricData && Object.keys(saved.fabricData).length > 0) {
          canvas.loadFromJSON(saved.fabricData, () => {
            canvas.renderAll();
            onBackgroundChange?.((canvas.backgroundColor as string) || DEFAULT_BG);
            canvas.getObjects().forEach(o => {
              if ((o as any).data?.type === 'frame') {
                frameCount.current++;
                framePosRef.current.set((o as any).data.id, { left: o.left ?? 0, top: o.top ?? 0 });
              }
            });
            pushHistory();
          });
        } else {
          onBackgroundChange?.(DEFAULT_BG);
          pushHistory();
        }

        if (saved.mediaItems?.length) {
          mediaItemsRef.current = saved.mediaItems;
          saved.mediaItems.forEach(item => addMediaFn(canvas, item.url, item.type, item));
        }
      } catch (e) {
        console.warn('Canvas parse error', e);
        onBackgroundChange?.(DEFAULT_BG);
        pushHistory();
      }

      // ── Scroll-to-zoom ────────────────────────────────────────────────────
      canvas.on('mouse:wheel', (opt) => {
        let zoom = canvas.getZoom() * (0.999 ** opt.e.deltaY);
        zoom = Math.max(0.05, Math.min(zoom, 8));
        canvas.zoomToPoint(new fabric.Point(opt.e.offsetX, opt.e.offsetY), zoom);
        opt.e.preventDefault(); opt.e.stopPropagation();
      });

      // ── Mouse down ────────────────────────────────────────────────────────
      canvas.on('mouse:down', (opt) => {
        const tool = activeToolRef.current;

        if (tool === 'hand') {
          isPanning.current = true;
          lastPtr.current   = { x: opt.e.clientX, y: opt.e.clientY };
          canvas.setCursor('grabbing');
          return;
        }

        if (tool === 'frame' && canEditRef.current) {
          isDrawingFrame.current = true;
          const ptr = canvas.getPointer(opt.e);
          frameOrigin.current = { x: ptr.x, y: ptr.y };
          const preview = new fabric.Rect({
            left: ptr.x, top: ptr.y, width: 1, height: 1,
            fill: 'transparent',
            stroke: '#0066FF', strokeWidth: 1.5,
            strokeDashArray: [6, 4],
            selectable: false, evented: false,
            data: { type: 'frame-preview' },
          } as any);
          tempFrame.current = preview;
          canvas.add(preview);
          canvas.renderAll();
          return;
        }

        if (tool === 'text' && !opt.target && canEditRef.current) {
          const ptr  = canvas.getPointer(opt.e);
          const text = new fabric.IText('Type here', {
            left: ptr.x, top: ptr.y,
            fontFamily: 'Inter, sans-serif', fontSize: 32,
            fill: '#ffffff', fontWeight: '600', editable: true,
            data: { id: uuidv4(), objectType: 'text' },
          } as any);
          canvas.add(text); canvas.setActiveObject(text);
          text.enterEditing(); text.selectAll();
          canvas.renderAll(); scheduleRef.current(); pushHistory();
        }
      });

      // ── Mouse move ────────────────────────────────────────────────────────
      canvas.on('mouse:move', (opt) => {
        const tool = activeToolRef.current;

        if (tool === 'hand' && isPanning.current) {
          const vpt = canvas.viewportTransform!;
          vpt[4] += opt.e.clientX - lastPtr.current.x;
          vpt[5] += opt.e.clientY - lastPtr.current.y;
          lastPtr.current = { x: opt.e.clientX, y: opt.e.clientY };
          canvas.requestRenderAll();
          return;
        }

        if (tool === 'frame' && isDrawingFrame.current && tempFrame.current) {
          const ptr   = canvas.getPointer(opt.e);
          const { x: ox, y: oy } = frameOrigin.current;
          const l = Math.min(ptr.x, ox), t = Math.min(ptr.y, oy);
          const w = Math.abs(ptr.x - ox),  h = Math.abs(ptr.y - oy);
          tempFrame.current.set({ left: l, top: t, width: w, height: h });
          drawTooltip.current = { x: l, y: t, w, h };
          canvas.requestRenderAll();
        }
      });

      // ── Mouse up ──────────────────────────────────────────────────────────
      canvas.on('mouse:up', () => {
        if (activeToolRef.current === 'frame' && isDrawingFrame.current) {
          isDrawingFrame.current = false;
          drawTooltip.current   = null;
          const draft = tempFrame.current;
          tempFrame.current = null;

          if (draft) {
            canvas.remove(draft);
            const { x: ox, y: oy } = frameOrigin.current;
            const dw = draft.width  ?? 0;
            const dh = draft.height ?? 0;

            let frame: fabric.Rect;
            if (dw < 5 && dh < 5) {
              // Bare click → 100 × 100 centred on click point
              frame = createFrameObject(canvas, ox - 50, oy - 50, 100, 100);
            } else {
              frame = createFrameObject(
                canvas,
                Math.min(draft.left ?? ox, ox),
                Math.min(draft.top  ?? oy, oy),
                Math.max(dw, 5), Math.max(dh, 5)
              );
            }
            // Auto-enter name-edit mode after React has re-rendered
            setTimeout(() => showFrameNameEdit(frame), 30);
          }

          canvas.renderAll();
          onToolChangeRef.current?.('select');
          return;
        }
        isPanning.current = false;
      });

      // ── Move frame children with frame ────────────────────────────────────
      canvas.on('object:moving', (e) => {
        const obj = e.target as any;
        if (obj.data?.type !== 'frame') return;

        const id   = obj.data.id;
        const prev = framePosRef.current.get(id);
        if (!prev) {
          framePosRef.current.set(id, { left: obj.left ?? 0, top: obj.top ?? 0 });
          return;
        }

        const dx = (obj.left ?? 0) - prev.left;
        const dy = (obj.top  ?? 0) - prev.top;

        canvas.getObjects().forEach(child => {
          if ((child as any).data?.frameId !== id) return;
          child.set({ left: (child.left ?? 0) + dx, top: (child.top ?? 0) + dy });
          const cp = (child as any).clipPath as any;
          if (cp) cp.set({ left: (cp.left ?? 0) + dx, top: (cp.top ?? 0) + dy });
          child.setCoords();
        });

        framePosRef.current.set(id, { left: obj.left ?? 0, top: obj.top ?? 0 });
        canvas.requestRenderAll();
      });

      // ── Scale frame → update children clip paths ──────────────────────────
      canvas.on('object:scaling', (e) => {
        const obj = e.target as any;
        if (obj.data?.type !== 'frame') return;
        const id = obj.data.id;
        const fw = (obj.width  ?? 0) * (obj.scaleX ?? 1);
        const fh = (obj.height ?? 0) * (obj.scaleY ?? 1);
        canvas.getObjects().forEach(child => {
          if ((child as any).data?.frameId !== id) return;
          const cp = (child as any).clipPath as any;
          if (cp) cp.set({ left: obj.left, top: obj.top, width: fw, height: fh });
        });
        canvas.requestRenderAll();
      });

      // ── Frame labels + drawing tooltip ────────────────────────────────────
      canvas.on('after:render', () => {
        const ctx  = canvas.getContext();
        const zoom = canvas.getZoom();
        const vpt  = canvas.viewportTransform!;

        // Render name label above each frame
        canvas.getObjects().forEach(obj => {
          if ((obj as any).data?.type !== 'frame') return;
          const sx = (obj.left ?? 0) * zoom + vpt[4];
          const sy = (obj.top  ?? 0) * zoom + vpt[5] - 6;
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.font = '500 11px Inter, system-ui, sans-serif';
          ctx.fillStyle = 'rgba(232,232,232,0.85)';
          ctx.fillText((obj as any).data?.frameName ?? 'Frame', sx, sy);
          ctx.restore();
        });

        // Dimensions tooltip while drawing
        if (drawTooltip.current) {
          const { x, y, w, h } = drawTooltip.current;
          const label = `${Math.round(w)} × ${Math.round(h)}`;
          const sx = (x + w) * zoom + vpt[4];
          const sy = (y + h) * zoom + vpt[5] + 10;

          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.font = '11px Inter, system-ui, sans-serif';
          const tw = ctx.measureText(label).width;
          const px = 8;

          ctx.fillStyle = '#0A84FF';
          ctx.beginPath();
          ctx.roundRect(sx - px, sy, tw + px * 2, 18, 3);
          ctx.fill();

          ctx.fillStyle = '#fff';
          ctx.textAlign = 'left';
          ctx.fillText(label, sx, sy + 13);
          ctx.restore();
        }
      });

      // ── Selection ─────────────────────────────────────────────────────────
      const trackFramePos = (obj?: fabric.Object) => {
        if (obj && (obj as any).data?.type === 'frame') {
          framePosRef.current.set((obj as any).data.id, { left: obj.left ?? 0, top: obj.top ?? 0 });
        }
      };
      canvas.on('selection:created', e => { onObjectSelect(e.selected?.[0] ?? null); trackFramePos(e.selected?.[0]); });
      canvas.on('selection:updated', e => { onObjectSelect(e.selected?.[0] ?? null); trackFramePos(e.selected?.[0]); });
      canvas.on('selection:cleared', () => onObjectSelect(null));

      // ── object:modified — re-parent + sync clip paths ─────────────────────
      canvas.on('object:modified', (e) => {
        const obj = e.target as any;

        if (obj.data?.type === 'frame') {
          // Sync position cache + update clip paths for children
          framePosRef.current.set(obj.data.id, { left: obj.left ?? 0, top: obj.top ?? 0 });
          const fw = (obj.width  ?? 0) * (obj.scaleX ?? 1);
          const fh = (obj.height ?? 0) * (obj.scaleY ?? 1);
          canvas.getObjects().forEach(child => {
            if ((child as any).data?.frameId !== obj.data.id) return;
            (child as any).data = {
              ...(child as any).data,
              localX: (child.left ?? 0) - (obj.left ?? 0),
              localY: (child.top  ?? 0) - (obj.top  ?? 0),
            };
            const cp = (child as any).clipPath as any;
            if (cp) cp.set({ left: obj.left, top: obj.top, width: fw, height: fh });
          });
        } else if (canEditRef.current) {
          // Re-parenting: center-point hit-test
          const target = getDropTarget(obj);
          reparentObject(obj, target);
        }

        pushHistory();
        scheduleRef.current();
        onLayersChangeRef.current?.();
      });

      canvas.on('object:added',   () => { if (!isRestoring.current) { scheduleRef.current(); onLayersChangeRef.current?.(); } });
      canvas.on('object:removed', (e) => {
        if (!isRestoring.current) { scheduleRef.current(); onLayersChangeRef.current?.(); }
        // Stop GIF animation for removed object
        const id = (e.target as any)?.data?.id;
        if (id && gifStoppers.current.has(id)) {
          gifStoppers.current.get(id)!();
          gifStoppers.current.delete(id);
        }
      });

      return () => {
        gifStoppers.current.forEach(stop => stop());
        gifStoppers.current.clear();
        if (changeTimer.current) clearTimeout(changeTimer.current);
        blobUrls.current.forEach(u => URL.revokeObjectURL(u));
        blobUrls.current = [];
        canvas.dispose();
        fabricRef.current = null;
      };
    }, []); // eslint-disable-line

    // ── Tool changes ─────────────────────────────────────────────────────────
    useEffect(() => {
      activeToolRef.current = activeTool;
      const canvas = fabricRef.current;
      if (!canvas) return;
      const editable = role !== 'viewer';

      if (activeTool === 'hand') {
        canvas.isDrawingMode = false; canvas.selection = false;
        canvas.defaultCursor = 'grab'; canvas.hoverCursor = 'grab';
        canvas.getObjects().forEach(o => { o.selectable = false; o.evented = false; });
      } else if (activeTool === 'frame') {
        canvas.isDrawingMode = false; canvas.selection = false;
        canvas.defaultCursor = 'crosshair'; canvas.hoverCursor = 'crosshair';
        canvas.getObjects().forEach(o => { o.selectable = false; o.evented = false; });
      } else {
        canvas.isDrawingMode = false; canvas.selection = editable;
        canvas.defaultCursor = activeTool === 'text' ? 'text' : 'default';
        canvas.hoverCursor   = activeTool === 'text' ? 'text' : 'move';
        canvas.getObjects().forEach(o => { o.selectable = editable; o.evented = true; });
      }
      canvas.renderAll();
    }, [activeTool, role]);

    // ── Clipboard paste ───────────────────────────────────────────────────────
    useEffect(() => {
      const onPaste = async (e: ClipboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        const canvas = fabricRef.current;
        if (!canvas || !canEditRef.current) return;

        const items = Array.from(e.clipboardData?.items ?? []);

        // 1. SVG — highest fidelity from Figma "Copy as SVG"
        const svgItem = items.find(i => i.type === 'image/svg+xml');
        if (svgItem) {
          e.preventDefault();
          const blob = svgItem.getAsFile();
          if (!blob) return;
          const text = await blob.text();
          (fabric as any).loadSVGFromString(text, (objects: any[], options: any) => {
            if (!objects.length) return;
            const svg = (fabric.util as any).groupSVGElements(objects, options);
            svg.set({
              left: canvas.width!  / 2 - ((svg.width  ?? 100) / 2),
              top:  canvas.height! / 2 - ((svg.height ?? 100) / 2),
              data: { id: uuidv4(), objectType: 'svg' },
            });
            canvas.add(svg); canvas.setActiveObject(svg);
            canvas.renderAll(); scheduleRef.current(); pushHistory();
          });
          return;
        }

        // 2. PNG / JPEG — natural dimensions, data URL (no server upload)
        const imgItem = items.find(i => i.type.startsWith('image/'));
        if (imgItem) {
          e.preventDefault();
          const blob = imgItem.getAsFile();
          if (!blob) return;
          const reader = new FileReader();
          reader.onload = () => addImageUrl(canvas, reader.result as string);
          reader.readAsDataURL(blob);
          return;
        }

        // 3. Plain text → IText node
        const textItem = items.find(i => i.type === 'text/plain');
        if (textItem) {
          textItem.getAsString(str => {
            if (!str.trim()) return;
            const vpt = canvas.viewportTransform!;
            const cx  = (canvas.width!  / 2 - vpt[4]) / vpt[0];
            const cy  = (canvas.height! / 2 - vpt[5]) / vpt[3];
            const t = new fabric.IText(str.trim(), {
              left: cx - 50, top: cy - 20,
              fontFamily: 'Inter, sans-serif', fontSize: 24, fill: '#1a1a1a',
              data: { id: uuidv4(), objectType: 'text' },
            } as any);
            canvas.add(t); canvas.setActiveObject(t);
            canvas.renderAll(); scheduleRef.current(); pushHistory();
          });
          return;
        }

        // 4. Internal clipboard fallback
        if (internalClip.current) {
          internalClip.current.clone((c: fabric.Object) => {
            c.set({ left: (c.left ?? 0) + 20, top: (c.top ?? 0) + 20 });
            canvas.add(c); canvas.setActiveObject(c); canvas.renderAll();
            internalClip.current = c;
            scheduleRef.current(); pushHistory();
          });
        }
      };

      window.addEventListener('paste', onPaste);
      return () => window.removeEventListener('paste', onPaste);
    }, [addImageUrl, pushHistory]);

    // ── Media helpers ─────────────────────────────────────────────────────────
    const addMediaFn = (
      canvas: fabric.Canvas, url: string, type: 'gif'|'mp4'|'webm',
      saved?: Partial<MediaItem>, pos?: { x: number; y: number }
    ) => {
      if (type === 'gif') addGif(canvas, url, saved, pos);
      else addVideo(canvas, url, type, saved, pos);
    };

    const addGif = (
      canvas: fabric.Canvas, url: string,
      saved?: Partial<MediaItem>, pos?: { x: number; y: number },
      sourceFile?: File
    ) => {
      const id = saved?.id ?? uuidv4();

      // Build display URL — blob for local file, raw URL otherwise
      const displayUrl = sourceFile
        ? (() => { const b = URL.createObjectURL(sourceFile); blobUrls.current.push(b); return b; })()
        : url;

      if (!displayUrl) return; // nothing to load

      const imgEl = new window.Image();
      // ── CRITICAL: do NOT set crossOrigin here. ───────────────────────────────
      // crossOrigin='anonymous' causes a silent onerror on any server that doesn't
      // return CORS headers (most CDNs, imgur, giphy direct links, etc.).
      // We never call getImageData / toDataURL on the GIF off-screen canvas, so
      // canvas taint is not a problem for display.

      imgEl.onload = () => {
        const w = imgEl.naturalWidth  || 200;
        const h = imgEl.naturalHeight || 200;

        // Off-screen canvas: each rAF tick we fill white then drawImage(imgEl).
        // White fill prevents transparent-pixel bleed-through between frames.
        const offCanvas = document.createElement('canvas');
        offCanvas.width  = w;
        offCanvas.height = h;
        const offCtx = offCanvas.getContext('2d')!;
        offCtx.fillStyle = '#ffffff';
        offCtx.fillRect(0, 0, w, h);
        offCtx.drawImage(imgEl, 0, 0, w, h);

        const fabricImg = new fabric.Image(offCanvas as any, {
          left:    saved?.left   ?? pos?.x ?? canvas.width!  / 2 - w / 2,
          top:     saved?.top    ?? pos?.y ?? canvas.height! / 2 - h / 2,
          scaleX:  saved?.scaleX ?? 1,
          scaleY:  saved?.scaleY ?? 1,
          angle:   saved?.angle  ?? 0,
          opacity: saved?.opacity ?? 1,
          objectCaching: false,
          data: { id, mediaType: 'gif', url },
        } as any);

        canvas.add(fabricImg);
        canvas.sendToBack(fabricImg);

        if (!saved?.id) {
          mediaItemsRef.current.push({
            id, type: 'gif', url,
            left: fabricImg.left!, top: fabricImg.top!,
            width: w, height: h,
            scaleX: 1, scaleY: 1, angle: 0, opacity: 1,
          });
          scheduleRef.current();
        }

        let cancelled = false;
        gifStoppers.current.set(id, () => {
          cancelled = true;
          if (imgEl.parentNode) imgEl.parentNode.removeChild(imgEl);
        });

        // rAF loop: copy current animated frame from imgEl → offCanvas → Fabric
        const tick = () => {
          if (cancelled) return;
          offCtx.fillStyle = '#ffffff';
          offCtx.fillRect(0, 0, w, h);
          offCtx.drawImage(imgEl, 0, 0, w, h);
          (fabricImg as any).dirty = true;
          canvas.requestRenderAll();
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      };

      imgEl.onerror = () => {
        console.error('GIF failed to load:', displayUrl);
        if (imgEl.parentNode) imgEl.parentNode.removeChild(imgEl);
      };

      // ── CRITICAL ORDER ────────────────────────────────────────────────────────
      // 1. Set src FIRST — browser starts fetching the GIF immediately.
      // 2. THEN append to DOM — registers the element with the browser's GIF
      //    animation engine so frames advance.
      //
      // WRONG order (what caused the "Failed to load GIF" alert):
      //   appendChild(imgEl)  → browser fires onerror for missing src
      //   imgEl.src = url     → too late; element already removed by onerror
      //
      // RIGHT order (below): src is already set when the element enters the DOM,
      // so no empty-src error fires and animation starts as soon as onload fires.
      // Must be inside the viewport — Chrome/Safari pause GIF animation for fixed
      // elements positioned outside the visible area (e.g. left:-99999px).
      // z-index:-9999 puts it behind the entire app so it's never seen.
      // opacity:0.01 (not 0) keeps the browser's animation engine running —
      // opacity:0 is treated as "hidden" and frames stop advancing.
      imgEl.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:-9999;opacity:0.01;';
      imgEl.src = displayUrl;                // ← src FIRST
      document.body.appendChild(imgEl);      // ← DOM second
    };

    const addVideo = (
      canvas: fabric.Canvas, url: string, type: 'mp4'|'webm',
      saved?: Partial<MediaItem>, pos?: { x: number; y: number }
    ) => {
      const id = saved?.id ?? uuidv4();
      const v  = document.createElement('video');
      v.src = url; v.loop = true; v.muted = true; v.autoplay = true; v.playsInline = true; v.crossOrigin = 'anonymous';
      v.addEventListener('loadeddata', () => {
        v.play().catch(console.warn);
        const img = new fabric.Image(v as any, {
          left:   saved?.left   ?? pos?.x ?? canvas.width!  / 2 - v.videoWidth  / 2,
          top:    saved?.top    ?? pos?.y ?? canvas.height! / 2 - v.videoHeight / 2,
          scaleX: saved?.scaleX ?? 1, scaleY: saved?.scaleY ?? 1,
          angle:  saved?.angle  ?? 0, opacity: saved?.opacity ?? 1,
          objectCaching: false, data: { id, mediaType: type, url },
        } as any);
        canvas.add(img); canvas.sendToBack(img);
        if (!saved?.id) {
          mediaItemsRef.current.push({ id, type, url, left: img.left!, top: img.top!, width: v.videoWidth, height: v.videoHeight, scaleX: 1, scaleY: 1, angle: 0, opacity: 1 });
          scheduleRef.current();
        }
        let videoCancelled = false;
        gifStoppers.current.set(id, () => { videoCancelled = true; v.pause(); });
        const loop = () => {
          if (videoCancelled) return;
          if (!v.paused) { (img as fabric.Image).dirty = true; canvas.requestRenderAll(); }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      }, { once: true });
      v.load();
    };

    const addTextAtCenter = (canvas: fabric.Canvas) => {
      const vpt = canvas.viewportTransform!;
      const cx  = (canvas.width!  / 2 - vpt[4]) / vpt[0];
      const cy  = (canvas.height! / 2 - vpt[5]) / vpt[3];
      const t   = new fabric.IText('Add text', {
        left: cx - 50, top: cy - 20,
        fontFamily: 'Inter, sans-serif', fontSize: 32,
        fill: '#1a1a1a', fontWeight: '600',
        data: { id: uuidv4(), objectType: 'text' },
      } as any);
      canvas.add(t); canvas.setActiveObject(t);
      t.enterEditing(); t.selectAll();
      canvas.renderAll(); scheduleRef.current(); pushHistory();
    };

    // ── Drag and drop ─────────────────────────────────────────────────────────
    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
      if (!isDragOver) setIsDragOver(true);
    };
    const handleDragLeave = (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
    };
    const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault(); setIsDragOver(false);
      const canvas = fabricRef.current;
      if (!canvas || !canEditRef.current) return;
      const rect  = canvas.getElement().getBoundingClientRect();
      const zoom  = canvas.getZoom();
      const vpt   = canvas.viewportTransform!;
      const dropX = (e.clientX - rect.left - vpt[4]) / zoom;
      const dropY = (e.clientY - rect.top  - vpt[5]) / zoom;

      if (e.dataTransfer.files.length > 0) {
        for (const file of Array.from(e.dataTransfer.files)) {
          if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;

          // GIF: local blob URL — instant, no server round-trip
          if (file.type === 'image/gif') {
            addGif(canvas, '', undefined, { x: dropX, y: dropY }, file);
            continue;
          }

          // Static image: FileReader data URL — instant + persists in canvas JSON
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = () => addImageUrl(canvas, reader.result as string, { x: dropX, y: dropY });
            reader.readAsDataURL(file);
            continue;
          }

          // Video: must upload to server for streaming
          if (uploadFnRef.current) {
            try {
              const r = await uploadFnRef.current(file);
              const t = r.mimetype === 'video/webm' ? 'webm' : 'mp4';
              addVideo(canvas, r.url, t, undefined, { x: dropX, y: dropY });
            } catch (err) { console.error('Drop upload failed:', err); }
          }
        }
        return;
      }

      const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        addImageUrl(canvas, url, { x: dropX, y: dropY });
      }
    };

    return (
      <div
        ref={wrapperRef}
        className="w-full h-full flex items-center justify-center overflow-hidden relative"
        style={{
          background:    isDragOver ? 'rgba(123,104,238,0.1)' : 'var(--bg-surround)',
          transition:    'background 0.12s',
          outline:       isDragOver ? '2px dashed rgba(123,104,238,0.6)' : 'none',
          outlineOffset: '-2px',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
            <div className="rounded-xl px-5 py-2.5 text-sm font-semibold shadow-lg"
              style={{ background: 'rgba(123,104,238,0.9)', color: '#fff' }}>
              Drop to add
            </div>
          </div>
        )}

        {/* Frame name edit overlay — auto-shown after frame creation */}
        {editingFrame && (
          <input
            autoFocus
            className="absolute z-20 text-xs font-medium rounded"
            style={{
              left:       editingFrame.sx,
              top:        editingFrame.sy,
              background: 'rgba(22,22,22,0.9)',
              border:     '1px solid var(--accent)',
              color:      'rgba(232,232,232,0.9)',
              padding:    '2px 6px',
              minWidth:   80,
              outline:    'none',
            }}
            value={editingFrame.name}
            onChange={e => {
              const name = e.target.value;
              setEditingFrame(prev => prev ? { ...prev, name } : null);
              const frame = fabricRef.current?.getObjects().find(
                o => (o as any).data?.id === editingFrame.id
              );
              if (frame) {
                (frame as any).data = { ...(frame as any).data, frameName: name };
                fabricRef.current?.renderAll();
              }
            }}
            onBlur={() => { setEditingFrame(null); scheduleRef.current(); }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                setEditingFrame(null); scheduleRef.current();
              }
              e.stopPropagation();
            }}
          />
        )}

        <div style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 12px 60px rgba(0,0,0,0.5)' }}>
          <canvas ref={canvasElRef} />
        </div>
      </div>
    );
  }
);

CanvasEditor.displayName = 'CanvasEditor';
export default CanvasEditor;
