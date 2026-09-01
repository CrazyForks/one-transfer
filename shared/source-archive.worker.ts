import {
  createSourceArchiveFromSelection,
  type BrowserSourceFile,
  type PreparedSourceArchiveSelection,
  type SourceArchive,
  type SourceArchiveWorkProgress,
} from "./source-archive";

interface ArchiveRequest {
  readonly selection: {
    readonly rootName: string;
    readonly excludedFileCount: number;
    readonly inputBytes: number;
    readonly included: Array<{
      readonly blob: Blob;
      readonly name: string;
      readonly size: number;
      readonly path: string;
    }>;
  };
  readonly maxArchiveBytes: number;
}

type ArchiveResponse =
  | { readonly type: "progress"; readonly progress: SourceArchiveWorkProgress }
  | { readonly type: "success"; readonly archive: SourceArchive }
  | { readonly type: "error"; readonly message: string };

self.onmessage = (event: MessageEvent<ArchiveRequest>) => {
  const request = event.data;
  const selection: PreparedSourceArchiveSelection = {
    rootName: request.selection.rootName,
    excludedFileCount: request.selection.excludedFileCount,
    inputBytes: request.selection.inputBytes,
    included: request.selection.included.map((item) => {
      const file: BrowserSourceFile = {
        name: item.name,
        size: item.size,
        webkitRelativePath: item.path,
        arrayBuffer: () => item.blob.arrayBuffer(),
      };
      return { file, path: item.path };
    }),
  };
  void createSourceArchiveFromSelection(selection, request.maxArchiveBytes, (progress) => {
    const response: ArchiveResponse = { type: "progress", progress };
    self.postMessage(response);
  })
    .then((archive) => {
      const response: ArchiveResponse = { type: "success", archive };
      self.postMessage(response, { transfer: [archive.bytes.buffer] });
    })
    .catch((error: unknown) => {
      const response: ArchiveResponse = {
        type: "error",
        message: error instanceof Error ? error.message : "源码文件夹压缩失败。",
      };
      self.postMessage(response);
    });
};
