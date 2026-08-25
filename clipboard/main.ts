import {
  encodeClipboardTransfer,
  isValidWindowsFileName,
  type ClipboardTextCodec,
  type EncodedClipboardTransfer,
} from "../shared/clipboard-transfer";
import { zip } from "fflate";
import { formatBytes } from "../shared/format";
import { statusLine } from "../shared/status-line";
import { createSourceArchiveInWorker } from "../shared/source-archive-client";

export function mountClipboard() {
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
  const file = fileInput.files?.[0];
  const currentGeneration = ++generation;
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
    await encodeSelected(currentGeneration, automaticWrite);
  } catch (error) {
    automaticWrite?.reject(error);
    if (currentGeneration !== generation) return;
    status.showError(error instanceof Error ? error.message : "读取文件失败，请重新选择");
  }
}

async function prepareDirectory(): Promise<void> {
  const files = [...(directoryInput.files ?? [])];
  const currentGeneration = ++generation;
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
    const entries: Record<string, Uint8Array> = Object.create(null);
    await Promise.all(files.map(async (file, index) => {
      entries[paths[index]!] = new Uint8Array(await file.arrayBuffer());
    }));
    if (currentGeneration !== generation) {
      automaticWrite?.reject(new Error("文件夹选择已变更"));
      return;
    }
    const bytes = await createZip(entries);
    selected = {
      itemType: "directory",
      name: rootName,
      bytes,
      mediaType: "application/zip",
      detail: `${files.length.toLocaleString()} 个文件 → ZIP ${formatBytes(bytes.length)}`,
    };
    await encodeSelected(currentGeneration, automaticWrite);
  } catch (error) {
    automaticWrite?.reject(error);
    if (currentGeneration !== generation) return;
    status.showError(error instanceof Error ? error.message : "文件夹打包失败，请重新选择");
    copyButton.textContent = "复制文件夹全部内容到剪贴板";
  }
}

async function prepareProjectDirectory(): Promise<void> {
  const files = [...(projectDirectoryInput.files ?? [])];
  const currentGeneration = ++generation;
  payload = null;
  selectedName = "";
  selected = null;
  copyButton.disabled = true;
  copyButton.textContent = "复制工程数据到剪贴板";
  nextStep.hidden = true;

  if (files.length === 0) return;

  const rootName = files[0]?.webkitRelativePath.replace(/\\/g, "/").split("/")[0] ?? "";
  fileNameLabel.textContent = `${rootName} · 正在筛选工程文件…`;
  const automaticWrite = beginDeferredClipboardWrite();
  status.showLoading(`正在 Worker 中筛选并压缩 ${rootName}…`);
  try {
    const archive = await createSourceArchiveInWorker(
      files,
      Number.POSITIVE_INFINITY,
      undefined,
      (progress) => {
        if (currentGeneration !== generation) return;
        status.showLoading(`${progress.message} · ${Math.round(progress.percent)}%`);
      },
      { maxInputBytes: Number.POSITIVE_INFINITY },
    );
    if (currentGeneration !== generation) {
      automaticWrite?.reject(new Error("工程选择已变更"));
      return;
    }
    fileNameLabel.textContent =
      `${rootName} · 保留 ${archive.includedFileCount.toLocaleString()} 个` +
      ` · 排除 ${archive.excludedFileCount.toLocaleString()} 个`;
    selected = {
      itemType: "directory",
      name: rootName,
      bytes: archive.bytes,
      mediaType: "application/zip",
      detail: `工程源码 · ZIP ${formatBytes(archive.bytes.length)}`,
    };
    await encodeSelected(currentGeneration, automaticWrite);
  } catch (error) {
    automaticWrite?.reject(error);
    if (currentGeneration !== generation) return;
    status.showError(error instanceof Error ? error.message : "工程压缩失败，请重新选择");
    copyButton.textContent = "复制工程数据到剪贴板";
  }
}

function createZip(entries: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(entries, { level: 6 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

async function encodeSelected(
  expectedGeneration: number,
  automaticWrite: DeferredClipboardWrite | null,
): Promise<void> {
  if (!selected) return;
  const item = selected;
  payload = null;
  copyButton.disabled = true;
  const codec = currentCodec();
  status.showLoading(`正在使用 Base91 编码 ${item.name}…`);
  try {
    const encoded = await encodeClipboardTransfer(
      item.itemType,
      item.name,
      item.bytes,
      codec,
      item.mediaType,
    );
    if (expectedGeneration !== generation) {
      automaticWrite?.reject(new Error("编码设置已变更"));
      return;
    }
    applyEncodedItem(item, encoded);
    automaticWrite?.resolve(encoded.text);
    await copyTransfer(true, expectedGeneration, automaticWrite?.result);
  } catch (error) {
    automaticWrite?.reject(error);
    if (expectedGeneration !== generation) return;
    status.showError(error instanceof Error ? error.message : "编码文件失败，请重试");
  }
}

function applyEncodedItem(
  item: NonNullable<typeof selected>,
  encoded: EncodedClipboardTransfer,
): void {
  payload = encoded.text;
  selectedName = item.name;
  copyButton.disabled = false;
  const legacyCharacters =
    25 +
    4 * Math.ceil(new TextEncoder().encode(item.name).length / 3) +
    4 * Math.ceil(item.bytes.length / 3);
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
        "等待剪贴板同步后运行 one-transfer-restore.bat",
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

fileInput.addEventListener("click", () => {
  fileInput.value = "";
  directoryInput.value = "";
  projectDirectoryInput.value = "";
});
directoryInput.addEventListener("click", () => {
  directoryInput.value = "";
  fileInput.value = "";
  projectDirectoryInput.value = "";
});
projectDirectoryInput.addEventListener("click", () => {
  projectDirectoryInput.value = "";
  fileInput.value = "";
  directoryInput.value = "";
});
fileInput.addEventListener("change", () => void prepareFile());
directoryInput.addEventListener("change", () => void prepareDirectory());
projectDirectoryInput.addEventListener("change", () => void prepareProjectDirectory());
copyButton.addEventListener("click", () => void copyTransfer());
return () => {
  generation++;
  clearTimeout(toastTimer);
  toast.remove();
  payload = null;
  selected = null;
};
}
