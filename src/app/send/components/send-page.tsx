import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { FolderOpen } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { SourceArchiveProgressDialog } from "@/components/source-archive-progress-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { PAGE_HEADING, VIEW_SHELL } from "@/app/constants";
import { inspectDeviceCapabilities } from "@/lib/device-capabilities";
import { cn } from "@/lib/utils";
import { ClipboardSendPanel } from "@/app/components/clipboard-panels";
import { FileSelectPanel } from "@/app/components/file-select-panel";
import {
  TransferChannelTabs,
  type TransferChannel,
} from "@/app/components/transfer-channel-tabs";
import {
  describeDeviceCapabilities,
  recommendSpeedProfile,
} from "../../../../shared/device-profile";
import { HEADER_LEN } from "../../../../shared/protocol";
import {
  SEND_CAPABILITIES_EVENT,
  SEND_PROGRESS_EVENT,
  type SendProgressDetail,
} from "../../../../shared/send-events";
import {
  DEFAULT_SEND_TUNING,
  QR_GRID_CELLS,
  SEND_SPEED_CHANGE_EVENT,
  SEND_SPEED_SYNC_EVENT,
  SEND_SPEED_PROFILES,
  SEND_TUNING_LIMITS,
  isSameSendTuning,
  normalizeSendTuning,
  type SendTuning,
} from "../../../../shared/send-settings";

