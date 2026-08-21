export const SEND_PROGRESS_EVENT = "one-transfer:send-progress";

export interface SendProgressDetail {
  active: boolean;
  percent: number;
  round: number;
  emittedSymbols: number;
  targetSymbols: number;
}
