import {
  isValidWindowsFileName,
  type ClipboardTextCodec,
  type EncodedClipboardTransfer,
} from "../../../shared/clipboard-transfer";
import {
  createClipboardDirectoryArchiveInWorker,
  encodeClipboardTransferInWorker,
} from "../../../shared/clipboard-processing-client";
import { formatBytes } from "../../../shared/format";
import { statusLine } from "../../../shared/status-line";
import { createSourceArchiveInWorker } from "../../../shared/source-archive-client";
import {
  SOURCE_ARCHIVE_COPY_EVENT,
  SOURCE_ARCHIVE_CLEAR_EVENT,
  SOURCE_ARCHIVE_OPTIONS_EVENT,
  SOURCE_ARCHIVE_PROGRESS_EVENT,
  type SourceArchiveOptionsDetail,
  type SourceArchiveProgressDetail,
} from "../../../shared/source-archive-events";

export function mountClipboardSend() {
const fileInput = document.getElementById("clipboard-file") as HTMLInputElement;
const directoryInput = document.getElementById("clipboard-directory") as HTMLInputElement;
const projectDirectoryInput = document.getElementById("clipboard-project-directory") as HTMLInputElement;
const copyButton = document.getElementById("copy-transfer") as HTMLButtonElement;
const fileNameLabel = document.getElementById("clipboard-file-name")!;
const nextStep = document.getElementById("clipboard-next-step") as HTMLElement;
const status = statusLine(document.getElementById("clipboard-status")!);
const toast = document.createElement("div");
toast.className = "clipboard-toast";
toast.setAttribute("role", "status");
toast.setAttribute("aria-live", "polite");
toast.setAttribute("aria-hidden", "true");
document.body.append(toast);

let payload: string | null = null;
let selectedName = "";
let generation = 0;
let processingAbortController: AbortController | null = null;
let sourceArchiveDownloadUrl: string | null = null;
let sourceArchiveOptions: SourceArchiveOptionsDetail = { includeGit: false };
let selected: {
  itemType: "file" | "directory";
  name: string;
  bytes: Uint8Array;
  mediaType: string;
  detail: string;
} | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

interface DeferredClipboardWrite {
  result: Promise<void>;
  resolve(text: string): void;
  reject(reason: unknown): void;
}

function currentCodec(): ClipboardTextCodec {
  return "base91";
}

function beginProcessing(): { currentGeneration: number; signal: AbortSignal } {
  processingAbortController?.abort();
  processingAbortController = new AbortController();
  return { currentGeneration: ++generation, signal: processingAbortController.signal };
}

function reportSourceArchive(detail: SourceArchiveProgressDetail): void {
  window.dispatchEvent(new CustomEvent<SourceArchiveProgressDetail>(SOURCE_ARCHIVE_PROGRESS_EVENT, { detail }));
}

function revokeSourceArchiveDownload(): void {
  if (!sourceArchiveDownloadUrl) return;
  URL.revokeObjectURL(sourceArchiveDownloadUrl);
  sourceArchiveDownloadUrl = null;
}

function clearClipboardSelection(preserveArchiveDialog = false): void {
  processingAbortController?.abort();
  processingAbortController = null;
  generation++;
  payload = null;
  selectedName = "";
  selected = null;
  fileInput.value = "";
  directoryInput.value = "";
  projectDirectoryInput.value = "";
  fileNameLabel.textContent = "未选择文件或文件夹";
  copyButton.disabled = true;
  copyButton.textContent = "复制数据到剪贴板";
  nextStep.hidden = true;
  status.setStatus("请选择要传递的文件或文件夹");
  revokeSourceArchiveDownload();
  clearTimeout(toastTimer);
  toast.classList.remove("show");
  toast.setAttribute("aria-hidden", "true");
  if (!preserveArchiveDialog) {
    reportSourceArchive({ state: "idle", percent: 0, message: "" });
  }
}

const onSourceArchiveOptions = (event: Event) => {
  sourceArchiveOptions = (event as CustomEvent<SourceArchiveOptionsDetail>).detail;
};

const onSourceArchiveCopy = () => {
  void copyTransfer(false);
};

const onSourceArchiveClear = () => clearClipboardSelection(true);

function showToast(message: string, tone: "success" | "error"): void {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `clipboard-toast ${tone} show`;
  toast.setAttribute("aria-hidden", "false");
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
    toast.setAttribute("aria-hidden", "true");
  }, 2800);
}

