import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OPTICAL_THROUGHPUT_CONFIG,
  estimateNetKiBPerSecond,
  estimateOpticalThroughput,
  estimateRawKiBPerSecond,
} from "../shared/throughput.ts";
import {
  SEND_SPEED_PROFILES,
  isSameSendTuning,
  normalizeSendTuning,
} from "../shared/send-settings.ts";

test("the default four-QR layout produces 120 symbols per second", () => {
  const estimate = estimateOpticalThroughput(DEFAULT_OPTICAL_THROUGHPUT_CONFIG, {
    decodeSuccessRate: 1,
    fountainOverhead: 1,
  });

  assert.equal(estimate.symbolsPerSecond, 120);
  assert.equal(estimate.blockBytes, 1680);
  assert.equal(estimate.rawKiBPerSecond, 196.875);
  assert.equal(estimate.netKiBPerSecond, estimate.rawKiBPerSecond);
});

test("speed profiles declare their own symbols per display tick", () => {
  const [stable, balanced, high] = SEND_SPEED_PROFILES;
  assert.deepEqual(stable, {
    label: "稳定",
    txFps: 60,
    frameBytes: 1465,
    symbolsPerTick: 1,
  });
  assert.equal(stable!.symbolsPerTick * stable!.txFps, 60);
  assert.equal(balanced!.symbolsPerTick * balanced!.txFps, 120);
  assert.equal(high!.symbolsPerTick * high!.txFps, 120);
  assert.equal(
    stable!.symbolsPerTick * stable!.txFps * (stable!.frameBytes - 20) / 1024,
    84.66796875,
  );
});

test("numeric sender settings are clamped to supported QR and display limits", () => {
  assert.deepEqual(normalizeSendTuning({ frameBytes: 300, txFps: 100, symbolsPerTick: 9 }), {
    frameBytes: 500,
    txFps: 60,
    symbolsPerTick: 4,
  });
});

test("send tuning equality compares the normalized values that can be applied", () => {
  assert.equal(isSameSendTuning(
    { frameBytes: 1700.4, txFps: 30.2, symbolsPerTick: 4 },
    { frameBytes: 1700, txFps: 30, symbolsPerTick: 4 },
  ), true);
  assert.equal(isSameSendTuning(
    { frameBytes: 1700, txFps: 30, symbolsPerTick: 4 },
    { frameBytes: 1700, txFps: 31, symbolsPerTick: 4 },
  ), false);
});

test("raw throughput excludes the per-symbol protocol header", () => {
  assert.equal(
    estimateRawKiBPerSecond({
      symbolsPerTick: 2,
      ticksPerSecond: 10,
      frameBytes: 120,
      headerBytes: 20,
    }),
    2000 / 1024,
  );
});

test("net throughput accounts for decode loss and fountain redundancy", () => {
  const net = estimateNetKiBPerSecond(DEFAULT_OPTICAL_THROUGHPUT_CONFIG, {
    decodeSuccessRate: 0.75,
    fountainOverhead: 1.2,
  });

  assert.equal(net, 123.046875);
});

test("invalid physical and link parameters are rejected", () => {
  assert.throws(
    () => estimateRawKiBPerSecond({
      ...DEFAULT_OPTICAL_THROUGHPUT_CONFIG,
      frameBytes: 20,
    }),
    /frameBytes must be greater than headerBytes/,
  );
  assert.throws(
    () => estimateNetKiBPerSecond(DEFAULT_OPTICAL_THROUGHPUT_CONFIG, {
      decodeSuccessRate: 1.01,
      fountainOverhead: 1.2,
    }),
    /decodeSuccessRate/,
  );
  assert.throws(
    () => estimateNetKiBPerSecond(DEFAULT_OPTICAL_THROUGHPUT_CONFIG, {
      decodeSuccessRate: 0.8,
      fountainOverhead: 0.99,
    }),
    /fountainOverhead/,
  );
});
