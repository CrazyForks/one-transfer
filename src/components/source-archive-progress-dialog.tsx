import { useEffect, useRef, useState } from "react";
import { Archive, CheckCircle2, CircleDashed, Terminal, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "../../shared/format";
import {
  SOURCE_ARCHIVE_PROGRESS_EVENT,
  type SourceArchiveProgressDetail,
} from "../../shared/source-archive-events";

export function SourceArchiveProgressDialog() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<SourceArchiveProgressDetail>({
    state: "idle",
    percent: 0,
    message: "等待选择工程文件夹",
  });
  const [logs, setLogs] = useState<string[]>([]);
  const lastMessage = useRef("");

  useEffect(() => {
    const update = (event: Event) => {
      const next = (event as CustomEvent<SourceArchiveProgressDetail>).detail;
      if (next.state === "idle") {
        setOpen(false);
        setDetail(next);
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
        setLogs((current) => [...current.slice(-19), next.message]);
      }
    };
    window.addEventListener(SOURCE_ARCHIVE_PROGRESS_EVENT, update);
    return () => window.removeEventListener(SOURCE_ARCHIVE_PROGRESS_EVENT, update);
  }, []);

  const complete = detail.state === "success";
  const failed = detail.state === "error";
  const StatusIcon = complete ? CheckCircle2 : failed ? XCircle : CircleDashed;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="size-5 text-blue-600" />
            {complete ? "源码压缩完成" : failed ? "源码压缩失败" : "正在准备发送文件"}
          </DialogTitle>
          <DialogDescription>
            文件只在当前浏览器本地处理，压缩完成后自动进入发送流程。
          </DialogDescription>
        </DialogHeader>

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

        <div className="min-h-44 overflow-hidden rounded-xl bg-zinc-950 text-left text-zinc-200">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 text-xs font-semibold text-zinc-400">
            <Terminal className="size-3.5" />处理日志
          </div>
          <div className="max-h-56 overflow-y-auto p-4 font-mono text-xs leading-relaxed">
            {logs.map((log, index) => (
              <div key={`${index}-${log}`} className="grid grid-cols-[18px_minmax(0,1fr)] gap-1.5">
                <span className="text-zinc-600">›</span>
                <span className="break-words">{log}</span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" disabled={detail.state === "running"}>
              {complete ? "关闭并查看发送画面" : failed ? "关闭" : "处理中…"}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