async function prepareFile(): Promise<void> {
  revokeSourceArchiveDownload();
  reportSourceArchive({ state: "idle", percent: 0, message: "" });
  const file = fileInput.files?.[0];
  const { currentGeneration, signal } = beginProcessing();
  payload = null;
  selectedName = "";
  selected = null;
  copyButton.disabled = true;
  copyButton.textContent = "复制文件数据到剪贴板";
  nextStep.hidden = true;

  if (!file) {
    status.setStatus("请选择要传递的文件或文件夹");
    return;
  }

  fileNameLabel.textContent = file.name;

  if (!isValidWindowsFileName(file.name)) {
    status.showError(`${file.name} 不是有效的 Windows 文件名，请先重命名`);
    return;
  }
  const automaticWrite = beginDeferredClipboardWrite();
  copyButton.textContent = "正在自动复制…";
  status.showLoading(`正在准备 ${file.name}…`);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (currentGeneration !== generation) {
      automaticWrite?.reject(new Error("文件选择已变更"));
      return;
    }
    selected = {
      itemType: "file",
      name: file.name,
      bytes,
      mediaType: file.type,
      detail: formatBytes(file.size),
    };
    await encodeSelected(currentGeneration, automaticWrite, signal);
  } catch (error) {
    automaticWrite?.reject(error);
    if (currentGeneration !== generation) return;
    status.showError(error instanceof Error ? error.message : "读取文件失败，请重新选择");
  }
}

async function prepareDirectory(): Promise<void> {
  revokeSourceArchiveDownload();
  reportSourceArchive({ state: "idle", percent: 0, message: "" });
  const files = [...(directoryInput.files ?? [])];
  const { currentGeneration, signal } = beginProcessing();
  payload = null;
  selectedName = "";
  selected = null;
  copyButton.disabled = true;
  copyButton.textContent = "复制文件夹全部内容到剪贴板";
  nextStep.hidden = true;

  if (files.length === 0) {
    status.showError("未读取到文件夹内容；纯空文件夹无法通过浏览器选择器传输");
    return;
  }
  if (files.length > 65_535) {
    status.showError("文件夹包含的文件超过 65,535 个，ZIP 格式无法安全保存");
    return;
  }

  const paths = files.map((file) => file.webkitRelativePath.replace(/\\/g, "/"));
  const rootName = paths[0]?.split("/")[0] ?? "";
  if (!isValidWindowsFileName(rootName)) {
    status.showError("文件夹名称无法在 Windows 中使用，请先重命名");
    return;
  }
  for (const path of paths) {
    const segments = path.split("/");
    if (
      segments.length < 2 ||
      segments[0] !== rootName ||
      segments.some((segment) => !segment || segment === "." || segment === ".." || !isValidWindowsFileName(segment))
    ) {
      status.showError("文件夹中包含无法在 Windows 中恢复的路径或文件名");
      return;
    }
  }

  fileNameLabel.textContent = `${rootName} · ${files.length.toLocaleString()} 个文件`;
  const automaticWrite = beginDeferredClipboardWrite();
  copyButton.textContent = "正在复制文件夹全部内容…";
  status.showLoading(`正在读取 ${rootName} 的全部文件并打包为 ZIP…`);
  try {
    const bytes = await createClipboardDirectoryArchiveInWorker(
      files.map((file, index) => ({ path: paths[index]!, blob: file })),
      signal,
    );
    selected = {
      itemType: "directory",
      name: rootName,
      bytes,
      mediaType: "application/zip",
      detail: `${files.length.toLocaleString()} 个文件 → ZIP ${formatBytes(bytes.length)}`,
    };
    await encodeSelected(currentGeneration, automaticWrite, signal);
  } catch (error) {
    automaticWrite?.reject(error);
    if (currentGeneration !== generation) return;
    status.showError(error instanceof Error ? error.message : "文件夹打包失败，请重新选择");
    copyButton.textContent = "复制文件夹全部内容到剪贴板";
  }
}

