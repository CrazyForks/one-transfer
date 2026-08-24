import type { DeviceCapabilities } from "../../shared/device-profile";

type NavigatorWithDeviceMemory = Navigator & { deviceMemory?: number };

export async function inspectDeviceCapabilities(): Promise<DeviceCapabilities> {
  const refreshRateHz = await measureRefreshRate();
  return {
    logicalCores: Math.max(1, navigator.hardwareConcurrency || 1),
    deviceMemoryGiB: (navigator as NavigatorWithDeviceMemory).deviceMemory,
    refreshRateHz,
    shortViewportEdge: Math.round(Math.min(window.innerWidth, window.innerHeight)),
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

async function measureRefreshRate(): Promise<number | undefined> {
  if (document.visibilityState !== "visible") return undefined;

  const timestamps = await new Promise<number[]>((resolve) => {
    const values: number[] = [];
    const sample = (timestamp: number) => {
      values.push(timestamp);
      if (values.length >= 22) resolve(values);
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const intervals = timestamps
    .slice(1)
    .map((value, index) => value - timestamps[index]!)
    .filter((value) => value > 0 && value < 100)
    .sort((a, b) => a - b);
  if (intervals.length === 0) return undefined;
  const median = intervals[Math.floor(intervals.length / 2)]!;
  return Math.min(240, Math.max(24, Math.round(1000 / median)));
}
