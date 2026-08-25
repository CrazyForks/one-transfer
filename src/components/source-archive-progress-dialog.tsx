import { useEffect, useRef, useState } from "react";
import { Archive, CheckCircle2, CircleDashed, Download, FolderArchive, Terminal, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "../../shared/format";
import {
  SOURCE_ARCHIVE_OPTIONS_EVENT,
  SOURCE_ARCHIVE_PROGRESS_EVENT,
  SOURCE_ARCHIVE_CLEAR_EVENT,
  SOURCE_ARCHIVE_COPY_EVENT,
  SOURCE_ARCHIVE_SEND_EVENT,
  type SourceArchiveOptionsDetail,
  type SourceArchiveProgressDetail,
} from "../../shared/source-archive-events";

const initialDetail: SourceArchiveProgressDetail = {
  state: "idle",
  percent: 0,
  message: "配置完成后选择工程文件夹",
};

export function SourceArchiveProgressDialog({
  directoryInputId,
  completionAction = "qr",
}: {
  directoryInputId: string;
  completionAction?: "qr" | "clipboard";
}) {
  const [open, setOpen] = useState(false);
  const [includeGit, setIncludeGit] = useState(false);
  const [detail, setDetail] = useState<SourceArchiveProgressDetail>(initialDetail);
  const [logs, setLogs] = useState<string[]>([]);
  const lastMessage = useRef("");

  useEffect(() => {
    const update = (event: Event) => {
      const next = (event as CustomEvent<SourceArchiveProgressDetail>).detail;
      if (next.state === "idle") {
        setDetail(initialDetail);
        setLogs([]);
        lastMessage.current = "";
        return;
      }
      if (next.percent === 0 && next.state === "running") {
        setLogs([]);
        lastMessage.current = "";
        setOpen(true);
      }
      setDetail(next);
      if (next.message && next.message !== lastMessage.current) {
        lastMessage.current = next.message;
        setLogs((current) => [...current.slice(-29), next.message]);
      }
    };
    window.addEventListener(SOURCE_ARCHIVE_PROGRESS_EVENT, update);
    return () => window.removeEventListener(SOURCE_ARCHIVE_PROGRESS_EVENT, update);
  }, []);

  const chooseDirectory = () => {
    const options: SourceArchiveOptionsDetail = { includeGit };
    window.dispatchEvent(new CustomEvent<SourceArchiveOptionsDetail>(SOURCE_ARCHIVE_OPTIONS_EVENT, { detail: options }));
    const message = "等待浏览器选择并授权工程文件夹";
    setDetail({ state: "running", percent: 0, message });
    setLogs([`压缩配置：${includeGit ? "包含 .git" : "不包含 .git"}`, message]);
    lastMessage.current = message;
    (document.getElementById(directoryInputId) as HTMLInputElement | null)?.click();
  };

  const clearPreviousSelection = () => {
    window.dispatchEvent(new Event(SOURCE_ARCHIVE_CLEAR_EVENT));
  };

  const sendByQr = () => {
    window.dispatchEvent(new Event(SOURCE_ARCHIVE_SEND_EVENT));
  };

  const copyToClipboard = () => {
    window.dispatchEvent(new Event(SOURCE_ARCHIVE_COPY_EVENT));
  };

  const complete = detail.state === "success";
  const failed = detail.state === "error";
  const waitingForPicker = detail.state === "running" && detail.percent === 0;
  const StatusIcon = complete ? CheckCircle2 : failed ? XCircle : CircleDashed;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" onClick={clearPreviousSelection}><FolderArchive />选择工程文件夹</Button>
      </DialogTrigger>
      <DialogContent className="source-archive-progress-dialog-style-01">
        <DialogHeader>
          <DialogTitle className="source-archive-progress-dialog-style-02">
            <Archive className="source-archive-progress-dialog-style-03" />
            {complete ? "工程压缩完成" : failed ? "工程压缩失败" : "准备工程压缩包"}
          </DialogTitle>
          <DialogDescription>浏览器授权目录后，筛选、读取和压缩均在本地Worker中完成。</DialogDescription>
        </DialogHeader>

        <label className="source-archive-progress-dialog-style-04">
          <Checkbox
            checked={includeGit}
            disabled={detail.state === "running" && !waitingForPicker}
            onCheckedChange={(checked) => setIncludeGit(checked === true)}
            aria-label="包含 Git 元数据"
          />
          <span className="source-archive-progress-dialog-style-05">
            <strong className="source-archive-progress-dialog-style-06">包含 .git 文件</strong>
            <span className="source-archive-progress-dialog-style-07">默认不包含；启用后会保留提交历史和Git配置，压缩包可能明显增大。</span>
          </span>
        </label>

        <ol className="source-archive-progress-dialog-style-08">
          {["选择目录", "筛选源码", "Worker压缩", completionAction === "qr" ? "下载或二维码发送" : "下载或复制到剪贴板"].map((step, index) => (
            <li key={step} className="source-archive-progress-dialog-style-09"><b className="source-archive-progress-dialog-style-10">{index + 1}.</b>{step}</li>
          ))}
        </ol>

        {detail.state !== "idle" ? (
          <div className="source-archive-progress-dialog-style-11">
            <div className="source-archive-progress-dialog-style-12">
              <span className="source-archive-progress-dialog-style-13">
                <StatusIcon className={complete ? "source-archive-progress-dialog-style-14" : failed ? "source-archive-progress-dialog-style-15" : "source-archive-progress-dialog-style-16"} />
                <span className="source-archive-progress-dialog-style-17">{detail.message}</span>
              </span>
              <strong className="source-archive-progress-dialog-style-18">{Math.round(detail.percent)}%</strong>
            </div>
            <Progress value={detail.percent} aria-label="源码压缩进度" />
            {complete && detail.archiveName && detail.archiveBytes !== undefined ? (
              <div className="source-archive-progress-dialog-style-19">
                <strong>{detail.archiveName}</strong>
                <span className="source-archive-progress-dialog-style-20">压缩文件大小 {formatBytes(detail.archiveBytes)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="source-archive-progress-dialog-style-21">
          <div className="source-archive-progress-dialog-style-22">
            <Terminal className="checkbox-style-02" />处理日志
          </div>
          <div className="source-archive-progress-dialog-style-23">
            {logs.length === 0 ? <span className="source-archive-progress-dialog-style-24">等待开始…</span> : logs.map((log, index) => (
              <div key={`${index}-${log}`} className="source-archive-progress-dialog-style-25">
                <span className="source-archive-progress-dialog-style-24">›</span><span className="source-archive-progress-dialog-style-26">{log}</span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="source-archive-progress-dialog-style-27">
          {complete && detail.downloadUrl && detail.archiveName ? (
            <Button asChild variant="outline">
              <a href={detail.downloadUrl} download={detail.archiveName}><Download />下载压缩文件</a>
            </Button>
          ) : null}
          {(detail.state === "idle" || waitingForPicker || failed) ? (
            <Button type="button" onClick={chooseDirectory}><FolderArchive />{waitingForPicker ? "重新选择" : "选择工程目录"}</Button>
          ) : null}
          {detail.state === "running" && !waitingForPicker ? <Button type="button" disabled>处理中…</Button> : null}
          {complete && completionAction === "qr" ? (
            <DialogClose asChild><Button type="button" onClick={sendByQr}>二维码发送</Button></DialogClose>
          ) : null}
          {complete && completionAction === "clipboard" ? (
            <DialogClose asChild><Button type="button" onClick={copyToClipboard}>手动复制</Button></DialogClose>
          ) : null}
          {failed ? <DialogClose asChild><Button type="button">关闭</Button></DialogClose> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
