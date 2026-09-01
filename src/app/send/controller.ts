// Sender: turn a file into an endless fountain-coded QR stream.
//
// Tuning notes from the experiments this PoC is distilled from:
// - Frame payload sets the QR version; denser wins on goodput as long as the
//   receiver can still decode it. The single speed slider exposes only tested
//   combinations instead of letting four independent controls fight each other.
// - The mask pattern is pinned (any declared mask is valid to a decoder);
//   this skips the spec's 8-way mask evaluation and speeds generation ~4×.
// - Each speed profile controls how many of the four visible symbols change on
//   a visual tick: constrained displays rotate one cell, capable senders batch four.
// - Error correction stays at L by default: the fountain layer already
//   handles erasures, and a frame is either decoded whole or discarded.

import QRCode from "qrcode";
import {
  canFitQrGridAtIntegerPixels,
  fitQrDisplayArea,
  integerQrGridLayout,
} from "../../../shared/display";
import { rasterizeQr } from "../../../shared/qr-raster";
import { formatBytes } from "../../../shared/format";
import {
  blockLength,
  fitsInOneStream,
  maximumFileBytes,
  minimumFrameBytes,
  sourceBlockCount,
} from "../../../shared/frame-capacity";
import { LTEncoder } from "../../../shared/fountain";
import { MAX_SNIPPET_BYTES, MAX_SNIPPET_LABEL, packSnippet } from "../../../shared/snippet";
import {
  fnv1a,
  packFile,
  packFrame,
  type FrameHeader,
  type PackedOpticalFile,
} from "../../../shared/protocol";
import { statusLine } from "../../../shared/status-line";
import { requestScreenWakeLock } from "../../../shared/wake-lock";
import { expectedFountainOverhead } from "../../../shared/progress";
import {
  SEND_CAPABILITIES_EVENT,
  SEND_PROGRESS_EVENT,
  isSendProgressReportDue,
  type SenderCapabilitiesDetail,
  type SendProgressDetail,
} from "../../../shared/send-events";
import {
  DEFAULT_SEND_TUNING,
  QR_GRID_CELLS,
  SEND_SPEED_CHANGE_EVENT,
  SEND_SPEED_SYNC_EVENT,
  SEND_TUNING_LIMITS,
  normalizeSendTuning,
  type SendTuning,
} from "../../../shared/send-settings";
import { createSourceArchiveInWorker } from "../../../shared/source-archive-client";
import { createClipboardDirectoryArchiveInWorker } from "../../../shared/clipboard-processing-client";
import { isValidWindowsFileName } from "../../../shared/clipboard-transfer";
import { packSenderCapabilityHello } from "../../../shared/link-calibration";
import {
  SOURCE_ARCHIVE_PROGRESS_EVENT,
  SOURCE_ARCHIVE_CLEAR_EVENT,
  SOURCE_ARCHIVE_OPTIONS_EVENT,
  SOURCE_ARCHIVE_SEND_EVENT,
  type SourceArchiveOptionsDetail,
  type SourceArchiveProgressDetail,
} from "../../../shared/source-archive-events";

const MARGIN = 4; // quiet-zone modules
const LOOKAHEAD_SYMBOLS = 8;
const CAPABILITY_PREAMBLE_MS = 1500;
const CAPABILITY_REPEAT_INTERVAL_MS = 10_000;
const CAPABILITY_REPEAT_BURST_MS = 500;