function SendModeTabs() {
  const [value, setValue] = useState("file");

  const changeMode = (nextValue: string) => {
    setValue(nextValue);
    const input = document.querySelector<HTMLInputElement>(`input[name="send-mode"][value="${nextValue}"]`);
    if (input) {
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    requestAnimationFrame(() => {
      const pane = document.getElementById(nextValue === "snippet" ? "pane-snippet" : "pane-file");
      if (!pane || pane.hidden) return;
      gsap.fromTo(
        pane,
        { y: 4 },
        { y: 0, duration: 0.16, ease: "power3.out", clearProps: "transform" },
      );
    });
  };

  return (
    <>
      <SegmentedTabs
        value={value}
        onValueChange={changeMode}
        items={[
          { value: "file", label: "文件" },
          { value: "snippet", label: "文字" },
        ]}
        ariaLabel="二维码发送内容"
        listClassName="send-mode-tabs"
      />
      <input hidden type="radio" name="send-mode" value="file" defaultChecked />
      <input hidden type="radio" name="send-mode" value="snippet" />
    </>
  );
}

function SendDirectoryActions() {
  return (
    <>
      <label htmlFor="cfg-directory" className={cn(buttonVariants({ variant: "outline" }), "app-style-31")}>
        <FolderOpen />完整文件夹
      </label>
      <SourceArchiveProgressDialog directoryInputId="cfg-source-directory" />
    </>
  );
}

function QrSendPanel() {
  return (
    <div className="transfer-channel-panel">
      <section data-reveal className="transfer-tool-surface qr-send-composer">
        <h2 id="tool-title" className="dialog-style-07">发送文件</h2>
        <header className="transfer-tool-header">
          <span className="transfer-tool-copy">
            <strong>二维码发送</strong>
            <span>选择内容后自动开始播放</span>
          </span>
          <SendModeTabs />
        </header>
        <div className="app-style-37" id="specs">选择文件开始</div>
        <div className="app-style-38">
          <FileSelectPanel
            panelId="pane-file"
            inputId="cfg-file"
            directoryInputId="cfg-directory"
            projectDirectoryInputId="cfg-source-directory"
            descriptionId="file-picker-label"
            description="任意文件、完整文件夹或前端/Python工程"
            className="file-select-panel--embedded"
            directoryControl={<SendDirectoryActions />}
            fileNameId="send-file-name"
          />
        </div>
        <div id="pane-snippet" hidden className="app-style-39">
          <label htmlFor="snippet-text" id="snippet-label">发送文字</label>
          <textarea id="snippet-text" rows={7} placeholder="粘贴或输入文字" className="app-style-40" />
          <Button id="send-snippet" type="button" className="app-style-41">开始发送</Button>
        </div>
        <SendTransferDialog />
      </section>
    </div>
  );
}

export function SendPage({
  channel,
  onChannelChange,
}: {
  channel: TransferChannel;
  onChannelChange: (channel: TransferChannel) => void;
}) {
  return (
    <main data-route-page data-view="send" className={cn(VIEW_SHELL, "app-style-33")}>
      <section data-reveal className="transfer-page-heading">
        <h1 className={PAGE_HEADING}>发送</h1>
        <p className="app-style-35">选择二维码或剪贴板通道发送文件、文件夹和文字。</p>
      </section>
      <TransferChannelTabs
        channel={channel}
        onChannelChange={onChannelChange}
        qr={<QrSendPanel />}
        clipboard={<ClipboardSendPanel />}
      />
    </main>
  );
}

function SendTransferDialog() {
  const [open, setOpen] = useState(false);
  const [hasTransfer, setHasTransfer] = useState(false);
  const activeRef = useRef(false);

  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<SendProgressDetail>).detail;
      if (detail.active && !activeRef.current) setOpen(true);
      activeRef.current = detail.active;
      setHasTransfer(detail.active);
      if (!detail.active) setOpen(false);
    };
    window.addEventListener(SEND_PROGRESS_EVENT, update);
    return () => window.removeEventListener(SEND_PROGRESS_EVENT, update);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {hasTransfer ? <DialogTrigger asChild><Button type="button" variant="outline">查看二维码发送</Button></DialogTrigger> : null}
      <DialogContent
        persistent
        className="send-transfer-dialog"
      >
        <DialogHeader className="app-style-43">
          <DialogTitle className="app-style-44">二维码发送</DialogTitle>
          <DialogDescription className="app-style-45">保持二维码完整可见；关闭弹窗后发送仍会在后台继续。</DialogDescription>
        </DialogHeader>
        <div className="send-transfer-workspace">
          <div id="qr-display-area" className="app-style-46 send-transfer-canvas">
            <div className="app-style-47" id="stage" hidden>
              <div id="qr-grid" className="qr-grid" aria-label="4 QR 高吞吐传输画面">
                {Array.from({ length: QR_GRID_CELLS }, (_, index) => (
                  <canvas
                    key={index}
                    id={index === 0 ? "qr" : `qr-${index}`}
                    data-qr-symbol={index}
                    width="16"
                    height="16"
                    aria-label={`QR ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <aside className="app-style-48 send-transfer-control-rail" aria-label="发送控制">
            <SendBroadcastProgress compact />
            <TransferSpeedControl compact />
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function tuningDraftField(label: string, min: number, max: number) {
  return z.string()
    .trim()
    .min(1, `${label}不能为空`)
    .regex(/^\d+$/, `${label}必须为整数`)
    .refine((value) => {
      const number = Number(value);
      return Number.isInteger(number) && number >= min && number <= max;
    }, `${label}范围为 ${min}–${max}`);
}

const sendTuningDraftSchema = z.object({
  frameBytes: tuningDraftField(
    "每码字节",
    SEND_TUNING_LIMITS.frameBytes.min,
    SEND_TUNING_LIMITS.frameBytes.max,
  ),
  txFps: tuningDraftField(
    "刷新 FPS",
    SEND_TUNING_LIMITS.txFps.min,
    SEND_TUNING_LIMITS.txFps.max,
  ),
  symbolsPerTick: tuningDraftField(
    "每次更新码数",
    SEND_TUNING_LIMITS.symbolsPerTick.min,
    SEND_TUNING_LIMITS.symbolsPerTick.max,
  ),
});

type SendTuningDraft = z.infer<typeof sendTuningDraftSchema>;

function validateTuningDraftField(
  field: keyof SendTuningDraft,
  value: string,
): true | string {
  const parsed = sendTuningDraftSchema.shape[field].safeParse(value);
  return parsed.success ? true : parsed.error.issues[0]?.message ?? "参数无效";
}

function tuningToDraft(tuning: Readonly<SendTuning>): SendTuningDraft {
  return {
    frameBytes: String(tuning.frameBytes),
    txFps: String(tuning.txFps),
    symbolsPerTick: String(tuning.symbolsPerTick),
  };
}

function tuningFromDraft(draft: SendTuningDraft): SendTuning | null {
  const parsed = sendTuningDraftSchema.safeParse(draft);
  if (!parsed.success) return null;
  return {
    frameBytes: Number(parsed.data.frameBytes),
    txFps: Number(parsed.data.txFps),
    symbolsPerTick: Number(parsed.data.symbolsPerTick),
  };
}

function TransferSpeedControl({ compact = false }: { compact?: boolean }) {
  const [appliedTuning, setAppliedTuning] = useState<SendTuning>({ ...DEFAULT_SEND_TUNING });
  const appliedTuningRef = useRef<SendTuning>({ ...DEFAULT_SEND_TUNING });
  const [inspection, setInspection] = useState("正在检测处理器、内存、刷新率和可用画面尺寸…");
  const manuallySelected = useRef(false);
  const {
    formState: { errors },
    getValues,
    handleSubmit,
    register,
    reset,
    watch,
  } = useForm<SendTuningDraft>({
    mode: "onChange",
    defaultValues: tuningToDraft(DEFAULT_SEND_TUNING),
  });
  const draftTuning = watch();
  const parsedDraft = tuningFromDraft(draftTuning);
  const hasPendingChanges = parsedDraft === null || !isSameSendTuning(parsedDraft, appliedTuning);
  const canConfirm = parsedDraft !== null && hasPendingChanges;
  const rawKiBPerSecond = parsedDraft === null ? null : Math.round(
    parsedDraft.symbolsPerTick * parsedDraft.txFps * (parsedDraft.frameBytes - HEADER_LEN) / 1024,
  );
  const formError = errors.frameBytes?.message ?? errors.txFps?.message ?? errors.symbolsPerTick?.message;

  const confirmTuning = (draft: SendTuningDraft) => {
    const parsed = tuningFromDraft(draft);
    if (!canConfirm || parsed === null) return;
    const normalized = normalizeSendTuning(parsed);
    appliedTuningRef.current = normalized;
    reset(tuningToDraft(normalized));
    setAppliedTuning(normalized);
    window.dispatchEvent(new CustomEvent<SendTuning>(SEND_SPEED_CHANGE_EVENT, { detail: normalized }));
  };

  useEffect(() => {
    let cancelled = false;
    void inspectDeviceCapabilities().then((capabilities) => {
      if (cancelled) return;
      const recommendation = recommendSpeedProfile(capabilities);
      const recommended = SEND_SPEED_PROFILES[recommendation.profileIndex]!;
      window.dispatchEvent(new CustomEvent(SEND_CAPABILITIES_EVENT, { detail: capabilities }));
      setInspection(
        `${describeDeviceCapabilities(capabilities)}。初始建议：每码 ${recommended.frameBytes} 字节、` +
          `${recommended.txFps} FPS、每次更新 ${recommended.symbolsPerTick} 码。${recommendation.explanation}。` +
          (manuallySelected.current ? " 已保留你的手动选择。" : " 已填入建议值，确认后生效。"),
      );
      if (!manuallySelected.current) reset(tuningToDraft(normalizeSendTuning(recommended)));
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const sync = (event: Event) => {
      const normalized = normalizeSendTuning((event as CustomEvent<SendTuning>).detail);
      const previousApplied = appliedTuningRef.current;
      appliedTuningRef.current = normalized;
      setAppliedTuning(normalized);
      const currentDraft = getValues();
      const currentTuning = tuningFromDraft(currentDraft);
      if (currentTuning && isSameSendTuning(currentTuning, previousApplied)) {
        reset(tuningToDraft(normalized));
      }
    };
    window.addEventListener(SEND_SPEED_SYNC_EVENT, sync);
    return () => window.removeEventListener(SEND_SPEED_SYNC_EVENT, sync);
  }, []);

  return (
    <section
      id="cfg-speed"
      data-frame-bytes={appliedTuning.frameBytes}
      data-tx-fps={appliedTuning.txFps}
      data-symbols-per-tick={appliedTuning.symbolsPerTick}
      className={cn(
        "app-style-49",
        compact ? "app-style-50" : "app-style-51",
      )}
    >
      <div className="app-style-52">
        <div>
          <p className="app-style-53">传输速度</p>
          {!compact ? <p className="app-style-54">自动检测后给出初始数字，确认应用后生效</p> : null}
        </div>
        <output className="app-style-55">
          {hasPendingChanges ? "待确认" : "理论约"}{rawKiBPerSecond === null ? " —" : ` ${rawKiBPerSecond} KiB/s`}
        </output>
      </div>
      <form onSubmit={handleSubmit(confirmTuning)} noValidate>
        <div
          className={cn("send-tuning-fields", compact && "is-compact")}
          aria-label="数字传输参数"
        >
          <label>
            <span>每码字节</span>
            <input
              type="number"
              min={SEND_TUNING_LIMITS.frameBytes.min}
              max={SEND_TUNING_LIMITS.frameBytes.max}
              step={25}
              aria-invalid={Boolean(errors.frameBytes)}
              aria-describedby="send-tuning-form-status"
              {...register("frameBytes", {
                validate: (value) => validateTuningDraftField("frameBytes", value),
                onChange: () => { manuallySelected.current = true; },
              })}
            />
          </label>
          <label>
            <span>刷新 FPS</span>
            <input
              type="number"
              min={SEND_TUNING_LIMITS.txFps.min}
              max={SEND_TUNING_LIMITS.txFps.max}
              step={1}
              aria-invalid={Boolean(errors.txFps)}
              aria-describedby="send-tuning-form-status"
              {...register("txFps", {
                validate: (value) => validateTuningDraftField("txFps", value),
                onChange: () => { manuallySelected.current = true; },
              })}
            />
          </label>
          <label>
            <span>每次更新码数</span>
            <input
              type="number"
              min={SEND_TUNING_LIMITS.symbolsPerTick.min}
              max={SEND_TUNING_LIMITS.symbolsPerTick.max}
              step={1}
              aria-invalid={Boolean(errors.symbolsPerTick)}
              aria-describedby="send-tuning-form-status"
              {...register("symbolsPerTick", {
                validate: (value) => validateTuningDraftField("symbolsPerTick", value),
                onChange: () => { manuallySelected.current = true; },
              })}
            />
          </label>
        </div>
        <div className="send-tuning-confirm-row">
          <span id="send-tuning-form-status" aria-live="polite">
            {parsedDraft === null
              ? formError ?? "请填写有效范围内的完整参数"
              : hasPendingChanges
                ? "参数尚未生效"
                : "当前参数已生效"}
          </span>
          <Button type="submit" size="sm" disabled={!canConfirm}>
            {hasPendingChanges ? "确认应用" : "已应用"}
          </Button>
        </div>
      </form>
      {compact ? (
        <p className="app-style-61" aria-live="polite">{inspection}</p>
      ) : (
        <>
          <p className="app-style-62" aria-live="polite">{inspection}</p>
          <p className="app-style-63">
            接收端会显示推荐的具体数字；发送端按推荐值手动调整。
          </p>
        </>
      )}
    </section>
  );
}

const idleSendProgress: SendProgressDetail = {
  active: false,
  percent: 0,
  round: 1,
  emittedSymbols: 0,
  targetSymbols: 0,
};

function SendBroadcastProgress({ compact = false }: { compact?: boolean }) {
  const [progress, setProgress] = useState(idleSendProgress);

  useEffect(() => {
    const update = (event: Event) => {
      setProgress((event as CustomEvent<SendProgressDetail>).detail);
    };
    window.addEventListener(SEND_PROGRESS_EVENT, update);
    return () => window.removeEventListener(SEND_PROGRESS_EVENT, update);
  }, []);

  if (!progress.active) return null;
  const preparing = progress.emittedSymbols === 0;
  return (
    <section className={cn("app-style-49", compact ? "app-style-64" : "app-style-65")} aria-live="polite">
      <div className={cn("app-style-66", compact ? "app-style-67" : "app-style-68")}>
        <strong className="app-style-69">
          {preparing ? "正在初始化二维码" : `第 ${progress.round} 轮广播 · ${Math.floor(progress.percent)}%`}
        </strong>
        <span className="app-style-70">{progress.emittedSymbols}/{progress.targetSymbols} symbols</span>
      </div>
      <Progress value={progress.percent} aria-label="发送广播进度" />
      <p className={cn("app-style-71", compact ? "app-style-59" : "app-style-72")}>
        {preparing
          ? "正在发送设备能力并创建首批二维码，请稍候…"
          : progress.actualSymbolsPerSecond !== undefined
            ? `实际 ${progress.actualSymbolsPerSecond.toFixed(1)}/${progress.targetSymbolsPerSecond?.toFixed(0)} symbols/s` +
              ` · 输出达成 ${progress.senderUtilizationPercent?.toFixed(0)}%` +
              ` · 队列等待 ${progress.queueStarvedPercent?.toFixed(1)}%`
            : "一轮建议symbol播放比例；是否完成以接收端为准。"}
      </p>
    </section>
  );
}
