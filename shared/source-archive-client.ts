import {
  createSourceArchive,
  type BrowserSourceFile,
  type SourceArchive,
  type SourceArchiveWorkProgress,
} from "./source-archive";

type ArchiveResponse =
  | { readonly type: "progress"; readonly progress: SourceArchiveWorkProgress }
  | { readonly type: "success"; readonly archive: SourceArchive }
  | { readonly type: "error"; readonly message: string };

export function createSourceArchiveInWorker(
  files: readonly BrowserSourceFile[],
  maxArchiveBytes: number,
  signal?: AbortSignal,
  onProgress: (progress: SourceArchiveWorkProgress) => void = () => undefined,
): Promise<SourceArchive> {
  if (typeof Worker === "undefined") return createSourceArchive(files, maxArchiveBytes, onProgress);

  let worker: Worker;
  try {
    worker = new Worker(new URL("./source-archive.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return createSourceArchive(files, maxArchiveBytes, onProgress);
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      cleanup();
      reject(new Error("源码文件夹压缩已取消。"));
    };

    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () => {
      cleanup();
      reject(new Error("源码压缩 Worker 执行失败。"));
    };
    worker.onmessage = (event: MessageEvent<ArchiveResponse>) => {
      if (event.data.type === "progress") {
        onProgress(event.data.progress);
        return;
      }
      cleanup();
      if (event.data.type === "error") reject(new Error(event.data.message));
      else resolve(event.data.archive);
    };
    worker.postMessage({
      files: files.map((file) => ({
        blob: file,
        name: file.name,
        size: file.size,
        relativePath: file.webkitRelativePath,
      })),
      maxArchiveBytes,
    });
  });
}
