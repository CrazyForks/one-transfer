import { encodeClipboardTransfer, isValidWindowsFileName } from "../shared/clipboard-transfer";
import { formatBytes } from "../shared/format";
import { statusLine } from "../shared/status-line";

export function mountClipboard() {
const fileInput = document.getElementById("clipboard-file") as HTMLInputElement;
const copyButton = document.getElementById("copy-transfer") as HTMLButtonElement;
const fileNameLabel = document.getElementById("clipboard-file-name")!;
const status = statusLine(document.getElementById("clipboard-status")!);

let payload: string | null = null;
let selectedName = "";
let generation = 0;

async function prepareFile(): Promise<void> {
  const file = fileInput.files?.[0];
  const currentGeneration = ++generation;
  payload = null;
  selectedName = "";
  copyButton.disabled = true;
  copyButton.textContent = "复制到剪贴板";

  if (!file) {
    status.setStatus("请在发送端选择要传递的文件");
    return;
  }

  fileNameLabel.textContent = file.name;

  if (!isValidWindowsFileName(file.name)) {
    status.showError(`${file.name} 不是有效的 Windows 文件名，请先重命名`);
    return;
  }

  status.showLoading(`正在准备 ${file.name}…`);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (currentGeneration !== generation) return;
    payload = encodeClipboardTransfer("file", file.name, bytes);
    selectedName = file.name;
    copyButton.disabled = false;
    status.setStatus(`${file.name} · ${formatBytes(file.size)} · 已准备`);
  } catch (error) {
    if (currentGeneration !== generation) return;
    status.showError("读取文件失败，请重新选择");
  }
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

async function copyTransfer(): Promise<void> {
  if (!payload) return;
  copyButton.disabled = true;
  try {
    await writeClipboard(payload);
    status.setStatus(`${selectedName} 已复制为文本，请到 Windows 接收端运行还原脚本`);
    copyButton.textContent = "重新复制";
  } catch {
    status.showError("复制失败，请允许浏览器写入剪贴板后重试");
  } finally {
    copyButton.disabled = false;
  }
}

fileInput.addEventListener("click", () => {
  fileInput.value = "";
});
fileInput.addEventListener("change", () => void prepareFile());
copyButton.addEventListener("click", () => void copyTransfer());

return () => {
  generation++;
  payload = null;
};
}
