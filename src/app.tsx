import * as React from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  ClipboardPaste,
  Download,
  FolderArchive,
  FolderOpen,
  ScanLine,
  Upload,
} from "lucide-react";
import { gsap } from "gsap";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
} from "react-router-dom";

import { Button, buttonVariants } from "@/components/ui/button";
import { AppUpdateChecker } from "@/components/app-update-checker";
import { BuildInfo } from "@/components/build-info";
import { SourceArchiveProgressDialog } from "@/components/source-archive-progress-dialog";
import { Card, CardContent } from "@/components/ui/card";
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
import { SweepShine } from "@/components/ui/sweep-shine";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SPEED_PROFILE_INDEX,
  QR_GRID_CELLS,
  QR_SYMBOLS_PER_TICK,
  SEND_SPEED_CHANGE_EVENT,
  SEND_SPEED_SYNC_EVENT,
  SEND_SPEED_PROFILES,
} from "../shared/send-settings";
import { HEADER_LEN } from "../shared/protocol";
import {
  describeDeviceCapabilities,
  recommendSpeedProfile,
  recommendedProfileLabel,
} from "../shared/device-profile";
import { SEND_PROGRESS_EVENT, type SendProgressDetail } from "../shared/send-events";
import { RECEIVE_CAPTURE_CLOSE_EVENT } from "../shared/receive-events";
import { inspectDeviceCapabilities } from "@/lib/device-capabilities";

type RouteKey = "home" | "send" | "receive" | "clipboard";

const routeTitles: Record<RouteKey, string> = {
  home: "One Transfer",
  send: "发送 · One Transfer",
  receive: "接收 · One Transfer",
  clipboard: "文本剪贴板传文件 · One Transfer",
};

const viewShell =
  "view-shell";
const headingClass = "page-heading";

function routeFromPath(pathname: string): RouteKey {
  if (pathname === "/send") return "send";
  if (pathname === "/receive") return "receive";
  if (pathname === "/clipboard") return "clipboard";
  return "home";
}

function LoadingScreen({ overlayRef }: { overlayRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={overlayRef}
      className="app-style-01"
      role="status"
      aria-label="One Transfer 加载中"
    >
      <div data-loading-mark className="app-style-02">
        <strong className="app-style-03">
          One Transfer
        </strong>
        <SweepShine className="app-style-04">用光传递数据</SweepShine>
      </div>
    </div>
  );
}

function handleRouteClick(
  event: React.MouseEvent<HTMLAnchorElement>,
  to: string,
  transitionTo: (to: string) => void,
) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  transitionTo(to);
}

function Header({ route, transitionTo }: { route: RouteKey; transitionTo: (to: string) => void }) {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "app-style-110",
      "app-style-111",
      isActive ? "app-style-112" : "app-style-113",
    );

  return (
    <header
      hidden={route === "home"}
      className="app-style-05"
    >
      <Button asChild variant="ghost" size="icon" className="app-style-06" aria-label="返回首页">
        <Link to="/" onClick={(event) => handleRouteClick(event, "/", transitionTo)}><ArrowLeft /></Link>
      </Button>
      <nav className="app-style-07" aria-label="功能切换">
        <NavLink to="/send" className={navClass} onClick={(event) => handleRouteClick(event, "/send", transitionTo)}>发送</NavLink>
        <NavLink to="/receive" className={navClass} onClick={(event) => handleRouteClick(event, "/receive", transitionTo)}>接收</NavLink>
        <NavLink to="/clipboard" className={navClass} onClick={(event) => handleRouteClick(event, "/clipboard", transitionTo)}>剪贴板</NavLink>
      </nav>
      <span aria-hidden="true" />
    </header>
  );
}

function Footer() {
  return (
    <footer className="app-style-08">
      <a
        href="https://github.com/zhihui-hu/one-transfer"
        target="_blank"
        rel="noreferrer"
        className="app-style-09"
      >
        <svg viewBox="0 0 24 24" className="app-style-10" aria-hidden="true">
          <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.69-1.28-1.69-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.29-5.27-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18A10.9 10.9 0 0 1 12 6.11c.98 0 1.95.13 2.87.39 2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.41-2.71 5.39-5.29 5.68.42.36.79 1.07.79 2.16v3.25c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z" />
        </svg>
        github.com/zhihui-hu/one-transfer
      </a>
      <span className="app-style-11">
        v{__APP_VERSION__} · {__APP_COMMIT__ === "development" ? "dev" : __APP_COMMIT__.slice(0, 7)}
      </span>
    </footer>
  );
}

