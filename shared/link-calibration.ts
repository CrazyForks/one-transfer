import { normalizeSendTuning, type SendTuning } from "./send-settings";

const HELLO_MAGIC = [0x4f, 0x54, 0x48, 0x31] as const; // OTH1
const HELLO_VERSION = 1;
export const SENDER_CAPABILITY_HELLO_LENGTH = 20;

export interface SenderCapabilityHello {
  readonly sessionId: number;
  readonly logicalCores: number;
  readonly deviceMemoryGiB?: number;
  readonly refreshRateHz?: number;
  readonly shortViewportEdge: number;
  readonly devicePixelRatio: number;
  readonly txFps: number;
  readonly symbolsPerTick: number;
  readonly frameBytes: number;
  readonly senderUtilizationPercent?: number;
}

export interface ReceiverTuningRecommendation {
  readonly captureFps: 30 | 45 | 60;
  readonly workers: number;
  readonly explanation: string;
}

export interface ReceiverLinkMetrics {
  readonly sampleSeconds: number;
  readonly averageDecodeMs: number;
  readonly captureFps: number;
  readonly workers: number;
  readonly busyDropPercent: number;
  readonly uniqueFramesPerSecond: number;
  readonly duplicatePercent: number;
  readonly netKiBps: number;
}

export interface SenderTuningRecommendation {
  readonly tuning: SendTuning;
  readonly explanation: string;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function checksum16(bytes: Uint8Array, end: number): number {
  let checksum = 0;
  for (let index = 0; index < end; index++) checksum = (checksum + bytes[index]!) & 0xffff;
  return checksum;
}

export function packSenderCapabilityHello(hello: SenderCapabilityHello): Uint8Array {
  const bytes = new Uint8Array(SENDER_CAPABILITY_HELLO_LENGTH);
  bytes.set(HELLO_MAGIC, 0);
  bytes[4] = HELLO_VERSION;
  bytes[5] = clampInteger(hello.logicalCores, 1, 0xff);
  bytes[6] = hello.deviceMemoryGiB === undefined
    ? 0
    : clampInteger(hello.deviceMemoryGiB, 1, 0xff);
  bytes[7] = hello.refreshRateHz === undefined
    ? 0
    : clampInteger(hello.refreshRateHz, 1, 0xff);
  bytes[8] = clampInteger(hello.symbolsPerTick, 1, 0xff);
  bytes[9] = clampInteger(hello.txFps, 1, 0xff);
  bytes[10] = clampInteger(hello.devicePixelRatio * 10, 1, 0xff);
  bytes[11] = hello.senderUtilizationPercent === undefined
    ? 0xff
    : clampInteger(hello.senderUtilizationPercent, 0, 100);
  const view = new DataView(bytes.buffer);
  view.setUint16(12, clampInteger(hello.shortViewportEdge, 1, 0xffff), true);
  view.setUint16(14, clampInteger(hello.frameBytes, 1, 0xffff), true);
  view.setUint16(16, clampInteger(hello.sessionId, 1, 0xffff), true);
  view.setUint16(18, checksum16(bytes, 18), true);
  return bytes;
}

export function parseSenderCapabilityHello(bytes: Uint8Array): SenderCapabilityHello | null {
  if (bytes.length !== SENDER_CAPABILITY_HELLO_LENGTH) return null;
  if (HELLO_MAGIC.some((value, index) => bytes[index] !== value) || bytes[4] !== HELLO_VERSION) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(18, true) !== checksum16(bytes, 18)) return null;
  const logicalCores = bytes[5]!;
  const symbolsPerTick = bytes[8]!;
  const txFps = bytes[9]!;
  const shortViewportEdge = view.getUint16(12, true);
  const frameBytes = view.getUint16(14, true);
  const sessionId = view.getUint16(16, true);
  if (!logicalCores || !symbolsPerTick || !txFps || !shortViewportEdge || !frameBytes || !sessionId) {
    return null;
  }
  const senderUtilizationPercent = bytes[11] === 0xff ? undefined : bytes[11];
  return {
    sessionId,
    logicalCores,
    deviceMemoryGiB: bytes[6] || undefined,
    refreshRateHz: bytes[7] || undefined,
    shortViewportEdge,
    devicePixelRatio: bytes[10]! / 10,
    txFps,
    symbolsPerTick,
    frameBytes,
    ...(senderUtilizationPercent === undefined ? {} : { senderUtilizationPercent }),
  };
}

