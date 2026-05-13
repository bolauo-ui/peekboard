import { fabric } from 'fabric';

// ── Types ────────────────────────────────────────────────────────────────────
export interface AutoLayout {
  enabled:    boolean;
  direction:  'horizontal' | 'vertical';
  gap:        number;
  padding:    number;                       // uniform — keeps UI simple for v1
  alignCross: 'start' | 'center' | 'end';
  hug:        boolean;                      // frame shrinks to fit children + padding
}

export const DEFAULT_AUTO_LAYOUT: AutoLayout = {
  enabled:    true,
  direction:  'vertical',
  gap:        8,
  padding:    16,
  alignCross: 'start',
  hug:        true,
};

// ── Helpers ──────────────────────────────────────────────────────────────────
export function isFrame(obj: fabric.Object | null | undefined): boolean {
  if (!obj) return false;
  const d = (obj as any).data;
  return d?.type === 'frame' || d?.objectType === 'frame';
}

export function getAutoLayout(frame: fabric.Object): AutoLayout | null {
  const cfg = (frame as any).data?.autoLayout as AutoLayout | undefined;
  return cfg && cfg.enabled ? cfg : null;
}

export function setAutoLayout(frame: fabric.Object, cfg: AutoLayout | null) {
  const data = ((frame as any).data ??= {});
  if (cfg) data.autoLayout = cfg;
  else delete data.autoLayout;
}

export function getFrameChildren(canvas: fabric.Canvas, frame: fabric.Object): fabric.Object[] {
  const fid = (frame as any).data?.id;
  if (!fid) return [];
  return canvas.getObjects().filter(o => {
    const d = (o as any).data;
    if (!d) return false;
    if (d.frameId !== fid) return false;
    if (d.type === 'frame-preview') return false;
    return true;
  });
}

// ── Layout engine ────────────────────────────────────────────────────────────
// Runs synchronously, mutating child positions and (when `hug` is on) the
// frame's own width / height. Designed to be called repeatedly — it is
// idempotent and cheap enough to wire into `object:modified`.
export function applyAutoLayout(canvas: fabric.Canvas, frame: fabric.Object): boolean {
  const cfg = getAutoLayout(frame);
  if (!cfg) return false;

  const children = getFrameChildren(canvas, frame);

  const frameLeft = frame.left ?? 0;
  const frameTop  = frame.top  ?? 0;
  const frameW    = (frame.width  ?? 0) * (frame.scaleX ?? 1);
  const frameH    = (frame.height ?? 0) * (frame.scaleY ?? 1);

  // Sort by current main-axis position. After the first apply this becomes
  // the layout order; rearranging via the layers panel updates z-order which
  // we use as the secondary sort key for stable ordering on ties.
  const sorted = [...children].sort((a, b) => {
    const ax = cfg.direction === 'horizontal' ? (a.left ?? 0) : (a.top ?? 0);
    const bx = cfg.direction === 'horizontal' ? (b.left ?? 0) : (b.top ?? 0);
    if (ax !== bx) return ax - bx;
    return canvas.getObjects().indexOf(a) - canvas.getObjects().indexOf(b);
  });

  let cursor   = cfg.padding;
  let maxCross = 0;

  for (const child of sorted) {
    const cw = child.getScaledWidth?.()  ?? (child.width  ?? 0);
    const ch = child.getScaledHeight?.() ?? (child.height ?? 0);

    if (cfg.direction === 'horizontal') {
      let crossY = cfg.padding;
      if (cfg.alignCross === 'center') crossY = (frameH - ch) / 2;
      else if (cfg.alignCross === 'end') crossY = frameH - ch - cfg.padding;
      child.set({ left: frameLeft + cursor, top: frameTop + crossY });
      child.setCoords();
      cursor   += cw + cfg.gap;
      maxCross  = Math.max(maxCross, ch);
    } else {
      let crossX = cfg.padding;
      if (cfg.alignCross === 'center') crossX = (frameW - cw) / 2;
      else if (cfg.alignCross === 'end') crossX = frameW - cw - cfg.padding;
      child.set({ left: frameLeft + crossX, top: frameTop + cursor });
      child.setCoords();
      cursor   += ch + cfg.gap;
      maxCross  = Math.max(maxCross, cw);
    }

    // Children inside an auto-layout container are not freely positionable.
    child.set({ lockMovementX: true, lockMovementY: true });
  }

  // Remove trailing gap, add bottom/right padding.
  const mainTotal  = (sorted.length ? cursor - cfg.gap : 0) + cfg.padding;
  const crossTotal = maxCross + cfg.padding * 2;

  if (cfg.hug) {
    // Reset scale to 1 and write into width/height for predictable sizing.
    const sx = frame.scaleX ?? 1;
    const sy = frame.scaleY ?? 1;
    if (cfg.direction === 'horizontal') {
      frame.set({ width: mainTotal / sx, height: crossTotal / sy });
    } else {
      frame.set({ width: crossTotal / sx, height: mainTotal / sy });
    }
    frame.setCoords();
  }

  // Bubble up to the parent frame in case THIS frame is also a child of a
  // hugging auto-layout frame.
  const parentId = (frame as any).data?.frameId;
  if (parentId) {
    const parent = canvas.getObjects().find(o => (o as any).data?.id === parentId);
    if (parent) applyAutoLayout(canvas, parent);
  }

  return true;
}

// Release lockMovementX/Y when auto-layout is turned off so the user can
// freely reposition the children again.
export function unlockChildren(canvas: fabric.Canvas, frame: fabric.Object) {
  for (const c of getFrameChildren(canvas, frame)) {
    c.set({ lockMovementX: false, lockMovementY: false });
  }
}

// If the modified object is a child of an auto-layout frame, find its frame
// and re-run the layout. Returns the frame that was relayed-out (if any) so
// callers can fire a follow-up render.
export function relayoutForChild(canvas: fabric.Canvas, child: fabric.Object): fabric.Object | null {
  const parentId = (child as any).data?.frameId;
  if (!parentId) return null;
  const parent = canvas.getObjects().find(o => (o as any).data?.id === parentId);
  if (!parent) return null;
  if (!getAutoLayout(parent)) return null;
  applyAutoLayout(canvas, parent);
  return parent;
}
