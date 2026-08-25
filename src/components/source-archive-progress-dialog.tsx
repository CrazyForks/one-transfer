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
  SOURCE_ARCHIVE_SEND_EVENT,
  type SourceArchiveOptionsDetail,
  type SourceArchiveProgressDetail,
} from "../../shared/source-archive-events";

const initialDetail: SourceArchiveProgressDetail = {
  state: "idle",
  percent: 0,
  message: "配置完成后选择工程文件夹",
};

export function SourceArchiveProgressDialog({ directoryInputId }: { directoryInputId: string }) {
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

  const sendByQr = () => {
    window.dispatchEvent(new Event(SOURCE_ARCHIVE_SEND_EVENT));
  };

  const complete = detail.state === "success";
  const failed = detail.state === "error";
  const waitingForPicker = detail.state === "running" && detail.percent === 0;
  const StatusIcon = complete ? CheckCircle2 : failed ? XCircle : CircleDashed;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline"><FolderArchive />选择工程文件夹</Button>
      </DialogTrigger>
      <DialogContent className="max-sm:overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="size-5 text-blue-600" />
            {complete ? "工程压缩完成" : failed ? "工程压缩失败" : "准备工程压缩包"}
          </DialogTitle>
          <DialogDescription>浏览器授权目录后，筛选、读取和压缩均在本地Worker中完成。</DialogDescription>
        </DialogHeader>

        <label className="flex items-start gap-3 rounded-xl border border-black/8 bg-zinc-50 p-4 text-left">
          <Checkbox
            checked={includeGit}
            disabled={detail.state === "running" && !waitingForPicker}
            onCheckedChange={(checked) => setIncludeGit(checked === true)}
            aria-label="包含 Git 元数据"
          />
          <span className="grid gap-1">
            <strong className="text-sm text-zinc-900">包含 .git 文件</strong>
            <span className="text-xs leading-relaxed text-zinc-500">默认不包含；启用后会保留提交历史和Git配置，压缩包可能明显增大。</span>
          </span>
        </label>

        <ol className="grid grid-cols-2 gap-2 text-xs text-zinc-500 sm:grid-cols-4">
          {["选择目录", "筛选源码", "Worker压缩", "下载或二维码发送"].map((step, index) => (
            <li key={step} className="rounded-lg bg-zinc-100 px-3 py-2"><b className="mr-1 text-zinc-900">{index + 1}.</b>{step}</li>
          ))}
        </ol>

        {detail.state !== "idle" ? (
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 font-medium text-zinc-800">
                <StatusIcon className={complete ? "size-4 text-emerald-600" : failed ? "size-4 text-red-600" : "size-4 animate-spin text-blue-600"} />
                <span className="truncate">{detail.message}</span>
              </span>
              <strong className="shrink-0 tabular-nums text-zinc-950">{Math.round(detail.percent)}%</strong>
            </div>
            <Progress value={detail.percent} aria-label="源码压缩进度" />
            {complete && detail.archiveName && detail.archiveBytes !== undefined ? (
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <strong>{detail.archiveName}</strong>
                <span className="ml-2">发送文件大小 {formatBytes(detail.archiveBytes)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="min-h-40 overflow-hidden rounded-xl bg-zinc-950 text-left text-zinc-200">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 text-xs font-semibold text-zinc-400">
            <Terminal className="size-3.5" />处理日志
          </div>
          <div className="max-h-52 overflow-y-auto p-4 font-mono text-xs leading-relaxed">
            {logs.length === 0 ? <span className="text-zinc-600">等待开始…</span> : logs.map((log, index) => (
              <div key={`${index}-${log}`} className="grid grid-cols-[18px_minmax(0,1fr)] gap-1.5">
                <span className="text-zinc-600">›</span><span className="break-words">{log}</span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="flex-wrap">
          {complete && detail.downloadUrl && detail.archiveName ? (
            <Button asChild variant="outline">
              <a href={detail.downloadUrl} download={detail.archiveName}><Download />下载压缩文件</a>
            </Button>
          ) : null}
          {(detail.state === "idle" || waitingForPicker || failed) ? (
            <Button type="button" onClick={chooseDirectory}><FolderArchive />{waitingForPicker ? "重新选择" : "选择工程目录"}</Button>
          ) : null}
          {detail.state === "running" && !waitingForPicker ? <Button type="button" disabled>处理中…</Button> : null}
          {complete ? (
            <DialogClose asChild><Button type="button" onClick={sendByQr}>二维码发送</Button></DialogClose>
          ) : null}
          {failed ? <DialogClose asChild><Button type="button">关闭</Button></DialogClose> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
