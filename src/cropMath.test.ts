import { describe, expect, it } from 'vitest'
import {
  clamp,
  clampOffset,
  getCenteredOffset,
  getCoverScale,
  getDisplaySize,
  getOffsetBounds,
  getSourceCropRect,
  reanchorOffsetAfterZoom,
} from './cropMath'

describe('clamp', () => {
  it('clamps to the inclusive range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-2, 0, 10)).toBe(0)
    expect(clamp(20, 0, 10)).toBe(10)
  })
})

describe('getCoverScale', () => {
  it('covers a square viewport for landscape sources', () => {
    expect(getCoverScale(800, 400, 200)).toBe(0.5)
  })

  it('covers a square viewport for portrait sources', () => {
    expect(getCoverScale(400, 800, 200)).toBe(0.5)
  })

  it('covers a square viewport for square sources', () => {
    expect(getCoverScale(400, 400, 200)).toBe(0.5)
  })

  it('returns 1 for invalid dimensions', () => {
    expect(getCoverScale(0, 100, 200)).toBe(1)
  })
})

describe('getDisplaySize', () => {
  it('applies cover scale and zoom', () => {
    const cover = getCoverScale(800, 400, 200)
    expect(getDisplaySize(800, 400, cover, 1)).toEqual({
      scale: 0.5,
      width: 400,
      height: 200,
    })
    expect(getDisplaySize(800, 400, cover, 2)).toEqual({
      scale: 1,
      width: 800,
      height: 400,
    })
  })
})

describe('offset bounds', () => {
  it('keeps the crop fully covered', () => {
    expect(getOffsetBounds(200, 400, 200)).toEqual({
      minX: -200,
      maxX: 0,
      minY: 0,
      maxY: 0,
    })
  })

  it('clamps offsets into valid bounds', () => {
    expect(clampOffset(-500, 50, 200, 400, 300)).toEqual({ x: -200, y: 0 })
  })

  it('centers landscape images horizontally', () => {
    expect(getCenteredOffset(200, 400, 200)).toEqual({ x: -100, y: 0 })
  })
})

describe('reanchorOffsetAfterZoom', () => {
  it('keeps the viewport center anchored and clamps', () => {
    const next = reanchorOffsetAfterZoom(-100, 0, 200, 1, 2, 800, 400)
    // center 100 → image point (200, 100) → at 2× offsets become (-300, -100)
    expect(next).toEqual({ x: -300, y: -100 })
  })
})

describe('getSourceCropRect', () => {
  it('maps display offsets back to source pixels', () => {
    expect(getSourceCropRect(-100, 0, 200, 0.5, 800, 400)).toEqual({
      x: 200,
      y: 0,
      size: 400,
    })
  })

  it('never exceeds source bounds', () => {
    const rect = getSourceCropRect(-1000, -1000, 200, 0.5, 800, 400)
    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.y).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.size).toBeLessThanOrEqual(800)
    expect(rect.y + rect.size).toBeLessThanOrEqual(400)
  })
})
