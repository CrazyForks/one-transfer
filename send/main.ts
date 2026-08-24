// Sender: turn a file into an endless fountain-coded QR stream.
//
// Tuning notes from the experiments this PoC is distilled from:
// - Frame payload sets the QR version; denser wins on goodput as long as the
//   receiver can still decode it. The single speed slider exposes only tested
//   combinations instead of letting four independent controls fight each other.
// - The mask pattern is pinned (any declared mask is valid to a decoder);
//   this skips the spec's 8-way mask evaluation and speeds generation ~4×.
// - Only one quadrant changes on each visual tick. The other three remain
//   stable, so a rolling-shutter transition cannot corrupt the whole grid.
// - Error correction stays at L by default: the fountain layer already
//   handles erasures, and a frame is either decoded whole or discarded.

import QRCode from "qrcode";
import { fitQrDisplaySize, integerQrGridLayout } from "../shared/display";
import { rasterizeQr } from "../shared/qr-raster";
import { formatBytes } from "../shared/format";
import {
  blockLength,
  fitsInOneStream,
  maximumFileBytes,
  sourceBlockCount,
} from "../shared/frame-capacity";
import { LTEncoder } from "../shared/fountain";
import { MAX_SNIPPET_BYTES, MAX_SNIPPET_LABEL, packSnippet } from "../shared/snippet";
import {
  fnv1a,
  packFile,
  packFrame,
  type FrameHeader,
  type PackedOpticalFile,
} from "../shared/protocol";
import { statusLine } from "../shared/status-line";
import { requestScreenWakeLock } from "../shared/wake-lock";
import { expectedFountainOverhead } from "../shared/progress";
import { SEND_PROGRESS_EVENT, type SendProgressDetail } from "../shared/send-events";
import {
  DEFAULT_SPEED_PROFILE_INDEX,
  QR_GRID_CELLS,
  QR_SYMBOLS_PER_TICK,
  SEND_SPEED_CHANGE_EVENT,
  SEND_SPEED_PROFILES,
} from "../shared/send-settings";

const MARGIN = 4; // quiet-zone modules
const LOOKAHEAD_SYMBOLS = 8;

export function mountSend() {
const qrGrid = document.getElementById("qr-grid") as HTMLDivElement;
const canvases = [...qrGrid.querySelectorAll<HTMLCanvasElement>("[data-qr-symbol]")];
const stage = document.getElementById("stage") as HTMLDivElement;
const specs = document.getElementById("specs")!;
const cfgFile = document.getElementById("cfg-file") as HTMLInputElement;
const filePickerLabel = document.getElementById("file-picker-label")!;
const fileNameLabel = document.getElementById("send-file-name")!;
const toolTitle = document.getElementById("tool-title")!;
const snippetText = document.getElementById("snippet-text") as HTMLTextAreaElement;
const snippetLabel = document.getElementById("snippet-label")!;
const sendSnippetBtn = document.getElementById("send-snippet") as HTMLButtonElement;
const paneFile = document.getElementById("pane-file")!;
const paneSnippet = document.getElementById("pane-snippet")!;
const modeInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="send-mode"]')];
const cfgSpeed = document.getElementById("cfg-speed") as HTMLElement;

let selectedFile: {
  name: string;
  size: number;
  payload: Uint8Array;
  compression: "none" | "gzip";
  transmittedSize: number;
} | null = null;
let generation = 0; // bumped on every restart; stale loops see it and die
let resizeDisplay: (() => void) | null = null;
let stopStream: (() => void) | null = null;
const initialSpeedProfileIndex = Number(cfgSpeed.dataset.speedIndex);
let speedProfileIndex = SEND_SPEED_PROFILES[initialSpeedProfileIndex]
  ? initialSpeedProfileIndex
  : DEFAULT_SPEED_PROFILE_INDEX;

function activeSpeedProfile() {
  return SEND_SPEED_PROFILES[speedProfileIndex] ?? SEND_SPEED_PROFILES[DEFAULT_SPEED_PROFILE_INDEX]!;
}

