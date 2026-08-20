import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeClipboardTransfer,
  isValidWindowsFileName,
} from "../shared/clipboard-transfer.ts";

test("clipboard payload matches the Windows restore protocol", () => {
  const bytes = new Uint8Array([0, 1, 2, 127, 128, 255]);
  const payload = encodeClipboardTransfer("file", "报告 2026.bin", bytes);
  const parts = payload.split("|", 4);

  assert.equal(parts[0], "ONE_TRANSFER_V1");
  assert.equal(parts[1], "file");
  assert.equal(Buffer.from(parts[2]!, "base64").toString("utf8"), "报告 2026.bin");
  assert.deepEqual(new Uint8Array(Buffer.from(parts[3]!, "base64")), bytes);
});

test("clipboard protocol preserves an empty file", () => {
  assert.match(encodeClipboardTransfer("file", "empty.txt", new Uint8Array()), /\|$/);
});

test("Windows filenames are rejected before copying unusable data", () => {
  assert.equal(isValidWindowsFileName("报告 2026.bin"), true);
  for (const name of ["CON.txt", "LPT9", "bad:name.txt", "trailing.", "dir/file.txt"]) {
    assert.equal(isValidWindowsFileName(name), false, name);
  }
});
