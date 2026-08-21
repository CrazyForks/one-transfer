import { RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { SweepShine } from "@/components/ui/sweep-shine";

type WorkerMessage = {
  type: "changed" | "error" | "unchanged";
  message?: string;
};

export function AppUpdateChecker() {
  const [available, setAvailable] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || typeof Worker === "undefined") return;
    const versionUrl = new URL("version.json", document.baseURI);
    const workerUrl = new URL("app-update-checker.worker.js", document.baseURI);
    let worker: Worker;
    try {
      worker = new Worker(workerUrl, { name: "app-update-checker" });
    } catch (error) {
      console.debug("App update checker worker failed to start.", error);
      return;
    }

    const check = () => {
      if (document.visibilityState === "hidden") return;
      worker.postMessage({
        type: "check",
        url: versionUrl.toString(),
        version: __APP_VERSION__,
        commit: __APP_COMMIT__,
      });
    };
    const onMessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.type === "changed") setAvailable(true);
      else if (event.data.type === "error") {
        console.debug("App update check failed.", event.data.message);
      }
    };
    const onVisible = () => check();
    worker.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(check, 5 * 60_000);
    check();
    return () => {
      window.clearInterval(timer);
      worker.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisible);
      worker.terminate();
    };
  }, []);

  if (!available) return null;

  const update = () => {
    setPending(true);
    const next = new URL(window.location.href);
    next.searchParams.set("update", Date.now().toString());
    window.location.replace(next.toString());
  };

  return (
    <aside
      role="alert"
      aria-live="polite"
      className="fixed right-4 bottom-4 left-4 z-[80] mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-black/10 bg-white p-4 sm:left-auto sm:mx-0"
    >
      <RefreshCw className={pending ? "size-5 shrink-0 animate-spin" : "size-5 shrink-0"} />
      <div className="min-w-0 flex-1">
        <strong className="block text-sm">发现新版本</strong>
        <span className="text-xs text-zinc-500">更新后即可使用最新功能和修复。</span>
      </div>
      <Button type="button" size="sm" disabled={pending} onClick={update}>
        <SweepShine>{pending ? "正在更新…" : "更新"}</SweepShine>
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8"
        aria-label="关闭更新提示"
        disabled={pending}
        onClick={() => setAvailable(false)}
      >
        <X />
      </Button>
    </aside>
  );
}