function activeMaxFileBytes(): number {
  return maximumFileBytes(activeSpeedProfile().frameBytes);
}

function updateFileLimitLabel(): void {
  filePickerLabel.textContent = `任意文件 · 最大 ${formatBytes(activeMaxFileBytes())}`;
}

const specsLine = statusLine(specs);
const setStatus = specsLine.setStatus;
const showLoading = specsLine.showLoading;

function invalidateStream(): number {
  generation++;
  resizeDisplay = null;
  stopStream?.();
  stopStream = null;
  reportSendProgress({ active: false, percent: 0, round: 1, emittedSymbols: 0, targetSymbols: 0 });
  return generation;
}

function reportSendProgress(detail: SendProgressDetail) {
  window.dispatchEvent(new CustomEvent<SendProgressDetail>(SEND_PROGRESS_EVENT, { detail }));
}

/**
 * Errors also hide the stage — a stale QR stream pulsing away under a
 * rejection message reads as "still working".
 *
 * Callers decide whether the pick survives. A file rejected on size is gone;
 * a stream that can't start at the current bytes/frame is not, because turning
 * that setting back up is the fix.
 */
function showError(message: string): void {
  stage.hidden = true;
  specsLine.showError(message);
}

function currentMode(): "file" | "snippet" {
  return modeInputs.find((input) => input.checked)?.value === "snippet" ? "snippet" : "file";
}

/** Switching what we're sending kills any stream in flight and clears the stage. */
function applyMode(): void {
  invalidateStream();
  selectedFile = null;
  stage.hidden = true;

  const mode = currentMode();
  paneFile.hidden = mode !== "file";
  paneSnippet.hidden = mode !== "snippet";
  toolTitle.textContent = mode === "snippet" ? "发送文字" : "发送文件";
  setStatus(mode === "snippet" ? "输入要发送的文字" : "选择文件开始");
  // A file left in the picker survives the switch, so re-arm it rather than
  // leaving a filename on screen next to "choose a file to begin".
  if (mode === "file" && cfgFile.files?.[0]) void selectFile();
}

/**
 * The one path from "user picked something" to a running stream.
 *
 * Kills any stream in flight, then packs the payload; a selection that lands
 * mid-pack (the generation guard) or fails to pack (throw → showError) leaves
 * the page idle rather than streaming something stale. Every way of choosing a
 * payload goes through here so the guard can't be subtly wrong in one copy.
 */
