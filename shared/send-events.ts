import type { DeviceCapabilities } from "./device-profile";

export const SEND_PROGRESS_EVENT = "one-transfer:send-progress";
export const SEND_CAPABILITIES_EVENT = "one-transfer:sender-capabilities";
export const SEND_PROGRESS_REPORT_INTERVAL_MS = 250;

export function isSendProgressReportDue(now: number, lastReportedAt: number): boolean {
  return now - lastReportedAt >= SEND_PROGRESS_REPORT_INTERVAL_MS;
}

export interface SendProgressDetail {
  active: boolean;
  percent: number;
  round: number;
  emittedSymbols: number;
  targetSymbols: number;
  actualSymbolsPerSecond?: number;
  targetSymbolsPerSecond?: number;
  senderUtilizationPercent?: number;
  queueStarvedPercent?: number;
}

export type SenderCapabilitiesDetail = DeviceCapabilities;
