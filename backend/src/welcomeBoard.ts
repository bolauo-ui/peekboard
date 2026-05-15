// Canvas JSON for the "Welcome" board auto-created on signup. Mirrors the
// fabric.js serialised structure CanvasEditor reads on load (fabricData +
// mediaItems + viewport). Hand-crafted rather than rendered, so we don't
// need to spin up a headless canvas server-side.

export function makeWelcomeCanvas(displayName: string): string {
  const first = displayName.split(' ')[0] || 'there';

  // ── Frame ─────────────────────────────────────────────────────────────────
  // White card with subtle border + rounded corners — same shape as the
  // intro design the user created.
  const introFrame = {
    type: 'rect',
    version: '5.3.0',
    originX: 'left', originY: 'top',
    left: 80, top: 80,
    width: 840, height: 580,
    fill: '#ffffff',
    stroke: '#e5e7eb', strokeWidth: 1,
    rx: 16, ry: 16,
    selectable: true, evented: true,
    data: { id: 'intro-frame', type: 'frame', objectType: 'frame', frameName: 'Welcome' },
  };

  // ── Text elements ─────────────────────────────────────────────────────────
  // Title sits below the cat GIF (GIF occupies top: 120 → 120+170 = 290)
  const title = {
    type: 'i-text',
    version: '5.3.0',
    left: 140, top: 308,
    width: 700,
    fontFamily: 'Inter, sans-serif',
    fontSize: 42, fontWeight: 700,
    fill: '#111827',
    text: `Welcome, ${first} 👋`,
    selectable: true, evented: true,
    data: { id: 'welcome-title', objectType: 'text', frameId: 'intro-frame' },
  };

  const subtitle = {
    type: 'i-text',
    version: '5.3.0',
    left: 140, top: 368,
    width: 700,
    fontFamily: 'Inter, sans-serif',
    fontSize: 15, lineHeight: 1.55,
    fill: '#374151',
    text: 'This is a Peekboard. Drop in GIFs, images, or videos. Frame and group your content. Leave pinned comments. Share it with anyone.',
    selectable: true, evented: true,
    data: { id: 'welcome-subtitle', objectType: 'text', frameId: 'intro-frame' },
  };

  const tipsHeader = {
    type: 'i-text',
    version: '5.3.0',
    left: 140, top: 458,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14, fontWeight: 700,
    fill: '#111827',
    text: 'Quick Tips',
    selectable: true, evented: true,
    data: { id: 'tips-header', objectType: 'text', frameId: 'intro-frame' },
  };

  const tips = {
    type: 'i-text',
    version: '5.3.0',
    left: 140, top: 482,
    width: 700,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14, lineHeight: 1.6,
    fill: '#374151',
    text:
      '• Drag a file (GIF / image / video) anywhere onto the canvas.\n' +
      '• Press F to draw a frame and group your content inside it.\n' +
      '• Click the speech-bubble in the toolbar to drop a pinned comment.\n' +
      '• Press ? for the full keyboard shortcuts list.',
    selectable: true, evented: true,
    data: { id: 'tips-body', objectType: 'text', frameId: 'intro-frame' },
  };

  const callout = {
    type: 'i-text',
    version: '5.3.0',
    left: 80, top: 688,
    width: 840,
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

  // ── Cat GIF media item ────────────────────────────────────────────────────
  // The GIF is 340×340 px; we display it at 170×170 (scaleX/Y = 0.5) in the
  // top-left corner of the frame.  CanvasEditor.addGif() reads these saved
  // fields to restore exact position/size on load.
  const catGifItem = {
    id:     'welcome-cat-gif',
    type:   'gif',
    url:    '/cat-welcome.gif',
    left:   140,   // canvas x — inside card, 60px from left edge
    top:    120,   // canvas y — 40px from top edge
    width:  340,   // natural GIF width
    height: 340,   // natural GIF height
    scaleX: 0.5,   // displays at 170×170
    scaleY: 0.5,
    angle:   0,
    opacity: 1,
  };

  return JSON.stringify({
    fabricData: data,
    mediaItems: [catGifItem],
    viewport:   [0.6, 0, 0, 0.6, 36, 36],  // ~60% zoom, slight offset
  });
}
