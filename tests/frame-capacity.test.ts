import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SOURCE_BLOCKS,
  blockLength,
  fitsInOneStream,
  maximumFileBytes,
  maximumStreamPayloadBytes,
  minimumFrameBytes,
  smallestSufficientFrameSize,
  sourceBlockCount,
} from "../shared/frame-capacity.ts";
import { HEADER_LEN, MAX_FILE_BYTES } from "../shared/protocol.ts";
import { SEND_SPEED_PROFILES } from "../shared/send-settings.ts";

/** The sender's actual speed profiles, not a copied list that can drift. */
const OFFERED = SEND_SPEED_PROFILES.map((profile) => profile.frameBytes);

test("the header takes its cut off every frame", () => {
  assert.equal(blockLength(2953), 2953 - HEADER_LEN);
  assert.equal(blockLength(500), 480);
});

test("file limits are derived from the active frame profile", () => {
  assert.equal(maximumStreamPayloadBytes(1465), 94_698_075);
  assert.equal(maximumFileBytes(1465), 94_566_956);
  assert.equal(maximumFileBytes(1700), 109_967_681);
  assert.equal(maximumFileBytes(2331), 151_320_266);
});

test("block count rounds up, because a partial block still needs a frame", () => {
  assert.equal(sourceBlockCount(1, 2953), 1);
  assert.equal(sourceBlockCount(2933, 2953), 1);
  assert.equal(sourceBlockCount(2934, 2953), 2);
  assert.equal(sourceBlockCount(10 * 2933, 2953), 10);
});

test("the block ceiling bites well below the file size limit", () => {
  // This is the whole reason the check exists: at the smallest offered frame
  // size you run out of block numbers around 30 MB, not 64.
  assert.equal(fitsInOneStream(30 * 1024 * 1024, 500), false);
  assert.equal(fitsInOneStream(20 * 1024 * 1024, 500), true);
  assert.equal(fitsInOneStream(MAX_FILE_BYTES, 2953), true);
});

test("minimumFrameBytes is the smallest frame size that actually fits", () => {
  for (const payload of [
    1,
    1000,
    30 * 1024 * 1024,
    MAX_FILE_BYTES,
    maximumFileBytes(2331),
  ]) {
    const minimum = minimumFrameBytes(payload);
    assert.ok(fitsInOneStream(payload, minimum), `${payload} does not fit at ${minimum}`);
    // ...and it really is the smallest: one byte less must not fit, unless we
    // are already at the floor where a single block covers everything.
    if (sourceBlockCount(payload, minimum) > 1) {
      assert.equal(
        fitsInOneStream(payload, minimum - 1),
        false,
        `${payload} unexpectedly still fits at ${minimum - 1}`,
      );
    }
  }
});

test("the suggested speed profile always works", () => {
  // The sender puts this number in front of the user, so it has to be a value
  // they can pick AND one that resolves the error.
  for (const payload of [95 * 1024 * 1024, 110 * 1024 * 1024, 140 * 1024 * 1024]) {
    for (const frameBytes of OFFERED) {
      if (fitsInOneStream(payload, frameBytes)) continue;
      const suggestion = smallestSufficientFrameSize(payload, OFFERED);
      assert.ok(suggestion !== undefined, `no suggestion for ${payload} at ${frameBytes}`);
      assert.ok(OFFERED.includes(suggestion), `${suggestion} is not an offered option`);
      assert.ok(fitsInOneStream(payload, suggestion), `${suggestion} still does not fit`);
      assert.ok(suggestion > frameBytes, "suggesting the setting that just failed helps nobody");
    }
  }
});

test("the fastest profile reaches its derived container ceiling", () => {
  const worstCase = maximumStreamPayloadBytes(Math.max(...OFFERED));
  const suggestion = smallestSufficientFrameSize(worstCase, OFFERED);
  assert.ok(suggestion !== undefined, "the dropdown cannot express the largest legal payload");
  assert.ok(fitsInOneStream(worstCase, suggestion));
});

test("no suggestion when nothing on offer is big enough", () => {
  assert.equal(smallestSufficientFrameSize(MAX_SOURCE_BLOCKS * 4000, OFFERED), undefined);
});
