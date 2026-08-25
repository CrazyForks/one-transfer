// Receiver: shared desktop or camera → WASM QR decode in workers → fountain
// decoder → file.
//
// Field lessons baked in:
// - requestVideoFrameCallback chains survive a stopped stream and resume on
//   the next one — a generation counter prevents zombie capture loops.
// - Desktop captures can be far larger than a camera frame. Downscale before
//   handing pixels to WASM so scanning a 4K display does not swamp the workers.
// - Progress must track frames COLLECTED: LT peeling back-loads its solve
//   cascade, so blocks-solved looks stalled and then teleports to done.

import { LTDecoder } from "../shared/fountain";
import {
  estimateTransferProgress,
  expectedFountainOverhead,
  formatDuration,
} from "../shared/progress";
import { createDecodeWorker } from "./worker-factory";
import { NoSignalHintTimer } from "../shared/no-signal";
import { DecodeWorkerPool } from "../shared/worker-pool";
import { isSnippet, snippetText } from "../shared/snippet";
import {
  HEADER_LEN,
  fnv1a,
  parseFrame,
  streamIdentity,
  unpackFile,
  verifyFile,
} from "../shared/protocol";
import { maximumFileBytes } from "../shared/frame-capacity";
import { mediaAspectRatio } from "../shared/display";
import { statusLine } from "../shared/status-line";
import { requestScreenWakeLock } from "../shared/wake-lock";
import {
  RECEIVE_CAPTURE_CLOSE_EVENT,
  RECEIVE_CAPTURE_START_EVENT,
  type ReceiveCaptureSource,
} from "../shared/receive-events";

