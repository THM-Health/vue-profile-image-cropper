/**
 * Unit tests for ImageCropper geometry.
 *
 * Crop space (used by pan/zoom):
 * - Origin = crop center (0, 0)
 * - +x right, +y up
 * - imageX / imageY = center of the displayed image
 *
 * Source space (export): top-left origin, +y down.
 * Viewport space (DOM): top-left origin, +y down.
 */
import { describe, expect, it } from 'vitest';
import { ImageCropper } from './imageCropper';

/** Build a cropper with source + viewport laid out, then optional zoom/position. */
function createCropper(options: {
  sourceWidth: number;
  sourceHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  zoom?: number;
  imageX?: number;
  imageY?: number;
}): ImageCropper {
  const cropper = new ImageCropper();
  cropper.sourceWidth = options.sourceWidth;
  cropper.sourceHeight = options.sourceHeight;
  cropper.setViewport(options.viewportWidth, options.viewportHeight);
  if (options.zoom !== undefined) cropper.setZoom(options.zoom);
  if (options.imageX !== undefined || options.imageY !== undefined) {
    cropper.commitPosition(options.imageX ?? cropper.imageX, options.imageY ?? cropper.imageY);
  }
  return cropper;
}

describe('ImageCropper', () => {
  describe('display (cover + zoom)', () => {
    it('scales the image to cover the crop square (not the full viewport)', () => {
      // 400×400 source in a 400×200 viewport → crop is 200 → cover scale 0.5
      expect(
        createCropper({
          sourceWidth: 400,
          sourceHeight: 400,
          viewportWidth: 400,
          viewportHeight: 200,
        }).display.scale,
      ).toBe(0.5);

      // 800×400 source in a 200×200 viewport → crop is 200 → cover scale 0.5
      expect(
        createCropper({
          sourceWidth: 800,
          sourceHeight: 400,
          viewportWidth: 200,
          viewportHeight: 200,
        }).display.scale,
      ).toBe(0.5);
    });

    it('multiplies cover scale by zoom', () => {
      const base = createCropper({
        sourceWidth: 800,
        sourceHeight: 400,
        viewportWidth: 200,
        viewportHeight: 200,
        zoom: 1,
      });
      expect(base.display).toEqual({ scale: 0.5, width: 400, height: 200 });

      const zoomed = createCropper({
        sourceWidth: 800,
        sourceHeight: 400,
        viewportWidth: 200,
        viewportHeight: 200,
        zoom: 2,
      });
      expect(zoomed.display).toEqual({ scale: 1, width: 800, height: 400 });
    });

    it('falls back to scale 1 when source size is invalid', () => {
      expect(
        createCropper({
          sourceWidth: 0,
          sourceHeight: 100,
          viewportWidth: 200,
          viewportHeight: 200,
        }).display.scale,
      ).toBe(1);
    });
  });

  describe('viewportCrop / viewportImage (DOM positions)', () => {
    it('places the crop square on the shorter viewport edge, centered', () => {
      // Wide viewport: crop height = 200, offset 100 from the left
      expect(
        createCropper({
          sourceWidth: 1,
          sourceHeight: 1,
          viewportWidth: 400,
          viewportHeight: 200,
        }).viewportCrop,
      ).toEqual({ x: 100, y: 0, size: 200 });

      // Tall viewport: crop width = 200, offset 100 from the top
      expect(
        createCropper({
          sourceWidth: 1,
          sourceHeight: 1,
          viewportWidth: 200,
          viewportHeight: 400,
        }).viewportCrop,
      ).toEqual({ x: 0, y: 100, size: 200 });
    });

    it('converts a centered image into a CSS translate for the image layer', () => {
      // Display 400×200, crop 200 → image top-left sits 100px left of the crop
      const cropper = createCropper({
        sourceWidth: 800,
        sourceHeight: 400,
        viewportWidth: 200,
        viewportHeight: 200,
        imageX: 0,
        imageY: 0,
      });
      expect(cropper.viewportImage).toEqual({ x: -100, y: 0 });
    });
  });

  describe('imagePositionBounds and commitPosition', () => {
    it('allows horizontal pan only when the image is wider than the crop', () => {
      // Display 400×200, crop 200 → ±X, no vertical room
      const cropper = createCropper({
        sourceWidth: 400,
        sourceHeight: 200,
        viewportWidth: 200,
        viewportHeight: 200,
      });
      expect(cropper.imagePositionBounds.minX).toBe(-100);
      expect(cropper.imagePositionBounds.maxX).toBe(100);
      expect(cropper.imagePositionBounds.minY).toBeCloseTo(0);
      expect(cropper.imagePositionBounds.maxY).toBeCloseTo(0);
    });

    it('allows pan on both axes when zoomed past cover', () => {
      // Zoom 2 on a square source in a wide viewport → display 400×400, crop 200
      const cropper = createCropper({
        sourceWidth: 400,
        sourceHeight: 400,
        viewportWidth: 400,
        viewportHeight: 200,
        zoom: 2,
      });
      expect(cropper.imagePositionBounds).toEqual({
        minX: -100,
        maxX: 100,
        minY: -100,
        maxY: 100,
      });
    });

    it('clamps commitPosition into bounds', () => {
      // Display 400×300 at zoom 1.5 → bounds ±100 X, ±50 Y
      const cropper = createCropper({
        sourceWidth: 400,
        sourceHeight: 300,
        viewportWidth: 200,
        viewportHeight: 200,
        zoom: 1.5,
      });
      cropper.commitPosition(-500, 50);
      expect(cropper.imageX).toBe(-100);
      expect(cropper.imageY).toBe(50);
    });

    it('resets the image center to (0, 0) on center()', () => {
      const cropper = createCropper({
        sourceWidth: 400,
        sourceHeight: 200,
        viewportWidth: 200,
        viewportHeight: 200,
        imageX: -80,
        imageY: 0,
      });
      cropper.center();
      expect(cropper.imageX).toBeCloseTo(0);
      expect(cropper.imageY).toBeCloseTo(0);
      expect(cropper.anchorSourceX).toBe(200);
      expect(cropper.anchorSourceY).toBe(100);
    });
  });

  describe('getPositionPercent', () => {
    it('maps pan limits to 0–100 (left/top → 0, right/bottom → 100)', () => {
      // Bounds ±100 X, ±50 Y
      const opts = {
        sourceWidth: 400,
        sourceHeight: 300,
        viewportWidth: 200,
        viewportHeight: 200,
        zoom: 1.5,
      } as const;

      expect(createCropper({ ...opts, imageX: -100, imageY: 50 }).getPositionPercent()).toEqual({
        x: 0,
        y: 0,
      });
      expect(createCropper({ ...opts, imageX: 100, imageY: -50 }).getPositionPercent()).toEqual({
        x: 100,
        y: 100,
      });
      expect(createCropper({ ...opts, imageX: 0, imageY: 0 }).getPositionPercent()).toEqual({
        x: 50,
        y: 50,
      });
    });

    it('returns null on an axis that cannot pan', () => {
      // Square at cover: no pan room
      expect(
        createCropper({
          sourceWidth: 200,
          sourceHeight: 200,
          viewportWidth: 200,
          viewportHeight: 200,
        }).getPositionPercent(),
      ).toEqual({ x: null, y: null });

      // Landscape: only X can pan
      expect(
        createCropper({
          sourceWidth: 400,
          sourceHeight: 200,
          viewportWidth: 200,
          viewportHeight: 200,
          imageX: 0,
          imageY: 0,
        }).getPositionPercent(),
      ).toEqual({ x: 50, y: null });
    });
  });

  describe('anchor, pan, and zoom', () => {
    it('centers the image and anchor on the first setViewport', () => {
      const cropper = new ImageCropper();
      cropper.sourceWidth = 800;
      cropper.sourceHeight = 400;
      cropper.setViewport(200, 200);

      expect(cropper.imageX).toBeCloseTo(0);
      expect(cropper.imageY).toBeCloseTo(0);
      expect(cropper.anchorSourceX).toBe(400);
      expect(cropper.anchorSourceY).toBe(200);
    });

    it('updates the source anchor when panning', () => {
      const cropper = createCropper({
        sourceWidth: 800,
        sourceHeight: 400,
        viewportWidth: 200,
        viewportHeight: 200,
        imageX: 0,
        imageY: 0,
      });

      // Drag image left → imageX decreases; crop center sees a point further right on the source
      cropper.panBy(-50, 0);
      expect(cropper.imageX).toBe(-50);
      expect(cropper.anchorSourceX).toBe(500);
      expect(cropper.anchorSourceY).toBe(200);
    });

    it('keeps the same source anchor under the crop center while zooming in', () => {
      const cropper = createCropper({
        sourceWidth: 800,
        sourceHeight: 400,
        viewportWidth: 200,
        viewportHeight: 200,
        imageX: 0,
        imageY: 0,
      });
      const { anchorSourceX, anchorSourceY } = cropper;

      cropper.setZoom(2);
      expect(cropper.anchorSourceX).toBe(anchorSourceX);
      expect(cropper.anchorSourceY).toBe(anchorSourceY);
      // Still looking at source center → image stays centered
      expect(cropper.imageX).toBeCloseTo(0);
      expect(cropper.imageY).toBeCloseTo(0);
    });

    it('rewrites the anchor when zoom-out clamping recenters the image', () => {
      // Panned into a corner at zoom 2; zooming out removes pan room and snaps to center
      const cropper = createCropper({
        sourceWidth: 400,
        sourceHeight: 400,
        viewportWidth: 400,
        viewportHeight: 200,
        zoom: 2,
        imageX: -100,
        imageY: -100,
      });
      expect(cropper.anchorSourceX).toBe(300);
      expect(cropper.anchorSourceY).toBe(100);

      cropper.setZoom(1);
      expect(cropper.imageX).toBeCloseTo(0);
      expect(cropper.imageY).toBeCloseTo(0);
      expect(cropper.anchorSourceX).toBe(200);
      expect(cropper.anchorSourceY).toBe(200);
    });

    it('re-applies the anchor after viewport resize so the source crop stays the same', () => {
      const cropper = createCropper({
        sourceWidth: 800,
        sourceHeight: 400,
        viewportWidth: 200,
        viewportHeight: 200,
        imageX: 0,
        imageY: 0,
      });
      const before = cropper.getSourceCropRect();

      cropper.setViewport(400, 200);
      expect(cropper.getSourceCropRect()).toEqual(before);
    });
  });

  describe('getSourceCropRect (export mapping)', () => {
    it('maps a centered landscape image to the middle of the source', () => {
      // Source 800×400, cover scale 0.5, crop 200 → source square 400×400 starting at x=200
      const cropper = createCropper({
        sourceWidth: 800,
        sourceHeight: 400,
        viewportWidth: 200,
        viewportHeight: 200,
        imageX: 0,
        imageY: 0,
      });
      expect(cropper.getSourceCropRect()).toEqual({ x: 200, y: 0, size: 400 });
    });

    it('maps a centered portrait image to the middle of the source', () => {
      // Source 400×800 → source square starts at y=200
      const cropper = createCropper({
        sourceWidth: 400,
        sourceHeight: 800,
        viewportWidth: 200,
        viewportHeight: 200,
        imageX: 0,
        imageY: 0,
      });
      expect(cropper.getSourceCropRect()).toEqual({ x: 0, y: 200, size: 400 });
    });

    it('moves the source crop up when the image is shifted down', () => {
      // imageY < 0 → image center below crop center → crop shows higher (smaller y) on the source
      const cropper = createCropper({
        sourceWidth: 400,
        sourceHeight: 800,
        viewportWidth: 200,
        viewportHeight: 200,
        imageX: 0,
        imageY: -50,
      });
      expect(cropper.getSourceCropRect()).toEqual({ x: 0, y: 100, size: 400 });
    });

    it('keeps the export rect inside the source bitmap after extreme pan', () => {
      const cropper = createCropper({
        sourceWidth: 800,
        sourceHeight: 400,
        viewportWidth: 200,
        viewportHeight: 200,
      });
      cropper.commitPosition(-1000, -1000);
      const rect = cropper.getSourceCropRect();

      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.size).toBeLessThanOrEqual(800);
      expect(rect.y + rect.size).toBeLessThanOrEqual(400);
    });
  });
});
