/** Pure crop geometry helpers (unit-tested, no Vue / DOM). */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Scale that makes the source cover the circular crop region (inscribed square). */
export function getCoverScale(
  sourceWidth: number,
  sourceHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  const cropSize = getCropSize(viewportWidth, viewportHeight)
  if (!sourceWidth || !sourceHeight || !cropSize) return 1
  return Math.max(cropSize / sourceWidth, cropSize / sourceHeight)
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

/** Square crop edge length inscribed in the viewport (circular mask diameter). */
export function getCropSize(viewportWidth: number, viewportHeight: number): number {
  return Math.min(viewportWidth, viewportHeight)
}

export function getCropOrigin(
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number; size: number } {
  const size = getCropSize(viewportWidth, viewportHeight)
  return {
    x: (viewportWidth - size) / 2,
    y: (viewportHeight - size) / 2,
    size,
  }
}

/**
 * Keep the circular crop fully covered by the image.
 * Empty space is allowed in the viewport outside the circle.
 */
export function getOffsetBounds(
  viewportWidth: number,
  viewportHeight: number,
  displayWidth: number,
  displayHeight: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const crop = getCropOrigin(viewportWidth, viewportHeight)
  return {
    minX: crop.x + crop.size - displayWidth,
    maxX: crop.x,
    minY: crop.y + crop.size - displayHeight,
    maxY: crop.y,
  }
}

export function clampOffset(
  offsetX: number,
  offsetY: number,
  viewportWidth: number,
  viewportHeight: number,
  displayWidth: number,
  displayHeight: number,
): { x: number; y: number } {
  const bounds = getOffsetBounds(viewportWidth, viewportHeight, displayWidth, displayHeight)
  return {
    x: clamp(offsetX, bounds.minX, bounds.maxX),
    y: clamp(offsetY, bounds.minY, bounds.maxY),
  }
}

/**
 * Relative crop position within the pan range, as 0–100.
 * - x/y = 0 at the left/top limit (cannot move further left/top)
 * - x/y = 100 at the right/bottom limit
 * - x/y = `null` when that axis cannot be panned (e.g. zoom 1× fills the crop)
 */
export function getCropPositionPercent(
  offsetX: number,
  offsetY: number,
  viewportWidth: number,
  viewportHeight: number,
  displayWidth: number,
  displayHeight: number,
): { x: number | null; y: number | null } {
  const bounds = getOffsetBounds(viewportWidth, viewportHeight, displayWidth, displayHeight)
  const rangeX = bounds.maxX - bounds.minX
  const rangeY = bounds.maxY - bounds.minY

  return {
    x: rangeX <= 0 ? null : clamp(((bounds.maxX - offsetX) / rangeX) * 100, 0, 100),
    y: rangeY <= 0 ? null : clamp(((bounds.maxY - offsetY) / rangeY) * 100, 0, 100),
  }
}

export function getCenteredOffset(
  viewportWidth: number,
  viewportHeight: number,
  displayWidth: number,
  displayHeight: number,
): { x: number; y: number } {
  return clampOffset(
    (viewportWidth - displayWidth) / 2,
    (viewportHeight - displayHeight) / 2,
    viewportWidth,
    viewportHeight,
    displayWidth,
    displayHeight,
  )
}

/** Keep the point under the viewport center stable across a zoom change. */
export function reanchorOffsetAfterZoom(
  offsetX: number,
  offsetY: number,
  viewportWidth: number,
  viewportHeight: number,
  prevZoom: number,
  nextZoom: number,
  displayWidth: number,
  displayHeight: number,
): { x: number; y: number } {
  if (!viewportWidth || !viewportHeight || prevZoom <= 0) {
    return clampOffset(offsetX, offsetY, viewportWidth, viewportHeight, displayWidth, displayHeight)
  }

  const cx = viewportWidth / 2
  const cy = viewportHeight / 2
  const ratio = nextZoom / prevZoom

  return clampOffset(
    cx - (cx - offsetX) * ratio,
    cy - (cy - offsetY) * ratio,
    viewportWidth,
    viewportHeight,
    displayWidth,
    displayHeight,
  )
}

/** Map the centered square crop region back to source-image coordinates. */
export function getSourceCropRect(
  offsetX: number,
  offsetY: number,
  viewportWidth: number,
  viewportHeight: number,
  displayScale: number,
  sourceWidth: number,
  sourceHeight: number,
): { x: number; y: number; size: number } {
  const crop = getCropOrigin(viewportWidth, viewportHeight)
  const sx = (crop.x - offsetX) / displayScale
  const sy = (crop.y - offsetY) / displayScale
  const sSize = crop.size / displayScale

  const x = clamp(sx, 0, Math.max(0, sourceWidth - sSize))
  const y = clamp(sy, 0, Math.max(0, sourceHeight - sSize))
  const size = Math.min(sSize, sourceWidth - x, sourceHeight - y)

  return { x, y, size }
}