export function mountReceive() {
const startBtn = document.getElementById("start") as HTMLButtonElement;
const cameraBtn = document.getElementById("start-camera") as HTMLButtonElement;
const captureActions = document.getElementById("capture-actions")!;
const video = document.getElementById("video") as HTMLVideoElement;
const preview = document.getElementById("preview")!;
const stats = document.getElementById("stats")!;
const progressEl = document.getElementById("progress")!;
const bar = document.getElementById("bar")!;
const progressStatus = document.getElementById("progress-status")!;
const progressLabel = document.getElementById("progress-label")!;
const etaLabel = document.getElementById("eta-label")!;
const result = document.getElementById("result")!;
const metricsEl = document.getElementById("metrics")!;
const cfgWidth = document.getElementById("cfg-width") as HTMLSelectElement;
const cfgCapFps = document.getElementById("cfg-capfps") as HTMLSelectElement;
const cfgWorkers = document.getElementById("cfg-workers") as HTMLSelectElement;
const captureActual = document.getElementById("capture-actual")!;
const receiveLog = document.getElementById("receive-log")!;
const copyReceiveLog = document.getElementById("copy-receive-log") as HTMLButtonElement;
const clearReceiveLog = document.getElementById("clear-receive-log") as HTMLButtonElement;
const metric = (id: string) => document.getElementById(id)!;

const diagnosticLines: string[] = [];
function diagnosticLog(event: string, detail: Record<string, unknown> = {}) {
  const line = `${new Date().toISOString()} ${event} ${JSON.stringify(detail)}`;
  diagnosticLines.push(line);
  if (diagnosticLines.length > 200) diagnosticLines.splice(0, diagnosticLines.length - 200);
  receiveLog.textContent = diagnosticLines.join("\n");
  receiveLog.scrollTop = receiveLog.scrollHeight;
  console.debug("[One Transfer receive]", event, detail);
}

copyReceiveLog.onclick = async () => {
  try {
    await navigator.clipboard.writeText(diagnosticLines.join("\n"));
    copyReceiveLog.textContent = "已复制";
    window.setTimeout(() => { copyReceiveLog.textContent = "复制"; }, 1200);
  } catch {
    copyReceiveLog.textContent = "复制失败";
  }
};
clearReceiveLog.onclick = () => {
  diagnosticLines.length = 0;
  receiveLog.textContent = "日志已清空";
};

// Nothing has decoded in this long → the sender is almost certainly too dense
// for this capture. Also the delay before a dismissed hint comes back, since
// dismissing it doesn't make the transfer start working.
const NO_SIGNAL_AFTER_MS = 10_000;

// Sliding window for the capture/decode fps metrics — the per-second rates in
// updateStats() are derived from this, so the window and the divisor can't
// drift apart.
const STATS_WINDOW_MS = 2000;

let stream: MediaStream | null = null;
let decoder: LTDecoder | null = null;
let streamKey = "";
let startTs = 0;
let captureGen = 0;
let captureSource: "screen" | "camera" = "screen";
let finishing = false;
let settingsWired = false;
let statsTimer: ReturnType<typeof setInterval> | undefined;
let resultObjectUrl: string | null = null;
let disposed = false;
let lastAutoScaleDropCount = 0;
let workersManuallySet = false;
let parsedPayloadCount = 0;
let invalidPayloadCount = 0;
let lastDiagnosticAt = 0;
const finishedStreamKeys = new Set<string>();
const intentionallyStoppedTracks = new WeakSet<MediaStreamTrack>();

const noSignal = new NoSignalHintTimer(NO_SIGNAL_AFTER_MS);
const pool = new DecodeWorkerPool(createDecodeWorker, (bytes) => onDecoded(bytes));
const captureTimes: number[] = [];
const decodeTimes: number[] = [];
let busyDropCount = 0;

diagnosticLog("receiver-mounted", {
  userAgent: navigator.userAgent,
  logicalCores: navigator.hardwareConcurrency,
  viewport: `${window.innerWidth}x${window.innerHeight}`,
  devicePixelRatio: window.devicePixelRatio,
});

const onCaptureStart = (event: Event) => {
  void start((event as CustomEvent<ReceiveCaptureSource>).detail);
};
const onCaptureDialogClose = () => stopCaptureForNavigation();
window.addEventListener(RECEIVE_CAPTURE_START_EVENT, onCaptureStart);
window.addEventListener(RECEIVE_CAPTURE_CLOSE_EVENT, onCaptureDialogClose);

const { setStatus, showLoading, showError } = statusLine(stats);

/** Only the latest result is kept on screen. Revoke its Blob URL before
 * replacing it so an unattended continuous receiver does not retain every
 * recovered file in memory. */
function replaceResult(...nodes: (Node | string)[]) {
  if (resultObjectUrl) {
    URL.revokeObjectURL(resultObjectUrl);
    resultObjectUrl = null;
  }
  result.replaceChildren(...nodes);
}

function updatePreviewAspect(settings?: MediaTrackSettings) {
  const width = video.videoWidth || settings?.width || 0;
  const height = video.videoHeight || settings?.height || 0;
  preview.style.aspectRatio = mediaAspectRatio(width, height);
}

/** Put the page back the way it was so a refused or stopped capture can be
 * retried without reloading the receiver. */
function offerRetry(message: string) {
  captureGen++;
  stream = null;
  video.srcObject = null;
  clearInterval(statsTimer);
  statsTimer = undefined;
  pool.resize(0);
  decoder = null;
  streamKey = "";
  finishing = false;
  startBtn.disabled = false;
  cameraBtn.disabled = false;
  startBtn.textContent = "扫描电脑屏幕";
  cameraBtn.textContent = "使用相机";
  captureActions.style.display = "flex";
  preview.style.display = "none";
  preview.style.aspectRatio = "";
  metricsEl.style.display = "none";
  progressEl.style.display = "none";
  progressStatus.style.display = "none";
  bar.style.width = "0";
  showError(message);
}

function stopCaptureForNavigation() {
  const activeStream = stream;
  if (!activeStream && !statsTimer && pool.size === 0) return;
  captureGen++;
  stream = null;
  for (const track of activeStream?.getTracks() ?? []) {
    intentionallyStoppedTracks.add(track);
    track.stop();
  }
  video.pause();
  video.srcObject = null;
  clearInterval(statsTimer);
  statsTimer = undefined;
  pool.resize(0);
  decoder = null;
  streamKey = "";
  finishing = false;
  startBtn.disabled = false;
  cameraBtn.disabled = false;
  startBtn.textContent = "扫描电脑屏幕";
  cameraBtn.textContent = "使用相机";
  captureActions.style.display = "flex";
  preview.style.display = "none";
  preview.style.aspectRatio = "";
  metricsEl.style.display = "none";
  progressEl.style.display = "none";
  progressStatus.style.display = "none";
  bar.style.width = "0";
  setStatus("选择扫描方式开始");
}

async function start(source: "screen" | "camera") {
  const mediaDevices = navigator.mediaDevices;
  const captureUnavailable =
    !mediaDevices ||
    (source === "screen"
      ? typeof mediaDevices.getDisplayMedia !== "function"
      : typeof mediaDevices.getUserMedia !== "function");
  if (captureUnavailable) {
    showError(
      `${source === "screen" ? "屏幕扫描" : "相机"}需要安全的浏览器环境，请使用 HTTPS 打开。`,
    );
    return;
  }
  const captureWidth = Number(cfgWidth.value);
  const captureFps = Number(cfgCapFps.value);
  diagnosticLog("capture-request", {
    source,
    requestedWidth: captureWidth,
    requestedFps: captureFps,
    requestedWorkers: Number(cfgWorkers.value),
  });
  captureSource = source;
  // Nothing on the page changes until the selected capture is actually live:
  // error paths below all have to leave a usable Start button behind.
  startBtn.disabled = true;
  cameraBtn.disabled = true;
  const activeButton = source === "screen" ? startBtn : cameraBtn;
  activeButton.textContent = source === "screen" ? "选择屏幕…" : "正在启动相机…";
  try {
    if (source === "screen") {
      stream = await mediaDevices.getDisplayMedia({
        audio: false,
        video: { frameRate: { ideal: captureFps } },
      });
    } else {
      const base: MediaTrackConstraints = {
        facingMode: "environment",
        width: { ideal: captureWidth },
        height: { ideal: Math.round((captureWidth * 3) / 4) },
      };
      try {
        stream = await mediaDevices.getUserMedia({
          audio: false,
          video: { ...base, frameRate: { exact: captureFps } },
        });
      } catch {
        stream = await mediaDevices.getUserMedia({
          audio: false,
          video: { ...base, frameRate: { ideal: captureFps } },
        });
      }
    }
  } catch (err) {
    diagnosticLog("capture-error", {
      source,
      name: err instanceof DOMException ? err.name : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
    const denied = err instanceof DOMException && err.name === "NotAllowedError";
    offerRetry(
      denied
        ? source === "screen"
          ? "已取消屏幕共享。请重新扫描，并选择显示二维码的屏幕或窗口。"
          : "相机权限被拒绝。允许相机访问后再试一次。"
        : `${source === "screen" ? "屏幕" : "相机"}：${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  if (disposed) {
    stopCaptureForNavigation();
    return;
  }

  captureActions.style.display = "none";
  preview.style.display = "block";
  metricsEl.style.display = "grid";
  progressEl.style.display = "block";
  progressStatus.style.display = "flex";
  progressEl.setAttribute("aria-valuenow", "0");
  bar.style.width = "0";
  progressLabel.textContent = "0% · 等待二维码";
  etaLabel.textContent = "正在查找二维码";
  video.srcObject = stream;
  await video.play().catch(() => undefined);
  const track = stream.getVideoTracks()[0];
  const settings = track?.getSettings();
  diagnosticLog("capture-started", {
    source,
    width: settings?.width,
    height: settings?.height,
    frameRate: settings?.frameRate,
    facingMode: settings?.facingMode,
  });
  updatePreviewAspect(settings);
  track?.addEventListener("ended", () => {
    if (track && intentionallyStoppedTracks.delete(track)) return;
    offerRetry(
      captureSource === "screen"
        ? "屏幕共享已停止，请重新选择屏幕。"
        : "相机已停止，请重新启动相机。",
    );
  }, { once: true });
  showLoading(
    `${source === "screen" ? "屏幕" : "相机"} ${settings?.width}×${settings?.height}@${settings?.frameRate} · 正在查找二维码…`,
  );

  pool.resetMetrics();
  busyDropCount = 0;
  lastAutoScaleDropCount = 0;
  workersManuallySet = false;
  captureTimes.length = 0;
  decodeTimes.length = 0;
  parsedPayloadCount = 0;
  invalidPayloadCount = 0;
  lastDiagnosticAt = 0;
  const logicalCores = navigator.hardwareConcurrency || 4;
  const suggestedWorkers = logicalCores >= 8 ? 4 : logicalCores >= 6 ? 3 : 2;
  cfgWorkers.value = String(suggestedWorkers);
  pool.resize(Number(cfgWorkers.value));
  diagnosticLog("worker-pool-ready", { workers: pool.size });
  reportCaptureSettings();
  if (!settingsWired) {
    settingsWired = true;
    for (const el of [cfgWidth, cfgCapFps, cfgWorkers]) {
      el.addEventListener("change", () => {
        if (el === cfgWorkers) workersManuallySet = true;
        void applyReceiveSettings();
      });
    }
  }

  noSignal.cameraStarted(performance.now());
  captureGen++;
  scheduleFrame(captureGen);
  statsTimer = setInterval(updateStats, 500);
  await requestScreenWakeLock();
}

function reportCaptureSettings() {
  const track = stream?.getVideoTracks()[0];
  if (!track) return;
  const s = track.getSettings();
  const askedFps = Number(cfgCapFps.value);
  const gotFps = Math.round(s.frameRate ?? 0);
  const fpsNote = gotFps && gotFps !== askedFps ? `（请求 ${askedFps}）` : "";
  const sourceLabel = captureSource === "screen" ? "共享屏幕" : "相机";
  const decode = pool.metrics;
  captureActual.textContent =
    `${sourceLabel} ${s.width}×${s.height} @ ${gotFps} fps${fpsNote} · ` +
    `解码宽度 ${cfgWidth.value} · ${pool.size} 个线程 · ` +
    `平均解码 ${decode.averageDecodeMs.toFixed(1)} ms · ` +
    `有效码 ${decode.decodedPayloads} · 忙碌丢帧 ${busyDropCount}`;
}

async function applyReceiveSettings() {
  pool.resize(Number(cfgWorkers.value));
  diagnosticLog("settings-change", {
    decodeWidth: Number(cfgWidth.value),
    requestedFps: Number(cfgCapFps.value),
    workers: pool.size,
  });
  const track = stream?.getVideoTracks()[0];
  if (!track) return;
  const width = Number(cfgWidth.value);
  try {
    await track.applyConstraints(
      captureSource === "screen"
        ? { frameRate: { ideal: Number(cfgCapFps.value) } }
        : {
            width: { ideal: width },
            height: { ideal: Math.round((width * 3) / 4) },
            frameRate: { ideal: Number(cfgCapFps.value) },
          },
    );
  } catch {
    diagnosticLog("settings-apply-failed", {
      source: captureSource,
      decodeWidth: width,
      requestedFps: Number(cfgCapFps.value),
    });
    captureActual.textContent =
      `${captureSource === "screen" ? "屏幕" : "相机"}无法应用帧率设置`;
    return;
  }
  updatePreviewAspect(track.getSettings());
  reportCaptureSettings();
}

type VideoRVFC = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };

function scheduleFrame(gen: number) {
  if (gen !== captureGen) return;
  const v = video as VideoRVFC;
  const next = () => {
    if (gen !== captureGen) return;
    captureFrame();
    scheduleFrame(gen);
  };
  if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(next);
  else requestAnimationFrame(next);
}

const grab = document.createElement("canvas");
let frameId = 0;

function captureFrame() {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  captureTimes.push(performance.now());
  if (pool.busyCount === pool.size) {
    busyDropCount++;
    return; // all busy — drop it, no harm done
  }
  // The sender displays a centered 2×2 square grid. Crop the camera/screen
  // frame to its centered square before scaling so 16:9 captures do not spend
  // ~44% of their pixel budget scanning guaranteed-empty side regions.
  const sourceSize = Math.min(vw, vh);
  const sourceX = Math.max(0, Math.floor((vw - sourceSize) / 2));
  const sourceY = Math.max(0, Math.floor((vh - sourceSize) / 2));
  const maxWidth = Number(cfgWidth.value);
  const scale = Math.min(1, maxWidth / sourceSize);
  const decodeWidth = Math.max(1, Math.round(sourceSize * scale));
  const decodeHeight = decodeWidth;
  if (grab.width !== decodeWidth || grab.height !== decodeHeight) {
    grab.width = decodeWidth;
    grab.height = decodeHeight;
  }
  const ctx = grab.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(
    video,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    decodeWidth,
    decodeHeight,
  );
  const img = ctx.getImageData(0, 0, decodeWidth, decodeHeight);
  pool.submit(
    { id: frameId++, buf: img.data.buffer, w: decodeWidth, h: decodeHeight },
    [img.data.buffer],
  );
}

function onDecoded(bytes: Uint8Array) {
  decodeTimes.push(performance.now());
  const parsed = parseFrame(bytes);
  if (!parsed) {
    invalidPayloadCount++;
    return;
  }
  parsedPayloadCount++;
  if (finishing) return;
  const { header, block } = parsed;
  if (noSignal.frameDecoded()) replaceResult();
  // streamIdentity() covers every header field that has to hold constant, not
  // just the session id — see the note on it in protocol.ts.
  const identity = streamIdentity(header);
  // The sender loops forever. Once a stream is recovered, ignore its remaining
  // frames until a genuinely new sender session appears, or the same desktop
  // QR animation would be downloaded repeatedly.
  if (finishedStreamKeys.has(identity)) return;
  if (!decoder || streamKey !== identity) {
    decoder = new LTDecoder(header.k, header.blockLen, header.sessionId, header.totalLen);
    streamKey = identity;
    startTs = performance.now();
    bar.classList.remove("error");
    bar.style.width = "0";
    progressEl.setAttribute("aria-valuenow", "0");
    progressEl.style.display = "block";
    progressStatus.style.display = "flex";
    showLoading("正在接收新内容…");
    diagnosticLog("stream-detected", {
      sessionId: header.sessionId,
      sourceBlocks: header.k,
      blockBytes: header.blockLen,
      totalBytes: header.totalLen,
    });
  }
  decoder.addFrame(header.seq, block);
  updateProgressEstimate();

  if (decoder.isComplete) {
    const payload = decoder.assemble()!;
    const seconds = (performance.now() - startTs) / 1000;
    const ok = fnv1a(payload) === header.payloadFnv;
    finishing = true;
    finishedStreamKeys.add(identity);
    const maxFileBytes = maximumFileBytes(header.blockLen + HEADER_LEN);
    void finish(payload, ok, seconds, maxFileBytes);
  }
}

function updateProgressEstimate() {
  if (!decoder) return;
  const elapsed = Math.max(0, (performance.now() - startTs) / 1000);
  const estimate = estimateTransferProgress(
    decoder.k,
    decoder.framesNew,
    elapsed,
    decoder.solvedCount,
  );
  const percent = estimate.fraction * 100;
  const shownPercent = percent < 10 ? percent.toFixed(1) : percent.toFixed(0);
  bar.style.width = `${percent.toFixed(1)}%`;
  progressEl.setAttribute("aria-valuenow", String(Math.floor(percent)));
  progressLabel.textContent =
    `${shownPercent}% · ${decoder.solvedCount}/${decoder.k} 块`;
  // Held back for the first few frames — a two-frame sample reads wildly wrong.
  const rate = decoder.framesNew >= 4 ? ` · ${goodputKbs(elapsed).toFixed(1)} KB/s` : "";
  etaLabel.textContent =
    (estimate.etaSeconds === undefined
      ? estimate.phase === "decoding"
        ? `${decoder.framesNew} 帧 · 正在解码`
        : "正在估算时间"
      : `约 ${formatDuration(estimate.etaSeconds)} · ${decoder.framesNew} 帧`) + rate;
}

/** Payload KB/s, discounting the frames the fountain spends on overhead. That
 *  discount is k-dependent — assuming a flat 1.18 over-reported small transfers
 *  by up to 2×, because a short stream needs far more redundancy per block. */
function goodputKbs(elapsed: number): number {
  if (!decoder) return 0;
  return (
    (decoder.framesNew * decoder.blockLen) /
    expectedFountainOverhead(decoder.k) /
    1024 /
    Math.max(0.1, elapsed)
  );
}

async function finish(
  container: Uint8Array,
  hashOk: boolean,
  seconds: number,
  maxFileBytes: number,
) {
  diagnosticLog("transfer-finish", {
    seconds: Number(seconds.toFixed(2)),
    containerBytes: container.length,
    hashOk,
    netKiBps: Number((container.length / 1024 / Math.max(0.1, seconds)).toFixed(2)),
  });
  bar.style.width = "100%";
  progressEl.setAttribute("aria-valuenow", "100");
  etaLabel.textContent = `共 ${formatDuration(seconds)}`;
  try {
    if (!hashOk) throw new Error("光学数据校验失败。");
    const file = await unpackFile(container, maxFileBytes);
    if (!(await verifyFile(file))) throw new Error("文件未通过 SHA-256 校验。");

    // The container carries its own media type, so the receiver never has to be
    // told in advance whether a file or a text snippet is coming.
    const rate = (container.length / 1024 / seconds).toFixed(1);
    const gzipNote = file.compression === "gzip" ? "已解压 gzip · " : "";
    if (isSnippet(file)) {
      progressLabel.textContent = "100% · 文字已接收";
      setStatus(
        `${seconds.toFixed(1)} 秒收到文字 · ${rate} KB/s · ${gzipNote}` +
          "SHA-256 校验通过 ✓ · 等待下一次传输…",
      );
      showSnippet(snippetText(file));
      return;
    }

    progressLabel.textContent = "100% · 文件已接收";
    const kb = Math.round(file.bytes.length / 1024);
    setStatus(
      `${seconds.toFixed(1)} 秒收到 ${kb} KB · ${rate} KB/s · ${gzipNote}` +
        "SHA-256 校验通过 ✓ · 等待下一次传输…",
    );
    const heading = document.createElement("div");
    heading.className = "done";
    heading.textContent = "接收完成";
    const url = URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: file.type }));
    const download = document.createElement("a");
    download.className = "download";
    download.href = url;
    download.download = file.name;
    download.textContent = `保存 ${file.name}`;
    const actions = document.createElement("div");
    actions.className = "note-actions";
    actions.append(download);
    replaceResult(heading, actions);
    resultObjectUrl = url;
    if (file.type.startsWith("image/")) {
      const image = document.createElement("img");
      image.className = "received";
      image.alt = `接收文件预览：${file.name}`;
      image.src = url;
      result.append(image);
    }
  } catch (error) {
    bar.classList.add("error");
    etaLabel.textContent = "接收失败";
    const message = error instanceof Error ? error.message : String(error);
    showError(`${message} 请重新开始发送，再次显示二维码。`);
    const heading = document.createElement("div");
    heading.className = "failed";
    heading.textContent = "接收失败";
    const detail = document.createElement("p");
    detail.className = "received-note";
    detail.textContent =
      "未能还原有效内容。请重新开始发送，此页面会继续等待新的二维码。";
    replaceResult(heading, detail);
  } finally {
    decoder = null;
    streamKey = "";
    startTs = 0;
    finishing = false;
    progressEl.style.display = "none";
    progressStatus.style.display = "none";
    bar.style.width = "0";
    progressEl.setAttribute("aria-valuenow", "0");
  }
}

/**
 * Ten seconds of capture and not one decoded frame.
 *
 * Both real fixes are on the SENDER, which is the non-obvious part — someone
 * staring at a blank receiver reaches for the capture controls. Dense and
 * fast sender settings can exceed either the camera or screen decoder.
 *
 * Dismissing it only re-arms the countdown: nothing about tapping the button
 * makes frames start arriving, so if the transfer is still dead ten seconds
 * later the advice is still the advice. It stops for good on the first frame
 * that parses, which is the only thing that actually means it worked.
 */
function showNoSignalHint() {
  diagnosticLog("no-signal", {
    source: captureSource,
    elapsedMs: NO_SIGNAL_AFTER_MS,
    decodedPayloads: pool.metrics.decodedPayloads,
    busyDrops: busyDropCount + pool.metrics.dropped,
  });
  const panel = document.createElement("div");
  panel.className = "no-signal";
  // It appears on a timer rather than in response to anything the user did,
  // which is exactly what a live region is for.
  panel.setAttribute("role", "status");

  const heading = document.createElement("strong");
  heading.textContent = "未识别到二维码";
  const message = document.createElement("p");
  message.textContent = captureSource === "screen"
    ? "请确保共享画面包含完整二维码。"
    : "请让二维码填满画面并保持稳定。";

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "text-button no-signal-dismiss";
  dismiss.textContent = "隐藏";
  dismiss.addEventListener("click", () => {
    noSignal.dismiss(performance.now());
    replaceResult();
  });

  panel.append(heading, message, dismiss);
  result.replaceChildren(panel);
}

/** Nothing is persisted: the text lives here until the page is closed. */
function showSnippet(text: string) {
  const heading = document.createElement("div");
  heading.className = "done";
  heading.textContent = "文字已接收";

  const body = document.createElement("p");
  body.className = "received-note";
  body.textContent = text;

  const actions = document.createElement("div");
  actions.className = "note-actions";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "text-button";
  copy.textContent = "复制";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = "已复制";
      setTimeout(() => { copy.textContent = "复制"; }, 1500);
    } catch {
      copy.textContent = "复制失败";
    }
  });
  actions.append(copy);

  replaceResult(heading, body, actions);
}

function updateStats() {
  const now = performance.now();
  const prune = (a: number[]) => {
    while (a.length > 0 && a[0]! < now - STATS_WINDOW_MS) a.shift();
  };
  prune(captureTimes);
  prune(decodeTimes);
  const perSecond = (a: number[]) => a.length / (STATS_WINDOW_MS / 1000);
  const captureFps = perSecond(captureTimes);
  const decodedPayloadFps = perSecond(decodeTimes);
  metric("m-cap").textContent = captureFps.toFixed(0);
  metric("m-dec").textContent = decodedPayloadFps.toFixed(1);
  const decode = pool.metrics;
  const newBusyDrops = busyDropCount - lastAutoScaleDropCount;
  if (!workersManuallySet && newBusyDrops >= 5 && pool.size < 4) {
    pool.resize(pool.size + 1);
    cfgWorkers.value = String(pool.size);
  }
  lastAutoScaleDropCount = busyDropCount;
  metricsEl.dataset.decodeAverageMs = decode.averageDecodeMs.toFixed(2);
  metricsEl.dataset.decodedPayloads = String(decode.decodedPayloads);
  metricsEl.dataset.workerBusyDrops = String(busyDropCount + decode.dropped);
  metricsEl.dataset.workerCompleted = String(decode.completed);
  metricsEl.dataset.robustAttempts = String(decode.robustAttempts);
  metricsEl.dataset.decodeErrors = String(decode.decodeErrors);
  reportCaptureSettings();
  if (noSignal.tick(now)) showNoSignalHint();
  if (!decoder) {
    if (now - lastDiagnosticAt >= STATS_WINDOW_MS) {
      lastDiagnosticAt = now;
      const trackSettings = stream?.getVideoTracks()[0]?.getSettings();
      diagnosticLog("search-snapshot", {
        source: captureSource,
        camera: `${trackSettings?.width ?? 0}x${trackSettings?.height ?? 0}@${trackSettings?.frameRate ?? 0}`,
        decodeCanvas: `${grab.width}x${grab.height}`,
        captureFps: Number(captureFps.toFixed(1)),
        decodedPayloadFps: Number(decodedPayloadFps.toFixed(1)),
        submitted: decode.submitted,
        completed: decode.completed,
        detectedPayloads: decode.decodedPayloads,
        parsedPayloads: parsedPayloadCount,
        invalidPayloads: invalidPayloadCount,
        averageDecodeMs: Number(decode.averageDecodeMs.toFixed(1)),
        busyDrops: busyDropCount + decode.dropped,
        robustAttempts: decode.robustAttempts,
        decodeErrors: decode.decodeErrors,
        lastDecodeError: decode.lastError,
      });
    }
    return;
  }
  const elapsed = (now - startTs) / 1000;
  updateProgressEstimate();
  metric("m-rate").textContent = `${goodputKbs(elapsed).toFixed(1)} KB/s`;
  metric("m-time").textContent = `${elapsed.toFixed(0)} s`;
  metric("m-frames").textContent = `${decoder.framesNew}/${decoder.framesDup}`;
  metric("m-k").textContent = String(decoder.k);
  metric("m-block").textContent = `${decoder.blockLen} B`;
  metric("m-payload").textContent = `${Math.round(decoder.totalLen / 1024)} KB`;

  if (now - lastDiagnosticAt >= STATS_WINDOW_MS) {
    lastDiagnosticAt = now;
    const trackSettings = stream?.getVideoTracks()[0]?.getSettings();
    diagnosticLog("throughput-snapshot", {
      source: captureSource,
      camera: `${trackSettings?.width ?? 0}x${trackSettings?.height ?? 0}@${trackSettings?.frameRate ?? 0}`,
      decodeCanvas: `${grab.width}x${grab.height}`,
      captureFps: Number(captureFps.toFixed(1)),
      decodedPayloadFps: Number(decodedPayloadFps.toFixed(1)),
      submitted: decode.submitted,
      completed: decode.completed,
      detectedPayloads: decode.decodedPayloads,
      parsedPayloads: parsedPayloadCount,
      invalidPayloads: invalidPayloadCount,
      newFrames: decoder.framesNew,
      duplicateFrames: decoder.framesDup,
      solvedBlocks: decoder.solvedCount,
      sourceBlocks: decoder.k,
      averageDecodeMs: Number(decode.averageDecodeMs.toFixed(1)),
      busyDrops: busyDropCount + decode.dropped,
      robustAttempts: decode.robustAttempts,
      decodeErrors: decode.decodeErrors,
      lastDecodeError: decode.lastError,
      netKiBps: Number(goodputKbs(elapsed).toFixed(2)),
    });
  }
}

return () => {
  diagnosticLog("receiver-unmount");
  disposed = true;
  copyReceiveLog.onclick = null;
  clearReceiveLog.onclick = null;
  window.removeEventListener(RECEIVE_CAPTURE_START_EVENT, onCaptureStart);
  window.removeEventListener(RECEIVE_CAPTURE_CLOSE_EVENT, onCaptureDialogClose);
  stopCaptureForNavigation();
  if (resultObjectUrl) URL.revokeObjectURL(resultObjectUrl);
};
}
