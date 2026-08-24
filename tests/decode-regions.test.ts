import assert from "node:assert/strict";
import test from "node:test";

import { decodeRegionForFrame } from "../shared/decode-regions.ts";

test("submitted frames rotate through four overlapping decode regions", () => {
  const regions = Array.from({ length: 4 }, (_, id) => decodeRegionForFrame(id, 1000, 800));
  assert.deepEqual(regions, [
    { x: 0, y: 0, width: 600, height: 480 },
    { x: 400, y: 0, width: 600, height: 480 },
    { x: 0, y: 320, width: 600, height: 480 },
    { x: 400, y: 320, width: 600, height: 480 },
  ]);
  assert.deepEqual(decodeRegionForFrame(4, 1000, 800), regions[0]);
});

test("decode regions stay valid for tiny and negative frame ids", () => {
  assert.deepEqual(decodeRegionForFrame(-1, 1, 1), { x: 0, y: 0, width: 1, height: 1 });
});
