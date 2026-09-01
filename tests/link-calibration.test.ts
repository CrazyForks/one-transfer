import assert from "node:assert/strict";
import test from "node:test";

import {
  packSenderCapabilityHello,
  parseSenderCapabilityHello,
  receiverDecodeUtilizationPercent,
  recommendReceiverTuning,
  refineReceiverTuning,
  recommendSenderTuning,
  type ReceiverLinkMetrics,
  type SenderCapabilityHello,
} from "../shared/link-calibration.ts";

const hello: SenderCapabilityHello = {
  sessionId: 1234,
  logicalCores: 4,
  deviceMemoryGiB: 8,
  refreshRateHz: 60,
  shortViewportEdge: 1080,
  devicePixelRatio: 1,
  txFps: 30,
  symbolsPerTick: 4,
  frameBytes: 1700,
};

const healthyMetrics: ReceiverLinkMetrics = {
  sampleSeconds: 12,
  averageDecodeMs: 25,
  captureFps: 30,
  workers: 2,
  busyDropPercent: 2.5,
  uniqueFramesPerSecond: 17,
  duplicatePercent: 33,
  netKiBps: 23.5,
};

test("sender capability hello round-trips exact numeric settings", () => {
  const packed = packSenderCapabilityHello(hello);
  assert.deepEqual(parseSenderCapabilityHello(packed), hello);

  const withUtilization = { ...hello, senderUtilizationPercent: 53 };
  assert.deepEqual(
    parseSenderCapabilityHello(packSenderCapabilityHello(withUtilization)),
    withUtilization,
  );

  packed[10] ^= 1;
  assert.equal(parseSenderCapabilityHello(packed), null, "checksum rejects modified capabilities");
});

test("receiver tuning is device-generic and scales with available cores", () => {
  assert.deepEqual(recommendReceiverTuning(hello, 4), {
    captureFps: 30,
    workers: 2,
    explanation: "四核接收端先控制解码负载，避免持续高帧率造成过载",
  });
  assert.equal(recommendReceiverTuning(hello, 6).captureFps, 45);
  assert.equal(recommendReceiverTuning(hello, 8).captureFps, 60);
});

test("receiver utilization follows decode occupancy rather than device labels", () => {
  assert.equal(receiverDecodeUtilizationPercent(healthyMetrics), 37.5);
});

test("runtime receiver tuning raises or lowers numeric capture settings conservatively", () => {
  assert.deepEqual(
    refineReceiverTuning(hello, 6, { captureFps: 30, workers: 3 }, healthyMetrics),
    {
      captureFps: 45,
      workers: 3,
      explanation: "接收端仍有明显余量，自动提高捕获 FPS 继续测速",
    },
  );
  assert.equal(refineReceiverTuning(
    hello,
    4,
    { captureFps: 60, workers: 2 },
    { ...healthyMetrics, averageDecodeMs: 60, captureFps: 60, busyDropPercent: 12 },
  ).captureFps, 45);
});

test("recommendations return concrete sender numbers instead of named profiles", () => {
  const initial = recommendSenderTuning(hello, 4);
  assert.deepEqual(initial.tuning, { frameBytes: 1700, txFps: 30, symbolsPerTick: 4 });

  const dense = recommendSenderTuning({ ...hello, frameBytes: 2331 }, 4, {
    ...healthyMetrics,
    uniqueFramesPerSecond: 0.2,
    netKiBps: 0.36,
  });
  assert.deepEqual(dense.tuning, { frameBytes: 1700, txFps: 30, symbolsPerTick: 4 });

  const current = recommendSenderTuning(hello, 4, healthyMetrics);
  assert.deepEqual(current.tuning, { frameBytes: 1750, txFps: 30, symbolsPerTick: 4 });
  assert.match(current.explanation, /提高 50/);

  const senderLimited = recommendSenderTuning(
    { ...hello, senderUtilizationPercent: 50 },
    4,
    healthyMetrics,
  );
  assert.deepEqual(senderLimited.tuning, { frameBytes: 1700, txFps: 30, symbolsPerTick: 2 });
  assert.match(senderLimited.explanation, /接近 100%/);
});
