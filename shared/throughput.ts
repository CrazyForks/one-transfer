import { HEADER_LEN } from "./protocol";
import {
  DEFAULT_FRAME_BYTES,
  DEFAULT_TX_FPS,
  QR_SYMBOLS_PER_TICK,
} from "./send-settings";

const BYTES_PER_KIB = 1024;

/** Parameters fixed by the sender and frame protocol. */
export interface OpticalThroughputConfig {
  symbolsPerTick: number;
  ticksPerSecond: number;
  frameBytes: number;
  headerBytes: number;
}

/** Conditions measured or assumed for a particular optical link. */
export interface OpticalLinkFactors {
  decodeSuccessRate: number;
  fountainOverhead: number;
}

export interface OpticalThroughputEstimate {
  symbolsPerSecond: number;
  blockBytes: number;
  rawKiBPerSecond: number;
  netKiBPerSecond: number;
}

export const DEFAULT_OPTICAL_THROUGHPUT_CONFIG: Readonly<OpticalThroughputConfig> = {
  symbolsPerTick: QR_SYMBOLS_PER_TICK,
  ticksPerSecond: DEFAULT_TX_FPS,
  frameBytes: DEFAULT_FRAME_BYTES,
  headerBytes: HEADER_LEN,
};

function requirePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

/** Payload capacity before capture loss and fountain-code redundancy. */
export function estimateRawKiBPerSecond(config: OpticalThroughputConfig): number {
  requirePositive("symbolsPerTick", config.symbolsPerTick);
  requirePositive("ticksPerSecond", config.ticksPerSecond);
  requirePositive("frameBytes", config.frameBytes);
  if (!Number.isFinite(config.headerBytes) || config.headerBytes < 0) {
    throw new RangeError("headerBytes must be a non-negative finite number");
  }
  if (config.frameBytes <= config.headerBytes) {
    throw new RangeError("frameBytes must be greater than headerBytes");
  }

  const blockBytes = config.frameBytes - config.headerBytes;
  return (config.symbolsPerTick * config.ticksPerSecond * blockBytes) / BYTES_PER_KIB;
}

/** Estimated recovered payload rate after decode loss and fountain overhead. */
export function estimateNetKiBPerSecond(
  config: OpticalThroughputConfig,
  factors: OpticalLinkFactors,
): number {
  if (
    !Number.isFinite(factors.decodeSuccessRate) ||
    factors.decodeSuccessRate < 0 ||
    factors.decodeSuccessRate > 1
  ) {
    throw new RangeError("decodeSuccessRate must be between 0 and 1");
  }
  if (!Number.isFinite(factors.fountainOverhead) || factors.fountainOverhead < 1) {
    throw new RangeError("fountainOverhead must be at least 1");
  }

  return (
    estimateRawKiBPerSecond(config) *
    factors.decodeSuccessRate / factors.fountainOverhead
  );
}

export function estimateOpticalThroughput(
  config: OpticalThroughputConfig,
  factors: OpticalLinkFactors,
): OpticalThroughputEstimate {
  const symbolsPerSecond = config.symbolsPerTick * config.ticksPerSecond;
  const blockBytes = config.frameBytes - config.headerBytes;
  const rawKiBPerSecond = estimateRawKiBPerSecond(config);
  return {
    symbolsPerSecond,
    blockBytes,
    rawKiBPerSecond,
    netKiBPerSecond: estimateNetKiBPerSecond(config, factors),
  };
}
