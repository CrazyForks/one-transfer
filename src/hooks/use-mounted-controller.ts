import { useEffect, useState } from "react";

export function useMountedController(
  loader: () => Promise<() => () => void>,
  enabled = true,
) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;
    setError(null);
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
  }, [enabled, loader]);

  return error;
}