async function prepareProjectDirectory(): Promise<void> {
  revokeSourceArchiveDownload();
  const files = projectDirectoryInput.files;
  const { currentGeneration, signal } = beginProcessing();
  payload = null;
  selectedName = "";
  selected = null;
  copyButton.disabled = true;
  copyButton.textContent = "复制工程数据到剪贴板";
  nextStep.hidden = true;

  if (!files?.length) return;

  const rootName = files[0]?.webkitRelativePath.replace(/\\/g, "/").split("/")[0] ?? "";
  fileNameLabel.textContent = `${rootName} · 正在筛选工程文件…`;
  status.showLoading(`正在 Worker 中筛选并压缩 ${rootName}…`);
  reportSourceArchive({ state: "running", percent: 1, message: `已选择 ${rootName}，正在准备文件列表` });
  try {
    const archive = await createSourceArchiveInWorker(
      files,
      Number.POSITIVE_INFINITY,
      signal,
      (progress) => {
        if (currentGeneration !== generation) return;
        status.showLoading(`${progress.message} · ${Math.round(progress.percent)}%`);
        reportSourceArchive({ state: "running", ...progress });
      },
      { ...sourceArchiveOptions, maxInputBytes: Number.POSITIVE_INFINITY },
    );
    if (currentGeneration !== generation) {
      return;
    }
    fileNameLabel.textContent =
      `${rootName} · 保留 ${archive.includedFileCount.toLocaleString()} 个` +
      ` · 排除 ${archive.excludedFileCount.toLocaleString()} 个`;
    const archiveByteLength = archive.bytes.length;
    sourceArchiveDownloadUrl = URL.createObjectURL(new Blob([archive.bytes as BlobPart], { type: "application/zip" }));
    selected = {
      itemType: "directory",
      name: rootName,
      bytes: archive.bytes,
      mediaType: "application/zip",
      detail: `工程源码 · ZIP ${formatBytes(archiveByteLength)}`,
    };
    reportSourceArchive({
      state: "running",
      percent: 96,
      message: "ZIP 已生成，正在 Worker 中压缩并编码剪贴板数据",
      archiveName: archive.name,
      archiveBytes: archiveByteLength,
      downloadUrl: sourceArchiveDownloadUrl,
    });
    const encoded = await encodeSelected(currentGeneration, null, signal, false);
    if (!encoded) return;
    reportSourceArchive({
      state: "success",
      percent: 100,
      message: `工程已准备完成：${archive.name} · ${formatBytes(archiveByteLength)}`,
      archiveName: archive.name,
      archiveBytes: archiveByteLength,
      downloadUrl: sourceArchiveDownloadUrl,
    });
  } catch (error) {
    if (currentGeneration !== generation) return;
    const message = error instanceof Error ? error.message : "工程压缩失败，请重新选择";
    status.showError(message);
    reportSourceArchive({ state: "error", percent: 0, message });
    copyButton.textContent = "复制工程数据到剪贴板";
  }
}

async function encodeSelected(
  expectedGeneration: number,
  automaticWrite: DeferredClipboardWrite | null,
  signal: AbortSignal,
  automaticCopy = true,
): Promise<boolean> {
  if (!selected) return false;
  const item = selected;
  payload = null;
  copyButton.disabled = true;
  const codec = currentCodec();
  status.showLoading(`正在 Worker 中使用最高级别压缩并编码 ${item.name}…`);
  const originalSize = item.bytes.length;
  try {
    const encoded = await encodeClipboardTransferInWorker(
      item.itemType,
      item.name,
      item.bytes,
      codec,
      item.mediaType,
      signal,
    );
    if (expectedGeneration !== generation) {
      automaticWrite?.reject(new Error("编码设置已变更"));
      return false;
    }
    applyEncodedItem(item, encoded, originalSize);
    automaticWrite?.resolve(encoded.text);
    if (automaticCopy) await copyTransfer(true, expectedGeneration, automaticWrite?.result);
    return true;
  } catch (error) {
    automaticWrite?.reject(error);
    if (expectedGeneration !== generation) return false;
    status.showError(error instanceof Error ? error.message : "编码文件失败，请重试");
    return false;
  }
}

