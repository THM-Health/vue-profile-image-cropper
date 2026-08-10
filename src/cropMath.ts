/** Pure crop geometry helpers (unit-tested, no Vue / DOM). */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Scale that makes the source cover a square viewport (object-fit: cover). */
export function getCoverScale(
  sourceWidth: number,
  sourceHeight: number,
  viewportSize: number,
): number {
  if (!sourceWidth || !sourceHeight || !viewportSize) return 1
  return Math.max(viewportSize / sourceWidth, viewportSize / sourceHeight)
}

export function getDisplaySize(
  sourceWidth: number,
  sourceHeight: number,
  coverScale: number,
  zoom: number,
): { width: number; height: number; scale: number } {
  const scale = coverScale * zoom
  return {
    scale,
    width: sourceWidth * scale,
    height: sourceHeight * scale,
  }
}

export function getOffsetBounds(
  viewportSize: number,
  displayWidth: number,
  displayHeight: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: viewportSize - displayWidth,
    maxX: 0,
    minY: viewportSize - displayHeight,
    maxY: 0,
  }
}

export function clampOffset(
  offsetX: number,
  offsetY: number,
  viewportSize: number,
  displayWidth: number,
  displayHeight: number,
): { x: number; y: number } {
  const bounds = getOffsetBounds(viewportSize, displayWidth, displayHeight)
  return {
    x: clamp(offsetX, bounds.minX, bounds.maxX),
    y: clamp(offsetY, bounds.minY, bounds.maxY),
  }
}

export function getCenteredOffset(
  viewportSize: number,
  displayWidth: number,
  displayHeight: number,
): { x: number; y: number } {
  return clampOffset(
    (viewportSize - displayWidth) / 2,
    (viewportSize - displayHeight) / 2,
    viewportSize,
    displayWidth,
    displayHeight,
  )
}

/** Keep the point under the viewport center stable across a zoom change. */
export function reanchorOffsetAfterZoom(
  offsetX: number,
  offsetY: number,
  viewportSize: number,
  prevZoom: number,
  nextZoom: number,
  displayWidth: number,
  displayHeight: number,
): { x: number; y: number } {
  if (!viewportSize || prevZoom <= 0) {
    return clampOffset(offsetX, offsetY, viewportSize, displayWidth, displayHeight)
  }

  const cx = viewportSize / 2
  const cy = viewportSize / 2
  const ratio = nextZoom / prevZoom

  return clampOffset(
    cx - (cx - offsetX) * ratio,
    cy - (cy - offsetY) * ratio,
    viewportSize,
    displayWidth,
    displayHeight,
  )
}

/** Map the visible 1:1 viewport back to source-image coordinates. */
export function getSourceCropRect(
  offsetX: number,
  offsetY: number,
  viewportSize: number,
  displayScale: number,
  sourceWidth: number,
  sourceHeight: number,
): { x: number; y: number; size: number } {
  const sx = -offsetX / displayScale
  const sy = -offsetY / displayScale
  const sSize = viewportSize / displayScale

  const x = clamp(sx, 0, Math.max(0, sourceWidth - sSize))
  const y = clamp(sy, 0, Math.max(0, sourceHeight - sSize))
  const size = Math.min(sSize, sourceWidth - x, sourceHeight - y)

  return { x, y, size }
}
