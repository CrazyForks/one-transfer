import { isPrecompressedType, MAX_FILE_BYTES, MAX_FILE_LABEL } from "./protocol";

export type ClipboardTransferItemType = "file" | "directory";
export type ClipboardTextCodec = "base91";
export type ClipboardCompression = "none" | "gzip";

export interface EncodedClipboardTransfer {
  text: string;
  codec: ClipboardTextCodec;
  compression: ClipboardCompression;
  originalSize: number;
  transmittedSize: number;
  encodedCharacters: number;
  sha256: string;
}

export interface DecodedClipboardTransfer {
  itemType: ClipboardTransferItemType;
  name: string;
  bytes: Uint8Array;
  codec: ClipboardTextCodec;
  compression: ClipboardCompression;
  sha256: string;
}

const BASE64_CHUNK_SIZE = 0x8000;
const BASE91_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~\"";
const BASE91_LOOKUP = new Map([...BASE91_ALPHABET].map((character, index) => [character, index]));
const textEncoder = new TextEncoder();

export function isValidWindowsFileName(name: string): boolean {
  if (!name || /[<>:"/\\|?*\u0000-\u001f]/.test(name) || /[ .]$/.test(name)) return false;
  const dot = name.indexOf(".");
  const stem = name.slice(0, dot === -1 ? undefined : dot);
  return !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem);
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_SIZE)));
  }
  return btoa(chunks.join(""));
}

/** Legacy encoder retained for old helper scripts and compatibility tests. */
export function encodeClipboardTransferV1(
  itemType: ClipboardTransferItemType,
  name: string,
  bytes: Uint8Array,
): string {
  const encodedName = bytesToBase64(textEncoder.encode(name));
  return `ONE_TRANSFER_V1|${itemType}|${encodedName}|${bytesToBase64(bytes)}`;
}

export async function encodeClipboardTransfer(
  itemType: ClipboardTransferItemType,
  name: string,
  bytes: Uint8Array,
  codec: ClipboardTextCodec = "base91",
  mediaType = "application/octet-stream",
): Promise<EncodedClipboardTransfer> {
  if (!isValidWindowsFileName(name)) throw new Error("文件名无法在 Windows 中使用。");
  if (bytes.length > MAX_FILE_BYTES) throw new Error(`文件不能超过 ${MAX_FILE_LABEL}。`);

  const [sha256, compressed] = await Promise.all([
    sha256Hex(bytes),
    shouldTryGzip(itemType, mediaType, bytes.length) ? gzip(bytes) : Promise.resolve(undefined),
  ]);
  const useGzip = compressed !== undefined && compressed.length + 64 < bytes.length;
  const transmitted = useGzip ? compressed : bytes;
  const compression: ClipboardCompression = useGzip ? "gzip" : "none";
  const payload = encodeBase91(transmitted);
  const encodedName = percentEncodeUtf8(name);
  const text = [
    "ONE_TRANSFER_V2",
    itemType,
    codec,
    compression,
    String(bytes.length),
    sha256,
    encodedName,
    payload,
  ].join("|");
  return {
    text,
    codec,
    compression,
    originalSize: bytes.length,
    transmittedSize: transmitted.length,
    encodedCharacters: text.length,
    sha256,
  };
}

