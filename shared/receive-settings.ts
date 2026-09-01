export function initialCameraCaptureFps(
  logicalCores: number,
  manuallySelectedFps?: number,
): number {
  if (manuallySelectedFps !== undefined) return manuallySelectedFps;
  return logicalCores <= 4 ? 30 : 60;
}

export function recommendedDecodeWorkers(logicalCores: number): number {
  return logicalCores >= 8 ? 4 : logicalCores >= 6 ? 3 : 2;
}

export function initialDecodeWorkers(
  logicalCores: number,
  manuallySelectedWorkers?: number,
): number {
  return manuallySelectedWorkers ?? recommendedDecodeWorkers(logicalCores);
}
