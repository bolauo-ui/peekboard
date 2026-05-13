// Canvas JSON for the "Welcome" board auto-created on signup. Mirrors the
// fabric.js serialised structure CanvasEditor reads on load (fabricData +
// mediaItems + viewport). Hand-crafted rather than rendered, so we don't
// need to spin up a headless canvas server-side.

export function makeWelcomeCanvas(displayName: string): string {
  const first = displayName.split(' ')[0] || 'there';

  // Frame: an "Intro" container so the user immediately sees how frames work.
  const introFrame = {
    type: 'rect',
    version: '5.3.0',
    originX: 'left', originY: 'top',
    left: 100, top: 100,
    width: 720, height: 420,
    fill: '#ffffff',
    stroke: '#e5e7eb', strokeWidth: 1,
    rx: 12, ry: 12,
    selectable: true, evented: true,
    data: { id: 'intro-frame', type: 'frame', objectType: 'frame', frameName: 'Welcome' },
  };

  const title = {
    type: 'i-text',
    version: '5.3.0',
    left: 140, top: 150,
    width: 640,
    fontFamily: 'Inter, sans-serif',
    fontSize: 36, fontWeight: 700,
    fill: '#1f2024',
    text: `Welcome, ${first} 👋`,
    selectable: true, evented: true,
    data: { id: 'welcome-title', objectType: 'text', frameId: 'intro-frame' },
  };

  const subtitle = {
    type: 'i-text',
    version: '5.3.0',
    left: 140, top: 210,
    width: 640,
    fontFamily: 'Inter, sans-serif',
    fontSize: 16,
    fill: '#3a3b3f',
    text: 'This is a Peekboard. Drop in GIFs, images, or videos. Frame and group your content. Leave pinned comments. Share it with anyone.',
    selectable: true, evented: true,
    data: { id: 'welcome-subtitle', objectType: 'text', frameId: 'intro-frame' },
  };

  const tipsHeader = {
    type: 'i-text',
    version: '5.3.0',
    left: 140, top: 310,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14, fontWeight: 600,
    fill: '#1f2024',
    text: 'Quick tips',
    data: { id: 'tips-header', objectType: 'text', frameId: 'intro-frame' },
  };

  const tips = {
    type: 'i-text',
    version: '5.3.0',
    left: 140, top: 340,
    width: 640,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14, lineHeight: 1.5,
    fill: '#3a3b3f',
    text:
      '① Drag a file (GIF / image / video) anywhere onto the canvas.\n' +
      '② Press F to draw a frame and group your content inside it.\n' +
      '③ Click the speech-bubble in the toolbar to drop a pinned comment.\n' +
      '④ Press ? for the full keyboard shortcuts list.',
    data: { id: 'tips-body', objectType: 'text', frameId: 'intro-frame' },
  };

  const callout = {
    type: 'i-text',
    version: '5.3.0',
    left: 100, top: 560,
    width: 720,
    fontFamily: 'Inter, sans-serif',
    fontSize: 13,
    fill: '#7b68ee',
    fontStyle: 'italic',
    text: 'Delete this board any time — it\'s yours.',
    data: { id: 'callout', objectType: 'text' },
  };

  const data = {
    version: '5.3.0',
    background: '#f0f0f0',
    objects: [introFrame, title, subtitle, tipsHeader, tips, callout],
  };

  return JSON.stringify({
    fabricData: data,
    mediaItems: [],
    viewport:   [0.6, 0, 0, 0.6, 60, 60],   // open ~60% zoom so it fits in the viewport
  });
}
