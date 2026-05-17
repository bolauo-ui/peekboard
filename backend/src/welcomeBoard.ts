// Canvas JSON for the "Welcome" board auto-created on signup. Mirrors the
// fabric.js serialised structure CanvasEditor reads on load (fabricData +
// mediaItems + viewport). Hand-crafted rather than rendered, so we don't
// need to spin up a headless canvas server-side.
//
// Fonts: "Crimson Pro" (serif) for the title, "Inter" for body copy —
// both loaded via Google Fonts in index.css.
//
// Important: use `textbox` (not `i-text`) for multi-line copy — Fabric.js
// only wraps text at a given width with the textbox type.

const SERIF = '"Crimson Pro", Georgia, serif';
const SANS  = '"Inter", system-ui, sans-serif';

export function makeWelcomeCanvas(displayName: string): string {
  const first = displayName.split(' ')[0] || 'there';

  // ── Frame ─────────────────────────────────────────────────────────────────
  // Frame: generous height so all content + padding fits comfortably.
  // Bottom of tips body ≈ top(538) + 4×(14×1.8)=101 = 639. Frame bottom
  // at 70+640=710 leaves ~71 px padding below the last bullet.
  const introFrame = {
    type: 'rect',
    version: '5.3.0',
    originX: 'left', originY: 'top',
    left: 80, top: 70,
    width: 820, height: 640,
    fill: '#ffffff',
    stroke: '#e5e7eb', strokeWidth: 1,
    rx: 16, ry: 16,
    selectable: true, evented: true,
    data: { id: 'intro-frame', type: 'frame', objectType: 'frame', frameName: 'Welcome' },
  };

  // ── Title — Crimson Pro regular ───────────────────────────────────────────
  // Cat GIF: top=110, height=170 → bottom=280. 30 px gap → title at 310.
  const title = {
    type: 'i-text',
    version: '5.3.0',
    left: 140, top: 310,
    fontFamily: SERIF,
    fontSize: 48, fontWeight: 400,
    fill: '#111827',
    text: `Welcome, ${first} 👋`,
    selectable: true, evented: true,
    data: { id: 'welcome-title', objectType: 'text', frameId: 'intro-frame' },
  };

  // ── Subtitle — Inter 16 px, textbox wraps at 640 px ──────────────────────
  // Title at 310, ~56 px tall (48×1.16) → bottom ≈ 366. 24 px gap → 390.
  // 2 lines × (16×1.6)=51 px → subtitle bottom ≈ 441.
  const subtitle = {
    type: 'textbox',
    version: '5.3.0',
    left: 140, top: 390,
    width: 640,
    fontFamily: SANS,
    fontSize: 16, lineHeight: 1.6,
    fill: '#1f2937',
    text: 'This is a Peekboard. Drop in GIFs, images, or videos. Frame and group your content. Leave pinned comments. Share it with anyone.',
    selectable: true, evented: true,
    data: { id: 'welcome-subtitle', objectType: 'text', frameId: 'intro-frame' },
  };

  // ── Tips header — Inter semibold ──────────────────────────────────────────
  // Subtitle bottom ≈ 441. Big 69 px breathing room → Quick Tips at 510.
  const tipsHeader = {
    type: 'i-text',
    version: '5.3.0',
    left: 140, top: 510,
    fontFamily: SANS,
    fontSize: 14, fontWeight: 600,
    fill: '#111827',
    text: 'Quick Tips',
    selectable: true, evented: true,
    data: { id: 'tips-header', objectType: 'text', frameId: 'intro-frame' },
  };

  // ── Tips body — Inter 14 px, lineHeight 1.8 for generous bullet spacing ──
  // QT at 510, ~16 px tall → bottom 526. 12 px gap → bullets at 538.
  // 4 lines × (14×1.8)=101 px → bottom ≈ 639. Frame bottom 710 → 71 px pad.
  const tips = {
    type: 'textbox',
    version: '5.3.0',
    left: 140, top: 538,
    width: 640,
    fontFamily: SANS,
    fontSize: 14, lineHeight: 1.8,
    fill: '#1f2937',
    text:
      '• Drag a file (GIF / image / video) anywhere onto the canvas.\n' +
      '• Press F to draw a frame and group your content inside it.\n' +
      '• Click the speech-bubble in the toolbar to drop a pinned comment.\n' +
      '• Press ? for the full keyboard shortcuts list.',
    selectable: true, evented: true,
    data: { id: 'tips-body', objectType: 'text', frameId: 'intro-frame' },
  };

  // ── Callout — Inter italic, sits below the card ───────────────────────────
  // Frame bottom: 70+640=710. 20 px gap → callout at 730.
  const callout = {
    type: 'i-text',
    version: '5.3.0',
    left: 80, top: 730,
    fontFamily: SANS,
    fontSize: 14,
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

  // ── Cat GIF — 340×340 source, displayed at 170×170 ───────────────────────
  const catGifItem = {
    id:         'welcome-cat-gif',
    type:       'gif',
    url:        '/cat-welcome.gif',
    left:       140,
    top:        110,
    width:      340,
    height:     340,
    scaleX:     0.5,
    scaleY:     0.5,
    angle:      0,
    opacity:    1,
    clipRadius: 24,   // rounded corners on the welcome cat GIF
  };

  return JSON.stringify({
    fabricData: data,
    mediaItems: [catGifItem],
    // No saved viewport — CanvasEditor will auto-fit the content to the
    // visible area on first open, correctly accounting for panel widths.
    viewport: null,
  });
}
