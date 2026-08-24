import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OPTICAL_THROUGHPUT_CONFIG,
  estimateNetKiBPerSecond,
  estimateOpticalThroughput,
  estimateRawKiBPerSecond,
} from "../shared/throughput.ts";

test("the default staggered four-QR layout produces 60 symbols per second", () => {
  const estimate = estimateOpticalThroughput(DEFAULT_OPTICAL_THROUGHPUT_CONFIG, {
    decodeSuccessRate: 1,
    fountainOverhead: 1,
  });

  assert.equal(estimate.symbolsPerSecond, 60);
  assert.equal(estimate.blockBytes, 980);
  assert.equal(estimate.rawKiBPerSecond, 57.421875);
  assert.equal(estimate.netKiBPerSecond, estimate.rawKiBPerSecond);
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

  assert.equal(net, 35.888671875);
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
