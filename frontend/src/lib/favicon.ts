// Tiny client-side favicon painter. When the user has unread @mentions or
// unresolved comments, we re-render the existing favicon SVG and stamp a
// red dot in the top-right corner so a backgrounded tab signals activity.
// Restores the original favicon when the count drops to zero.

let originalHref: string | null = null;

function getLink(): HTMLLinkElement | null {
  return document.querySelector('link[rel~="icon"]') as HTMLLinkElement | null;
}

export function setFaviconDot(count: number) {
  const link = getLink();
  if (!link) return;
  if (originalHref === null) originalHref = link.href;

  if (count <= 0) {
    link.href = originalHref;
    return;
  }

  // Draw the original favicon onto a 32×32 canvas and stamp a red dot.
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 32, 32);
    // Red dot top-right.
    ctx.beginPath();
    ctx.arc(24, 8, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#111';
    ctx.stroke();
    link.href = canvas.toDataURL('image/png');
  };
  img.onerror = () => { /* leave original alone */ };
  img.src = originalHref;
}
