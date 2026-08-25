import assert from "node:assert/strict";
import test from "node:test";
import { DecodeWorkerPool, type PoolWorker } from "../shared/worker-pool.ts";

class FakeWorker implements PoolWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  readonly sent: unknown[] = [];
  terminated = false;

  constructor(readonly id: number) {}

  postMessage(message: unknown): void {
    this.sent.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Pretend the WASM decoder came back with something (or nothing). */
  reply(
    bytes: Uint8Array | null,
    id = 0,
    extra: Record<string, unknown> = {},
  ): void {
    this.onmessage?.({ data: { id, bytes, ...extra } } as MessageEvent);
  }
}

function harness() {
  const created: FakeWorker[] = [];
  const decoded: Uint8Array[] = [];
  const pool = new DecodeWorkerPool(
    () => {
      const worker = new FakeWorker(created.length);
      created.push(worker);
      return worker;
    },
    (bytes) => decoded.push(bytes),
  );
  return { pool, created, decoded };
}

const frame = (n: number) => new Uint8Array([n]);

test("the pool grows and shrinks to the requested size", () => {
  const { pool, created } = harness();
  pool.resize(3);
  assert.equal(pool.size, 3);
  assert.equal(created.length, 3);

  pool.resize(1);
  assert.equal(pool.size, 1);
  assert.equal(created.length, 3, "shrinking must not spawn anything");
  assert.deepEqual(
    created.map((w) => w.terminated),
    [false, true, true],
    "shrinking terminates from the end, so surviving workers keep their slots",
  );

  pool.resize(0);
  assert.equal(pool.size, 0);
  assert.ok(created.every((w) => w.terminated));
});

test("resize is idempotent and ignores negative counts", () => {
  const { pool, created } = harness();
  pool.resize(2);
  pool.resize(2);
  assert.equal(created.length, 2);
  pool.resize(-5);
  assert.equal(pool.size, 0);
});

test("frames go to free workers and come back as decoded bytes", () => {
  const { pool, created, decoded } = harness();
  pool.resize(2);

  assert.equal(pool.submit(frame(1), []), true);
  assert.equal(pool.submit(frame(2), []), true);
  assert.equal(pool.busyCount, 2);
  assert.equal(pool.submit(frame(3), []), false, "no free worker — the caller drops the frame");
  assert.deepEqual(created[0]!.sent, [frame(1)]);
  assert.deepEqual(created[1]!.sent, [frame(2)]);

  created[0]!.reply(new Uint8Array([0xaa]));
  assert.equal(pool.busyCount, 1);
  assert.deepEqual(decoded, [new Uint8Array([0xaa])]);
  assert.equal(pool.submit(frame(4), []), true, "the freed worker takes the next frame");
  assert.deepEqual(created[0]!.sent, [frame(1), frame(4)]);
});

test("a worker that found no code still frees its slot", () => {
  const { pool, created, decoded } = harness();
  pool.resize(1);
  pool.submit(frame(1), []);
  created[0]!.reply(null);
  assert.equal(pool.busyCount, 0);
  assert.deepEqual(decoded, [], "no bytes, nothing to hand on");
});

test("a worker batch hands every decoded symbol to the consumer", () => {
  const { pool, created, decoded } = harness();
  pool.resize(1);
  pool.submit(frame(1), []);
  created[0]!.reply(new Uint8Array([0xaa]), 0, {
    payloads: [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])],
    decodeMs: 12.5,
  });

  assert.equal(pool.busyCount, 0);
  assert.deepEqual(decoded, [
    new Uint8Array([1]),
    new Uint8Array([2]),
    new Uint8Array([3]),
  ]);
  assert.deepEqual(pool.metrics, {
    submitted: 1,
    dropped: 0,
    completed: 1,
    decodedPayloads: 3,
    totalDecodeMs: 12.5,
    averageDecodeMs: 12.5,
    robustAttempts: 0,
    decodeErrors: 0,
    lastError: undefined,
  });
});

test("pool metrics include busy drops and robust decode reports", () => {
  const reports: { decodeMs: number; payloadCount: number; mode: string }[] = [];
  const created: FakeWorker[] = [];
  const pool = new DecodeWorkerPool(
    () => {
      const worker = new FakeWorker(created.length);
      created.push(worker);
      return worker;
    },
    () => undefined,
    (report) => reports.push(report),
  );
  pool.resize(1);

  assert.equal(pool.submit(frame(1), []), true);
  assert.equal(pool.submit(frame(2), []), false);
  created[0]!.reply(null, 0, { decodeMs: 20, mode: "robust", payloads: [] });

  assert.deepEqual(reports, [{ decodeMs: 20, payloadCount: 0, mode: "robust" }]);
  assert.deepEqual(pool.metrics, {
    submitted: 1,
    dropped: 1,
    completed: 1,
    decodedPayloads: 0,
    totalDecodeMs: 20,
    averageDecodeMs: 20,
    robustAttempts: 1,
    decodeErrors: 0,
    lastError: undefined,
  });

  pool.resetMetrics();
  assert.deepEqual(pool.metrics, {
    submitted: 0,
    dropped: 0,
    completed: 0,
    decodedPayloads: 0,
    totalDecodeMs: 0,
    averageDecodeMs: 0,
    robustAttempts: 0,
    decodeErrors: 0,
    lastError: undefined,
  });
});

test("the warm-up ping is not mistaken for a finished frame", () => {
  // worker.ts posts {id: -1} once the WASM is instantiated, before any real
  // frame. Treating that as a completion would free a slot nobody claimed.
  const { pool, created, decoded } = harness();
  pool.resize(1);
  pool.submit(frame(1), []);
  assert.equal(pool.busyCount, 1);

  created[0]!.reply(null, -1);
  assert.equal(pool.busyCount, 1, "the in-flight frame is still in flight");
  assert.deepEqual(decoded, []);

  created[0]!.reply(new Uint8Array([1]), 7);
  assert.equal(pool.busyCount, 0);
});

test("slots stay bound to their own worker across a shrink and regrow", () => {
  // Each worker's handler closes over its index. If shrinking renumbered the
  // survivors, a reply from worker 0 would free somebody else's slot.
  const { pool, created } = harness();
  pool.resize(3);
  pool.submit(frame(1), []);
  pool.resize(1); // drops the two idle workers, keeps the busy one at slot 0
  assert.equal(pool.busyCount, 1);

  pool.resize(3); // two fresh workers land in slots 1 and 2
  assert.equal(created.length, 5);
  assert.equal(pool.submit(frame(2), []), true);
  assert.equal(pool.submit(frame(3), []), true);
  assert.equal(pool.submit(frame(4), []), false, "all three are busy");

  created[0]!.reply(new Uint8Array([1]));
  assert.equal(pool.busyCount, 2);
  created[3]!.reply(new Uint8Array([2]));
  created[4]!.reply(new Uint8Array([3]));
  assert.equal(pool.busyCount, 0);
});

test("an empty pool accepts nothing", () => {
  const { pool } = harness();
  assert.equal(pool.submit(frame(1), []), false);
  assert.equal(pool.busyCount, 0);
});
