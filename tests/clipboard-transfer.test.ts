import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  assertBrowserClipboardRestoreInput,
  clipboardDownloadFileName,
  decodeBase91,
  decodeClipboardTransfer,
  encodeBase91,
  encodeClipboardTransfer,
  encodeClipboardTransferV1,
  isValidWindowsFileName,
} from "../shared/clipboard-transfer.ts";
import { MAX_FILE_BYTES } from "../shared/protocol.ts";

test("V2 defaults to Base91 and round-trips Unicode filenames", async () => {
  const bytes = new Uint8Array([0, 1, 2, 127, 128, 255]);
  const encoded = await encodeClipboardTransfer("file", "报告 2026.bin", bytes);

  assert.match(encoded.text, /^ONE_TRANSFER_V2\|file\|base91\|none\|6\|[0-9a-f]{64}\|/);
  const decoded = await decodeClipboardTransfer(encoded.text);
  assert.equal(decoded.name, "报告 2026.bin");
  assert.equal(decoded.codec, "base91");
  assert.deepEqual(decoded.bytes, bytes);
});

test("Base91 is the ASCII-compatible V2 codec", async () => {
  const bytes = Uint8Array.from({ length: 4096 }, (_, index) => (index * 31) & 0xff);
  const encoded = await encodeClipboardTransfer(
    "file",
    "fallback.bin",
    bytes,
    "base91",
    "application/zip",
  );
  assert.match(encoded.text, /^ONE_TRANSFER_V2\|file\|base91\|(?:none|gzip)\|4096\|/);
  assert.doesNotMatch(encoded.text, /[^\x20-\x7e]/);
  assert.deepEqual((await decodeClipboardTransfer(encoded.text)).bytes, bytes);
  assert.deepEqual(decodeBase91(encodeBase91(bytes)), bytes);
});

test("Base91 round-trips a large random payload", () => {
  const bytes = Uint8Array.from(randomBytes(1024 * 1024));
  assert.deepEqual(decodeBase91(encodeBase91(bytes)), bytes);
});

test("a Base91 pipe inside the payload cannot split V2 fields", async () => {
  const bytes = new Uint8Array([0, 27]);
  assert.equal(encodeBase91(bytes), "|;A");
  const encoded = await encodeClipboardTransfer("file", "pipe.bin", bytes, "base91");
  assert.ok(encoded.text.endsWith("||;A"));
  assert.deepEqual((await decodeClipboardTransfer(encoded.text)).bytes, bytes);
});

test("compressible clipboard payloads use gzip before text encoding", async () => {
  const bytes = new TextEncoder().encode("One Transfer clipboard protocol\n".repeat(1000));
  const encoded = await encodeClipboardTransfer("file", "notes.txt", bytes);
  assert.equal(encoded.compression, "gzip");
  assert.ok(encoded.transmittedSize < encoded.originalSize / 5);
  assert.deepEqual((await decodeClipboardTransfer(encoded.text)).bytes, bytes);
});

test("clipboard gzip decoding stops when output exceeds the declared size", async () => {
  const bytes = new TextEncoder().encode("bounded clipboard output\n".repeat(2_000));
  const encoded = await encodeClipboardTransfer("file", "bounded.txt", bytes);
  assert.equal(encoded.compression, "gzip");

  const malformed = encoded.text.replace(`|${bytes.length}|`, "|1|");
  await assert.rejects(decodeClipboardTransfer(malformed), /gzip 解压结果超过声明大小/);
});

test("browser clipboard restore rejects oversized declarations before decoding", async () => {
  const encoded = await encodeClipboardTransfer("file", "too-large.bin", new Uint8Array([1]));
  const oversized = encoded.text.replace("|1|", `|${MAX_FILE_BYTES + 1}|`);

  assert.throws(() => assertBrowserClipboardRestoreInput(oversized), /网页直接还原最大 64 MB/);
  await assert.rejects(decodeClipboardTransfer(oversized), /网页直接还原最大 64 MB/);
});

test("V2 preserves an empty file and verifies SHA-256", async () => {
  const encoded = await encodeClipboardTransfer("file", "empty.txt", new Uint8Array());
  const decoded = await decodeClipboardTransfer(encoded.text);
  assert.equal(decoded.bytes.length, 0);
  assert.equal(decoded.sha256, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("directory clipboard payloads download as a ZIP while files keep their names", async () => {
  const bytes = new TextEncoder().encode("directory archive bytes");
  const encoded = await encodeClipboardTransfer("directory", "项目源码", bytes);
  const decoded = await decodeClipboardTransfer(encoded.text);

  assert.equal(decoded.itemType, "directory");
  assert.equal(decoded.name, "项目源码");
  assert.deepEqual(decoded.bytes, bytes);
  assert.equal(clipboardDownloadFileName(decoded.itemType, decoded.name), "项目源码.zip");
  assert.equal(clipboardDownloadFileName("file", "报告.zip"), "报告.zip");
});

test("tampered V2 metadata or payload is rejected", async () => {
  const encoded = await encodeClipboardTransfer("file", "safe.bin", new Uint8Array([1, 2, 3]));
  await assert.rejects(
    decodeClipboardTransfer(encoded.text.replace(/\|[0-9a-f]{64}\|/, `|${"0".repeat(64)}|`)),
    /SHA-256/,
  );
});

test("the legacy V1 encoder remains byte-compatible", () => {
  const bytes = new Uint8Array([0, 1, 2, 127, 128, 255]);
  const payload = encodeClipboardTransferV1("file", "报告 2026.bin", bytes);
  const parts = payload.split("|", 4);
  assert.equal(parts[0], "ONE_TRANSFER_V1");
  assert.equal(Buffer.from(parts[2]!, "base64").toString("utf8"), "报告 2026.bin");
  assert.deepEqual(new Uint8Array(Buffer.from(parts[3]!, "base64")), bytes);
});

test("Windows filenames are rejected before copying unusable data", () => {
  assert.equal(isValidWindowsFileName("报告 2026.bin"), true);
  for (const name of ["CON.txt", "LPT9", "bad:name.txt", "trailing.", "dir/file.txt"]) {
    assert.equal(isValidWindowsFileName(name), false, name);
  }
});
