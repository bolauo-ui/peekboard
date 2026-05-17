import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useState } from 'react';
import { fabric } from 'fabric';
import type { Board, MediaItem, CanvasData, Tool } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { parseGIF, decompressFrames } from 'gifuct-js';
import { applyAutoLayout, getAutoLayout, relayoutForChild } from '@/components/canvas/autoLayout';

export interface CanvasEditorHandle {
  addMedia:      (url: string, mimeType: string, file?: File) => void;
  addText:       () => void;
  exportFrame:   (format?: 'png' | 'jpeg' | 'svg') => string;
  exportGif:     () => Promise<string>;   // animated GIF — async (captures live frames)
  getCanvas:     () => fabric.Canvas | null;
  setBackground: (color: string) => void;
  getBackground: () => string;
  undo:  () => void;
  redo:  () => void;
  copy:  () => void;
  paste: () => void;
  flushSave: () => void;     // immediate save (Cmd+S, manual)
  applyAutoLayoutTo: (frame: fabric.Object) => void; // re-run after panel edits
  zoomIn:     () => void;
  zoomOut:    () => void;
  zoomTo:     (level: number) => void;       // e.g. 0.5, 1, 2
  zoomToFit:  () => void;
  getZoom:    () => number;
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
  onZoomChange?:       (zoom: number) => void;
  onCanvasChangeKeepAlive?: (data: CanvasData) => void;  // for pagehide
  uploadFn?:           (file: File) => Promise<{ url: string; mimetype: string }>;
  // Receives a JPEG data-URL snapshot of the canvas, throttled to once
  // every ~30 s while the user is editing. Parent uploads it via
  // boardsApi.thumbnail so it shows on the dashboard.
  onThumbnail?:        (dataUrl: string) => void;
}

const DEFAULT_BG = '#f0f0f0';

// Fabric.js has a bug in `stylesToArray` where it crashes on `undefined`
// line entries in a text object's `styles` map. This helper scrubs those
// before every serialisation call so the board never crashes on save.
function sanitiseTextStyles(canvas: fabric.Canvas) {
  const walk = (obj: any) => {
    if (obj?.styles && typeof obj.styles === 'object') {
      for (const lineKey of Object.keys(obj.styles)) {
        if (obj.styles[lineKey] == null) {
          delete obj.styles[lineKey];
        } else if (typeof obj.styles[lineKey] === 'object') {
          for (const charKey of Object.keys(obj.styles[lineKey])) {
            if (obj.styles[lineKey][charKey] == null) {
              delete obj.styles[lineKey][charKey];
            }
          }
        }
      }
    }
    // Recurse into groups
    if (typeof obj?.getObjects === 'function') {
      (obj as fabric.Group).getObjects().forEach(walk);
    }
  };
  canvas.getObjects().forEach(walk);
}