async function startSelection(
  status: string,
  prepare: () => Promise<{ name: string; size: number; packed: PackedOpticalFile }>,
): Promise<void> {
  const selectionGeneration = invalidateStream();
  selectedFile = null;
  stage.hidden = true;
  showLoading(status);
  try {
    const { name, size, packed } = await prepare();
    if (selectionGeneration !== generation) return;
    selectedFile = {
      name,
      size,
      payload: packed.container,
      compression: packed.compression,
      transmittedSize: packed.transmittedSize,
    };
    // Wake Lock is best-effort. Some browsers leave the permission request
    // pending, so it must never hold the first QR batch behind that promise.
    void requestScreenWakeLock();
    await startStream(true);
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
}

async function selectFile(): Promise<void> {
  const file = cfgFile.files?.[0];
  if (!file) return;
  fileNameLabel.textContent = file.name;
  await startSelection(`正在准备 ${file.name}…`, async () => {
    // Checked here, off File.size, rather than after reading the bytes: a file
    // well past the limit should be refused instantly instead of after the
    // browser has spent time and memory materialising it. Name the actual size —
    // "too large" without a number leaves you guessing by how much.
    if (file.size === 0) {
      throw new Error(`${file.name} 是空文件，无法发送。`);
    }
    const maxFileBytes = activeMaxFileBytes();
    if (file.size > maxFileBytes) {
      throw new Error(
        `${file.name} 大小为 ${formatBytes(file.size)}，` +
          `超过“${activeSpeedProfile().label}”档 ${formatBytes(maxFileBytes)} 限制。`,
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    return {
      name: file.name,
      size: file.size,
      packed: await packFile(file.name, file.type, bytes, maxFileBytes),
    };
  });
}

async function selectSnippet(): Promise<void> {
  await startSelection("正在准备文字…", async () => {
    const packed = await packSnippet(snippetText.value);
    return { name: "文字", size: packed.originalSize, packed };
  });
}

async function main() {
  // Both bounds come from MAX_SNIPPET_BYTES so they can't drift apart. maxLength
  // counts UTF-16 units and the real check counts UTF-8 bytes, which are never
  // fewer — so this is a loose guard and packSnippet() remains authoritative.
  snippetText.maxLength = MAX_SNIPPET_BYTES;
  snippetLabel.textContent = `发送文字 · 最大 ${MAX_SNIPPET_LABEL}`;
  updateFileLimitLabel();

  // Browsers do not fire `change` when the same file is selected twice.
  // Clear only the picker value before opening it; the current QR stream keeps
  // playing if the dialog is cancelled, while re-selecting the file creates a
  // fresh payload and session.
  cfgFile.addEventListener("click", () => {
    cfgFile.value = "";
  });
  cfgFile.addEventListener("change", () => void selectFile());
  sendSnippetBtn.addEventListener("click", () => void selectSnippet());
  for (const input of modeInputs) input.addEventListener("change", applyMode);
  applyMode();
  window.addEventListener("resize", onResize);
  window.addEventListener(SEND_SPEED_CHANGE_EVENT, onSpeedChange);
}

const onResize = () => resizeDisplay?.();
const onSpeedChange = (event: Event) => {
  const nextIndex = (event as CustomEvent<number>).detail;
  if (Number.isInteger(nextIndex) && SEND_SPEED_PROFILES[nextIndex]) {
    speedProfileIndex = nextIndex;
  }
  updateFileLimitLabel();
  void startStream();
};

/** Only on a fresh pick — a settings change restarts the stream too, and
 *  yanking the page down every time you nudge tx fps is worse than useless. */
function scrollStageIntoView() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  requestAnimationFrame(() => {
    stage.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  });
}

async function startStream(revealStage = false) {
  const gen = invalidateStream();
  const speedProfile = activeSpeedProfile();
  if (!selectedFile) {
    setStatus(
      `${speedProfile.label}档 · ${currentMode() === "snippet" ? "输入要发送的文字" : "选择文件开始"}`,
    );
    return;
  }
  const { name, size: fileSize, payload, compression, transmittedSize } = selectedFile;
  if (gen !== generation) return; // superseded while fetching
  const txFps = speedProfile.txFps;
  const frameBytes = speedProfile.frameBytes;
  const ecc = "L" as const;
  const displayPx = 1200;

  const sessionId = (Math.floor(Math.random() * 0xffff) + 1) & 0xffff;
  const blockLen = blockLength(frameBytes);
  // Keep selectedFile on this path — raising the combined speed preset is the fix,
  // and dropping the pick would hide that.
  if (!fitsInOneStream(payload.length, frameBytes)) {
    const suggestion = SEND_SPEED_PROFILES.find((profile) =>
      fitsInOneStream(payload.length, profile.frameBytes),
    );
    showError(
      `${formatBytes(payload.length)} 需要 ` +
        `${sourceBlockCount(payload.length, frameBytes).toLocaleString()} 个数据块，` +
        `已超过“${speedProfile.label}”档位上限。` +
        (suggestion ? `请将传输速度调到“${suggestion.label}”。` : "请减小文件后重试。"),
    );
    return;
  }
  const encoder = new LTEncoder(payload, blockLen, sessionId);
  const targetSymbols = Math.ceil(
    encoder.k * expectedFountainOverhead(encoder.k) / QR_SYMBOLS_PER_TICK,
  ) * QR_SYMBOLS_PER_TICK;
  let emittedSymbols = 0;
  reportSendProgress({ active: true, percent: 0, round: 1, emittedSymbols, targetSymbols });
  const header: FrameHeader = {
    sessionId,
    seq: 0,
    k: encoder.k,
    blockLen,
    totalLen: payload.length,
    payloadFnv: fnv1a(payload),
  };

  let version: number | undefined; // locked after the first frame
  let modules = 0;
  let scale = 1;
  const staging = document.createElement("canvas");
  const stagingContext = staging.getContext("2d")!;
  const canvasContexts = canvases.map((target) => target.getContext("2d")!);
  const visibleFrames: (ImageData | null)[] = canvases.map(() => null);
  const queue: ImageData[] = [];
  let nextSeq = 0;
  stage.hidden = false;

  const sizeCanvas = () => {
    const dpr = window.devicePixelRatio || 1;
    const total = modules + 2 * MARGIN;
    const parent = stage.parentElement;
    const parentStyle = parent ? getComputedStyle(parent) : null;
    const containerWidth = parent
      ? parent.clientWidth -
        Number.parseFloat(parentStyle?.paddingLeft || "0") -
        Number.parseFloat(parentStyle?.paddingRight || "0")
      : window.innerWidth;
    const stageStyle = getComputedStyle(stage);
    const horizontalChrome =
      Number.parseFloat(stageStyle.paddingLeft) +
      Number.parseFloat(stageStyle.paddingRight) +
      Number.parseFloat(stageStyle.borderLeftWidth) +
      Number.parseFloat(stageStyle.borderRightWidth);
    const gridBudget = fitQrDisplaySize(
      window.innerWidth,
      window.innerHeight,
      containerWidth,
      displayPx,
      horizontalChrome,
    );
    const gridStyle = getComputedStyle(qrGrid);
    const gap = Number.parseFloat(gridStyle.columnGap) || 0;
    const layout = integerQrGridLayout(total, gridBudget, gap, dpr);
    scale = layout.modulePixels;
    staging.width = total;
    staging.height = total;
    qrGrid.style.width = `${layout.gridCssPixels}px`;
    qrGrid.style.gridTemplateColumns = `repeat(2, ${layout.cellCssPixels}px)`;
    stage.style.width = `${layout.gridCssPixels + horizontalChrome}px`;
    for (const target of canvases) {
      target.width = total * scale;
      target.height = total * scale;
      target.style.width = `${layout.cellCssPixels}px`;
      target.style.height = `${layout.cellCssPixels}px`;
    }
    visibleFrames.forEach((frame, index) => {
      if (frame) drawSymbol(index, frame);
    });
  };

  function drawSymbol(index: number, frame: ImageData) {
    visibleFrames[index] = frame;
    stagingContext.putImageData(frame, 0, 0);
    const ctx = canvasContexts[index]!;
    const target = canvases[index]!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(staging, 0, 0, target.width, target.height);
  }

  const makeFrame = (): ImageData => {
    const bytes = packFrame({ ...header, seq: nextSeq }, encoder.encode(nextSeq));
    nextSeq++;
    const qr = QRCode.create([{ data: bytes, mode: "byte" } as unknown as QRCode.QRCodeSegment], {
      errorCorrectionLevel: ecc,
      version,
      maskPattern: 4,
    });
    if (version === undefined) {
      version = qr.version;
      modules = qr.modules.size;
      sizeCanvas();
      resizeDisplay = sizeCanvas;
      // Scroll only now: before sizeCanvas() the canvas is still 16×16, so the
      // scroll target would be the wrong height.
      if (revealStage) scrollStageIntoView();
      setStatus(
        `${speedProfile.label} · ${QR_GRID_CELLS} QR 轮流刷新 · ` +
          `${txFps * QR_SYMBOLS_PER_TICK} symbols/s · 每码约 ${txFps / QR_GRID_CELLS} 次/s · ` +
          `${frameBytes} 字节 · V${version} · ${scale} px/模块 · ECC ${ecc} · ` +
          `${name} · ${formatBytes(fileSize)} · ` +
          `${compression === "gzip" ? `gzip 后 ${formatBytes(transmittedSize)}` : "未压缩"} · ` +
          `K=${encoder.k}`,
      );
    }
    const raster = rasterizeQr(qr.modules.size, qr.modules.data, MARGIN);
    return new ImageData(new Uint8ClampedArray(raster.pixels.buffer), raster.size, raster.size);
  };

  /**
   * Refill the symbol lookahead. Generation happens after painting so the
   * visual update never waits for the next QR to be encoded.
   *
   * Called once up front to fill the queue, then once per tick() — the only
   * thing that drains it. Self-scheduling on `setTimeout(pump, 0)` instead cost
   * ~250 wake-ups a second doing nothing once the queue was full. After the
   * initial fill, generation is deferred until after painting so a visual tick
   * never waits for the next QR symbol before reaching the screen.
   */
  let generatorFailed = false;
  const pump = (max = LOOKAHEAD_SYMBOLS) => {
    if (generatorFailed || gen !== generation) return;
    try {
      for (let n = 0; n < max && queue.length < LOOKAHEAD_SYMBOLS; n++) {
        queue.push(makeFrame());
      }
    } catch (err) {
      // e.g. frame bytes over capacity for the chosen ECC level
      generatorFailed = true;
      showError(err instanceof Error ? err.message : String(err));
    }
  };
  const initialFrames = Array.from({ length: QR_GRID_CELLS }, () => makeFrame());
  initialFrames.forEach((frame, index) => drawSymbol(index, frame));
  emittedSymbols = initialFrames.length;
  const emittedInInitialRound = ((emittedSymbols - 1) % targetSymbols) + 1;
  reportSendProgress({
    active: true,
    percent: emittedInInitialRound / targetSymbols * 100,
    round: Math.floor((emittedSymbols - 1) / targetSymbols) + 1,
    emittedSymbols: emittedInInitialRound,
    targetSymbols,
  });
  pump();

  const interval = 1000 / txFps;
  let nextAt = performance.now();
  let animationFrameId = 0;
  let pumpTimer: number | null = null;
  let nextCanvasIndex = 0;
  const schedulePump = () => {
    if (pumpTimer !== null || generatorFailed || gen !== generation) return;
    pumpTimer = window.setTimeout(() => {
      pumpTimer = null;
      pump(1);
    }, 0);
  };
  const tick = (now: number) => {
    // generatorFailed means no frame will ever be produced again, so stop the
    // rAF loop rather than spinning on an empty queue until a settings change.
    if (gen !== generation || generatorFailed) return;
    animationFrameId = requestAnimationFrame(tick);
    if (now + 0.5 < nextAt) return;
    const frame = queue.shift();
    if (!frame) {
      schedulePump();
      nextAt = now + interval;
      return;
    }
    drawSymbol(nextCanvasIndex, frame);
    nextCanvasIndex = (nextCanvasIndex + 1) % QR_GRID_CELLS;
    emittedSymbols += QR_SYMBOLS_PER_TICK;
    const round = Math.floor((emittedSymbols - 1) / targetSymbols) + 1;
    const emittedInRound = ((emittedSymbols - 1) % targetSymbols) + 1;
    reportSendProgress({
      active: true,
      percent: emittedInRound / targetSymbols * 100,
      round,
      emittedSymbols: emittedInRound,
      targetSymbols,
    });
    schedulePump();
    nextAt += interval;
    if (now - nextAt > 3 * interval) nextAt = now + interval; // fell behind — don't burst
  };
  animationFrameId = requestAnimationFrame(tick);
  stopStream = () => {
    cancelAnimationFrame(animationFrameId);
    if (pumpTimer !== null) window.clearTimeout(pumpTimer);
  };
}

void main();

return () => {
  invalidateStream();
  window.removeEventListener("resize", onResize);
  window.removeEventListener(SEND_SPEED_CHANGE_EVENT, onSpeedChange);
};
}
