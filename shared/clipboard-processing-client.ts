import {
  encodeClipboardTransfer,
  type ClipboardTextCodec,
  type ClipboardTransferItemType,
  type EncodedClipboardTransfer,
} from "./clipboard-transfer";
import {
  createClipboardDirectoryArchive,
  type ClipboardDirectoryEntry,
  type ClipboardProcessingRequest,
  type ClipboardProcessingResponse,
} from "./clipboard-processing";

function runClipboardWorker(
  request: ClipboardProcessingRequest,
  transfer: Transferable[],
  signal?: AbortSignal,
): Promise<ClipboardProcessingResponse> {
  const worker = new Worker(new URL("./clipboard-processing.worker.ts", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      cleanup();
      reject(new Error("剪贴板数据处理已取消。"));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () => {
      cleanup();
      reject(new Error("剪贴板处理 Worker 执行失败。"));
    };
    worker.onmessage = (event: MessageEvent<ClipboardProcessingResponse>) => {
      cleanup();
      if (event.data.type === "error") reject(new Error(event.data.message));
      else resolve(event.data);
    };
    worker.postMessage(request, { transfer });
  });
}

export async function encodeClipboardTransferInWorker(
  itemType: ClipboardTransferItemType,
  name: string,
  bytes: Uint8Array,
  codec: ClipboardTextCodec,
  mediaType: string,
  signal?: AbortSignal,
): Promise<EncodedClipboardTransfer> {
  if (typeof Worker === "undefined") {
    return encodeClipboardTransfer(itemType, name, bytes, codec, mediaType);
  }
  const transferable =
    bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes
      : bytes.slice();
  const response = await runClipboardWorker({
    type: "encode",
    itemType,
    name,
    bytes: transferable,
    codec,
    mediaType,
  }, [transferable.buffer as ArrayBuffer], signal);
  if (response.type !== "encoded") throw new Error("剪贴板处理 Worker 返回了无效结果。");
  return response.encoded;
}

export async function createClipboardDirectoryArchiveInWorker(
  entries: readonly ClipboardDirectoryEntry[],
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (typeof Worker === "undefined") return createClipboardDirectoryArchive(entries);
  const response = await runClipboardWorker({
    type: "archive-directory",
    entries: [...entries],
  }, [], signal);
  if (response.type !== "archive") throw new Error("剪贴板处理 Worker 返回了无效结果。");
  return response.bytes;
}
