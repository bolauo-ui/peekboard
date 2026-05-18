declare module 'gifenc' {
  export interface GIFEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: { palette?: number[][]; delay?: number; repeat?: number; transparent?: number; }
    ): void;
    finish(): void;
    bytesView(): Uint8Array;
    bytes(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(): GIFEncoderInstance;

  export function quantize(
    rgba: Uint8ClampedArray | Uint8Array,
    maxColors: number,
    opts?: { format?: 'rgb444' | 'rgb565' | 'rgba4444'; oneBitAlpha?: boolean }
  ): number[][];

  export function applyPalette(
    rgba: Uint8ClampedArray | Uint8Array,
    palette: number[][],
    format?: string
  ): Uint8Array;
}
