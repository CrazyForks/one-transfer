import * as React from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  ClipboardPaste,
  Download,
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
import { Card, CardContent } from "@/components/ui/card";
import { SweepShine } from "@/components/ui/sweep-shine";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type RouteKey = "home" | "send" | "receive" | "clipboard";

const routeTitles: Record<RouteKey, string> = {
  home: "One Transfer",
  send: "发送 · One Transfer",
  receive: "接收 · One Transfer",
  clipboard: "文本剪贴板传文件 · One Transfer",
};

const viewShell =
  "relative isolate mx-auto flex min-h-[calc(100svh-60px)] w-full max-w-[720px] flex-1 flex-col items-center gap-3.5 overflow-hidden px-4 py-[clamp(42px,7vw,68px)] text-center sm:px-6";
const headingClass = "text-[clamp(40px,8vw,54px)] leading-none font-bold tracking-[-0.05em]";

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
      isActive ? "bg-white text-zinc-950" : "text-zinc-500 hover:text-zinc-950",
    );

  return (
    <header
      hidden={route === "home"}
      className="sticky top-0 z-50 grid min-h-15 grid-cols-[44px_auto_44px] items-center justify-between border-b border-black/8 bg-[#f5f5f7]/85 px-4 py-2 backdrop-blur-xl"
    >
      <Button asChild variant="ghost" size="icon" className="rounded-full" aria-label="返回首页">
        <Link to="/" onClick={(event) => handleRouteClick(event, "/", transitionTo)}><ArrowLeft /></Link>
      </Button>
      <nav className="flex gap-0.5 rounded-full bg-zinc-200/75 p-1" aria-label="功能切换">
        <NavLink to="/send" className={navClass} onClick={(event) => handleRouteClick(event, "/send", transitionTo)}>发送</NavLink>
        <NavLink to="/receive" className={navClass} onClick={(event) => handleRouteClick(event, "/receive", transitionTo)}>接收</NavLink>
        <NavLink to="/clipboard" className={navClass} onClick={(event) => handleRouteClick(event, "/clipboard", transitionTo)}>剪贴板</NavLink>
      </nav>
      <span aria-hidden="true" />
    </header>
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
      duration: 0.38,
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
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: 0.38, ease: "power3.out", clearProps: "opacity,visibility,transform" },
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
  descriptionId,
  description,
  fileNameId,
}: {
  panelId?: string;
  inputId: string;
  descriptionId?: string;
  description: string;
  fileNameId: string;
}) {
  return (
    <div
      data-reveal
      id={panelId}
      className="relative z-10 flex min-h-44 w-full flex-col items-center justify-center gap-4 rounded-2xl border border-black/[0.07] bg-white p-6 text-center"
    >
      <strong id={descriptionId} className="text-lg font-semibold">{description}</strong>
      <label htmlFor={inputId} className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer")}> 
        <Upload />选择文件
      </label>
      <input id={inputId} className="sr-only" type="file" />
      <span id={fileNameId} className="max-w-full truncate text-sm text-zinc-500">未选择文件</span>
    </div>
  );
}

function SendView() {
  return (
    <main data-route-page data-view="send" className={viewShell}>
      <section data-reveal className="relative z-10 mb-4 w-full text-center">
        <h1 id="tool-title" className={headingClass}>发送文件</h1>
        <p className="mt-3.5 text-base text-zinc-500">选择内容后，二维码会自动开始播放。</p>
      </section>
      <div data-reveal className="relative z-10 w-full"><SendModeTabs /></div>
      <div className="status-line relative z-10 min-h-5 w-full text-center font-mono text-xs text-zinc-500" id="specs">选择文件开始</div>
      <FileSelectPanel
        panelId="pane-file"
        inputId="cfg-file"
        descriptionId="file-picker-label"
        description="选择文件"
        fileNameId="send-file-name"
      />
      <div id="pane-snippet" hidden className="relative z-10 grid w-full justify-items-center gap-2 text-sm font-semibold text-zinc-500">
        <label htmlFor="snippet-text" id="snippet-label">发送文字</label>
        <textarea id="snippet-text" rows={7} placeholder="粘贴或输入文字" className="min-h-44 w-full resize-y rounded-2xl border border-black/10 bg-white p-4 text-left text-base leading-relaxed font-normal text-zinc-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
        <Button id="send-snippet" type="button" className="mt-1 w-fit">开始发送</Button>
      </div>
      <div className="stage relative z-10 max-w-full self-center overflow-hidden rounded-2xl bg-white p-4" id="stage" hidden>
        <canvas id="qr" width="16" height="16" />
      </div>
      <div className="internal-config" hidden aria-hidden="true">
        <select id="cfg-fps" />
        <select id="cfg-bytes" />
        <select id="cfg-ecc" defaultValue="L"><option>L</option><option>M</option><option>Q</option><option>H</option></select>
        <input id="cfg-size" type="range" min="300" max="1200" step="50" defaultValue="900" />
      </div>
    </main>
  );
}

