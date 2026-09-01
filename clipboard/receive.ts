import {
  assertBrowserClipboardRestoreInput,
  clipboardDownloadFileName,
} from "../shared/clipboard-transfer";
import { decodeClipboardTransferInWorker } from "../shared/clipboard-processing-client";
import { formatBytes } from "../shared/format";
import { statusLine } from "../shared/status-line";

export function mountClipboardReceive() {
  const restoreButton = document.getElementById("restore-from-clipboard") as HTMLButtonElement;
  const restoreButtonLabel = document.getElementById("restore-from-clipboard-label")!;
  const restoreStatus = statusLine(document.getElementById("browser-restore-status")!);
  const downloadWrap = document.getElementById("browser-restore-download-wrap")!;
  const download = document.getElementById("browser-restore-download") as HTMLAnchorElement;

  let abortController: AbortController | null = null;
  let downloadUrl: string | null = null;

  function revokeDownload(): void {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
    download.removeAttribute("href");
    download.removeAttribute("download");
    downloadWrap.hidden = true;
  }

  function restoreErrorMessage(error: unknown): string {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      return "浏览器未允许读取剪贴板。请在地址栏的站点权限中允许剪贴板后重试，或使用下方 BAT。";
    }
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return "剪贴板中没有可读取的文本，请重新复制当前 V2 数据。";
    }
    const message = error instanceof Error ? error.message : "剪贴板还原失败。";
    if (message.includes("下方 BAT")) return message;
    if (message.includes("ONE_TRANSFER_V2")) {
      return `${message} 当前网页只还原 V2；旧 V1 数据请使用下方 BAT。`;
    }
    return `${message} 请重新复制当前 V2 数据；如仍失败，请使用下方 BAT。`;
  }

  async function restoreFromClipboard(): Promise<void> {
    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;
    revokeDownload();
    restoreButton.disabled = true;
    restoreButtonLabel.textContent = "正在读取剪贴板…";
    restoreStatus.showLoading("正在请求剪贴板读取权限…");

    try {
      if (!window.isSecureContext) {
        throw new Error("浏览器只允许 HTTPS 页面读取剪贴板，请打开正式 HTTPS 地址或使用下方 BAT。");
      }
      const clipboard = navigator.clipboard;
      if (!clipboard?.readText) {
        throw new Error("当前浏览器不支持读取文本剪贴板，请使用新版 Edge/Chrome 或下方 BAT。");
      }

      const text = await clipboard.readText();
      if (controller.signal.aborted) return;
      if (!text.trim()) throw new Error("剪贴板为空，请重新复制当前 V2 数据。");
      assertBrowserClipboardRestoreInput(text);

      restoreButtonLabel.textContent = "正在校验 V2 数据…";
      restoreStatus.showLoading("正在 Worker 中解码、解压并校验 SHA-256…");
      const decoded = await decodeClipboardTransferInWorker(text, controller.signal);
      if (controller.signal.aborted) return;

      const fileName = clipboardDownloadFileName(decoded.itemType, decoded.name);
      const mediaType = decoded.itemType === "directory" ? "application/zip" : "application/octet-stream";
      const url = URL.createObjectURL(new Blob([decoded.bytes as BlobPart], { type: mediaType }));
      downloadUrl = url;
      download.href = url;
      download.download = fileName;
      downloadWrap.hidden = false;
      download.click();
      restoreStatus.setStatus(
        `${fileName} · ${formatBytes(decoded.bytes.length)} · SHA-256 校验通过，已开始下载`,
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      restoreStatus.showError(restoreErrorMessage(error));
    } finally {
      if (abortController === controller) {
        abortController = null;
        restoreButton.disabled = false;
        restoreButtonLabel.textContent = "读取剪贴板并下载";
      }
    }
  }

  const onRestore = () => void restoreFromClipboard();
  restoreButton.addEventListener("click", onRestore);

  return () => {
    abortController?.abort();
    abortController = null;
    restoreButton.removeEventListener("click", onRestore);
    revokeDownload();
  };
}