export function receiverDecodeUtilizationPercent(metrics: ReceiverLinkMetrics): number {
  if (metrics.workers <= 0) return 100;
  return Math.min(
    100,
    Math.max(0, metrics.averageDecodeMs * metrics.captureFps / metrics.workers / 10),
  );
}

export function recommendReceiverTuning(
  hello: SenderCapabilityHello,
  receiverLogicalCores: number,
): ReceiverTuningRecommendation {
  const targetSymbolsPerSecond = hello.txFps * hello.symbolsPerTick;
  if (receiverLogicalCores <= 4) {
    return {
      captureFps: 30,
      workers: 2,
      explanation: "四核接收端先控制解码负载，避免持续高帧率造成过载",
    };
  }
  if (receiverLogicalCores < 8) {
    return {
      captureFps: targetSymbolsPerSecond > 60 ? 45 : 30,
      workers: 3,
      explanation: "接收端有中等并行能力，按发送符号率提高捕获帧率",
    };
  }
  return {
    captureFps: targetSymbolsPerSecond > 60 ? 60 : 30,
    workers: 4,
    explanation: "多核接收端可使用更高捕获帧率和四个解码 Worker",
  };
}

export function refineReceiverTuning(
  hello: SenderCapabilityHello,
  receiverLogicalCores: number,
  current: Pick<ReceiverTuningRecommendation, "captureFps" | "workers">,
  metrics: ReceiverLinkMetrics,
): ReceiverTuningRecommendation {
  const utilization = receiverDecodeUtilizationPercent(metrics);
  if (metrics.sampleSeconds < 6) {
    return { ...current, explanation: "继续采样接收端实际解码负载" };
  }

  if (metrics.busyDropPercent > 8 && receiverLogicalCores >= 6 && current.workers < 4) {
    return {
      captureFps: current.captureFps,
      workers: current.workers + 1,
      explanation: "接收端忙丢帧偏高，先增加一个解码 Worker",
    };
  }

  if (utilization > 82 || metrics.busyDropPercent > 10) {
    const captureFps = current.captureFps === 60 ? 45 : 30;
    return {
      captureFps,
      workers: current.workers,
      explanation: "接收端负载过高，自动降低捕获 FPS",
    };
  }

  const targetSymbolsPerSecond = hello.txFps * hello.symbolsPerTick;
  if (
    receiverLogicalCores >= 6 &&
    targetSymbolsPerSecond > 60 &&
    utilization < 50 &&
    metrics.busyDropPercent < 3
  ) {
    const captureFps = current.captureFps === 30 ? 45 : 60;
    if (captureFps > current.captureFps) {
      return {
        captureFps,
        workers: current.workers,
        explanation: "接收端仍有明显余量，自动提高捕获 FPS 继续测速",
      };
    }
  }

  return { ...current, explanation: "接收端当前参数与实测负载匹配" };
}