const transferCards = [
  { to: "/send", title: "发送", description: "播放文件或文字二维码", icon: Upload },
  { to: "/receive", title: "接收", description: "扫描屏幕或使用相机", icon: ScanLine },
  { to: "/clipboard", title: "剪贴板", description: "用文本剪贴板传递文件数据", icon: ClipboardPaste },
] as const;

function HomeView({ transitionTo }: { transitionTo: (to: string) => void }) {
  return (
    <main
      data-route-page
      data-view="home"
      className="app-style-12"
    >
      <section data-reveal className="app-style-13">
        <h1 className="app-style-14">One Transfer</h1>
        <p data-breathe className="app-style-15">用光传递数据</p>
      </section>
      <section className="app-style-16" aria-label="选择功能">
        {transferCards.map(({ to, title, description, icon: Icon }) => (
          <Link key={to} to={to} onClick={(event) => handleRouteClick(event, to, transitionTo)} data-reveal className="app-style-17">
            <Card className="app-style-18">
              <CardContent className="app-style-19">
                <span className="app-style-20">
                  <Icon className="app-style-21" strokeWidth={1.8} />
                </span>
                <span className="app-style-22">
                  <strong className="app-style-23">{title}</strong>
                  <span className="dialog-style-11">{description}</span>
                </span>
                <ChevronRight className="app-style-24" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>
    </main>
  );
}

function SendModeTabs() {
  const [value, setValue] = useState("file");
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    const trigger = list?.querySelector<HTMLElement>(`[data-tab-value="${value}"]`);
    if (!list || !indicator || !trigger) return;
    gsap.to(indicator, {
      x: trigger.offsetLeft - 4,
      width: trigger.offsetWidth,
      duration: 0.14,
      ease: "power3.out",
      overwrite: "auto",
    });
  }, [value]);

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
      <Tabs value={value} onValueChange={changeMode}>
        <TabsList ref={listRef} className="app-style-25">
          <span ref={indicatorRef} className="app-style-26" />
          <TabsTrigger value="file" data-tab-value="file">文件</TabsTrigger>
          <TabsTrigger value="snippet" data-tab-value="snippet">文字</TabsTrigger>
        </TabsList>
      </Tabs>
      <input hidden type="radio" name="send-mode" value="file" defaultChecked />
      <input hidden type="radio" name="send-mode" value="snippet" />
    </>
  );
}

function FileSelectPanel({
  panelId,
  inputId,
  directoryInputId,
  projectDirectoryInputId,
  descriptionId,
  description,
  directoryControl,
  directoryLabel = "选择文件夹",
  fileNameId,
}: {
  panelId?: string;
  inputId: string;
  directoryInputId?: string;
  projectDirectoryInputId?: string;
  descriptionId?: string;
  description: string;
  directoryControl?: React.ReactNode;
  directoryLabel?: string;
  fileNameId: string;
}) {
  return (
    <div
      data-reveal
      id={panelId}
      className="app-style-27"
    >
      <strong id={descriptionId} className="app-style-28">{description}</strong>
      <div className="app-style-29">
        <label htmlFor={inputId} className={cn(buttonVariants({ variant: "outline" }), "app-style-31")}>
          <Upload />选择文件
        </label>
        {directoryControl ?? (directoryInputId ? (
          <label htmlFor={directoryInputId} className={cn(buttonVariants({ variant: "outline" }), "app-style-31")}>
            <FolderArchive />{directoryLabel}
          </label>
        ) : null)}
      </div>
      <input id={inputId} className="dialog-style-07" type="file" />
      {directoryInputId ? (
        <input
          id={directoryInputId}
          className="dialog-style-07"
          type="file"
          multiple
          {...{ webkitdirectory: "", directory: "" }}
        />
      ) : null}
      {projectDirectoryInputId ? (
        <input
          id={projectDirectoryInputId}
          className="dialog-style-07"
          type="file"
          multiple
          {...{ webkitdirectory: "", directory: "" }}
        />
      ) : null}
      <span id={fileNameId} className="app-style-32">未选择文件或文件夹</span>
    </div>
  );
}

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

