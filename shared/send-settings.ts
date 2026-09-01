// The sender's transmit tuning, in one place. The SPA renders its dropdowns
// from these lists at runtime, and the receiver's no-signal hint names its
// fallback values from here too — so the advice can never point at a setting
// the sender doesn't offer.

/** What the no-signal hint tells the user to turn the sender down to. */
export const NO_SIGNAL_HINT_FRAME_BYTES = 1465;
export const NO_SIGNAL_HINT_TX_FPS = 60;

/** Four independently decodable symbols stay visible in the display grid. */
export const QR_GRID_CELLS = 4;
export const QR_SYMBOLS_PER_TICK = QR_GRID_CELLS;

// Capable senders replace all four symbols at 30 display ticks/s. The stable
// profile keeps the same moderate density but changes one cell at a time so a
// constrained sender or VDI display does not have to repaint the whole grid.
export const DEFAULT_TX_FPS = 30;
export const DEFAULT_FRAME_BYTES = 1700;

export interface SendTuning {
  txFps: number;
  frameBytes: number;
  symbolsPerTick: number;
}

export interface SendSpeedProfile extends SendTuning {
  label: string;
}

export const SEND_TUNING_LIMITS = {
  txFps: { min: 10, max: 60 },
  frameBytes: { min: 500, max: 2331 },
  symbolsPerTick: { min: 1, max: QR_GRID_CELLS },
} as const;

export const DEFAULT_SEND_TUNING: Readonly<SendTuning> = {
  txFps: DEFAULT_TX_FPS,
  frameBytes: DEFAULT_FRAME_BYTES,
  symbolsPerTick: QR_SYMBOLS_PER_TICK,
};

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeSendTuning(tuning: SendTuning): SendTuning {
  return {
    txFps: clampInteger(tuning.txFps, SEND_TUNING_LIMITS.txFps.min, SEND_TUNING_LIMITS.txFps.max),
    frameBytes: clampInteger(
      tuning.frameBytes,
      SEND_TUNING_LIMITS.frameBytes.min,
      SEND_TUNING_LIMITS.frameBytes.max,
    ),
    symbolsPerTick: clampInteger(
      tuning.symbolsPerTick,
      SEND_TUNING_LIMITS.symbolsPerTick.min,
      SEND_TUNING_LIMITS.symbolsPerTick.max,
    ),
  };
}

/** One slider replaces independent settings that could form poor combinations. */
export const SEND_SPEED_PROFILES: readonly SendSpeedProfile[] = [
  {
    label: "稳定",
    txFps: NO_SIGNAL_HINT_TX_FPS,
    frameBytes: NO_SIGNAL_HINT_FRAME_BYTES,
    symbolsPerTick: 1,
  },
  {
    label: "平衡",
    txFps: DEFAULT_TX_FPS,
    frameBytes: DEFAULT_FRAME_BYTES,
    symbolsPerTick: QR_SYMBOLS_PER_TICK,
  },
  {
    label: "高速",
    txFps: DEFAULT_TX_FPS,
    frameBytes: 2331,
    symbolsPerTick: QR_SYMBOLS_PER_TICK,
  },
];

export const DEFAULT_SPEED_PROFILE_INDEX = 1;
export const SEND_SPEED_CHANGE_EVENT = "one-transfer:speed-change";
export const SEND_SPEED_SYNC_EVENT = "one-transfer:speed-sync";

// The hint values appear in these lists by construction, not by coincidence.
export const TX_FPS_OPTIONS: readonly number[] = [
  10,
  15,
  20,
  DEFAULT_TX_FPS,
  NO_SIGNAL_HINT_TX_FPS,
];
export const FRAME_BYTES_OPTIONS: readonly number[] = [
  500,
  1000,
  NO_SIGNAL_HINT_FRAME_BYTES,
  DEFAULT_FRAME_BYTES,
  1850,
  2331,
];
