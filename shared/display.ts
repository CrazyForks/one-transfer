export function fitQrDisplaySize(
  viewportWidth: number,
  viewportHeight: number,
  containerWidth: number,
  requestedSize: number,
  horizontalChrome = 0,
): number {
  const viewportBudget = 0.9 * Math.min(viewportWidth, viewportHeight);
  const containerBudget = Math.max(1, containerWidth - horizontalChrome);
  return Math.max(1, Math.min(viewportBudget, containerBudget, requestedSize));
}

export function fitQrDisplayArea(
  containerWidth: number,
  containerHeight: number,
  horizontalChrome = 0,
  verticalChrome = 0,
): number {
  const width = Math.max(0, containerWidth - horizontalChrome);
  const height = Math.max(0, containerHeight - verticalChrome);
  return Math.max(0, Math.min(width, height));
}

export interface IntegerQrGridLayout {
  modulePixels: number;
  cellCssPixels: number;
  gridCssPixels: number;
}

export function canFitQrGridAtIntegerPixels(
  totalModules: number,
  gridBudgetCssPixels: number,
  gapCssPixels: number,
  devicePixelRatio: number,
): boolean {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const cellBudget = Math.max(0, (gridBudgetCssPixels - Math.max(0, gapCssPixels)) / 2);
  return cellBudget * dpr >= totalModules;
}

export function mediaAspectRatio(width?: number, height?: number): string {
  return width && height && width > 0 && height > 0 ? `${width} / ${height}` : "";
}

/**
 * Keep every QR module on an integer number of physical display pixels.
 * Stretching a canvas to fill the last few CSS pixels makes module widths
 * uneven, which is especially damaging once a camera samples the screen.
 */
export function integerQrGridLayout(
  totalModules: number,
  gridBudgetCssPixels: number,
  gapCssPixels: number,
  devicePixelRatio: number,
): IntegerQrGridLayout {
  if (totalModules <= 0) throw new RangeError("totalModules must be positive");
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? devicePixelRatio
    : 1;
  const gap = Math.max(0, gapCssPixels);
  const cellBudget = Math.max(1, (gridBudgetCssPixels - gap) / 2);
  const integerModulePixels = Math.floor(cellBudget * dpr / totalModules);
  const modulePixels = Math.max(1, integerModulePixels);
  const cellCssPixels = integerModulePixels >= 1
    ? totalModules * modulePixels / dpr
    : cellBudget;
  return {
    modulePixels,
    cellCssPixels,
    gridCssPixels: 2 * cellCssPixels + gap,
  };
}
