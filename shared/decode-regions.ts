export interface DecodeRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Pick one overlapping quadrant for a submitted video frame. The sender
 * updates its four cells in the same round-robin order, so scanning one region
 * per camera frame avoids four full QR searches while still visiting every
 * cell. Overlap tolerates normal hand-held framing error around the centre.
 */
export function decodeRegionForFrame(
  frameId: number,
  width: number,
  height: number,
): DecodeRegion {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  const halfWidth = Math.floor(safeWidth / 2);
  const halfHeight = Math.floor(safeHeight / 2);
  const overlapX = Math.floor(safeWidth * 0.1);
  const overlapY = Math.floor(safeHeight * 0.1);
  const index = ((frameId % 4) + 4) % 4;
  const column = index % 2;
  const row = Math.floor(index / 2);
  const x = column === 0 ? 0 : Math.max(0, halfWidth - overlapX);
  const y = row === 0 ? 0 : Math.max(0, halfHeight - overlapY);
  const right = column === 0 ? Math.min(safeWidth, halfWidth + overlapX) : safeWidth;
  const bottom = row === 0 ? Math.min(safeHeight, halfHeight + overlapY) : safeHeight;
  return { x, y, width: right - x, height: bottom - y };
}
