// The sender's transmit tuning, in one place. The SPA renders its dropdowns
// from these lists at runtime, and the receiver's no-signal hint names its
// fallback values from here too — so the advice can never point at a setting
// the sender doesn't offer.

/** What the no-signal hint tells the user to turn the sender down to. */
export const NO_SIGNAL_HINT_FRAME_BYTES = 700;
export const NO_SIGNAL_HINT_TX_FPS = 30;

/** Four symbols stay visible, but only one changes on each display tick. */
export const QR_GRID_CELLS = 4;
export const QR_SYMBOLS_PER_TICK = 1;

// One cell changes per refresh, so every QR remains stable for four display
// cycles. The widened integer-pixel grid keeps V27 camera-readable while
// 60 updates/s restores the useful throughput of the earlier stream.
export const DEFAULT_TX_FPS = 60;
export const DEFAULT_FRAME_BYTES = 1465;

export interface SendSpeedProfile {
  label: string;
  txFps: number;
  frameBytes: number;
}

/** One slider replaces independent settings that could form poor combinations. */
export const SEND_SPEED_PROFILES: readonly SendSpeedProfile[] = [
  { label: "稳定", txFps: NO_SIGNAL_HINT_TX_FPS, frameBytes: NO_SIGNAL_HINT_FRAME_BYTES },
  { label: "平衡", txFps: DEFAULT_TX_FPS, frameBytes: DEFAULT_FRAME_BYTES },
  { label: "高速", txFps: DEFAULT_TX_FPS, frameBytes: 2331 },
];

export const DEFAULT_SPEED_PROFILE_INDEX = 0;
export const SEND_SPEED_CHANGE_EVENT = "one-transfer:speed-change";
export const SEND_SPEED_SYNC_EVENT = "one-transfer:speed-sync";

// The hint values appear in these lists by construction, not by coincidence.
export const TX_FPS_OPTIONS: readonly number[] = [
  10,
  15,
  20,
  NO_SIGNAL_HINT_TX_FPS,
  DEFAULT_TX_FPS,
  60,
];
export const FRAME_BYTES_OPTIONS: readonly number[] = [
  500,
  NO_SIGNAL_HINT_FRAME_BYTES,
  1000,
  DEFAULT_FRAME_BYTES,
  2331,
];
