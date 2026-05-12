// gifler is loaded via CDN in index.html
declare function gifler(url: string): {
  frames: (
    canvas: HTMLCanvasElement,
    callback: (ctx: CanvasRenderingContext2D, frame: { buffer: HTMLCanvasElement; x: number; y: number; width: number; height: number; delay: number }) => void,
    autoplay?: boolean
  ) => void;
  stop: () => void;
  play: () => void;
  pause: () => void;
};
