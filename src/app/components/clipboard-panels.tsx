import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardPaste, Download, FolderOpen } from "lucide-react";

import { SourceArchiveProgressDialog } from "@/components/source-archive-progress-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { FileSelectPanel } from "@/app/components/file-select-panel";

function ClipboardDirectoryActions({
  directoryInputId,
  projectDirectoryInputId,
}: {
  directoryInputId: string;
  projectDirectoryInputId: string;
}) {
  return (
    <>
      <label
        htmlFor={directoryInputId}
        className={cn(buttonVariants({ variant: "outline" }), "app-style-31")}
      >
        <FolderOpen />完整文件夹
      </label>
      <SourceArchiveProgressDialog
        directoryInputId={projectDirectoryInputId}
        completionAction="clipboard"
      />
    </>
  );
}

export function ClipboardSendPanel() {
  return (
    <div className="transfer-channel-panel">
      <section data-reveal className="transfer-tool-surface">
        <h2 className="dialog-style-07">剪贴板发送</h2>
        <header className="transfer-tool-header">
          <span className="transfer-tool-copy">
            <strong>剪贴板发送</strong>
            <span>编码为文本，文件夹自动打包并保留层级</span>
          </span>
        </header>
        <div className="app-style-102" id="clipboard-status" aria-live="polite">
          请选择要传递的文件或文件夹
        </div>
        <FileSelectPanel
          inputId="clipboard-file"
          directoryInputId="clipboard-directory"
          projectDirectoryInputId="clipboard-project-directory"
          description="选择文件、文件夹或工程"
          className="file-select-panel--embedded"
          directoryControl={(
            <ClipboardDirectoryActions
              directoryInputId="clipboard-directory"
              projectDirectoryInputId="clipboard-project-directory"
            />
          )}
          fileNameId="clipboard-file-name"
        />
        <div className="app-style-103">
          <Button id="copy-transfer" type="button" disabled>复制数据到剪贴板</Button>
          <span className="dialog-style-11">
            选择后自动复制；工程会自动排除依赖和构建产物。
          </span>
        </div>
        <section
          id="clipboard-next-step"
          hidden
          aria-live="polite"
          className="app-style-104"
        >
          <strong className="app-style-105">复制成功，下一步到 Windows 接收</strong>
          <ol className="app-style-106">
            <li><b>1.</b> 切换到 Windows，等待远程剪贴板同步完成。</li>
            <li><b>2.</b> 打开 One Transfer 的“接收 → 剪贴板”。</li>
            <li><b>3.</b> 点击“读取剪贴板并下载”；文件夹会下载为 ZIP。</li>
          </ol>
          <Link to="/receive?channel=clipboard" className="app-style-107">
            前往剪贴板接收
          </Link>
        </section>
      </section>
    </div>
  );
}

function BrowserRestorePanel() {
  return (
    <Card id="browser-restore-panel" data-reveal className="app-style-94">
      <CardContent className="app-style-95">
        <div className="app-style-96">
          <span className="app-style-97">WINDOWS 接收端 · 无需脚本</span>
          <strong>浏览器直接还原</strong>
          <span className="dialog-style-11">
            读取当前 ONE_TRANSFER_V2 文本剪贴板，校验通过后直接下载；文件夹会下载为 ZIP，
            网页直接还原最大 64 MB。
          </span>
        </div>
        <div id="browser-restore-status" className="app-style-102" aria-live="polite">
          等待读取当前 V2 剪贴板数据
        </div>
        <div className="app-style-100">
          <Button id="restore-from-clipboard" type="button">
            <ClipboardPaste /><span id="restore-from-clipboard-label">读取剪贴板并下载</span>
          </Button>
          <span id="browser-restore-download-wrap" hidden>
            <a
              id="browser-restore-download"
              href="#browser-restore-panel"
              className={buttonVariants({ variant: "outline" })}
            >
              <Download /><span>再次下载</span>
            </a>
          </span>
        </div>
        <span className="dialog-style-11">如浏览器或内网策略不允许读取剪贴板，请使用下方 BAT 备用方式。</span>
      </CardContent>
    </Card>
  );
}

function RestoreScriptPanel() {
  const [script, setScript] = useState("");
  const [copyLabel, setCopyLabel] = useState("复制脚本源码");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(new URL("one-transfer-restore.bat", document.baseURI), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then(setScript)
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError("还原脚本加载失败，请使用下载按钮。");
      });
    return () => controller.abort();
  }, []);

  const copyScript = async () => {
    if (!script) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(script);
      else {
        textareaRef.current?.focus();
        textareaRef.current?.select();
        if (!document.execCommand("copy")) throw new Error("copy failed");
      }
      setCopyLabel("已复制 · 再次复制");
    } catch {
      setCopyLabel("复制失败，请手动全选复制");
    }
  };

  return (
    <Card id="restore-script-panel" data-reveal className="app-style-94">
      <CardContent className="app-style-95">
        <div className="app-style-96">
          <span className="app-style-97">WINDOWS 接收端 · 备用方式</span>
          <strong>One Transfer 通用还原脚本</strong>
          <span className="dialog-style-11">下载脚本，或复制下方源码并保存为 one-transfer-restore.bat；兼容 V1/V2。</span>
        </div>
        <textarea
          ref={textareaRef}
          value={script}
          readOnly
          rows={12}
          spellCheck={false}
          aria-label="one-transfer-restore.bat 脚本源码"
          onFocus={(event) => event.currentTarget.select()}
          className="app-style-98"
          placeholder="正在加载 one-transfer-restore.bat…"
        />
        {error ? <span className="app-style-99">{error}</span> : null}
        <div className="app-style-100">
          <Button type="button" variant="outline" disabled={!script} onClick={() => void copyScript()}>
            <ClipboardPaste />{copyLabel}
          </Button>
          <Button asChild>
            <a href="./one-transfer-restore.bat" download="one-transfer-restore.bat"><Download />下载还原脚本</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ClipboardReceivePanel() {
  return (
    <div className="transfer-channel-panel">
      <BrowserRestorePanel />
      <RestoreScriptPanel />
    </div>
  );
}