export async function decodeClipboardTransfer(text: string): Promise<DecodedClipboardTransfer> {
  const parts = splitFields(text.trim(), 8);
  if (parts.length !== 8 || parts[0] !== "ONE_TRANSFER_V2") {
    throw new Error("剪贴板内容不是 ONE_TRANSFER_V2 数据。");
  }
  const itemType = parts[1];
  if (itemType !== "file" && itemType !== "directory") throw new Error("内容类型无效。");
  const codec = parts[2];
  if (codec !== "base91") throw new Error("文本编码不受支持。");
  const compression = parts[3];
  if (compression !== "none" && compression !== "gzip") throw new Error("压缩方式不受支持。");
  const originalSize = Number(parts[4]);
  if (!Number.isSafeInteger(originalSize) || originalSize < 0 || originalSize > MAX_FILE_BYTES) {
    throw new Error("原始文件大小无效。");
  }
  const expectedSha256 = parts[5]!.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedSha256)) throw new Error("SHA-256 字段无效。");
  const name = decodeURIComponent(parts[6]!);
  if (!isValidWindowsFileName(name)) throw new Error("文件名无法在 Windows 中使用。");
  const encodedPayload = parts[7]!.replace(/\s/g, "");
  const transmitted = decodeBase91(encodedPayload);
  const bytes = compression === "gzip"
    ? await gunzip(transmitted, originalSize)
    : transmitted;
  if (bytes.length !== originalSize) throw new Error("文件长度校验失败。");
  const actualSha256 = await sha256Hex(bytes);
  if (actualSha256 !== expectedSha256) throw new Error("SHA-256 校验失败。");
  return { itemType, name, bytes, codec, compression, sha256: actualSha256 };
}

export function encodeBase91(bytes: Uint8Array): string {
  let queue = 0;
  let queuedBits = 0;
  let output = "";
  for (const byte of bytes) {
    queue |= byte << queuedBits;
    queuedBits += 8;
    if (queuedBits > 13) {
      let value = queue & 8191;
      if (value > 88) {
        queue >>= 13;
        queuedBits -= 13;
      } else {
        value = queue & 16383;
        queue >>= 14;
        queuedBits -= 14;
      }
      output += BASE91_ALPHABET[value % 91]! + BASE91_ALPHABET[Math.floor(value / 91)]!;
    }
  }
  if (queuedBits > 0) {
    output += BASE91_ALPHABET[queue % 91]!;
    if (queuedBits > 7 || queue > 90) output += BASE91_ALPHABET[Math.floor(queue / 91)]!;
  }
  return output;
}

export function decodeBase91(text: string): Uint8Array {
  let queue = 0;
  let queuedBits = 0;
  let value = -1;
  const output: number[] = [];
  for (const character of text) {
    const decoded = BASE91_LOOKUP.get(character);
    if (decoded === undefined) throw new Error(`无法识别的 Base91 字符：${character}`);
    if (value < 0) {
      value = decoded;
      continue;
    }
    value += decoded * 91;
    queue |= value << queuedBits;
    queuedBits += (value & 8191) > 88 ? 13 : 14;
    while (queuedBits >= 8) {
      output.push(queue & 0xff);
      queue >>= 8;
      queuedBits -= 8;
    }
    value = -1;
  }
  if (value >= 0) output.push((queue | value << queuedBits) & 0xff);
  return Uint8Array.from(output);
}

function shouldTryGzip(
  itemType: ClipboardTransferItemType,
  mediaType: string,
  byteLength: number,
): boolean {
  return itemType === "file" && byteLength >= 768 && !isPrecompressedType(mediaType);
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array | undefined> {
  if (typeof CompressionStream === "undefined") return undefined;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error("当前环境不支持 gzip 解压。");
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  const output = new Uint8Array(await new Response(stream).arrayBuffer());
  if (output.length > expectedSize) throw new Error("gzip 解压结果超过声明大小。");
  return output;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const stable = Uint8Array.from(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", stable));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function percentEncodeUtf8(value: string): string {
  return [...textEncoder.encode(value)]
    .map((byte) => {
      const character = String.fromCharCode(byte);
      return /[A-Za-z0-9._~-]/.test(character)
        ? character
        : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    })
    .join("");
}

function splitFields(value: string, count: number): string[] {
  const fields: string[] = [];
  let start = 0;
  for (let index = 1; index < count; index++) {
    const separator = value.indexOf("|", start);
    if (separator < 0) return fields;
    fields.push(value.slice(start, separator));
    start = separator + 1;
  }
  fields.push(value.slice(start));
  return fields;
}