function ReceiveView() {
  return (
    <main data-route-page data-view="receive" className={viewShell}>
      <section className="receiver-primary relative z-10 flex w-full flex-col items-center gap-3.5 text-center">
        <div data-reveal className="mb-2 w-full text-center">
          <h1 className={headingClass}>接收</h1>
          <div className="status-line mt-3.5 min-h-5 text-center font-mono text-xs text-zinc-500" id="stats">选择扫描方式开始</div>
        </div>
        <div data-reveal className="capture-actions flex flex-wrap justify-center gap-2.5" id="capture-actions">
          <Button id="start" type="button" className="min-w-52">扫描电脑屏幕</Button>
          <Button id="start-camera" type="button" variant="outline">使用相机</Button>
        </div>
        <div className="preview relative aspect-video max-h-[calc(100dvh-145px)] w-full overflow-hidden rounded-2xl bg-zinc-950" id="preview" style={{ display: "none" }}>
          <video id="video" muted playsInline />
        </div>
        <div className="transfer-hud w-full px-0.5 pt-0.5">
          <div className="progress" id="progress" style={{ display: "none" }} role="progressbar" aria-label="接收进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}><div id="bar" /></div>
          <div className="progress-status mt-2 flex gap-3.5 font-mono text-xs text-zinc-500" id="progress-status" style={{ display: "none" }} aria-live="polite">
            <strong id="progress-label" className="shrink-0 text-zinc-950">0% · 0 帧</strong>
            <span id="eta-label" className="min-w-0 flex-1 truncate text-right">正在估算时间</span>
          </div>
        </div>
        <div id="result" />
        <div className="internal-config" hidden aria-hidden="true">
          <div id="metrics"><span id="m-cap">—</span><span id="m-dec">—</span><span id="m-rate">—</span><span id="m-time">—</span><span id="m-frames">—</span><span id="m-k">—</span><span id="m-block">—</span><span id="m-payload">—</span></div>
          <select id="cfg-width" defaultValue="1280"><option>960</option><option>1280</option><option>1920</option></select>
          <select id="cfg-capfps" defaultValue="60"><option>30</option><option>60</option></select>
          <select id="cfg-workers" defaultValue="2"><option>1</option><option>2</option><option>3</option></select>
          <span id="capture-actual" />
        </div>
      </section>
    </main>
  );
}

function ClipboardView() {
  return (
    <main data-route-page data-view="clipboard" className={viewShell}>
      <section data-reveal className="relative z-10 mb-4 w-full text-center">
        <h1 className={headingClass}>通过文本剪贴板传文件</h1>
        <p className="mt-3.5 text-base text-zinc-500">把文件编码为 Base64 文本复制，再在 Windows 接收端还原。</p>
      </section>
      <Card data-reveal className="relative z-10 w-full">
        <CardContent className="flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="grid justify-items-center gap-1">
            <span className="text-[11px] font-bold tracking-wider text-blue-600">WINDOWS 接收端 · 首次使用</span>
            <strong id="restore-title">下载 Windows 还原脚本</strong>
            <span className="text-sm text-zinc-500">在接收端打开本页，把脚本下载到文件接收目录，只需准备一次。</span>
          </div>
          <Button asChild className="shrink-0">
            <a href="./restore-base64.bat" download="restore-base64.bat"><Download />下载还原脚本</a>
          </Button>
        </CardContent>
      </Card>
      <div className="status-line relative z-10 min-h-5 w-full text-center font-mono text-xs text-zinc-500" id="clipboard-status" aria-live="polite">请在发送端选择要传递的文件</div>
      <FileSelectPanel
        inputId="clipboard-file"
        description="发送端 · 选择文件"
        fileNameId="clipboard-file-name"
      />
      <div data-reveal className="relative z-10 flex w-full flex-col items-center gap-3.5 text-center">
        <Button id="copy-transfer" type="button" disabled>复制到剪贴板</Button>
        <span className="text-sm text-zinc-500">只复制 Base64 文本，不会上传文件；文本大小约为原文件的 1.33 倍。</span>
      </div>
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
  const routeTweenRef = useRef<gsap.core.Tween | null>(null);

  const transitionTo = useCallback(
    (to: string) => {
      if (location.pathname === to) return;
      routeTweenRef.current?.kill();
      const currentPage = contentRef.current?.querySelector<HTMLElement>("[data-route-page]");
      if (!currentPage || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        navigate(to);
        return;
      }
      routeTweenRef.current = gsap.to(currentPage, {
        autoAlpha: 0,
        y: -10,
        duration: 0.22,
        ease: "power2.in",
        overwrite: "auto",
        onComplete: () => {
          routeTweenRef.current = null;
          navigate(to);
        },
      });
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
    const context = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const entrance = gsap.timeline({ defaults: { ease: "power3.out" } });
        entrance
          .fromTo(page, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.46 })
          .fromTo(
            page.querySelectorAll("[data-reveal]"),
            { autoAlpha: 0, y: 16 },
            { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.06 },
            "-=0.28",
          );
        const breathing = gsap.to(page.querySelectorAll("[data-breathe]"), {
          scale: 1.02,
          autoAlpha: 0.82,
          duration: 2.8,
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

  useEffect(
    () => () => {
      routeTweenRef.current?.kill();
    },
    [],
  );

  return (
    <>
      {loaderVisible ? <LoadingScreen overlayRef={overlayRef} /> : null}
      <div ref={contentRef} className="app-content min-h-svh">
        <Header route={route} transitionTo={transitionTo} />
        <Outlet context={{ transitionTo } satisfies RouteOutletContext} />
      </div>
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
