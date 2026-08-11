import { describe, expect, it } from 'vitest'
import {
  clamp,
  clampOffset,
  getCenteredOffset,
  getCoverScale,
  getCropOrigin,
  getCropPositionPercent,
  getCropSize,
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
  it('covers the crop circle for landscape sources', () => {
    expect(getCoverScale(800, 400, 200, 200)).toBe(0.5)
  })

  it('covers the crop circle for portrait sources', () => {
    expect(getCoverScale(400, 800, 200, 200)).toBe(0.5)
  })

  it('covers the inscribed crop, not the full rectangular viewport', () => {
    // Viewport 400×200 → crop 200; square 400×400 source → scale 0.5 (not 1)
    expect(getCoverScale(400, 400, 400, 200)).toBe(0.5)
    expect(getCoverScale(800, 400, 400, 200)).toBe(0.5)
  })

  it('returns 1 for invalid dimensions', () => {
    expect(getCoverScale(0, 100, 200, 200)).toBe(1)
  })
})

describe('getCropSize / getCropOrigin', () => {
  it('uses the shorter viewport edge for the inscribed square', () => {
    expect(getCropSize(400, 200)).toBe(200)
    expect(getCropOrigin(400, 200)).toEqual({ x: 100, y: 0, size: 200 })
    expect(getCropOrigin(200, 400)).toEqual({ x: 0, y: 100, size: 200 })
  })
})

describe('getDisplaySize', () => {
  it('applies cover scale and zoom', () => {
    const cover = getCoverScale(800, 400, 200, 200)
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
  it('keeps the crop circle covered for a square viewport', () => {
    expect(getOffsetBounds(200, 200, 400, 200)).toEqual({
      minX: -200,
      maxX: 0,
      minY: 0,
      maxY: 0,
    })
  })

  it('allows empty space outside the circle in a rectangular viewport', () => {
    // Viewport 400×200, crop at x=100 size 200; display 400×200
    expect(getOffsetBounds(400, 200, 400, 200)).toEqual({
      minX: -100,
      maxX: 100,
      minY: 0,
      maxY: 0,
    })
  })

  it('lets a zoomed square image pan horizontally in a wide viewport', () => {
    // Viewport 400×200, crop 200; zoomed square display 400×400
    expect(getOffsetBounds(400, 200, 400, 400)).toEqual({
      minX: -100,
      maxX: 100,
      minY: -200,
      maxY: 0,
    })
  })

  it('clamps offsets into valid bounds', () => {
    expect(clampOffset(-500, 50, 200, 200, 400, 300)).toEqual({ x: -200, y: 0 })
  })

  it('centers landscape images on the crop', () => {
    expect(getCenteredOffset(200, 200, 400, 200)).toEqual({ x: -100, y: 0 })
    expect(getCenteredOffset(400, 200, 400, 200)).toEqual({ x: 0, y: 0 })
  })
})

describe('getCropPositionPercent', () => {
  it('is 0 at the left/top limit and 100 at the right/bottom limit', () => {
    // Square viewport 200; display 400×300 → minX=-200 maxX=0, minY=-100 maxY=0
    expect(getCropPositionPercent(0, 0, 200, 200, 400, 300)).toEqual({ x: 0, y: 0 })
    expect(getCropPositionPercent(-200, -100, 200, 200, 400, 300)).toEqual({ x: 100, y: 100 })
    expect(getCropPositionPercent(-100, -50, 200, 200, 400, 300)).toEqual({ x: 50, y: 50 })
  })

  it('returns null when an axis cannot be panned', () => {
    expect(getCropPositionPercent(0, 0, 200, 200, 200, 200)).toEqual({ x: null, y: null })
    // Landscape cover: Y locked, X pannable
    expect(getCropPositionPercent(-100, 0, 200, 200, 400, 200)).toEqual({ x: 50, y: null })
  })
})

describe('reanchorOffsetAfterZoom', () => {
  it('keeps the viewport center anchored and clamps', () => {
    const next = reanchorOffsetAfterZoom(-100, 0, 200, 200, 1, 2, 800, 400)
    // center 100 → image point (200, 100) → at 2× offsets become (-300, -100)
    expect(next).toEqual({ x: -300, y: -100 })
  })
})

describe('getSourceCropRect', () => {
  it('maps display offsets back to source pixels', () => {
    expect(getSourceCropRect(-100, 0, 200, 200, 0.5, 800, 400)).toEqual({
      x: 200,
      y: 0,
      size: 400,
    })
  })

  it('uses the centered inscribed square for rectangular viewports', () => {
    // Viewport 400×200, crop square at x=100; image offset (-100, 0), scale 0.5
    // source x = (100 - (-100)) / 0.5 = 400
    expect(getSourceCropRect(-100, 0, 400, 200, 0.5, 1600, 400)).toEqual({
      x: 400,
      y: 0,
      size: 400,
    })
  })

  it('never exceeds source bounds', () => {
    const rect = getSourceCropRect(-1000, -1000, 200, 200, 0.5, 800, 400)
    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.y).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.size).toBeLessThanOrEqual(800)
    expect(rect.y + rect.size).toBeLessThanOrEqual(400)
  })
})
