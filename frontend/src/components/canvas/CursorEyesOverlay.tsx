/**
 * CursorEyesOverlay
 * Imperatively mounts a transparent <canvas> on top of the Fabric canvas and
 * draws animated pupils on every image object that has `data.eyeFollower.enabled`.
 * Uses its own RAF loop so eye motion is buttery-smooth regardless of Fabric renders.
 */
import { useEffect, useRef, useCallback } from 'react';
import { fabric } from 'fabric';

export interface EyeData {
  xRatio: number;   // 0–1 across the object's width
  yRatio: number;   // 0–1 across the object's height
  radius: number;   // iris radius in canvas pixels (pre-zoom)
}

interface Props {
  canvas: fabric.Canvas | null;
}

export default function CursorEyesOverlay({ canvas }: Props) {
  const overlayRef  = useRef<HTMLCanvasElement | null>(null);
  const rafRef      = useRef<number>(0);
  // Raw cursor position in overlay-canvas pixels
  const cursorRef   = useRef({ x: -9999, y: -9999 });
  // Smoothed cursor (lerped each frame)
  const smoothRef   = useRef({ x: -9999, y: -9999 });

  /* ── Mount overlay canvas as a sibling of Fabric's canvas elements ──────── */
  useEffect(() => {
    if (!canvas) return;
    const lc      = (canvas as any).lowerCanvasEl as HTMLCanvasElement | null;
    const wrapper = lc?.parentElement;
    if (!lc || !wrapper) return;

    const el = document.createElement('canvas');
    el.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:5;';
    wrapper.appendChild(el);
    overlayRef.current = el;

    const syncSize = () => {
      if (!el) return;
      el.width        = lc.width;
      el.height       = lc.height;
      el.style.width  = lc.style.width  || `${lc.width}px`;
      el.style.height = lc.style.height || `${lc.height}px`;
    };
    syncSize();

    const ro = new ResizeObserver(syncSize);
    ro.observe(lc);
    return () => { ro.disconnect(); el.remove(); overlayRef.current = null; };
  }, [canvas]);

  /* ── Track mouse in overlay-canvas pixel space ──────────────────────────── */
  useEffect(() => {
    if (!canvas) return;
    const lc      = (canvas as any).lowerCanvasEl as HTMLCanvasElement | null;
    const wrapper = lc?.parentElement;
    if (!wrapper) return;

    const onMove = (e: MouseEvent) => {
      const r = wrapper.getBoundingClientRect();
      cursorRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    // Track globally so eyes follow even when cursor is outside the canvas
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [canvas]);

  /* ── RAF draw loop ──────────────────────────────────────────────────────── */
  const draw = useCallback(() => {
    rafRef.current = requestAnimationFrame(draw);

    const el = overlayRef.current;
    if (!el || !canvas) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;

    // Smooth-follow cursor
    const k = 0.13;
    smoothRef.current.x += (cursorRef.current.x - smoothRef.current.x) * k;
    smoothRef.current.y += (cursorRef.current.y - smoothRef.current.y) * k;
    const cx = smoothRef.current.x;
    const cy = smoothRef.current.y;

    ctx.clearRect(0, 0, el.width, el.height);

    const followers = canvas.getObjects().filter(
      (o: any) => o.data?.eyeFollower?.enabled && o.data.eyeFollower.eyes?.length > 0
    );
    if (followers.length === 0) return;

    const vpt  = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0];
    const zoom = canvas.getZoom();

    for (const obj of followers) {
      const eyes: EyeData[] = (obj as any).data.eyeFollower.eyes;
      const coords: any     = (obj as any).calcCoords?.();
      if (!coords) continue;

      const { tl, tr, bl } = coords as { tl: fabric.Point; tr: fabric.Point; bl: fabric.Point };
      // vRight / vDown are the full-width / full-height vectors in canvas space
      const vRx = tr.x - tl.x, vRy = tr.y - tl.y;
      const vDx = bl.x - tl.x, vDy = bl.y - tl.y;

      for (const eye of eyes) {
        // Interpolate eye position into canvas space
        const ecx = tl.x + eye.xRatio * vRx + eye.yRatio * vDx;
        const ecy = tl.y + eye.xRatio * vRy + eye.yRatio * vDy;

        // Convert to overlay-canvas pixel space (same as screen-space within wrapper)
        const esx = ecx * zoom + vpt[4];
        const esy = ecy * zoom + vpt[5];

        const irisR = eye.radius * zoom;
        if (irisR < 2) continue;

        // Direction toward smooth cursor, clamped to maxOffset
        const dx   = cx - esx, dy = cy - esy;
        const dist = Math.hypot(dx, dy) || 1;
        const maxOffset = irisR * 0.38;
        const t   = Math.min(dist, maxOffset) / dist;
        const px  = esx + dx * t;
        const py  = esy + dy * t;

        ctx.save();

        // Sclera (white)
        ctx.beginPath();
        ctx.ellipse(esx, esy, irisR, irisR * 0.78, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(252,252,252,0.94)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.16)';
        ctx.lineWidth   = Math.max(0.5, zoom * 0.6);
        ctx.stroke();

        // Iris
        ctx.beginPath();
        ctx.ellipse(px, py, irisR * 0.58, irisR * 0.52, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#3d72c4';
        ctx.fill();

        // Pupil
        ctx.beginPath();
        ctx.ellipse(px, py, irisR * 0.29, irisR * 0.29, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#08090d';
        ctx.fill();

        // Catch-light
        ctx.beginPath();
        ctx.ellipse(px - irisR * 0.11, py - irisR * 0.13, irisR * 0.09, irisR * 0.09, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.76)';
        ctx.fill();

        ctx.restore();
      }
    }
  }, [canvas]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return null; // overlay canvas is imperatively managed above
}
