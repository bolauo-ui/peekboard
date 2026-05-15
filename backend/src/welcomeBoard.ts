// Canvas JSON for the "Welcome" board auto-created on signup. Mirrors the
// fabric.js serialised structure CanvasEditor reads on load (fabricData +
// mediaItems + viewport). Hand-crafted rather than rendered, so we don't
// need to spin up a headless canvas server-side.
//
// Important: use `textbox` (not `i-text`) for any multi-line copy — Fabric.js
// only wraps text automatically with the textbox type.

export function makeWelcomeCanvas(displayName: string): string {
  const first = displayName.split(' ')[0] || 'there';

  // ── Frame ─────────────────────────────────────────────────────────────────
  // White rounded card. Height is generous enough to hold all text at any
  // typical font-rendering size.
  const introFrame = {
    type: 'rect',
    version: '5.3.0',
    originX: 'left', originY: 'top',
    left: 80, top: 70,
    width: 820, height: 620,
    fill: '#ffffff',
    stroke: '#e5e7eb', strokeWidth: 1,
    rx: 16, ry: 16,
    selectable: true, evented: true,
    data: { id: 'intro-frame', type: 'frame', objectType: 'frame', frameName: 'Welcome' },
  };

  // ── Title ─────────────────────────────────────────────────────────────────
  // Sits 18 px below the cat GIF (GIF: top=110, height=170 → bottom=280)
  const title = {
    type: 'i-text',
    version: '5.3.0',
    left: 140, top: 298,
    fontFamily: 'Inter, sans-serif',
    fontSize: 40, fontWeight: 700,
    fill: '#111827',
    text: `Welcome, ${first} 👋`,
    selectable: true, evented: true,
    data: { id: 'welcome-title', objectType: 'text', frameId: 'intro-frame' },
  };

  // ── Subtitle — textbox so it word-wraps at 640 px ─────────────────────────
  const subtitle = {
    type: 'textbox',
    version: '5.3.0',
    left: 140, top: 356,
    width: 640,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14, lineHeight: 1.55,
    fill: '#374151',
    text: 'This is a Peekboard. Drop in GIFs, images, or videos. Frame and group your content. Leave pinned comments. Share it with anyone.',
    selectable: true, evented: true,
    data: { id: 'welcome-subtitle', objectType: 'text', frameId: 'intro-frame' },
  };

  // ── Tips header ───────────────────────────────────────────────────────────
  const tipsHeader = {
    type: 'i-text',
    version: '5.3.0',
    left: 140, top: 442,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14, fontWeight: 700,
    fill: '#111827',
    text: 'Quick Tips',
    selectable: true, evented: true,
    data: { id: 'tips-header', objectType: 'text', frameId: 'intro-frame' },
  };

  // ── Tips body — textbox so long lines wrap instead of overflowing ─────────
  const tips = {
    type: 'textbox',
    version: '5.3.0',
    left: 140, top: 466,
    width: 640,
    fontFamily: 'Inter, sans-serif',
    fontSize: 13, lineHeight: 1.65,
    fill: '#374151',
    text:
      '• Drag a file (GIF / image / video) anywhere onto the canvas.\n' +
      '• Press F to draw a frame and group your content inside it.\n' +
      '• Click the speech-bubble in the toolbar to drop a pinned comment.\n' +
      '• Press ? for the full keyboard shortcuts list.',
    selectable: true, evented: true,
    data: { id: 'tips-body', objectType: 'text', frameId: 'intro-frame' },
  };

  // ── Callout — sits below the card ─────────────────────────────────────────
  const callout = {
    type: 'i-text',
    version: '5.3.0',
    left: 80, top: 716,
    fontFamily: 'Inter, sans-serif',
    fontSize: 13,
    fill: '#2563eb',
    fontStyle: 'italic',
    text: 'Delete this board any time — it\'s yours.',
    selectable: true, evented: true,
    data: { id: 'callout', objectType: 'text' },
  };

  // ── Canvas JSON ───────────────────────────────────────────────────────────
  const data = {
    version: '5.3.0',
    background: '#f0f0f0',
    objects: [introFrame, title, subtitle, tipsHeader, tips, callout],
  };

  // ── Cat GIF — 340×340 source, displayed at 170×170 (scaleX/Y = 0.5) ──────
  // Positioned in the top-left corner of the frame with 60 px padding.
  const catGifItem = {
    id:     'welcome-cat-gif',
    type:   'gif',
    url:    '/cat-welcome.gif',
    left:   140,
    top:    110,
    width:  340,
    height: 340,
    scaleX: 0.5,
    scaleY: 0.5,
    angle:   0,
    opacity: 1,
  };

  return JSON.stringify({
    fabricData: data,
    mediaItems: [catGifItem],
    viewport: [0.6, 0, 0, 0.6, 36, 28],
  });
}
