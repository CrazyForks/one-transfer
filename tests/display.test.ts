import assert from "node:assert/strict";
import test from "node:test";
import {
  canFitQrGridAtIntegerPixels,
  fitQrDisplayArea,
  fitQrDisplaySize,
  integerQrGridLayout,
  mediaAspectRatio,
} from "../shared/display.ts";

test("full-screen QR display uses the actual container width and height", () => {
  assert.equal(fitQrDisplayArea(1800, 900, 32, 24), 876);
  assert.equal(fitQrDisplayArea(720, 1200, 40, 24), 680);
  assert.equal(fitQrDisplayArea(0, 900, 32, 24), 0);
});

test("QR display fits inside its container including padding", () => {
  assert.equal(fitQrDisplaySize(1440, 1000, 720, 900, 40), 680);
  assert.equal(fitQrDisplaySize(748, 833, 672, 900, 32), 640);
});

test("QR display still respects the requested and viewport sizes", () => {
  assert.equal(fitQrDisplaySize(1440, 1000, 1200, 600, 40), 600);
  assert.equal(fitQrDisplaySize(390, 844, 366, 900, 40), 326);
});

test("four-QR cells use an integer number of physical pixels per module", () => {
  assert.deepEqual(integerQrGridLayout(97, 900, 12, 1), {
    modulePixels: 4,
    cellCssPixels: 388,
    gridCssPixels: 788,
  });
  assert.deepEqual(integerQrGridLayout(113, 640, 8, 2), {
    modulePixels: 5,
    cellCssPixels: 282.5,
    gridCssPixels: 573,
  });
});

test("integer QR layout falls back safely for invalid device pixel ratios", () => {
  assert.equal(integerQrGridLayout(97, 100, 6, 0).modulePixels, 1);
  assert.throws(() => integerQrGridLayout(0, 100, 6, 1), /totalModules/);
});

test("dense QR grids clamp to a narrow mobile container instead of overflowing", () => {
  assert.equal(canFitQrGridAtIntegerPixels(220, 390, 8, 1), false);
  assert.deepEqual(integerQrGridLayout(220, 390, 8, 1), {
    modulePixels: 1,
    cellCssPixels: 191,
    gridCssPixels: 390,
  });
});

test("camera preview follows the actual portrait or landscape track", () => {
  assert.equal(mediaAspectRatio(960, 1280), "960 / 1280");
  assert.equal(mediaAspectRatio(1920, 1080), "1920 / 1080");
  assert.equal(mediaAspectRatio(0, 1080), "");
});