export function recommendSenderTuning(
  hello: SenderCapabilityHello,
  receiverLogicalCores: number,
  metrics?: ReceiverLinkMetrics,
): SenderTuningRecommendation {
  const memorySupportsBalanced =
    hello.deviceMemoryGiB === undefined || hello.deviceMemoryGiB >= 4;
  const initialTuning = hello.logicalCores >= 4 && receiverLogicalCores >= 4 && memorySupportsBalanced
    ? normalizeSendTuning({ frameBytes: 1700, txFps: 30, symbolsPerTick: 4 })
    : normalizeSendTuning({ frameBytes: 1465, txFps: 60, symbolsPerTick: 1 });
  if (!metrics || metrics.sampleSeconds < 4) {
    return {
      tuning: initialTuning,
      explanation: "先根据两端核心数和内存给出初始建议，接收数秒后再按实测净带宽修正",
    };
  }

  const utilization = receiverDecodeUtilizationPercent(metrics);
  if (hello.senderUtilizationPercent !== undefined && hello.senderUtilizationPercent < 80) {
    const actualSymbolsPerSecond = Math.max(
      10,
      Math.round(hello.txFps * hello.symbolsPerTick * hello.senderUtilizationPercent / 100),
    );
    const symbolsPerTick = Math.max(
      1,
      Math.min(hello.symbolsPerTick, Math.round(actualSymbolsPerSecond / hello.txFps)),
    );
    return {
      tuning: normalizeSendTuning({
        frameBytes: hello.frameBytes,
        txFps: Math.max(10, Math.round(actualSymbolsPerSecond / symbolsPerTick)),
        symbolsPerTick,
      }),
      explanation: "发送端实际输出未达到目标，建议先降低同步码数或刷新率，使输出达成接近 100%",
    };
  }
  if (hello.frameBytes >= 2000) {
    if (metrics.netKiBps < 10 || metrics.uniqueFramesPerSecond < 5) {
      return {
        tuning: normalizeSendTuning({ frameBytes: 1700, txFps: 30, symbolsPerTick: 4 }),
        explanation: "当前二维码过密或有效新帧不足，建议降低每码字节数",
      };
    }
    if (utilization < 80 && metrics.busyDropPercent < 5) {
      return {
        tuning: normalizeSendTuning(hello),
        explanation: "当前数字设置净带宽稳定且接收端仍有余量，可继续使用",
      };
    }
    return {
      tuning: normalizeSendTuning({ frameBytes: 1700, txFps: 30, symbolsPerTick: 4 }),
      explanation: "当前设置已接近接收端解码上限，建议降低二维码密度",
    };
  }

  if (hello.frameBytes <= 1500 || hello.symbolsPerTick === 1) {
    if (
      utilization < 70 &&
      metrics.busyDropPercent < 5 &&
      metrics.uniqueFramesPerSecond >= 8
    ) {
      return {
        tuning: normalizeSendTuning({ frameBytes: 1700, txFps: 30, symbolsPerTick: 4 }),
        explanation: "当前设置可识别且两端仍有余量，建议提高到四码同步的中等密度",
      };
    }
    return { tuning: normalizeSendTuning(hello), explanation: "当前链路余量不足，保持现有数字设置" };
  }

  if (metrics.netKiBps < 3 || metrics.uniqueFramesPerSecond < 2) {
    return {
      tuning: normalizeSendTuning({
        frameBytes: Math.max(1000, hello.frameBytes - 200),
        txFps: Math.max(15, hello.txFps - 5),
        symbolsPerTick: Math.max(1, hello.symbolsPerTick - 1),
      }),
      explanation: "有效新帧过低，建议小步降低字节数、刷新率和同步码数",
    };
  }

  if (utilization > 85 || metrics.busyDropPercent > 10) {
    return {
      tuning: normalizeSendTuning({
        frameBytes: Math.max(1000, hello.frameBytes - 100),
        txFps: Math.max(15, hello.txFps - 5),
        symbolsPerTick: hello.symbolsPerTick,
      }),
      explanation: "接收端已接近上限，建议小步降低发送字节数和刷新率",
    };
  }

  if (
    utilization < 55 &&
    metrics.busyDropPercent < 3 &&
    metrics.uniqueFramesPerSecond >= 10
  ) {
    if (hello.symbolsPerTick < 4) {
      return {
        tuning: normalizeSendTuning({ ...hello, symbolsPerTick: hello.symbolsPerTick + 1 }),
        explanation: "两端仍有余量，建议先增加每次更新的二维码数量",
      };
    }
    if (hello.frameBytes < 1850) {
      return {
        tuning: normalizeSendTuning({ ...hello, frameBytes: hello.frameBytes + 50 }),
        explanation: "两端仍有余量，建议把每码字节数提高 50 后继续测速",
      };
    }
    if (hello.txFps < Math.min(45, metrics.captureFps)) {
      return {
        tuning: normalizeSendTuning({ ...hello, txFps: hello.txFps + 5 }),
        explanation: "二维码密度已较高，建议把发送刷新率提高 5 FPS 后继续测速",
      };
    }
  }
  return { tuning: normalizeSendTuning(hello), explanation: "当前数字设置净带宽稳定，建议保持" };
}