function applyEncodedItem(
  item: NonNullable<typeof selected>,
  encoded: EncodedClipboardTransfer,
  originalSize: number,
): void {
  payload = encoded.text;
  selectedName = item.name;
  copyButton.disabled = false;
  const legacyCharacters =
    25 +
    4 * Math.ceil(new TextEncoder().encode(item.name).length / 3) +
    4 * Math.ceil(originalSize / 3);
  const saving = Math.round((1 - encoded.encodedCharacters / Math.max(1, legacyCharacters)) * 100);
  const compression = encoded.compression === "gzip"
    ? `${formatBytes(encoded.originalSize)} → gzip ${formatBytes(encoded.transmittedSize)}`
    : formatBytes(encoded.originalSize);
  const savingText = saving > 0 ? ` · 较 V1 Base64 少约 ${saving}%` : "";
  status.setStatus(
    `${item.name} · ${item.detail} · ${compression} · ${encoded.encodedCharacters.toLocaleString()} 字符` +
      `${savingText} · SHA-256 已写入协议`,
  );
}

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("浏览器未允许写入剪贴板");
}

function beginDeferredClipboardWrite(): DeferredClipboardWrite | null {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return null;
  let resolve!: (text: string) => void;
  let reject!: (reason: unknown) => void;
  const text = new Promise<string>((resolveText, rejectText) => {
    resolve = resolveText;
    reject = rejectText;
  });
  try {
    const result = navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": text.then((value) => new Blob([value], { type: "text/plain" })),
      }),
    ]);
    void result.catch(() => undefined);
    return { result, resolve, reject };
  } catch {
    reject(new Error("浏览器不支持延迟写入剪贴板"));
    return null;
  }
}

async function copyTransfer(
  automatic = false,
  expectedGeneration = generation,
  pendingWrite?: Promise<void>,
): Promise<void> {
  if (!payload) return;
  const text = payload;
  const name = selectedName;
  copyButton.disabled = true;
  copyButton.textContent = automatic ? "正在自动复制…" : "正在复制…";
  try {
    if (pendingWrite) await pendingWrite;
    else await writeClipboard(text);
    if (expectedGeneration !== generation) return;
    status.setStatus(
      `${name} ${automatic ? "已自动复制" : "已复制"}。下一步：切换到 Windows，` +
        "等待剪贴板同步后打开“接收 → 剪贴板”并下载；BAT 作为备用方式",
    );
    copyButton.textContent = automatic ? "已自动复制 · 再次复制" : "已复制 · 再次复制";
    nextStep.hidden = false;
    showToast(`${name} 已复制，请按页面提示到 Windows 恢复`, "success");
  } catch {
    if (expectedGeneration !== generation) return;
    status.showError(
      automatic
        ? `${name} 已编码，但浏览器阻止自动复制，请点击下方按钮重试`
        : "复制失败，请允许浏览器写入剪贴板后重试",
    );
    nextStep.hidden = true;
    copyButton.textContent = "点击复制到剪贴板";
    showToast(
      automatic ? "自动复制失败，请点击按钮重试" : "复制失败，请允许剪贴板权限后重试",
      "error",
    );
  } finally {
    if (expectedGeneration === generation) copyButton.disabled = false;
  }
}

fileInput.addEventListener("click", () => clearClipboardSelection());
directoryInput.addEventListener("click", () => clearClipboardSelection());
projectDirectoryInput.addEventListener("click", () => clearClipboardSelection(true));
fileInput.addEventListener("change", () => void prepareFile());
directoryInput.addEventListener("change", () => void prepareDirectory());
projectDirectoryInput.addEventListener("change", () => void prepareProjectDirectory());
copyButton.addEventListener("click", () => void copyTransfer());
window.addEventListener(SOURCE_ARCHIVE_OPTIONS_EVENT, onSourceArchiveOptions);
window.addEventListener(SOURCE_ARCHIVE_COPY_EVENT, onSourceArchiveCopy);
window.addEventListener(SOURCE_ARCHIVE_CLEAR_EVENT, onSourceArchiveClear);
return () => {
  processingAbortController?.abort();
  processingAbortController = null;
  generation++;
  clearTimeout(toastTimer);
  toast.remove();
  payload = null;
  selected = null;
  window.removeEventListener(SOURCE_ARCHIVE_OPTIONS_EVENT, onSourceArchiveOptions);
  window.removeEventListener(SOURCE_ARCHIVE_COPY_EVENT, onSourceArchiveCopy);
  window.removeEventListener(SOURCE_ARCHIVE_CLEAR_EVENT, onSourceArchiveClear);
  revokeSourceArchiveDownload();
  reportSourceArchive({ state: "idle", percent: 0, message: "" });
};
}
