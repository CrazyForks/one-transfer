// QR decode worker: zxing-cpp compiled to WASM. (Safari has never shipped
// BarcodeDetector — WebKit bug 281848 — so WASM is the only portable way.)
// One frame in flight per worker; the main thread drops frames when all
// workers are busy. Frames are disposable — the fountain doesn't care.

import wasmUrl from "./wasm-url";
import {
  prepareZXingModule,
  readBarcodes,
  type ReaderOptions,
  type ReadResult,
} from "zxing-wasm/reader";

const MAX_SYMBOLS_PER_FRAME = 4;
const ROBUST_FALLBACK_MISSES = 10;

// The zxing-wasm defaults optimize for difficult one-off scans. Animated QR
// transfer needs the opposite: scan the predictable upright black-on-white
// symbols cheaply, drop misses, and move on to the next video frame.
const FAST_OPTIONS = {
  formats: ["QRCode"],
  maxNumberOfSymbols: MAX_SYMBOLS_PER_FRAME,
  tryHarder: false,
  tryRotate: false,
  tryInvert: false,
  tryDownscale: false,
  tryDenoise: false,
} satisfies ReaderOptions;

// A sparse recovery pass keeps camera rotation, inverted captures and heavily
// compressed frames usable without charging every frame for these searches.
const ROBUST_OPTIONS = {
  ...FAST_OPTIONS,
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  tryDenoise: true,
} satisfies ReaderOptions;

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? wasmUrl : prefix + path,
  },
});

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(msg: unknown, transfer?: Transferable[]): void;
};

let consecutiveFastMisses = 0;

function payloadsFrom(results: ReadResult[]): Uint8Array[] {
  return results
    .filter((result) => result.isValid && result.bytes.length > 0)
    // Copy out of the binding-owned result before the next WASM invocation.
    .map((result) => Uint8Array.from(result.bytes));
}

ctx.onmessage = async (e: MessageEvent) => {
  const { id, buf, w, h } = e.data as { id: number; buf: ArrayBuffer; w: number; h: number };
  const startedAt = performance.now();
  let mode: "fast" | "robust" = "fast";
  try {
    const img = new ImageData(new Uint8ClampedArray(buf), w, h);
    let payloads = payloadsFrom(await readBarcodes(img, FAST_OPTIONS));
    if (payloads.length > 0) {
      consecutiveFastMisses = 0;
    } else {
      consecutiveFastMisses++;
      if (consecutiveFastMisses % ROBUST_FALLBACK_MISSES === 0) {
        mode = "robust";
        payloads = payloadsFrom(await readBarcodes(img, ROBUST_OPTIONS));
        if (payloads.length > 0) consecutiveFastMisses = 0;
      }
    }
    const bytes = payloads[0] ?? null;
    ctx.postMessage(
      { id, bytes, payloads, decodeMs: performance.now() - startedAt, mode },
      payloads.map((payload) => payload.buffer as ArrayBuffer),
    );
  } catch (error) {
    ctx.postMessage({
      id,
      bytes: null,
      payloads: [],
      decodeMs: performance.now() - startedAt,
      mode,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

// warm the WASM so the first real frame doesn't pay instantiation
void readBarcodes(new ImageData(8, 8), FAST_OPTIONS)
  .catch(() => undefined)
  .then(() => ctx.postMessage({ id: -1, bytes: null, payloads: [] }));
