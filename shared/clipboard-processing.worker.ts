import { encodeClipboardTransfer } from "./clipboard-transfer";
import {
  createClipboardDirectoryArchive,
  type ClipboardProcessingRequest,
  type ClipboardProcessingResponse,
} from "./clipboard-processing";

self.onmessage = (event: MessageEvent<ClipboardProcessingRequest>) => {
  const request = event.data;
  const operation = request.type === "encode"
    ? encodeClipboardTransfer(
        request.itemType,
        request.name,
        request.bytes,
        request.codec,
        request.mediaType,
      ).then((encoded) => {
        const response: ClipboardProcessingResponse = { type: "encoded", encoded };
        self.postMessage(response);
      })
    : createClipboardDirectoryArchive(request.entries).then((bytes) => {
        const response: ClipboardProcessingResponse = { type: "archive", bytes };
        self.postMessage(response, { transfer: [bytes.buffer] });
      });

  void operation.catch((error: unknown) => {
    const response: ClipboardProcessingResponse = {
      type: "error",
      message: error instanceof Error ? error.message : "剪贴板数据处理失败。",
    };
    self.postMessage(response);
  });
};