function SendView() {
  return (
    <main data-route-page data-view="send" className={cn(viewShell, "app-style-33")}>
      <section data-reveal className="app-style-34">
        <h1 id="tool-title" className={headingClass}>发送文件</h1>
        <p data-breathe className="app-style-35">选择内容后，二维码会自动开始播放。</p>
      </section>
      <div data-reveal className="app-style-36"><SendModeTabs /></div>
      <div className="app-style-37" id="specs">选择文件开始</div>
      <div className="app-style-38">
        <FileSelectPanel
          panelId="pane-file"
          inputId="cfg-file"
          directoryInputId="cfg-source-directory"
          descriptionId="file-picker-label"
          description="选择文件或前端/Python工程"
          directoryControl={<SourceArchiveProgressDialog directoryInputId="cfg-source-directory" />}
          fileNameId="send-file-name"
        />
      </div>
      <div id="pane-snippet" hidden className="app-style-39">
        <label htmlFor="snippet-text" id="snippet-label">发送文字</label>
        <textarea id="snippet-text" rows={7} placeholder="粘贴或输入文字" className="app-style-40" />
        <Button id="send-snippet" type="button" className="app-style-41">开始发送</Button>
      </div>
      <SendTransferDialog />
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
        <div id="qr-display-area" className="app-style-46">
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
        <div className="app-style-48">
          <SendBroadcastProgress compact />
          <TransferSpeedControl compact />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TransferSpeedControl({ compact = false }: { compact?: boolean }) {
  const [index, setIndex] = useState(DEFAULT_SPEED_PROFILE_INDEX);
  const [inspection, setInspection] = useState("正在检测处理器、内存、刷新率和可用画面尺寸…");
  const manuallySelected = useRef(false);
  const profile = SEND_SPEED_PROFILES[index]!;
  const rawKiBPerSecond = Math.round(
    QR_SYMBOLS_PER_TICK * profile.txFps * (profile.frameBytes - HEADER_LEN) / 1024,
  );

  const applySpeed = (nextIndex: number) => {
    setIndex(nextIndex);
    window.dispatchEvent(new CustomEvent<number>(SEND_SPEED_CHANGE_EVENT, { detail: nextIndex }));
  };

  const selectSpeed = (nextIndex: number) => {
    manuallySelected.current = true;
    applySpeed(nextIndex);
  };

  useEffect(() => {
    let cancelled = false;
    void inspectDeviceCapabilities().then((capabilities) => {
      if (cancelled) return;
      const recommendation = recommendSpeedProfile(capabilities);
      const label = recommendedProfileLabel(recommendation);
      setInspection(
        `${describeDeviceCapabilities(capabilities)}。推荐“${label}”：${recommendation.explanation}。` +
          (manuallySelected.current ? " 已保留你的手动选择。" : " 已自动应用。"),
      );
      if (!manuallySelected.current) applySpeed(recommendation.profileIndex);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const sync = (event: Event) => setIndex((event as CustomEvent<number>).detail);
    window.addEventListener(SEND_SPEED_SYNC_EVENT, sync);
    return () => window.removeEventListener(SEND_SPEED_SYNC_EVENT, sync);
  }, []);

  return (
    <section
      id="cfg-speed"
      data-speed-index={index}
      className={cn(
        "app-style-49",
        compact ? "app-style-50" : "app-style-51",
      )}
    >
      <div className="app-style-52">
        <div>
          <p className="app-style-53">传输速度</p>
          {!compact ? <p className="app-style-54">自动选择当前电脑可承受的最高档位</p> : null}
        </div>
        <output className="app-style-55">
          {profile.label} · 约 {rawKiBPerSecond} KiB/s
        </output>
      </div>
      <div
        className={cn("speed-profile-buttons", compact && "is-compact")}
        role="group"
        aria-label="传输速度"
      >
        {SEND_SPEED_PROFILES.map((option, optionIndex) => {
          const speed = Math.round(
            QR_SYMBOLS_PER_TICK * option.txFps * (option.frameBytes - HEADER_LEN) / 1024,
          );
          return (
            <button
              key={option.label}
              type="button"
              className={cn("speed-profile-button", optionIndex === index && "is-active")}
              aria-pressed={optionIndex === index}
              onClick={() => selectSpeed(optionIndex)}
            >
              <strong>{option.label}</strong>
              <span>约 {speed} KiB/s</span>
            </button>
          );
        })}
      </div>
      {compact ? (
        <p className="app-style-61" aria-live="polite">{inspection}</p>
      ) : (
        <>
          <p className="app-style-62" aria-live="polite">{inspection}</p>
          <p className="app-style-63">
            检测仅覆盖发送电脑；相机、远程桌面压缩和接收端性能不可见，识别不稳时请手动降档。
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
  return (
    <section className={cn("app-style-49", compact ? "app-style-64" : "app-style-65")} aria-live="polite">
      <div className={cn("app-style-66", compact ? "app-style-67" : "app-style-68")}>
        <strong className="app-style-69">第 {progress.round} 轮广播 · {Math.floor(progress.percent)}%</strong>
        <span className="app-style-70">{progress.emittedSymbols}/{progress.targetSymbols} symbols</span>
      </div>
      <Progress value={progress.percent} aria-label="发送广播进度" />
      <p className={cn("app-style-71", compact ? "app-style-59" : "app-style-72")}>一轮建议symbol播放比例；是否完成以接收端为准。</p>
    </section>
  );
}

function ReceiveView() {
  const [captureOpen, setCaptureOpen] = useState(false);

  const changeCaptureOpen = (next: boolean) => {
    setCaptureOpen(next);
    if (!next) window.dispatchEvent(new Event(RECEIVE_CAPTURE_CLOSE_EVENT));
  };

  return (
    <main data-route-page data-view="receive" className={viewShell}>
      <section className="receiver-primary">
        <div data-reveal className="app-style-73">
          <h1 data-breathe className={headingClass}>接收</h1>
          <p className="app-style-35">选择扫描方式后，在全屏窗口中查看画面和接收进度。</p>
        </div>
        <div data-reveal className="app-style-74" id="capture-actions">
          <Button id="start" type="button" className="app-style-75" onClick={() => setCaptureOpen(true)}>扫描电脑屏幕</Button>
          <Button id="start-camera" type="button" variant="outline" onClick={() => setCaptureOpen(true)}>使用相机</Button>
        </div>
        <Dialog open={captureOpen} onOpenChange={changeCaptureOpen}>
          <DialogContent
            persistent
            className="receive-capture-dialog"
          >
            <DialogHeader className="app-style-77">
              <DialogTitle className="app-style-78">实时扫描</DialogTitle>
              <DialogDescription className="app-style-79">上方显示完整扫描画面，底部显示接收进度和解码状态。</DialogDescription>
              <div className="app-style-80" id="stats">选择扫描方式开始</div>
            </DialogHeader>
            <div className="app-style-81">
              <div className="app-style-82" id="preview" style={{ display: "none" }}>
                <video id="video" muted playsInline className="app-style-83" />
              </div>
            </div>
            <div className="app-style-84">
              <div className="transfer-hud">
                <div className="progress" id="progress" style={{ display: "none" }} role="progressbar" aria-label="接收进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}><div id="bar" /></div>
                <div className="progress-status" id="progress-status" style={{ display: "none" }} aria-live="polite">
                  <strong id="progress-label" className="app-style-85">0% · 0帧</strong>
                  <span id="eta-label" className="app-style-86">正在估算时间</span>
                </div>
              </div>
              <div id="result" />
              <details id="diagnostics" className="app-style-87" style={{ display: "none" }}>
                <summary className="app-style-88">解码性能与诊断</summary>
                <div id="metrics" className="app-style-89">
                  <span>捕获 FPS <strong id="m-cap">—</strong></span><span>有效码 FPS <strong id="m-dec">—</strong></span><span>净带宽 <strong id="m-rate">—</strong></span><span>耗时 <strong id="m-time">—</strong></span>
                  <span>新帧/重复 <strong id="m-frames">—</strong></span><span>数据块 K <strong id="m-k">—</strong></span><span>块大小 <strong id="m-block">—</strong></span><span>负载 <strong id="m-payload">—</strong></span>
                </div>
                <div className="app-style-90">
                  <label className="app-style-91">解码宽度<select id="cfg-width" defaultValue="1280" className="app-style-92"><option>960</option><option>1280</option><option>1920</option></select></label>
                  <label className="app-style-91">捕获 FPS<select id="cfg-capfps" defaultValue="60" className="app-style-92"><option>30</option><option>60</option></select></label>
                  <label className="app-style-91">Worker数<select id="cfg-workers" defaultValue="2" className="app-style-92"><option>1</option><option>2</option><option>3</option><option>4</option></select></label>
                </div>
                <span id="capture-actual" className="app-style-93" />
              </details>
              <DialogFooter><DialogClose asChild><Button type="button" variant="outline">停止扫描并关闭</Button></DialogClose></DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </section>
    </main>
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

function ClipboardView() {
  return (
    <main data-route-page data-view="clipboard" className={viewShell}>
      <section data-reveal className="app-style-101">
        <h1 className={headingClass}>通过文本剪贴板传文件或文件夹</h1>
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

type RouteOutletContext = { transitionTo: (to: string) => void };

function ControllerError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="app-style-108">
      {message}
    </div>
  );
}

function useMountedController(loader: () => Promise<() => () => void>) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    loader()
      .then((mount) => {
        if (!disposed) cleanup = mount();
      })
      .catch((reason) => {
        console.error("Transfer controller failed to mount", reason);
        if (!disposed) setError("页面控制器加载失败，请刷新后重试。");
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [loader]);
  return error;
}

const loadSendController = () => import("../send/main").then((module) => module.mountSend);
const loadReceiveController = () => import("../receive/main").then((module) => module.mountReceive);
const loadClipboardController = () => import("../clipboard/main").then((module) => module.mountClipboard);

function HomeRoute() {
  const { transitionTo } = useOutletContext<RouteOutletContext>();
  return <HomeView transitionTo={transitionTo} />;
}

function SendRoute() {
  const error = useMountedController(loadSendController);
  return <><ControllerError message={error} /><SendView /></>;
}

function ReceiveRoute() {
  const error = useMountedController(loadReceiveController);
  return <><ControllerError message={error} /><ReceiveView /></>;
}

function ClipboardRoute() {
  const error = useMountedController(loadClipboardController);
  return <><ControllerError message={error} /><ClipboardView /></>;
}

function TransferLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = routeFromPath(location.pathname);
  const [loaderVisible, setLoaderVisible] = useState(true);
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hasEnteredRouteRef = useRef(false);

  const transitionTo = useCallback(
    (to: string) => {
      if (location.pathname === to) return;
      navigate(to);
    },
    [location.pathname, navigate],
  );

  useEffect(() => {
    document.title = routeTitles[route];
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [route]);

  useLayoutEffect(() => {
    if (!loaderVisible || !overlayRef.current) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const tween = gsap.fromTo(
        overlayRef.current!.querySelector("[data-loading-mark]"),
        { scale: 0.985, autoAlpha: 0.72 },
        { scale: 1.025, autoAlpha: 1, duration: 1.15, ease: "sine.inOut", repeat: -1, yoyo: true },
      );
      return () => tween.kill();
    });
    return () => mm.revert();
  }, [loaderVisible]);

  useLayoutEffect(() => {
    if (!overlayRef.current || !contentRef.current) return;
    const overlay = overlayRef.current;
    const fallback = window.setTimeout(() => setLoaderVisible(false), 1200);
    const timeline = gsap.timeline({
      onComplete: () => {
        window.clearTimeout(fallback);
        setLoaderVisible(false);
      },
    });
    timeline.to(overlay, {
      autoAlpha: 0,
      scale: 1.015,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 0.45,
      delay: 0.55,
      ease: "power2.inOut",
    });
    return () => {
      window.clearTimeout(fallback);
      timeline.kill();
    };
  }, []);

  useLayoutEffect(() => {
    const page = contentRef.current?.querySelector<HTMLElement>("[data-route-page]");
    if (!page) return;
    const isInitialEntry = !hasEnteredRouteRef.current;
    hasEnteredRouteRef.current = true;
    const context = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const entrance = gsap.timeline({ defaults: { ease: "power3.out" } });
        if (isInitialEntry) {
          entrance
            .fromTo(page, { autoAlpha: 0.7, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.3 })
            .fromTo(
              page.querySelectorAll("[data-reveal]"),
              { autoAlpha: 0.75, y: 10 },
              { autoAlpha: 1, y: 0, duration: 0.32, stagger: 0.035 },
              "-=0.2",
            );
        } else {
          entrance
            .fromTo(page, { y: 3 }, { y: 0, duration: 0.14, clearProps: "transform" })
            .fromTo(
              page.querySelectorAll("[data-reveal]"),
              { y: 3 },
              { y: 0, duration: 0.15, stagger: 0.012, clearProps: "transform" },
              "<",
            );
        }
        const breathing = gsap.to(page.querySelectorAll("[data-breathe]"), {
          scale: 1.012,
          autoAlpha: 0.9,
          duration: 2.4,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        });
        return () => { entrance.kill(); breathing.kill(); };
      });
      return () => mm.revert();
    }, page);
    return () => context.revert();
  }, [location.pathname]);

  return (
    <>
      {loaderVisible ? <LoadingScreen overlayRef={overlayRef} /> : null}
      <div ref={contentRef} className="app-style-109">
        <Header route={route} transitionTo={transitionTo} />
        <Outlet context={{ transitionTo } satisfies RouteOutletContext} />
        <Footer />
      </div>
      <BuildInfo />
      <AppUpdateChecker />
    </>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<TransferLayout />}>
        <Route index element={<HomeRoute />} />
        <Route path="send" element={<SendRoute />} />
        <Route path="receive" element={<ReceiveRoute />} />
        <Route path="clipboard" element={<ClipboardRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
