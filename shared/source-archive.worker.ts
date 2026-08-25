import {
  createSourceArchive,
  type BrowserSourceFile,
  type SourceArchive,
  type SourceArchiveOptions,
  type SourceArchiveWorkProgress,
} from "./source-archive";

interface ArchiveRequest {
  readonly files: Array<{
    readonly blob: Blob;
    readonly name: string;
    readonly size: number;
    readonly relativePath: string;
  }>;
  readonly maxArchiveBytes: number;
  readonly options: SourceArchiveOptions;
}

type ArchiveResponse =
  | { readonly type: "progress"; readonly progress: SourceArchiveWorkProgress }
  | { readonly type: "success"; readonly archive: SourceArchive }
  | { readonly type: "error"; readonly message: string };

self.onmessage = (event: MessageEvent<ArchiveRequest>) => {
  const files: BrowserSourceFile[] = event.data.files.map((item) => ({
    name: item.name,
    size: item.size,
    webkitRelativePath: item.relativePath,
    arrayBuffer: () => item.blob.arrayBuffer(),
  }));
  void createSourceArchive(files, event.data.maxArchiveBytes, (progress) => {
    const response: ArchiveResponse = { type: "progress", progress };
    self.postMessage(response);
  }, event.data.options)
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
