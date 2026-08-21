import {
  encodeClipboardTransfer,
  isValidWindowsFileName,
  type ClipboardTextCodec,
  type EncodedClipboardTransfer,
} from "../shared/clipboard-transfer";
import { formatBytes } from "../shared/format";
import { MAX_FILE_BYTES, MAX_FILE_LABEL } from "../shared/protocol";
import { statusLine } from "../shared/status-line";

export function mountClipboard() {
const fileInput = document.getElementById("clipboard-file") as HTMLInputElement;
const copyButton = document.getElementById("copy-transfer") as HTMLButtonElement;
const fileNameLabel = document.getElementById("clipboard-file-name")!;
const status = statusLine(document.getElementById("clipboard-status")!);
const codecInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="clipboard-codec"]')];

let payload: string | null = null;
let selectedName = "";
let generation = 0;
let selected: { file: File; bytes: Uint8Array } | null = null;

function currentCodec(): ClipboardTextCodec {
  return codecInputs.find((input) => input.checked)?.value === "base91" ? "base91" : "b32768";
}

async function prepareFile(): Promise<void> {
  const file = fileInput.files?.[0];
  const currentGeneration = ++generation;
  payload = null;
  selectedName = "";
  selected = null;
  copyButton.disabled = true;
  copyButton.textContent = "复制文件数据到剪贴板";

  if (!file) {
    status.setStatus("请在发送端选择要传递的文件");
    return;
  }

  fileNameLabel.textContent = file.name;

  if (!isValidWindowsFileName(file.name)) {
    status.showError(`${file.name} 不是有效的 Windows 文件名，请先重命名`);
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    status.showError(`${file.name} 大小为 ${formatBytes(file.size)}，超过 ${MAX_FILE_LABEL} 限制`);
    return;
  }

  status.showLoading(`正在准备 ${file.name}…`);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (currentGeneration !== generation) return;
    selected = { file, bytes };
    await encodeSelected(currentGeneration);
  } catch (error) {
    if (currentGeneration !== generation) return;
    status.showError(error instanceof Error ? error.message : "读取文件失败，请重新选择");
  }
}

async function encodeSelected(expectedGeneration = ++generation): Promise<void> {
  if (!selected) return;
  const { file, bytes } = selected;
  payload = null;
  copyButton.disabled = true;
  const codec = currentCodec();
  status.showLoading(`正在使用 ${codec === "b32768" ? "Base32768" : "Base91"} 编码 ${file.name}…`);
  try {
    const encoded = await encodeClipboardTransfer("file", file.name, bytes, codec, file.type);
    if (expectedGeneration !== generation) return;
    applyEncodedFile(file, encoded);
  } catch (error) {
    if (expectedGeneration !== generation) return;
    status.showError(error instanceof Error ? error.message : "编码文件失败，请重试");
  }
}

function applyEncodedFile(file: File, encoded: EncodedClipboardTransfer): void {
  payload = encoded.text;
  selectedName = file.name;
  copyButton.disabled = false;
  const legacyCharacters =
    25 +
    4 * Math.ceil(new TextEncoder().encode(file.name).length / 3) +
    4 * Math.ceil(file.size / 3);
  const saving = Math.round((1 - encoded.encodedCharacters / Math.max(1, legacyCharacters)) * 100);
  const compression = encoded.compression === "gzip"
    ? `${formatBytes(encoded.originalSize)} → gzip ${formatBytes(encoded.transmittedSize)}`
    : formatBytes(encoded.originalSize);
  const savingText = saving > 0 ? ` · 较 V1 Base64 少约 ${saving}%` : "";
  status.setStatus(
    `${file.name} · ${compression} · ${encoded.encodedCharacters.toLocaleString()} 字符` +
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

async function copyTransfer(): Promise<void> {
  if (!payload) return;
  copyButton.disabled = true;
  try {
    await writeClipboard(payload);
    status.setStatus(
      `${selectedName} 已复制为 ${currentCodec() === "b32768" ? "高密度 Unicode" : "ASCII 兼容"}文本，` +
        "请到 Windows 接收端运行还原脚本",
    );
    copyButton.textContent = "已复制 · 再次复制";
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
for (const input of codecInputs) {
  input.addEventListener("change", () => {
    if (input.checked && selected) void encodeSelected();
  });
}

return () => {
  generation++;
  payload = null;
  selected = null;
};
}
