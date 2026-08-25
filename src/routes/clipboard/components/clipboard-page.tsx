import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, Download, FolderOpen } from "lucide-react";

import { PAGE_HEADING, VIEW_SHELL } from "@/app/constants";
import { SourceArchiveProgressDialog } from "@/components/source-archive-progress-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { FileSelectPanel } from "@/routes/components/file-select-panel";

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
          <span className="app-style-97">WINDOWS 接收端 · 首次使用</span>
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

export function ClipboardPage() {
  return (
    <main data-route-page data-view="clipboard" className={VIEW_SHELL}>
      <section data-reveal className="app-style-101">
        <h1 className={PAGE_HEADING}>通过文本剪贴板传文件或文件夹</h1>
        <p data-breathe className="app-style-35">文件夹会包含全部文件和层级，自动打包后复制到 Windows 还原。</p>
      </section>
      <div className="app-style-102" id="clipboard-status" aria-live="polite">请选择要传递的文件或文件夹</div>
      <FileSelectPanel
        inputId="clipboard-file"
        directoryInputId="clipboard-directory"
        projectDirectoryInputId="clipboard-project-directory"
        description="发送端 · 选择文件、文件夹或工程"
        directoryControl={(
          <ClipboardDirectoryActions
            directoryInputId="clipboard-directory"
            projectDirectoryInputId="clipboard-project-directory"
          />
        )}
        fileNameId="clipboard-file-name"
      />
      <div data-reveal className="app-style-103">
        <Button id="copy-transfer" type="button" disabled>复制数据到剪贴板</Button>
        <span className="dialog-style-11">选择后自动复制；完整文件夹保留全部内容，工程会自动排除依赖和构建产物。</span>
      </div>
      <section
        id="clipboard-next-step"
        hidden
        aria-live="polite"
        className="app-style-104"
      >
        <strong className="app-style-105">复制成功，下一步到 Windows 恢复</strong>
        <ol className="app-style-106">
          <li><b>1.</b> 切换到 Windows，等待远程剪贴板同步完成。</li>
          <li><b>2.</b> 将下方的 <code>one-transfer-restore.bat</code> 放到希望保存文件的目录。</li>
          <li><b>3.</b> 双击运行脚本；脚本会读取剪贴板、校验数据并恢复文件，文件夹会自动解压。</li>
        </ol>
        <a href="#restore-script-panel" className="app-style-107">
          查看或下载 Windows 还原脚本
        </a>
      </section>
      <RestoreScriptPanel />
    </main>
  );
}