export function mountSend() {
const qrGrid = document.getElementById("qr-grid") as HTMLDivElement;
const canvases = [...qrGrid.querySelectorAll<HTMLCanvasElement>("[data-qr-symbol]")];
const stage = document.getElementById("stage") as HTMLDivElement;
const qrDisplayArea = document.getElementById("qr-display-area") as HTMLDivElement;
const specs = document.getElementById("specs")!;
const cfgFile = document.getElementById("cfg-file") as HTMLInputElement;
const cfgDirectory = document.getElementById("cfg-directory") as HTMLInputElement;
const cfgSourceDirectory = document.getElementById("cfg-source-directory") as HTMLInputElement;
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
let sourceArchiveAbortController: AbortController | null = null;
let directoryArchiveAbortController: AbortController | null = null;
let sourceArchiveDownloadUrl: string | null = null;
let sourceArchiveOptions: SourceArchiveOptionsDetail = { includeGit: false };
let generation = 0; // bumped on every restart; stale loops see it and die
let resizeDisplay: (() => void) | null = null;
let stopStream: (() => void) | null = null;
const qrResizeObserver = typeof ResizeObserver === "undefined"
  ? null
  : new ResizeObserver(() => resizeDisplay?.());
qrResizeObserver?.observe(qrDisplayArea);
let sendTuning = normalizeSendTuning({
  frameBytes: Number(cfgSpeed.dataset.frameBytes) || DEFAULT_SEND_TUNING.frameBytes,
  txFps: Number(cfgSpeed.dataset.txFps) || DEFAULT_SEND_TUNING.txFps,
  symbolsPerTick: Number(cfgSpeed.dataset.symbolsPerTick) || DEFAULT_SEND_TUNING.symbolsPerTick,
});
let detectedSenderCapabilities: SenderCapabilitiesDetail | null = null;

function senderCapabilitiesForHello(): SenderCapabilitiesDetail {
  if (detectedSenderCapabilities) return detectedSenderCapabilities;
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  return {
    logicalCores: Math.max(1, navigator.hardwareConcurrency || 1),
    deviceMemoryGiB: navigatorWithMemory.deviceMemory,
    shortViewportEdge: Math.round(Math.min(window.innerWidth, window.innerHeight)),
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

function activeSendTuning(): SendTuning {
  return sendTuning;
}

function activeMaxFileBytes(): number {
  return maximumFileBytes(activeSendTuning().frameBytes);
}

function updateFileLimitLabel(): void {
  filePickerLabel.textContent = `任意文件或源码文件夹 · 最大 ${formatBytes(activeMaxFileBytes())}`;
}

const specsLine = statusLine(specs);
const setStatus = specsLine.setStatus;
const showLoading = specsLine.showLoading;

function invalidateStream(announceInactive = true): number {
  generation++;
  resizeDisplay = null;
  stopStream?.();
  stopStream = null;
  if (announceInactive) {
    reportSendProgress({ active: false, percent: 0, round: 1, emittedSymbols: 0, targetSymbols: 0 });
  }
  return generation;
}

function cancelSourceArchive(): void {
  sourceArchiveAbortController?.abort();
  sourceArchiveAbortController = null;
  reportSourceArchive({ state: "idle", percent: 0, message: "" });
}

function cancelDirectoryArchive(): void {
  directoryArchiveAbortController?.abort();
  directoryArchiveAbortController = null;
}

function revokeSourceArchiveDownload(): void {
  if (!sourceArchiveDownloadUrl) return;
  URL.revokeObjectURL(sourceArchiveDownloadUrl);
  sourceArchiveDownloadUrl = null;
}

function clearFileSelection(preserveArchiveDialog = false): void {
  sourceArchiveAbortController?.abort();
  sourceArchiveAbortController = null;
  cancelDirectoryArchive();
  revokeSourceArchiveDownload();
  invalidateStream();
  selectedFile = null;
  stage.hidden = true;
  cfgFile.value = "";
  cfgDirectory.value = "";
  cfgSourceDirectory.value = "";
  fileNameLabel.textContent = "未选择文件或文件夹";
  setStatus("选择文件开始");
  if (!preserveArchiveDialog) {
    reportSourceArchive({ state: "idle", percent: 0, message: "" });
  }
}

function reportSourceArchive(detail: SourceArchiveProgressDetail): void {
  window.dispatchEvent(new CustomEvent<SourceArchiveProgressDetail>(SOURCE_ARCHIVE_PROGRESS_EVENT, { detail }));
}

const onSourceArchiveOptions = (event: Event) => {
  sourceArchiveOptions = (event as CustomEvent<SourceArchiveOptionsDetail>).detail;
};

const onSourceArchiveClear = () => clearFileSelection(true);

function reportSendProgress(detail: SendProgressDetail) {
  window.dispatchEvent(new CustomEvent<SendProgressDetail>(SEND_PROGRESS_EVENT, { detail }));
}

function afterNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
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
  cancelSourceArchive();
  cancelDirectoryArchive();
  revokeSourceArchiveDownload();
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
  else if (mode === "file" && cfgDirectory.files?.length) void selectDirectory();
  else if (mode === "file" && cfgSourceDirectory.files?.length) void selectSourceDirectory();
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
  autoStart = true,
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
    if (autoStart) await startStream(true);
    else setStatus(`${name} · ${formatBytes(size)} · 已准备完成，可下载或使用二维码发送`);
  } catch (error) {
    if (selectionGeneration !== generation) return;
    showError(error instanceof Error ? error.message : String(error));
  }
}

async function selectFile(): Promise<void> {
  cancelSourceArchive();
  revokeSourceArchiveDownload();
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
          `超过当前每码 ${activeSendTuning().frameBytes} 字节设置的 ${formatBytes(maxFileBytes)} 限制。`,
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

async function selectDirectory(): Promise<void> {
  cancelSourceArchive();
  revokeSourceArchiveDownload();
  const files = [...(cfgDirectory.files ?? [])];
  if (files.length === 0) return;
  if (files.length > 65_535) {
    showError("文件夹包含的文件超过 65,535 个，ZIP 格式无法安全保存。");
    return;
  }

  const paths = files.map((file) => file.webkitRelativePath.replace(/\\/g, "/"));
  const rootName = paths[0]?.split("/")[0] ?? "";
  if (!isValidWindowsFileName(rootName)) {
    showError("文件夹名称无法在 Windows 中使用，请先重命名。");
    return;
  }
  for (const path of paths) {
    const segments = path.split("/");
    if (
      segments.length < 2 ||
      segments[0] !== rootName ||
      segments.some((segment) => !segment || segment === "." || segment === ".." || !isValidWindowsFileName(segment))
    ) {
      showError("文件夹中包含无法在 Windows 中使用的路径或文件名。");
      return;
    }
  }

  const abortController = new AbortController();
  directoryArchiveAbortController = abortController;
  fileNameLabel.textContent = `${rootName} · ${files.length.toLocaleString()} 个文件`;
  try {
    await startSelection(`正在 Worker 中压缩 ${rootName}…`, async () => {
      const archive = await createClipboardDirectoryArchiveInWorker(
        files.map((file, index) => ({ path: paths[index]!, blob: file })),
        abortController.signal,
      );
      const maxFileBytes = activeMaxFileBytes();
      if (archive.length > maxFileBytes) {
        throw new Error(
          `${rootName}.zip 大小为 ${formatBytes(archive.length)}，` +
          `超过当前每码 ${activeSendTuning().frameBytes} 字节设置的 ${formatBytes(maxFileBytes)} 限制。`,
        );
      }
      const archiveName = `${rootName}.zip`;
      fileNameLabel.textContent = `${archiveName} · ${files.length.toLocaleString()} 个文件 · ${formatBytes(archive.length)}`;
      return {
        name: archiveName,
        size: archive.length,
        packed: await packFile(archiveName, "application/zip", archive, maxFileBytes),
      };
    });
  } finally {
    if (directoryArchiveAbortController === abortController) directoryArchiveAbortController = null;
  }
}

async function selectSourceDirectory(): Promise<void> {
  sourceArchiveAbortController?.abort();
  sourceArchiveAbortController = null;
  revokeSourceArchiveDownload();
  const files = cfgSourceDirectory.files;
  if (!files?.length) return;
  const abortController = new AbortController();
  sourceArchiveAbortController = abortController;
  let progressPercent = 0;
  const selectedRoot = files[0]?.webkitRelativePath.replace(/\\/g, "/").split("/")[0] || "源码文件夹";
  fileNameLabel.textContent = `${selectedRoot} · 正在筛选源码…`;
  reportSourceArchive({ state: "running", percent: 1, message: `已选择 ${selectedRoot}，正在准备文件列表` });
  try {
    await startSelection(`正在 Worker 中过滤并压缩 ${selectedRoot}…`, async () => {
      try {
        const maxFileBytes = activeMaxFileBytes();
        const archive = await createSourceArchiveInWorker(
          files,
          maxFileBytes,
          abortController.signal,
          (progress) => {
            progressPercent = progress.percent;
            reportSourceArchive({ state: "running", ...progress });
          },
          sourceArchiveOptions,
        );
        fileNameLabel.textContent =
          `${archive.name} · ${formatBytes(archive.inputBytes)} → ZIP ${formatBytes(archive.bytes.length)}` +
          ` · 保留 ${archive.includedFileCount.toLocaleString()} 个` +
          ` · 排除 ${archive.excludedFileCount.toLocaleString()} 个`;
        progressPercent = 96;
        reportSourceArchive({
          state: "running",
          percent: 96,
          message: "ZIP 已生成，正在校验并封装二维码数据",
          archiveName: archive.name,
          archiveBytes: archive.bytes.length,
        });
        await afterNextPaint();
        if (abortController.signal.aborted) throw new Error("源码文件夹压缩已取消。");
        const packed = await packFile(archive.name, "application/zip", archive.bytes, maxFileBytes);
        if (abortController.signal.aborted) throw new Error("源码文件夹压缩已取消。");
        sourceArchiveDownloadUrl = URL.createObjectURL(new Blob([archive.bytes as BlobPart], { type: "application/zip" }));
        reportSourceArchive({
          state: "success",
          percent: 100,
          message: `发送文件已准备完成：${archive.name} · ${formatBytes(archive.bytes.length)}`,
          archiveName: archive.name,
          archiveBytes: archive.bytes.length,
          downloadUrl: sourceArchiveDownloadUrl,
        });
        return {
          name: archive.name,
          size: archive.bytes.length,
          packed,
        };
      } catch (error) {
        if (abortController.signal.aborted) {
          reportSourceArchive({ state: "idle", percent: 0, message: "" });
        } else {
          reportSourceArchive({
            state: "error",
            percent: progressPercent,
            message: error instanceof Error ? error.message : "源码文件夹压缩失败。",
          });
        }
        throw error;
      }
    }, false);
  } finally {
    if (sourceArchiveAbortController === abortController) sourceArchiveAbortController = null;
  }
}

async function selectSnippet(): Promise<void> {
  cancelSourceArchive();
  revokeSourceArchiveDownload();
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

  // Opening any picker immediately clears the old transfer. Cancelling the
  // system picker therefore leaves an honest empty state instead of silently
  // retaining an old file or QR stream.
  cfgFile.addEventListener("click", () => clearFileSelection());
  cfgDirectory.addEventListener("click", () => clearFileSelection());
  cfgSourceDirectory.addEventListener("click", () => clearFileSelection(true));
  cfgFile.addEventListener("change", () => void selectFile());
  cfgDirectory.addEventListener("change", () => void selectDirectory());
  cfgSourceDirectory.addEventListener("change", () => void selectSourceDirectory());
  sendSnippetBtn.addEventListener("click", () => void selectSnippet());
  for (const input of modeInputs) input.addEventListener("change", applyMode);
  applyMode();
  window.addEventListener("resize", onResize);
  window.addEventListener(SEND_SPEED_CHANGE_EVENT, onSpeedChange);
  window.addEventListener(SEND_CAPABILITIES_EVENT, onSenderCapabilities);
  window.addEventListener(SOURCE_ARCHIVE_OPTIONS_EVENT, onSourceArchiveOptions);
  window.addEventListener(SOURCE_ARCHIVE_CLEAR_EVENT, onSourceArchiveClear);
  window.addEventListener(SOURCE_ARCHIVE_SEND_EVENT, onSourceArchiveSend);
}

const onResize = () => resizeDisplay?.();
const onSpeedChange = (event: Event) => {
  sendTuning = normalizeSendTuning((event as CustomEvent<SendTuning>).detail);
  updateFileLimitLabel();
  // Capability inspection finishes asynchronously. If it completes while a
  // file is still being read or archived, restarting here would invalidate
  // that in-flight selection. The selection will start with the new tuning
  // once preparation finishes; only an already prepared stream needs restart.
  if (selectedFile) void startStream(false, true);
};
const onSenderCapabilities = (event: Event) => {
  detectedSenderCapabilities = (event as CustomEvent<SenderCapabilitiesDetail>).detail;
};

const onSourceArchiveSend = () => {
  void startStream(true);
};

/** Only on a fresh pick — a settings change restarts the stream too, and
 *  yanking the page down every time you nudge tx fps is worse than useless. */
function scrollStageIntoView() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  requestAnimationFrame(() => {
    stage.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  });
}

async function startStream(revealStage = false, preserveDialog = false) {
  const gen = invalidateStream(!preserveDialog);
  const tuning = activeSendTuning();
  if (!selectedFile) {
    setStatus(
      `${tuning.frameBytes} 字节 · ${tuning.txFps} FPS · 每次 ${tuning.symbolsPerTick} 码 · ` +
        `${currentMode() === "snippet" ? "输入要发送的文字" : "选择文件开始"}`,
    );
    return;
  }
  const { name, size: fileSize, payload, compression, transmittedSize } = selectedFile;
  if (gen !== generation) return; // superseded while fetching
  const txFps = tuning.txFps;
  const frameBytes = tuning.frameBytes;
  const symbolsPerTick = tuning.symbolsPerTick;
  const ecc = "L" as const;

  const sessionId = (Math.floor(Math.random() * 0xffff) + 1) & 0xffff;
  const blockLen = blockLength(frameBytes);
  // Keep selectedFile on this path — raising the combined speed preset is the fix,
  // and dropping the pick would hide that.
  if (!fitsInOneStream(payload.length, frameBytes)) {
    const suggestion = minimumFrameBytes(payload.length);
    showError(
      `${formatBytes(payload.length)} 需要 ` +
        `${sourceBlockCount(payload.length, frameBytes).toLocaleString()} 个数据块，` +
        `已超过当前每码 ${frameBytes} 字节的上限。` +
        (suggestion <= SEND_TUNING_LIMITS.frameBytes.max
          ? `请把“每码字节”至少调整为 ${suggestion}。`
          : "请减小文件后重试。"),
    );
    return;
  }
  const sourceBlocks = sourceBlockCount(payload.length, frameBytes);
  const targetSymbols = Math.ceil(
    sourceBlocks * expectedFountainOverhead(sourceBlocks) / symbolsPerTick,
  ) * symbolsPerTick;
  let emittedSymbols = 0;
  reportSendProgress({ active: true, percent: 0, round: 1, emittedSymbols, targetSymbols });
  showLoading(`正在按 ${frameBytes} 字节 / ${txFps} FPS / ${symbolsPerTick} 码初始化二维码…`);
  await afterNextPaint();
  if (gen !== generation) return;

  const encoder = new LTEncoder(payload, blockLen, sessionId);
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
  let capabilityFrame: ImageData | null = null;
  let capabilityCanvas: HTMLCanvasElement | null = null;
  const queue: ImageData[] = [];
  let nextSeq = 0;
  let layoutRestartScheduled = false;
  stage.hidden = false;

  const sizeCanvas = () => {
    const dpr = window.devicePixelRatio || 1;
    const total = modules + 2 * MARGIN;
    const areaStyle = getComputedStyle(qrDisplayArea);
    const horizontalAreaChrome =
      Number.parseFloat(areaStyle.paddingLeft) +
      Number.parseFloat(areaStyle.paddingRight) +
      Number.parseFloat(areaStyle.borderLeftWidth) +
      Number.parseFloat(areaStyle.borderRightWidth);
    const verticalAreaChrome =
      Number.parseFloat(areaStyle.paddingTop) +
      Number.parseFloat(areaStyle.paddingBottom) +
      Number.parseFloat(areaStyle.borderTopWidth) +
      Number.parseFloat(areaStyle.borderBottomWidth);
    const stageStyle = getComputedStyle(stage);
    const horizontalChrome =
      Number.parseFloat(stageStyle.paddingLeft) +
      Number.parseFloat(stageStyle.paddingRight) +
      Number.parseFloat(stageStyle.borderLeftWidth) +
      Number.parseFloat(stageStyle.borderRightWidth);
    const gridBudget = fitQrDisplayArea(
      qrDisplayArea.clientWidth,
      qrDisplayArea.clientHeight,
      horizontalAreaChrome + horizontalChrome,
      verticalAreaChrome,
    );
    if (gridBudget <= 0) return;
    const gridStyle = getComputedStyle(qrGrid);
    const gap = Number.parseFloat(gridStyle.columnGap) || 0;
    if (!canFitQrGridAtIntegerPixels(total, gridBudget, gap, dpr) && !layoutRestartScheduled) {
      const nextTuning = normalizeSendTuning({
        ...tuning,
        frameBytes: Math.max(minimumFrameBytes(payload.length), frameBytes - 100),
      });
      const nextFrameBytes = nextTuning.frameBytes;
      if (nextFrameBytes < frameBytes && fitsInOneStream(payload.length, nextFrameBytes)) {
        layoutRestartScheduled = true;
        sendTuning = nextTuning;
        window.dispatchEvent(new CustomEvent<SendTuning>(SEND_SPEED_SYNC_EVENT, { detail: sendTuning }));
        setStatus(`当前画面较窄，已把每码字节自动调整为 ${nextFrameBytes}`);
        window.setTimeout(() => void startStream(true, true), 0);
        return;
      }
    }
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
    const ctx = canvasContexts[index]!;
    const target = canvases[index]!;
    ctx.imageSmoothingEnabled = false;
    if (frame === capabilityFrame && capabilityCanvas) {
      ctx.drawImage(capabilityCanvas, 0, 0, target.width, target.height);
    } else {
      stagingContext.putImageData(frame, 0, 0);
      ctx.drawImage(staging, 0, 0, target.width, target.height);
    }
  }

  const showStreamStatus = () => {
    if (version === undefined) return;
    const refreshMode = symbolsPerTick === QR_GRID_CELLS ? "同步刷新" : "轮流刷新";
    const refreshesPerCode = txFps * symbolsPerTick / QR_GRID_CELLS;
    setStatus(
      `${QR_GRID_CELLS} QR ${refreshMode} · ` +
        `${txFps * symbolsPerTick} symbols/s · 每码 ${refreshesPerCode} 次/s · ` +
        `${frameBytes} 字节 · V${version} · ${scale} px/模块 · ECC ${ecc} · ` +
        `${name} · ${formatBytes(fileSize)} · ` +
        `${compression === "gzip" ? `gzip 后 ${formatBytes(transmittedSize)}` : "未压缩"} · ` +
        `K=${encoder.k}`,
    );
  };

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
      requestAnimationFrame(() => requestAnimationFrame(sizeCanvas));
      // Scroll only now: before sizeCanvas() the canvas is still 16×16, so the
      // scroll target would be the wrong height.
      if (revealStage) scrollStageIntoView();
      showStreamStatus();
    }
    const raster = rasterizeQr(qr.modules.size, qr.modules.data, MARGIN);
    return new ImageData(new Uint8ClampedArray(raster.pixels.buffer), raster.size, raster.size);
  };

  /**
   * Refill the symbol lookahead. Generation happens after painting so the
   * visual update never waits for the next QR to be encoded.
   *
   * The initial four visible symbols are painted first. Lookahead generation
   * then starts in a timer and refills once per tick, so opening the QR dialog
   * never waits for an eager eight-symbol batch on a constrained sender.
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
  const capabilities = senderCapabilitiesForHello();
  const createCapabilityFrame = (senderUtilizationPercent?: number): ImageData => {
    const helloBytes = packSenderCapabilityHello({
      sessionId,
      logicalCores: capabilities.logicalCores,
      deviceMemoryGiB: capabilities.deviceMemoryGiB,
      refreshRateHz: capabilities.refreshRateHz,
      shortViewportEdge: capabilities.shortViewportEdge,
      devicePixelRatio: capabilities.devicePixelRatio ?? 1,
      txFps,
      symbolsPerTick,
      frameBytes,
      senderUtilizationPercent,
    });
    const helloQr = QRCode.create(
      [{ data: helloBytes, mode: "byte" } as unknown as QRCode.QRCodeSegment],
      { errorCorrectionLevel: "M", maskPattern: 4 },
    );
    const helloRaster = rasterizeQr(helloQr.modules.size, helloQr.modules.data, MARGIN);
    const frame = new ImageData(
      new Uint8ClampedArray(helloRaster.pixels.buffer),
      helloRaster.size,
      helloRaster.size,
    );
    capabilityFrame = frame;
    capabilityCanvas = document.createElement("canvas");
    capabilityCanvas.width = frame.width;
    capabilityCanvas.height = frame.height;
    capabilityCanvas.getContext("2d")!.putImageData(frame, 0, 0);
    return frame;
  };
  let helloFrame = createCapabilityFrame();
  canvases.forEach((_, index) => drawSymbol(index, helloFrame));
  setStatus(
    `正在发送设备能力 · ${capabilities.logicalCores} 线程 · ` +
      `${capabilities.deviceMemoryGiB ?? "未知"} GiB · ${frameBytes} 字节 / ${txFps} FPS / ${symbolsPerTick} 码`,
  );
  await new Promise((resolve) => window.setTimeout(resolve, CAPABILITY_PREAMBLE_MS));
  if (gen !== generation) return;

  initialFrames.forEach((frame, index) => drawSymbol(index, frame));
  showStreamStatus();
  emittedSymbols = initialFrames.length;
  const emittedInInitialRound = ((emittedSymbols - 1) % targetSymbols) + 1;
  reportSendProgress({
    active: true,
    percent: emittedInInitialRound / targetSymbols * 100,
    round: Math.floor((emittedSymbols - 1) / targetSymbols) + 1,
    emittedSymbols: emittedInInitialRound,
    targetSymbols,
  });
  let lastProgressReportAt = performance.now();
  let lastRateAt = lastProgressReportAt;
  let lastRateEmitted = emittedSymbols;
  let actualSymbolsPerSecond = 0;
  let totalDisplayTicks = 0;
  let starvedDisplayTicks = 0;

  const interval = 1000 / txFps;
  let nextAt = performance.now();
  let animationFrameId = 0;
  let pumpTimer: number | null = null;
  let nextCanvasIndex = 0;
  let nextCapabilityBurstAt = performance.now() + CAPABILITY_REPEAT_INTERVAL_MS;
  let capabilityBurstUntil = 0;
  const schedulePump = () => {
    if (pumpTimer !== null || generatorFailed || gen !== generation) return;
    pumpTimer = window.setTimeout(() => {
      pumpTimer = null;
      pump(symbolsPerTick);
    }, 0);
  };
  schedulePump();
  const reportRuntimeProgress = (now: number) => {
    if (!isSendProgressReportDue(now, lastProgressReportAt)) return;
    const seconds = Math.max(0.001, (now - lastRateAt) / 1000);
    const instantRate = (emittedSymbols - lastRateEmitted) / seconds;
    actualSymbolsPerSecond = actualSymbolsPerSecond === 0
      ? instantRate
      : actualSymbolsPerSecond * 0.7 + instantRate * 0.3;
    const targetSymbolsPerSecond = txFps * symbolsPerTick;
    const round = Math.floor((emittedSymbols - 1) / targetSymbols) + 1;
    const emittedInRound = ((emittedSymbols - 1) % targetSymbols) + 1;
    reportSendProgress({
      active: true,
      percent: emittedInRound / targetSymbols * 100,
      round,
      emittedSymbols: emittedInRound,
      targetSymbols,
      actualSymbolsPerSecond,
      targetSymbolsPerSecond,
      senderUtilizationPercent: Math.min(100, actualSymbolsPerSecond / targetSymbolsPerSecond * 100),
      queueStarvedPercent: totalDisplayTicks === 0 ? 0 : starvedDisplayTicks / totalDisplayTicks * 100,
    });
    lastRateAt = now;
    lastRateEmitted = emittedSymbols;
    lastProgressReportAt = now;
  };
  const tick = (now: number) => {
    // generatorFailed means no frame will ever be produced again, so stop the
    // rAF loop rather than spinning on an empty queue until a settings change.
    if (gen !== generation || generatorFailed) return;
    animationFrameId = requestAnimationFrame(tick);
    if (now + 0.5 < nextAt) return;
    totalDisplayTicks++;
    if (now >= nextCapabilityBurstAt) {
      helloFrame = createCapabilityFrame(
        Math.min(100, actualSymbolsPerSecond / (txFps * symbolsPerTick) * 100),
      );
      capabilityBurstUntil = now + CAPABILITY_REPEAT_BURST_MS;
      nextCapabilityBurstAt = now + CAPABILITY_REPEAT_INTERVAL_MS;
    }
    const showCapability = now < capabilityBurstUntil;
    const dataSlots = Math.max(0, symbolsPerTick - (showCapability ? 1 : 0));
    if (queue.length < dataSlots) {
      starvedDisplayTicks++;
      schedulePump();
      reportRuntimeProgress(now);
      nextAt = now + interval;
      return;
    }
    if (showCapability) {
      drawSymbol(nextCanvasIndex, helloFrame);
      nextCanvasIndex = (nextCanvasIndex + 1) % QR_GRID_CELLS;
    }
    const batch = queue.splice(0, dataSlots);
    for (const frame of batch) {
      drawSymbol(nextCanvasIndex, frame);
      nextCanvasIndex = (nextCanvasIndex + 1) % QR_GRID_CELLS;
    }
    emittedSymbols += dataSlots;
    reportRuntimeProgress(now);
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
  cancelSourceArchive();
  cancelDirectoryArchive();
  invalidateStream();
  window.removeEventListener("resize", onResize);
  window.removeEventListener(SEND_SPEED_CHANGE_EVENT, onSpeedChange);
  window.removeEventListener(SEND_CAPABILITIES_EVENT, onSenderCapabilities);
  window.removeEventListener(SOURCE_ARCHIVE_OPTIONS_EVENT, onSourceArchiveOptions);
  window.removeEventListener(SOURCE_ARCHIVE_CLEAR_EVENT, onSourceArchiveClear);
  window.removeEventListener(SOURCE_ARCHIVE_SEND_EVENT, onSourceArchiveSend);
  qrResizeObserver?.disconnect();
  revokeSourceArchiveDownload();
};
}
