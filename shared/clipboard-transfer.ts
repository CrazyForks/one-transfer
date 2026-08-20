export type ClipboardTransferItemType = "file" | "directory";

const BASE64_CHUNK_SIZE = 0x8000;

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

/** Keep this byte-for-byte compatible with deploy/add-transfer.sh. */
export function encodeClipboardTransfer(
  itemType: ClipboardTransferItemType,
  name: string,
  bytes: Uint8Array,
): string {
  const encodedName = bytesToBase64(new TextEncoder().encode(name));
  return `ONE_TRANSFER_V1|${itemType}|${encodedName}|${bytesToBase64(bytes)}`;
}
