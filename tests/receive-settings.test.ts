import assert from "node:assert/strict";
import test from "node:test";

import {
  initialCameraCaptureFps,
  initialDecodeWorkers,
  recommendedDecodeWorkers,
} from "../shared/receive-settings.ts";

test("four-core cameras start at 30 fps without overriding a manual choice", () => {
  assert.equal(initialCameraCaptureFps(2), 30);
  assert.equal(initialCameraCaptureFps(4), 30);
  assert.equal(initialCameraCaptureFps(4, 60), 60);
});

test("higher-core cameras keep the 60 fps default", () => {
  assert.equal(initialCameraCaptureFps(5), 60);
  assert.equal(initialCameraCaptureFps(8), 60);
});

test("decoder workers stay at the hardware recommendation", () => {
  assert.equal(recommendedDecodeWorkers(4), 2);
  assert.equal(recommendedDecodeWorkers(6), 3);
  assert.equal(recommendedDecodeWorkers(8), 4);
});

test("a manually selected worker count remains usable across capture restarts", () => {
  assert.equal(initialDecodeWorkers(4), 2);
  assert.equal(initialDecodeWorkers(4, 4), 4);
});
