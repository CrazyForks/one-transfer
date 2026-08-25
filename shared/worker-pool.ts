// Fixed-slot pool of decode workers.
//
// The subtle part is slot identity: every worker's message handler closes over
// its own index, so growing and shrinking the pool has to leave the surviving
// workers' indices alone. Shrinking from the end is what makes that true, and
// it is why this is worth having on its own rather than inline in the receiver.
//
// Each worker holds its own ~940 KB zxing WASM instance, so resizing the pool
// also controls the receiver's decoder memory footprint.

export interface PoolWorker {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
  terminate(): void;
}

interface DecodeMessage {
  id: number;
  /** First decoded symbol, kept for compatibility with older workers. */
  bytes?: Uint8Array | null;
  /** All valid symbols found in the submitted image. */
  payloads?: Uint8Array[];
  decodeMs?: number;
  mode?: "fast" | "robust";
  error?: string;
}

export interface DecodeWorkerReport {
  decodeMs: number;
  payloadCount: number;
  mode: "fast" | "robust";
}

export interface DecodeWorkerPoolMetrics {
  submitted: number;
  dropped: number;
  completed: number;
  decodedPayloads: number;
  totalDecodeMs: number;
  averageDecodeMs: number;
  robustAttempts: number;
  decodeErrors: number;
  lastError?: string;
}

export class DecodeWorkerPool {
  private readonly workers: PoolWorker[] = [];
  private readonly busy: boolean[] = [];
  private submitted = 0;
  private dropped = 0;
  private completed = 0;
  private decodedPayloads = 0;
  private totalDecodeMs = 0;
  private robustAttempts = 0;
  private decodeErrors = 0;
  private lastError: string | undefined;

  constructor(
    private readonly create: () => PoolWorker,
    private readonly onDecoded: (bytes: Uint8Array) => void,
    private readonly onReport?: (report: DecodeWorkerReport) => void,
  ) {}

  get size(): number {
    return this.workers.length;
  }

  get busyCount(): number {
    return this.busy.filter(Boolean).length;
  }

  get metrics(): DecodeWorkerPoolMetrics {
    return {
      submitted: this.submitted,
      dropped: this.dropped,
      completed: this.completed,
      decodedPayloads: this.decodedPayloads,
      totalDecodeMs: this.totalDecodeMs,
      averageDecodeMs: this.completed > 0 ? this.totalDecodeMs / this.completed : 0,
      robustAttempts: this.robustAttempts,
      decodeErrors: this.decodeErrors,
      lastError: this.lastError,
    };
  }

  resetMetrics(): void {
    this.submitted = 0;
    this.dropped = 0;
    this.completed = 0;
    this.decodedPayloads = 0;
    this.totalDecodeMs = 0;
    this.robustAttempts = 0;
    this.decodeErrors = 0;
    this.lastError = undefined;
  }

  /** Grow or shrink in place. Terminating a busy worker just drops the frame it
   *  held, which the fountain absorbs like any other miss. */
  resize(count: number): void {
    while (this.workers.length > Math.max(0, count)) {
      this.workers.pop()!.terminate();
      this.busy.pop();
    }
    while (this.workers.length < count) {
      const slot = this.workers.length;
      const worker = this.create();
      worker.onmessage = (event: MessageEvent) => {
        const { id, bytes, payloads, decodeMs, mode, error } = event.data as DecodeMessage;
        if (id === -1) return; // warm-up ping, no frame attached
        this.busy[slot] = false;
        const decoded = payloads ?? (bytes ? [bytes] : []);
        const elapsed =
          typeof decodeMs === "number" && Number.isFinite(decodeMs) && decodeMs >= 0
            ? decodeMs
            : 0;
        const usedMode = mode === "robust" ? "robust" : "fast";
        this.completed++;
        this.decodedPayloads += decoded.length;
        this.totalDecodeMs += elapsed;
        if (usedMode === "robust") this.robustAttempts++;
        if (error) {
          this.decodeErrors++;
          this.lastError = error;
        }
        const report: DecodeWorkerReport = {
          decodeMs: elapsed,
          payloadCount: decoded.length,
          mode: usedMode,
        };
        this.onReport?.(report);
        for (const payload of decoded) this.onDecoded(payload);
      };
      this.workers.push(worker);
      this.busy.push(false);
    }
  }

  /** Hand a frame to a free worker. False when every worker is busy — the
   *  caller drops the frame rather than queueing it, because a stale frame is
   *  worth less than the next one. */
  submit(message: unknown, transfer: Transferable[]): boolean {
    const slot = this.busy.indexOf(false);
    if (slot === -1) {
      this.dropped++;
      return false;
    }
    this.busy[slot] = true;
    this.submitted++;
    this.workers[slot]!.postMessage(message, transfer);
    return true;
  }
}
