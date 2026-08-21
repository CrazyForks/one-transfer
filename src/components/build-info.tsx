import { useEffect } from "react";

export function BuildInfo() {
  useEffect(() => {
    const print = (key: string, value: string) => {
      console.info(`[build-info] ${key}: ${value}`);
    };

    print("one-transfer", __APP_VERSION__);
    print("build time", formatBuildTime(__APP_BUILD_TIME__));
    print("commit", __APP_COMMIT__);
  }, []);

  return null;
}

function formatBuildTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(date);
}
