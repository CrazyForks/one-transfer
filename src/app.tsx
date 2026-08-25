import * as React from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SweepShine } from "@/components/ui/sweep-shine";
import { Slider } from "@/components/ui/slider";
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
  "relative isolate mx-auto flex min-h-[calc(100svh-52px)] w-full max-w-[720px] flex-1 flex-col items-center gap-3 overflow-hidden px-3 py-8 text-center sm:min-h-[calc(100svh-60px)] sm:gap-3.5 sm:px-6 sm:py-[clamp(42px,7vw,68px)]";
const headingClass = "text-[clamp(32px,9vw,54px)] leading-none font-bold tracking-[-0.05em]";

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
      className="app-loading-fallback pointer-events-none fixed inset-0 z-[100] grid place-items-center bg-[#f5f5f7]"
      role="status"
      aria-label="One Transfer 加载中"
    >
      <div data-loading-mark className="grid gap-3 text-center will-change-transform">
        <strong className="text-[clamp(34px,7vw,56px)] leading-none font-bold tracking-[-0.055em]">
          One Transfer
        </strong>
        <SweepShine className="text-sm font-medium text-zinc-500">用光传递数据</SweepShine>
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
      "relative z-10 min-w-17 rounded-full px-3 py-1.5 text-center text-xs font-semibold transition-colors",
      "max-sm:min-w-0 max-sm:px-2 max-sm:text-[11px]",
      isActive ? "bg-white text-zinc-950" : "text-zinc-500 hover:text-zinc-950",
    );

  return (
    <header
      hidden={route === "home"}
      className="sticky top-0 z-50 grid min-h-13 grid-cols-[36px_minmax(0,1fr)_36px] items-center justify-between border-b border-black/8 bg-[#f5f5f7]/85 px-2 py-1.5 backdrop-blur-xl sm:min-h-15 sm:grid-cols-[44px_auto_44px] sm:px-4 sm:py-2"
    >
      <Button asChild variant="ghost" size="icon" className="rounded-full" aria-label="返回首页">
        <Link to="/" onClick={(event) => handleRouteClick(event, "/", transitionTo)}><ArrowLeft /></Link>
      </Button>
      <nav className="mx-auto flex min-w-0 gap-0.5 rounded-full bg-zinc-200/75 p-1" aria-label="功能切换">
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
    <footer className="relative z-10 flex min-h-14 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-black/[0.06] px-4 py-4 text-center">
      <a
        href="https://github.com/zhihui-hu/one-transfer"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15"
      >
        <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
          <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.69-1.28-1.69-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.29-5.27-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18A10.9 10.9 0 0 1 12 6.11c.98 0 1.95.13 2.87.39 2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.41-2.71 5.39-5.29 5.68.42.36.79 1.07.79 2.16v3.25c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z" />
        </svg>
        github.com/zhihui-hu/one-transfer
      </a>
      <span className="text-xs font-medium text-zinc-400">
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
      className="relative isolate mx-auto flex min-h-svh w-full max-w-[1020px] flex-col justify-center gap-14 overflow-hidden px-5 py-16"
    >
      <section data-reveal className="relative z-10 text-center">
        <h1 className="text-[clamp(46px,7vw,72px)] leading-none font-bold tracking-[-0.055em]">One Transfer</h1>
        <p data-breathe className="mt-5 text-[clamp(17px,2vw,20px)] text-zinc-500">用光传递数据</p>
      </section>
      <section className="relative z-10 grid grid-cols-1 gap-4 min-[861px]:grid-cols-3" aria-label="选择功能">
        {transferCards.map(({ to, title, description, icon: Icon }) => (
          <Link key={to} to={to} onClick={(event) => handleRouteClick(event, to, transitionTo)} data-reveal className="group rounded-3xl outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15">
            <Card className="h-full min-h-40 transition-[transform,border-color] duration-200 group-hover:-translate-y-1 group-hover:border-blue-500/25">
              <CardContent className="grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 p-6 lg:p-7">
                <span className="grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                  <Icon className="size-6" strokeWidth={1.8} />
                </span>
                <span className="grid min-w-0 gap-1">
                  <strong className="text-2xl leading-none font-bold tracking-tight">{title}</strong>
                  <span className="text-sm text-zinc-500">{description}</span>
                </span>
                <ChevronRight className="size-5 text-blue-600 transition-transform group-hover:translate-x-0.5" />
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
        <TabsList ref={listRef} className="w-full">
          <span ref={indicatorRef} className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white" />
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
      className="relative z-10 flex min-h-44 w-full flex-col items-center justify-center gap-4 rounded-2xl border border-black/[0.07] bg-white p-6 text-center"
    >
      <strong id={descriptionId} className="text-lg font-semibold">{description}</strong>
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <label htmlFor={inputId} className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer")}>
          <Upload />选择文件
        </label>
        {directoryControl ?? (directoryInputId ? (
          <label htmlFor={directoryInputId} className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer")}>
            <FolderArchive />{directoryLabel}
          </label>
        ) : null)}
      </div>
      <input id={inputId} className="sr-only" type="file" />
      {directoryInputId ? (
        <input
          id={directoryInputId}
          className="sr-only"
          type="file"
          multiple
          {...{ webkitdirectory: "", directory: "" }}
        />
      ) : null}
      {projectDirectoryInputId ? (
        <input
          id={projectDirectoryInputId}
          className="sr-only"
          type="file"
          multiple
          {...{ webkitdirectory: "", directory: "" }}
        />
      ) : null}
      <span id={fileNameId} className="max-w-full truncate text-sm text-zinc-500">未选择文件或文件夹</span>
    </div>
  );
}

function ClipboardDirectoryMenu({
  directoryInputId,
  projectDirectoryInputId,
}: {
  directoryInputId: string;
  projectDirectoryInputId: string;
}) {
  const openPicker = (inputId: string) => {
    (document.getElementById(inputId) as HTMLInputElement | null)?.click();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline"><FolderArchive />选择文件夹<ChevronDown /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>选择文件夹类型</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openPicker(directoryInputId)}>
          <FolderOpen />
          完整文件夹
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openPicker(projectDirectoryInputId)}>
          <FolderArchive />
          前端 / Python 工程
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SendView() {
  return (
    <main data-route-page data-view="send" className={cn(viewShell, "max-w-[1200px] overflow-visible")}>
      <section data-reveal className="relative z-10 mb-4 w-full max-w-[720px] text-center">
        <h1 id="tool-title" className={headingClass}>发送文件</h1>
        <p data-breathe className="mt-3.5 text-base text-zinc-500">选择内容后，二维码会自动开始播放。</p>
      </section>
      <div data-reveal className="relative z-10 w-full max-w-[720px]"><SendModeTabs /></div>
      <div className="status-line relative z-10 min-h-5 w-full max-w-[720px] text-center font-mono text-xs text-zinc-500" id="specs">选择文件开始</div>
      <div className="w-full max-w-[720px]">
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
      <div id="pane-snippet" hidden className="relative z-10 grid w-full max-w-[720px] justify-items-center gap-2 text-sm font-semibold text-zinc-500">
        <label htmlFor="snippet-text" id="snippet-label">发送文字</label>
        <textarea id="snippet-text" rows={7} placeholder="粘贴或输入文字" className="min-h-44 w-full resize-y rounded-2xl border border-black/10 bg-white p-4 text-left text-base leading-relaxed font-normal text-zinc-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
        <Button id="send-snippet" type="button" className="mt-1 w-fit">开始发送</Button>
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
        className="top-0 left-0 h-dvh max-h-none w-dvw max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 rounded-none border-0 bg-zinc-100 p-2 sm:gap-3 sm:p-5"
      >
        <DialogHeader className="px-1">
          <DialogTitle className="text-base sm:text-lg">二维码发送</DialogTitle>
          <DialogDescription className="hidden sm:block">保持二维码完整可见；关闭弹窗后发送仍会在后台继续。</DialogDescription>
        </DialogHeader>
        <div id="qr-display-area" className="grid min-h-0 place-items-center overflow-hidden rounded-2xl bg-white p-2 sm:p-4">
          <div className="stage max-w-full overflow-hidden rounded-xl bg-white p-1" id="stage" hidden>
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
        <div className="grid max-h-[30dvh] shrink-0 gap-1 overflow-y-auto rounded-xl border border-black/[0.07] bg-white p-1.5 sm:gap-2 sm:p-2 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.55fr)]">
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

  const changeSpeed = ([nextIndex]: number[]) => {
    if (nextIndex === undefined) return;
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
        "relative z-10 w-full text-left",
        compact ? "rounded-lg bg-zinc-50 px-3 py-2.5" : "max-w-[720px] rounded-2xl border border-black/[0.07] bg-white p-5",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-zinc-950">传输速度</p>
          {!compact ? <p className="mt-1 text-xs text-zinc-500">自动选择当前电脑可承受的最高档位</p> : null}
        </div>
        <output className="shrink-0 text-right text-xs font-semibold text-blue-600">
          {profile.label} · 约 {rawKiBPerSecond} KiB/s
        </output>
      </div>
      <Slider
        className={compact ? "mt-2.5" : "mt-5"}
        value={[index]}
        min={0}
        max={SEND_SPEED_PROFILES.length - 1}
        step={1}
        aria-label="传输速度"
        onValueChange={changeSpeed}
      />
      <div className={cn("flex justify-between font-medium text-zinc-400", compact ? "mt-1 text-[10px]" : "mt-2 text-xs")}>
        <span>最低</span>
        <span>最高</span>
      </div>
      {compact ? (
        <p className="mt-1 truncate text-[10px] text-zinc-400" aria-live="polite">{inspection}</p>
      ) : (
        <>
          <p className="mt-4 text-xs leading-relaxed text-zinc-500" aria-live="polite">{inspection}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
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
    <section className={cn("relative z-10 w-full text-left", compact ? "px-3 py-2.5" : "max-w-[720px] rounded-2xl border border-black/[0.07] bg-white p-4")} aria-live="polite">
      <div className={cn("flex items-center justify-between gap-3 text-xs", compact ? "mb-1.5" : "mb-2")}>
        <strong className="text-zinc-950">第 {progress.round} 轮广播 · {Math.floor(progress.percent)}%</strong>
        <span className="text-zinc-500">{progress.emittedSymbols}/{progress.targetSymbols} symbols</span>
      </div>
      <Progress value={progress.percent} aria-label="发送广播进度" />
      <p className={cn("text-zinc-400", compact ? "mt-1 text-[10px]" : "mt-2 text-[11px]")}>一轮建议symbol播放比例；是否完成以接收端为准。</p>
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
      <section className="receiver-primary relative z-10 flex w-full flex-col items-center gap-3.5 text-center">
        <div data-reveal className="mb-2 w-full text-center">
          <h1 data-breathe className={headingClass}>接收</h1>
          <p className="mt-3.5 text-base text-zinc-500">选择扫描方式后，在全屏窗口中查看画面和接收进度。</p>
        </div>
        <div data-reveal className="capture-actions flex flex-wrap justify-center gap-2.5" id="capture-actions">
          <Button id="start" type="button" className="min-w-52" onClick={() => setCaptureOpen(true)}>扫描电脑屏幕</Button>
          <Button id="start-camera" type="button" variant="outline" onClick={() => setCaptureOpen(true)}>使用相机</Button>
        </div>
        <Dialog open={captureOpen} onOpenChange={changeCaptureOpen}>
          <DialogContent
            persistent
            className="top-0 left-0 h-dvh max-h-none w-dvw max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 rounded-none border-0 bg-zinc-950 p-2 text-white sm:gap-3 sm:p-5"
          >
            <DialogHeader className="px-1 text-white">
              <DialogTitle className="text-base text-white sm:text-lg">实时扫描</DialogTitle>
              <DialogDescription className="hidden text-zinc-400 sm:block">上方显示完整扫描画面，底部显示接收进度和解码状态。</DialogDescription>
              <div className="status-line min-h-5 font-mono text-xs text-zinc-400" id="stats">选择扫描方式开始</div>
            </DialogHeader>
            <div className="grid min-h-0 place-items-center overflow-hidden rounded-2xl bg-black">
              <div className="preview relative h-full max-h-full w-full overflow-hidden bg-black" id="preview" style={{ display: "none" }}>
                <video id="video" muted playsInline className="h-full w-full object-contain" />
              </div>
            </div>
            <div className="grid max-h-[38dvh] gap-3 overflow-y-auto rounded-2xl bg-white p-4 text-zinc-950">
              <div className="transfer-hud w-full px-0.5 pt-0.5">
                <div className="progress" id="progress" style={{ display: "none" }} role="progressbar" aria-label="接收进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}><div id="bar" /></div>
                <div className="progress-status mt-2 flex gap-3.5 font-mono text-xs text-zinc-500" id="progress-status" style={{ display: "none" }} aria-live="polite">
                  <strong id="progress-label" className="shrink-0 text-zinc-950">0% · 0帧</strong>
                  <span id="eta-label" className="min-w-0 flex-1 truncate text-right">正在估算时间</span>
                </div>
              </div>
              <div id="result" />
              <details id="diagnostics" className="w-full rounded-xl border border-black/[0.07] bg-zinc-50 p-4 text-left" style={{ display: "none" }}>
                <summary className="cursor-pointer text-center text-sm font-semibold text-zinc-600">解码性能与诊断</summary>
                <div id="metrics" className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <span>捕获 FPS <strong id="m-cap">—</strong></span><span>有效码 FPS <strong id="m-dec">—</strong></span><span>净带宽 <strong id="m-rate">—</strong></span><span>耗时 <strong id="m-time">—</strong></span>
                  <span>新帧/重复 <strong id="m-frames">—</strong></span><span>数据块 K <strong id="m-k">—</strong></span><span>块大小 <strong id="m-block">—</strong></span><span>负载 <strong id="m-payload">—</strong></span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-xs font-medium text-zinc-500">解码宽度<select id="cfg-width" defaultValue="1280" className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900"><option>960</option><option>1280</option><option>1920</option></select></label>
                  <label className="grid gap-1 text-xs font-medium text-zinc-500">捕获 FPS<select id="cfg-capfps" defaultValue="60" className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900"><option>30</option><option>60</option></select></label>
                  <label className="grid gap-1 text-xs font-medium text-zinc-500">Worker数<select id="cfg-workers" defaultValue="2" className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900"><option>1</option><option>2</option><option>3</option><option>4</option></select></label>
                </div>
                <span id="capture-actual" className="mt-3 block text-xs text-zinc-500" />
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
    <Card id="restore-script-panel" data-reveal className="relative z-10 w-full scroll-mt-20">
      <CardContent className="grid justify-items-center gap-4 p-6 text-center">
        <div className="grid justify-items-center gap-1">
          <span className="text-[11px] font-bold tracking-wider text-blue-600">WINDOWS 接收端 · 首次使用</span>
          <strong>One Transfer 通用还原脚本</strong>
          <span className="text-sm text-zinc-500">下载脚本，或复制下方源码并保存为 one-transfer-restore.bat；兼容 V1/V2。</span>
        </div>
        <textarea
          ref={textareaRef}
          value={script}
          readOnly
          rows={12}
          spellCheck={false}
          aria-label="one-transfer-restore.bat 脚本源码"
          onFocus={(event) => event.currentTarget.select()}
          className="w-full resize-y rounded-xl border border-black/10 bg-zinc-50 p-4 text-left font-mono text-xs leading-relaxed text-zinc-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          placeholder="正在加载 one-transfer-restore.bat…"
        />
        {error ? <span className="text-sm font-medium text-red-600">{error}</span> : null}
        <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
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
      <section data-reveal className="relative z-10 mb-4 w-full text-center">
        <h1 className={headingClass}>通过文本剪贴板传文件或文件夹</h1>
        <p data-breathe className="mt-3.5 text-base text-zinc-500">文件夹会包含全部文件和层级，自动打包后复制到 Windows 还原。</p>
      </section>
      <div className="status-line relative z-10 min-h-5 w-full text-center font-mono text-xs text-zinc-500" id="clipboard-status" aria-live="polite">请选择要传递的文件或文件夹</div>
      <FileSelectPanel
        inputId="clipboard-file"
        directoryInputId="clipboard-directory"
        projectDirectoryInputId="clipboard-project-directory"
        description="发送端 · 选择文件、文件夹或工程"
        directoryControl={(
          <ClipboardDirectoryMenu
            directoryInputId="clipboard-directory"
            projectDirectoryInputId="clipboard-project-directory"
          />
        )}
        fileNameId="clipboard-file-name"
      />
      <div data-reveal className="relative z-10 flex w-full flex-col items-center gap-3.5 text-center">
        <Button id="copy-transfer" type="button" disabled>复制数据到剪贴板</Button>
        <span className="text-sm text-zinc-500">选择后自动复制；完整文件夹保留全部内容，工程会自动排除依赖和构建产物。</span>
      </div>
      <section
        id="clipboard-next-step"
        hidden
        aria-live="polite"
        className="relative z-10 w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-left"
      >
        <strong className="text-base text-emerald-900">复制成功，下一步到 Windows 恢复</strong>
        <ol className="mt-3 grid gap-2 text-sm leading-relaxed text-emerald-950/80">
          <li><b>1.</b> 切换到 Windows，等待远程剪贴板同步完成。</li>
          <li><b>2.</b> 将下方的 <code>one-transfer-restore.bat</code> 放到希望保存文件的目录。</li>
          <li><b>3.</b> 双击运行脚本；脚本会读取剪贴板、校验数据并恢复文件，文件夹会自动解压。</li>
        </ol>
        <a href="#restore-script-panel" className="mt-4 inline-flex text-sm font-semibold text-emerald-800 underline underline-offset-4">
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
    <div className="fixed inset-x-4 top-4 z-[90] mx-auto max-w-xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
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
      <div ref={contentRef} className="app-content min-h-svh">
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
