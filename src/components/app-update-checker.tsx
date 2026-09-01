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

  const update = async () => {
    setPending(true);
    const next = new URL(window.location.href);
    next.searchParams.set("t", Date.now().toString());
    window.history.replaceState(window.history.state, "", next);
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.update();
    } catch (error) {
      console.debug("Service worker update check failed.", error);
    }
    window.location.replace(next.toString());
  };

  return (
    <aside
      role="alert"
      aria-live="polite"
      className="app-update-checker-style-01"
    >
      <RefreshCw className={pending ? "app-update-checker-style-02" : "app-update-checker-style-03"} />
      <div className="app-update-checker-style-04">
        <strong className="app-update-checker-style-05">发现新版本</strong>
        <span className="app-update-checker-style-06">更新后即可使用最新功能和修复。</span>
      </div>
      <Button type="button" size="sm" disabled={pending} onClick={update}>
        <SweepShine>{pending ? "正在更新…" : "更新"}</SweepShine>
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="app-update-checker-style-07"
        aria-label="关闭更新提示"
        disabled={pending}
        onClick={() => setAvailable(false)}
      >
        <X />
      </Button>
    </aside>
  );
}