const CanvasEditor = forwardRef<CanvasEditorHandle, Props>(
  ({ board, activeTool, role, onObjectSelect, onCanvasChange, onCanvasReady,
     onBackgroundChange, onToolChange, onLayersChange, onZoomChange,
     onCanvasChangeKeepAlive, uploadFn, onThumbnail }, ref) => {

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

    // Which frame is currently hovered (for blue outline on hover)
    const hoveredFrameIdRef = useRef<string | null>(null);

    // Which frame is currently the drop-target while dragging an object
    const dropTargetFrameIdRef = useRef<string | null>(null);

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
      try {
        sanitiseTextStyles(canvas);
        const snap = JSON.stringify(canvas.toJSON(['data', 'id', 'selectable', 'evented']));
        history.current = history.current.slice(0, historyIdx.current + 1);
        history.current.push(snap);
        if (history.current.length > 60) history.current.shift();
        else historyIdx.current++;
      } catch (e) {
        console.warn('[history] skipped snapshot due to serialisation error', e);
      }
    }, []);

    // ── Debounced save ───────────────────────────────────────────────────────
    // Build the CanvasData payload directly from the current canvas state.
    // Used by both the debounced path and the immediate flush-on-hide path.
    const buildPayload = useCallback((): CanvasData | null => {
      const canvas = fabricRef.current;
      if (!canvas) return null;
      sanitiseTextStyles(canvas);
      const json = canvas.toJSON(['data', 'id', 'selectable', 'evented']);
      const filtered = (json.objects as any[]).filter(
        (o: any) => !['gif', 'mp4', 'webm'].includes(o?.data?.mediaType)
      );
      const vpt = canvas.viewportTransform
        ? ([...canvas.viewportTransform] as CanvasData['viewport'])
        : undefined;
      return {
        fabricData: { ...json, objects: filtered },
        mediaItems: mediaItemsRef.current,
        viewport: vpt,
      };
    }, []);

    // Last time we emitted a thumbnail snapshot — used to throttle to
    // ~once every 30 s so we don't spam the upload endpoint mid-drag.
    const lastThumbAt = useRef<number>(0);

    const scheduleChange = useCallback(() => {
      if (changeTimer.current) clearTimeout(changeTimer.current);
      changeTimer.current = setTimeout(() => {
        const payload = buildPayload();
        if (!payload) return;
        onCanvasChange(payload);

        // Thumbnail snapshot — small JPEG of the canvas, throttled. Wrapped
        // in try/catch because toDataURL throws if any object on the canvas
        // was loaded from a tainted cross-origin source.
        const now = Date.now();
        if (onThumbnail && now - lastThumbAt.current > 30_000) {
          const c = fabricRef.current;
          if (c) {
            try {
              const dataUrl = c.toDataURL({ format: 'jpeg', quality: 0.6, multiplier: 0.25 });
              if (dataUrl && dataUrl.length < 2_000_000) {
                lastThumbAt.current = now;
                onThumbnail(dataUrl);
              }
            } catch { /* tainted canvas — skip silently */ }
          }
        }
      }, 300);
    }, [onCanvasChange, onThumbnail]);

    useEffect(() => { scheduleRef.current = scheduleChange; }, [scheduleChange]);

    // ── Flush pending save on tab-hide / unload ──────────────────────────────
    // The debounced save can sit for up to ~1.8s before hitting the server.
    // If the user closes the tab inside that window their last edits are lost
    // and a refresh restores stale state. Flushing immediately on
    // `visibilitychange` (Chrome / Safari best-practice for "save on leave")
    // and on `pagehide` makes sure the very latest state always gets persisted.
    useEffect(() => {
      const flush = () => {
        if (changeTimer.current) {
          clearTimeout(changeTimer.current);
          changeTimer.current = null;
        }
        const payload = buildPayload();
        if (!payload) return;
        // Prefer the keep-alive path on unload so the request survives the
        // tab close. Axios uses XHR which the browser aborts on unload, so
        // a regular onCanvasChange here would drop the user's last edits.
        if (onCanvasChangeKeepAlive) onCanvasChangeKeepAlive(payload);
        else onCanvasChange(payload);
      };
      const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
      window.addEventListener('pagehide',      flush);
      document.addEventListener('visibilitychange', onVis);
      return () => {
        window.removeEventListener('pagehide',      flush);
        document.removeEventListener('visibilitychange', onVis);
      };
    }, [buildPayload, onCanvasChange, onCanvasChangeKeepAlive]);

    // ── Frame clip helper ────────────────────────────────────────────────────
    const makeClipRect = (frame: fabric.Object): fabric.Rect =>
      new fabric.Rect({
        left:   frame.left ?? 0,
        top:    frame.top  ?? 0,
        width:  (frame.width  ?? 0) * (frame.scaleX ?? 1),
        height: (frame.height ?? 0) * (frame.scaleY ?? 1),
        absolutePositioned: true,
      } as any);

    // ── Apply Figma-style selection appearance to all frame objects ───────────
    // Called after loadFromJSON (initial + undo/redo) so restored frames keep
    // the correct handle colours and hidden bounding-box styling.
    const applyFigmaFrameStyles = (canvas: fabric.Canvas) => {
      canvas.getObjects().forEach(o => {
        if ((o as any).data?.type !== 'frame') return;
        o.set({
          stroke:           'transparent',
          strokeWidth:       0,
          borderColor:      'transparent',
          cornerColor:      '#ffffff',
          cornerStrokeColor:'#0d99ff',
          cornerSize:        7,
          transparentCorners: false,
        } as any);
      });
    };

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
          stroke: 'transparent', strokeWidth: 0,
          selectable: true, evented: true,
          // Figma-style selection handles — hide Fabric bounding box, draw our own
          borderColor:      'transparent',
          cornerColor:      '#ffffff',
          cornerStrokeColor:'#0d99ff',
          cornerSize:        7,
          transparentCorners: false,
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

    // ── Helper: compute crop rect for the current frame (canvas CSS pixels) ──
    const getFrameCrop = (canvas: fabric.Canvas) => {
      const zoom = canvas.getZoom();
      const vpt  = canvas.viewportTransform!;
      const active = canvas.getActiveObject() as any;
      const frameObj: fabric.Object | undefined =
        (active?.data?.objectType === 'frame' ? active : undefined) ??
        (canvas.getObjects().find((o: any) => o.data?.objectType === 'frame') as fabric.Object | undefined);

      if (frameObj) {
        const fw = (frameObj as any).getScaledWidth?.() ?? (frameObj as any).width  as number;
        const fh = (frameObj as any).getScaledHeight?.() ?? (frameObj as any).height as number;
        return {
          cropLeft:   (frameObj as any).left * zoom + vpt[4],
          cropTop:    (frameObj as any).top  * zoom + vpt[5],
          cropWidth:  fw * zoom,
          cropHeight: fh * zoom,
        };
      }
      // Fallback: tight bounding box of all objects
      const objs = canvas.getObjects();
      let minX = 0, minY = 0, maxX = canvas.getWidth(), maxY = canvas.getHeight();
      if (objs.length) {
        minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
        objs.forEach(o => {
          const b = o.getBoundingRect(true);
          minX = Math.min(minX, b.left);           minY = Math.min(minY, b.top);
          maxX = Math.max(maxX, b.left + b.width); maxY = Math.max(maxY, b.top + b.height);
        });
      }
      return {
        cropLeft:   minX * zoom + vpt[4],
        cropTop:    minY * zoom + vpt[5],
        cropWidth:  (maxX - minX) * zoom,
        cropHeight: (maxY - minY) * zoom,
      };
    };

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
      exportFrame: (format: 'png' | 'jpeg' | 'svg' = 'png') => {
        const canvas = fabricRef.current;
        if (!canvas) return '';

        // SVG: return serialised markup as a data-URI
        if (format === 'svg') {
          return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(canvas.toSVG());
        }

        const { cropLeft, cropTop, cropWidth, cropHeight } = getFrameCrop(canvas);
        const zoom = canvas.getZoom();

        // Discard selection handles/borders before screenshotting, restore after
        const active = canvas.getActiveObject();
        canvas.discardActiveObject();
        canvas.renderAll();
        const result = canvas.toDataURL({
          format,
          quality:    format === 'jpeg' ? 0.95 : undefined,
          multiplier: 2 / zoom,
          left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight,
        });
        if (active) { canvas.setActiveObject(active); canvas.renderAll(); }
        return result;
      },

      exportGif: () => {
        const canvas = fabricRef.current;
        if (!canvas) return Promise.resolve('');

        return new Promise<string>(async (resolve) => {
          // Dynamic import so gif-encoder-2 only loads when needed
          const GIFEncoder = (await import('gif-encoder-2')).default;

          // Clear selection so borders don't appear in frames
          const prevActive = canvas.getActiveObject();
          canvas.discardActiveObject();
          canvas.renderAll();

          const zoom   = canvas.getZoom();
          const { cropLeft, cropTop, cropWidth, cropHeight } = getFrameCrop(canvas);

          // Output dimensions at 1× (gif-encoder-2 works at CSS pixel size)
          const outW = Math.round(cropWidth);
          const outH = Math.round(cropHeight);

          // Capture ~3 s of animation at 10 fps = 30 frames
          const FPS        = 10;
          const DURATION_S = 3;
          const FRAME_MS   = 1000 / FPS;
          const TOTAL      = FPS * DURATION_S;

          const encoder = new GIFEncoder(outW, outH, 'neuquant', true);
          encoder.setDelay(FRAME_MS);
          encoder.setRepeat(0);     // loop forever
          encoder.setQuality(10);   // 1=best, 20=fast
          encoder.start();

          // Scratch canvas we composite each frame onto at output size
          const scratch    = document.createElement('canvas');
          scratch.width    = outW;
          scratch.height   = outH;
          const scratchCtx = scratch.getContext('2d')!;

          // Lower canvas element — this is what fabric draws onto
          const lowerEl = canvas.getElement();

          let captured = 0;
          const captureFrame = () => {
            if (captured >= TOTAL) {
              encoder.finish();
              const buf  = encoder.out.getData() as Uint8Array;
              const blob = new Blob([buf.buffer as ArrayBuffer], { type: 'image/gif' });
              const url  = URL.createObjectURL(blob);
              // Restore previous selection
              if (prevActive) { canvas.setActiveObject(prevActive); canvas.renderAll(); }
              resolve(url);
              return;
            }

            // Force a fresh render then read the canvas pixels
            canvas.renderAll();
            scratchCtx.clearRect(0, 0, outW, outH);
            scratchCtx.drawImage(
              lowerEl,
              cropLeft, cropTop, cropWidth, cropHeight,  // src crop
              0, 0, outW, outH,                           // dst full
            );
            encoder.addFrame(scratchCtx);
            captured++;
            setTimeout(captureFrame, FRAME_MS);
          };

          captureFrame();
        });
      },
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
        const canvas = fabricRef.current;
        canvas?.loadFromJSON(JSON.parse(history.current[historyIdx.current]), () => {
          if (canvas) applyFigmaFrameStyles(canvas);
          canvas?.renderAll();
          isRestoring.current = false;
          onObjectSelect(null);
          onLayersChangeRef.current?.();
        });
      },
      redo: () => {
        if (historyIdx.current >= history.current.length - 1) return;
        historyIdx.current++;
        isRestoring.current = true;
        const canvas = fabricRef.current;
        canvas?.loadFromJSON(JSON.parse(history.current[historyIdx.current]), () => {
          if (canvas) applyFigmaFrameStyles(canvas);
          canvas?.renderAll();
          isRestoring.current = false;
          onObjectSelect(null);
          onLayersChangeRef.current?.();
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
      applyAutoLayoutTo: (frame) => {
        const c = fabricRef.current; if (!c) return;
        applyAutoLayout(c, frame);
        c.requestRenderAll();
        pushHistory();
        scheduleRef.current();
      },
      flushSave: () => {
        // Cancel pending debounce and save current state immediately.
        if (changeTimer.current) {
          clearTimeout(changeTimer.current);
          changeTimer.current = null;
        }
        const payload = buildPayload();
        if (payload) onCanvasChange(payload);
      },
      // ── Zoom ─────────────────────────────────────────────────────────────
      // All zooms anchor on the canvas centre so the user's view stays put.
      zoomIn:  () => {
        const c = fabricRef.current; if (!c) return;
        const z = Math.min(c.getZoom() * 1.2, 8);
        const cx = c.getWidth()  / 2;
        const cy = c.getHeight() / 2;
        c.zoomToPoint(new fabric.Point(cx, cy), z);
        onZoomChange?.(z);
        scheduleRef.current();
      },
      zoomOut: () => {
        const c = fabricRef.current; if (!c) return;
        const z = Math.max(c.getZoom() / 1.2, 0.05);
        const cx = c.getWidth()  / 2;
        const cy = c.getHeight() / 2;
        c.zoomToPoint(new fabric.Point(cx, cy), z);
        onZoomChange?.(z);
        scheduleRef.current();
      },
      zoomTo: (level: number) => {
        const c = fabricRef.current; if (!c) return;
        const z = Math.max(0.05, Math.min(level, 8));
        const cx = c.getWidth()  / 2;
        const cy = c.getHeight() / 2;
        c.zoomToPoint(new fabric.Point(cx, cy), z);
        onZoomChange?.(z);
        scheduleRef.current();
      },
      zoomToFit: () => {
        const c = fabricRef.current; if (!c) return;
        const objs = c.getObjects();
        const vw = c.getWidth();
        const vh = c.getHeight();
        if (!objs.length) {
          c.setViewportTransform([1, 0, 0, 1, 0, 0]);
          onZoomChange?.(1);
          c.requestRenderAll();
          scheduleRef.current();
          return;
        }
        // Compute bbox of all objects in canvas-space
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        objs.forEach(o => {
          const r = o.getBoundingRect(true, true);
          minX = Math.min(minX, r.left);
          minY = Math.min(minY, r.top);
          maxX = Math.max(maxX, r.left + r.width);
          maxY = Math.max(maxY, r.top  + r.height);
        });
        const bw = maxX - minX;
        const bh = maxY - minY;
        const pad = 40;
        const zx = (vw - pad * 2) / bw;
        const zy = (vh - pad * 2) / bh;
        const z  = Math.max(0.05, Math.min(zx, zy, 8));
        // Translate so bbox centre lands at viewport centre
        const tx = vw / 2 - (minX + bw / 2) * z;
        const ty = vh / 2 - (minY + bh / 2) * z;
        c.setViewportTransform([z, 0, 0, z, tx, ty]);
        onZoomChange?.(z);
        c.requestRenderAll();
        scheduleRef.current();
      },
      getZoom: () => fabricRef.current?.getZoom() ?? 1,
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

    // ── SVG paste ────────────────────────────────────────────────────────────
    // Sanitize raw SVG markup (strip <script> + on*= attributes) and load it
    // onto the canvas, dropped at the centre of the current viewport. The
    // user can then resize / recolour like any other Fabric object.
    const importSvgToCanvas = useCallback((canvas: fabric.Canvas, rawSvg: string) => {
      // Strip <script>...</script> blocks and any on* handlers for safety.
      const sanitized = rawSvg
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
        .replace(/\son\w+\s*=\s*'[^']*'/gi, '');

      (fabric as any).loadSVGFromString(sanitized, (objects: any[], options: any) => {
        if (!objects || !objects.length) {
          alert('Could not parse SVG — try copying again from Figma.');
          return;
        }
        const grouped = (fabric.util as any).groupSVGElements(objects, options);

        // Place at the centre of the current viewport (world coords).
        const vpt  = canvas.viewportTransform!;
        const zoom = canvas.getZoom();
        const cx   = (canvas.width!  / 2 - vpt[4]) / zoom;
        const cy   = (canvas.height! / 2 - vpt[5]) / zoom;
        const sw   = (grouped.width  ?? 100);
        const sh   = (grouped.height ?? 100);

        grouped.set({
          left: cx - sw / 2,
          top:  cy - sh / 2,
          data: { id: uuidv4(), objectType: 'svg', source: 'figma' },
        });
        canvas.add(grouped);
        canvas.setActiveObject(grouped);
        canvas.renderAll();
        scheduleRef.current();
        pushHistory();
      }, undefined, { crossOrigin: 'anonymous' });
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
            applyFigmaFrameStyles(canvas);
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

        // Restore viewport (zoom + pan) so refresh returns to last view.
        // For brand-new boards (no saved viewport yet) we start zoomed out
        // to 10% so the whole working area is visible instead of opening
        // already-zoomed-in at 100%.
        if (saved.viewport && saved.viewport.length === 6) {
          canvas.setViewportTransform(saved.viewport as any);
          onZoomChange?.(canvas.getZoom());
          canvas.requestRenderAll();
        } else {
          const z  = 0.1;
          const cx = canvas.getWidth()  / 2;
          const cy = canvas.getHeight() / 2;
          // Centre the 10% view on the canvas origin so newly-created
          // content lands near the middle of the viewport.
          canvas.setViewportTransform([z, 0, 0, z, cx, cy]);
          onZoomChange?.(z);
          canvas.requestRenderAll();
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
        onZoomChange?.(zoom);
        scheduleRef.current();   // persist new viewport
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
          // Scale font so it always appears ~20px tall on screen regardless of zoom.
          const zoom     = canvas.getZoom();
          const fontSize = Math.max(12, Math.round(20 / zoom));
          const text = new fabric.IText('', {
            left: ptr.x, top: ptr.y,
            fontFamily: 'Inter, sans-serif', fontSize,
            fill: '#1a1a1a', fontWeight: '400', editable: true,
            data: { id: uuidv4(), objectType: 'text' },
          } as any);
          canvas.add(text);
          canvas.setActiveObject(text);
          onToolChangeRef.current?.('select');  // exit text tool, stay in edit
          text.enterEditing();
          (text as any).hiddenTextarea?.focus();
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
        if (isPanning.current) {
          isPanning.current = false;
          scheduleRef.current();   // persist viewport after pan
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
        const ctx       = canvas.getContext();
        const zoom      = canvas.getZoom();
        const vpt       = canvas.viewportTransform!;
        const activeObj = canvas.getActiveObject();

        // Render Figma-style frame name labels + drop-target highlight
        canvas.getObjects().forEach(obj => {
          if ((obj as any).data?.type !== 'frame') return;

          const fw = (obj.width  ?? 0) * (obj.scaleX ?? 1);
          const fh = (obj.height ?? 0) * (obj.scaleY ?? 1);
          const sx = (obj.left ?? 0) * zoom + vpt[4];
          const sy = (obj.top  ?? 0) * zoom + vpt[5];
          const sw = fw * zoom;
          const sh = fh * zoom;

          const isSelected   = obj === activeObj;
          const isDropTarget = (obj as any).data?.id === dropTargetFrameIdRef.current;

          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);

          // ── Drop-target highlight (Figma purple fill) ─────────────────────
          if (isDropTarget) {
            ctx.fillStyle = 'rgba(27,175,216,0.08)';
            ctx.fillRect(sx, sy, sw, sh);
          }

          // ── Name label above top-left corner (like Figma) ─────────────────
          const frameName = (obj as any).data?.frameName ?? 'Frame';
          ctx.font         = '400 11px Inter, system-ui, sans-serif';
          ctx.fillStyle    = isSelected || isDropTarget ? '#0d99ff' : 'rgba(160,160,160,0.85)';
          ctx.textBaseline = 'bottom';
          ctx.fillText(frameName, sx, sy - 6);

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

      // ── Frame stroke helpers (Figma: blue on hover/select, none otherwise) ──
      const FRAME_STROKE_ON  = '#0d99ff';
      const FRAME_STROKE_OFF = 'transparent';

      const setFrameStroke = (obj: fabric.Object | null | undefined, on: boolean) => {
        if (!obj || (obj as any).data?.type !== 'frame') return;
        obj.set({ stroke: on ? FRAME_STROKE_ON : FRAME_STROKE_OFF, strokeWidth: on ? 1 : 0, strokeUniform: true } as any);
      };

      const clearAllFrameStrokes = () => {
        canvas.getObjects().forEach(o => {
          if ((o as any).data?.type === 'frame') setFrameStroke(o, false);
        });
      };

      // ── Frame hover → show blue outline like Figma ────────────────────────
      canvas.on('mouse:over', (e) => {
        const obj = e.target;
        if ((obj as any)?.data?.type === 'frame' && obj !== canvas.getActiveObject()) {
          hoveredFrameIdRef.current = (obj as any).data?.id ?? null;
          setFrameStroke(obj, true);
          canvas.requestRenderAll();
        }
      });
      canvas.on('mouse:out', (e) => {
        const obj = e.target;
        if ((obj as any)?.data?.type === 'frame' && obj !== canvas.getActiveObject()) {
          hoveredFrameIdRef.current = null;
          setFrameStroke(obj, false);
          canvas.requestRenderAll();
        }
      });

      // ── Drop-target highlight while dragging (Figma purple frame glow) ──────
      canvas.on('object:moving', (e) => {
        const obj = e.target;
        if (!obj || (obj as any).data?.type === 'frame') return;
        const target = getDropTarget(obj);
        const newId  = (target as any)?.data?.id ?? null;
        if (newId !== dropTargetFrameIdRef.current) {
          dropTargetFrameIdRef.current = newId;
          canvas.requestRenderAll();
        }
      });

      // ── Selection ─────────────────────────────────────────────────────────
      const trackFramePos = (obj?: fabric.Object) => {
        if (obj && (obj as any).data?.type === 'frame') {
          framePosRef.current.set((obj as any).data.id, { left: obj.left ?? 0, top: obj.top ?? 0 });
        }
      };
      canvas.on('selection:created', e => {
        const obj = e.selected?.[0] ?? null;
        clearAllFrameStrokes();
        setFrameStroke(obj, true);
        onObjectSelect(obj); trackFramePos(obj ?? undefined);
      });
      canvas.on('selection:updated', e => {
        e.deselected?.forEach(o => setFrameStroke(o, false));
        const obj = e.selected?.[0] ?? null;
        setFrameStroke(obj, true);
        onObjectSelect(obj); trackFramePos(obj ?? undefined);
      });
      canvas.on('selection:cleared', () => {
        clearAllFrameStrokes();
        hoveredFrameIdRef.current = null;
        onObjectSelect(null);
      });

      // ── object:modified — re-parent + sync clip paths ─────────────────────
      canvas.on('object:modified', (e) => {
        const obj = e.target as any;
        // Clear drop-target highlight after drag completes
        dropTargetFrameIdRef.current = null;

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
          // If this frame is auto-laying-out, re-run on any change to it.
          if (getAutoLayout(obj)) {
            applyAutoLayout(canvas, obj);
            canvas.requestRenderAll();
          }
        } else if (canEditRef.current) {
          // Re-parenting: center-point hit-test
          const target = getDropTarget(obj);
          reparentObject(obj, target);
          // If we landed inside (or were inside) an auto-layout frame, re-run.
          relayoutForChild(canvas, obj);
          canvas.requestRenderAll();
        }

        pushHistory();
        scheduleRef.current();
        onLayersChangeRef.current?.();
      });

      canvas.on('object:added', (e) => {
        if (!isRestoring.current) {
          // Re-layout the parent auto-layout frame if the added object is a child.
          if (e.target) {
            const re = relayoutForChild(canvas, e.target as fabric.Object);
            if (re) canvas.requestRenderAll();
          }
          scheduleRef.current();
          onLayersChangeRef.current?.();
        }
      });
      canvas.on('object:removed', (e) => {
        if (!isRestoring.current) {
          // Re-layout parent auto-layout frame after removal.
          if (e.target) {
            const re = relayoutForChild(canvas, e.target as fabric.Object);
            if (re) canvas.requestRenderAll();
          }
          scheduleRef.current();
          onLayersChangeRef.current?.();
        }
        // Stop GIF animation for removed object
        const id = (e.target as any)?.data?.id;
        if (id && gifStoppers.current.has(id)) {
          gifStoppers.current.get(id)!();
          gifStoppers.current.delete(id);
        }
      });

      // Live re-layout during resize so the user sees the layout update in
      // real time rather than only on mouse-up.
      canvas.on('object:scaling', (e) => {
        const obj = e.target as fabric.Object | undefined;
        if (!obj) return;
        if (getAutoLayout(obj as any)) {
          applyAutoLayout(canvas, obj as any);
        } else {
          relayoutForChild(canvas, obj as any);
        }
      });

      return () => {
        // Flush any pending debounced save BEFORE nullifying the canvas so
        // in-app navigation (back to dashboard) doesn't lose the last edit.
        if (changeTimer.current) {
          clearTimeout(changeTimer.current);
          changeTimer.current = null;
          const payload = buildPayload();
          if (payload) {
            if (onCanvasChangeKeepAlive) onCanvasChangeKeepAlive(payload);
            else onCanvasChange(payload);
          }
        }
        gifStoppers.current.forEach(stop => stop());
        gifStoppers.current.clear();
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
      } else if (activeTool === 'comment') {
        // Comment-pin mode: crosshair cursor everywhere, swallow object
        // selection so the click event becomes the "drop pin here" gesture.
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

        // 1. SVG — highest fidelity from Figma "Copy as SVG".
        //    Figma sometimes attaches it as `image/svg+xml`, sometimes only as
        //    `text/plain` containing raw `<svg …>` markup. Handle both.
        const svgItem = items.find(i => i.type === 'image/svg+xml');
        const textPromise: Promise<string | null> = svgItem
          ? Promise.resolve(svgItem.getAsFile()?.text() ?? Promise.resolve(null))
          : (async () => {
              const t = items.find(i => i.type === 'text/plain');
              if (!t) return null;
              const str = await new Promise<string>(res => t.getAsString(res));
              return /<svg[\s>]/i.test(str) ? str : null;
            })();

        const rawSvg = await textPromise;
        if (rawSvg) {
          e.preventDefault();
          importSvgToCanvas(canvas, rawSvg);
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
    }, [addImageUrl, importSvgToCanvas, pushHistory]);

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

      // ── Two-phase load for snappy UX ──────────────────────────────────────
      //
      // Phase 1 (INSTANT, ~10ms): create an <img> with the GIF's URL. The
      //   browser decodes the first frame natively in microtask time and we
      //   immediately wrap it in a fabric.Image. The user sees the GIF
      //   appear right away — no spinner, no blank slot.
      //
      // Phase 2 (BACKGROUND, ~50-500ms): fetch the bytes, run gifuct-js to
      //   decode every frame, pre-render each into a tiny <canvas>, then
      //   atomically swap the fabric image's source to an off-screen canvas
      //   we drive ourselves. From this point the GIF animates forever.
      //
      // This makes both single uploads AND board-reload-with-many-GIFs feel
      // instant: previously every GIF had to wait for full decode before
      // appearing, so 5 GIFs popped in serially over ~2 seconds. Now they
      // all show up in one paint, then upgrade to animated as each decode
      // resolves on its own.

      const sourceUrl = sourceFile
        ? (() => { const b = URL.createObjectURL(sourceFile); blobUrls.current.push(b); return b; })()
        : url;

      if (!sourceUrl) return;

      let cancelled = false;
      let fabricImg: fabric.Image | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      gifStoppers.current.set(id, () => {
        cancelled = true;
        if (timeoutId) clearTimeout(timeoutId);
      });

      // ── PHASE 1: instant static preview ────────────────────────────────────
      const previewImg = new window.Image();
      previewImg.onload = () => {
        if (cancelled) return;
        const w = previewImg.naturalWidth  || 200;
        const h = previewImg.naturalHeight || 200;

        fabricImg = new fabric.Image(previewImg, {
          left:    saved?.left   ?? pos?.x ?? canvas.width!  / 2 - w / 2,
          top:     saved?.top    ?? pos?.y ?? canvas.height! / 2 - h / 2,
          scaleX:  saved?.scaleX ?? 1,
          scaleY:  saved?.scaleY ?? 1,
          angle:   saved?.angle  ?? 0,
          opacity: saved?.opacity ?? 1,
          objectCaching: false,
          data: { id, mediaType: 'gif', url },
        } as any);

        // Apply rounded corners if requested
        if (saved?.clipRadius) {
          fabricImg.clipPath = new fabric.Rect({
            width:   w,
            height:  h,
            rx:      saved.clipRadius,
            ry:      saved.clipRadius,
            originX: 'center',
            originY: 'center',
          } as any);
        }

        canvas.add(fabricImg);
        // Only push new (not restored) GIFs to the back so they sit behind
        // any text / shapes already on the canvas.  Restored GIFs keep their
        // original stacking order so they aren't buried under frame rects.
        if (!saved?.id) canvas.sendToBack(fabricImg);
        canvas.requestRenderAll();

        if (!saved?.id) {
          mediaItemsRef.current.push({
            id, type: 'gif', url,
            left: fabricImg.left!, top: fabricImg.top!,
            width: w, height: h,
            scaleX: 1, scaleY: 1, angle: 0, opacity: 1,
          });
          scheduleRef.current();
        }

        // Kick off server upload in parallel (does not block animation).
        if (sourceFile && uploadFn && !url) {
          uploadFn(sourceFile)
            .then(({ url: serverUrl }) => {
              if (cancelled || !serverUrl) return;
              const item = mediaItemsRef.current.find(m => m.id === id);
              if (item) item.url = serverUrl;
              if (fabricImg) (fabricImg as any).data = { ...(fabricImg as any).data, url: serverUrl };
              scheduleRef.current();
            })
            .catch(err => console.warn('GIF upload failed; will not persist across refresh:', err));
        }

        // ── PHASE 2: background decode + animation upgrade ──────────────────
        // requestIdleCallback (or setTimeout fallback) keeps the main thread
        // free for layout/paint of the rest of the board until the browser
        // has idle time to chew through gifuct's heavy decode work.
        const schedule: (cb: () => void) => void =
          (window as any).requestIdleCallback
            ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 400 })
            : (cb) => setTimeout(cb, 0);

        schedule(async () => {
          if (cancelled) return;
          try {
            const buf = await fetchBuffer(sourceUrl);
            if (cancelled) return;

            const gif = parseGIF(buf);
            const rawFrames = decompressFrames(gif, true);
            if (!rawFrames.length) return; // keep static fallback
            const gw = gif.lsd.width  || w;
            const gh = gif.lsd.height || h;
            if (!gw || !gh) return;

            // Pre-render each frame to a tiny per-frame canvas, then drop
            // the raw RGBA arrays so memory stays bounded with many GIFs.
            const prerendered = rawFrames.map(f => {
              const c = document.createElement('canvas');
              c.width  = f.dims.width;
              c.height = f.dims.height;
              const cctx = c.getContext('2d')!;
              const idata = cctx.createImageData(f.dims.width, f.dims.height);
              idata.data.set(f.patch);
              cctx.putImageData(idata, 0, 0);
              return {
                canvas:       c,
                dims:         f.dims,
                delay:        Math.max(20, f.delay || 100),
                disposalType: f.disposalType,
              };
            });
            for (let k = 0; k < rawFrames.length; k++) (rawFrames[k] as any).patch = null;

            // Atomically swap the fabric image source from the static <img>
            // to the off-screen canvas we will drive.
            const offCanvas = document.createElement('canvas');
            offCanvas.width  = gw;
            offCanvas.height = gh;
            const offCtx = offCanvas.getContext('2d')!;
            offCtx.fillStyle = '#ffffff';
            offCtx.fillRect(0, 0, gw, gh);
            // Seed with the static preview so the swap is visually a no-op.
            try { offCtx.drawImage(previewImg, 0, 0, gw, gh); } catch { /* taint ok */ }

            if (cancelled || !fabricImg) return;
            (fabricImg as any).setElement(offCanvas);
            (fabricImg as any).dirty = true;
            canvas.requestRenderAll();

            // Resilient frame loop — never let a bad frame kill the chain.
            let i = 0;
            let savedImageData: ImageData | null = null;
            const drawFrame = () => {
              if (cancelled) return;
              const frame = prerendered[i];
              const delay = frame?.delay ?? 100;
              try {
                const prev = prerendered[(i - 1 + prerendered.length) % prerendered.length];
                if (i > 0 && prev.disposalType === 2) {
                  offCtx.fillStyle = '#ffffff';
                  offCtx.fillRect(prev.dims.left, prev.dims.top, prev.dims.width, prev.dims.height);
                } else if (i > 0 && prev.disposalType === 3 && savedImageData) {
                  offCtx.putImageData(savedImageData, 0, 0);
                }
                if (frame.disposalType === 3) {
                  try { savedImageData = offCtx.getImageData(0, 0, gw, gh); } catch { savedImageData = null; }
                }
                offCtx.drawImage(frame.canvas, frame.dims.left, frame.dims.top);
                if (fabricImg) (fabricImg as any).dirty = true;
                try { canvas.requestRenderAll(); } catch { /* canvas gone */ }
              } catch (err) {
                console.warn('GIF frame draw error (continuing):', err);
              }
              i = (i + 1) % prerendered.length;
              timeoutId = setTimeout(drawFrame, delay);
            };
            drawFrame();
          } catch (err) {
            // Static preview already on screen — just log and stop here.
            console.warn('GIF decode failed; staying as static frame:', err);
          }
        });
      };

      previewImg.onerror = () => {
        // Browser couldn't even render the static preview. Try the gifuct
        // path directly so we still get a chance to display the GIF.
        if (cancelled) return;
        decodeOnlyFallback();
      };

      // Set src LAST — browser starts decoding the first frame immediately
      // and onload fires as soon as it's ready, often within the same tick.
      previewImg.src = sourceUrl;

      // ── Helpers ───────────────────────────────────────────────────────────
      async function fetchBuffer(u: string): Promise<ArrayBuffer> {
        // Same-origin uploads never need a CORS proxy — skip straight to direct.
        const isSameOrigin = u.startsWith('/') || u.startsWith(window.location.origin);
        try {
          const r = await fetch(u);
          if (r.ok) return await r.arrayBuffer();
        } catch { if (isSameOrigin) throw new Error('same-origin fetch failed'); }
        if (isSameOrigin) throw new Error('same-origin fetch failed');
        const proxied = `https://corsproxy.io/?${encodeURIComponent(u)}`;
        const r2 = await fetch(proxied);
        return await r2.arrayBuffer();
      }

      // Used only when the <img> tag itself fails — extremely rare.
      async function decodeOnlyFallback() {
        try {
          const buf = await fetchBuffer(sourceUrl);
          if (cancelled) return;
          const gif = parseGIF(buf);
          const rawFrames = decompressFrames(gif, true);
          if (!rawFrames.length) return;
          // Re-use the same Phase-2 path by spoofing a previewImg sized to gif.
          const tmp = document.createElement('canvas');
          tmp.width  = gif.lsd.width;
          tmp.height = gif.lsd.height;
          previewImg.onload = null;
          fabricImg = new fabric.Image(tmp as any, {
            left: saved?.left ?? pos?.x ?? canvas.width!/2 - tmp.width/2,
            top:  saved?.top  ?? pos?.y ?? canvas.height!/2 - tmp.height/2,
            data: { id, mediaType: 'gif', url },
            objectCaching: false,
          } as any);
          canvas.add(fabricImg);
          canvas.sendToBack(fabricImg);
          canvas.requestRenderAll();
        } catch (err) {
          console.error('GIF could not be displayed at all:', err);
        }
      }
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
      const vpt      = canvas.viewportTransform!;
      const zoom     = canvas.getZoom();
      const cx       = (canvas.width!  / 2 - vpt[4]) / zoom;
      const cy       = (canvas.height! / 2 - vpt[5]) / zoom;
      const fontSize = Math.max(12, Math.round(20 / zoom));
      const t   = new fabric.IText('', {
        left: cx, top: cy,
        fontFamily: 'Inter, sans-serif', fontSize,
        fill: '#1a1a1a', fontWeight: '400',
        data: { id: uuidv4(), objectType: 'text' },
      } as any);
      canvas.add(t); canvas.setActiveObject(t);
      t.enterEditing(); (t as any).hiddenTextarea?.focus();
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
          background:    isDragOver ? 'rgba(27,175,216,0.1)' : 'var(--bg-surround)',
          transition:    'background 0.12s',
          outline:       isDragOver ? '2px dashed rgba(27,175,216,0.6)' : 'none',
          outlineOffset: '-2px',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
            <div className="rounded-xl px-5 py-2.5 text-sm font-semibold shadow-lg"
              style={{ background: 'rgba(27,175,216,0.9)', color: '#fff' }}>
              Drop to add
            </div>
          </div>
        )}

        {/* Frame name edit overlay — auto-shown after frame creation */}
        {editingFrame && (
          <input
            autoFocus
            className="absolute z-20 text-xs rounded"
            style={{
              left:       editingFrame.sx,
              top:        editingFrame.sy,
              background: 'rgba(30,30,40,0.85)',
              border:     '1px solid #0d99ff',
              color:      '#0d99ff',
              padding:    '1px 4px',
              minWidth:   60,
              fontWeight: 400,
              outline:    'none',
              letterSpacing: 0,
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
