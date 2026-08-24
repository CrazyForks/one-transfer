import assert from "node:assert/strict";
import test from "node:test";

import {
  describeDeviceCapabilities,
  recommendSpeedProfile,
} from "../shared/device-profile.ts";

test("a capable desktop receives the fastest profile", () => {
  assert.equal(recommendSpeedProfile({
    logicalCores: 12,
    deviceMemoryGiB: 16,
    refreshRateHz: 60,
    shortViewportEdge: 900,
    devicePixelRatio: 2,
  }).profileIndex, 2);
});

test("a normal laptop receives the balanced profile", () => {
  assert.equal(recommendSpeedProfile({
    logicalCores: 6,
    deviceMemoryGiB: 8,
    refreshRateHz: 60,
    shortViewportEdge: 1200,
    devicePixelRatio: 1,
  }).profileIndex, 1);
});

test("small or constrained devices fall back to stable", () => {
  assert.equal(recommendSpeedProfile({
    logicalCores: 8,
    deviceMemoryGiB: 16,
    refreshRateHz: 60,
    shortViewportEdge: 430,
    devicePixelRatio: 1,
  }).profileIndex, 0);
});

test("browser-hidden memory does not penalize an otherwise capable device", () => {
  const capabilities = {
    logicalCores: 10,
    refreshRateHz: 60,
    shortViewportEdge: 900,
    devicePixelRatio: 2,
  };
  assert.equal(recommendSpeedProfile(capabilities).profileIndex, 2);
  assert.equal(
    describeDeviceCapabilities(capabilities),
    "10 线程 · 约 60 Hz · 画面短边 900px · 2× 像素密度",
  );
});
