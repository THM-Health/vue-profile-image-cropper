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

/** Access private helpers used by public APIs (for unit tests only). */
function internals(cropper: ImageCropper): {
  commitPosition(imageX?: number, imageY?: number): void;
  getSourceImageCropSquareRect(): { x: number; y: number; size: number };
} {
  return cropper as unknown as {
    commitPosition(imageX?: number, imageY?: number): void;
    getSourceImageCropSquareRect(): { x: number; y: number; size: number };
  };
}

function sourceImageCropSquareRect(cropper: ImageCropper): {
  x: number;
  y: number;
  size: number;
} {
  return internals(cropper).getSourceImageCropSquareRect();
}

/** Build a cropper with source + viewport laid out, then optional zoom/position. */
function createCropper(options: {
  sourceImageWidth: number;
  sourceImageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  zoom?: number;
  imageX?: number;
  imageY?: number;
}): ImageCropper {
  const cropper = new ImageCropper();
  cropper.sourceImageWidth = options.sourceImageWidth;
  cropper.sourceImageHeight = options.sourceImageHeight;
  cropper.setViewport(options.viewportWidth, options.viewportHeight);
  if (options.zoom !== undefined) cropper.setZoom(options.zoom);
  if (options.imageX !== undefined || options.imageY !== undefined) {
    internals(cropper).commitPosition(
      options.imageX ?? cropper.imageX,
      options.imageY ?? cropper.imageY,
    );
  }
  return cropper;
}

describe('ImageCropper', () => {
  describe('imageStyle (cover + zoom)', () => {
    it('scales the image to cover the crop square (not the full viewport)', () => {
      // 400×400 source in a 400×200 viewport → crop is 200 → cover scale 0.5 → 200×200
      expect(
        createCropper({
          sourceImageWidth: 400,
          sourceImageHeight: 400,
          viewportWidth: 400,
          viewportHeight: 200,
        }).imageStyle,
      ).toMatchObject({ width: 200, height: 200 });

      // 800×400 source in a 200×200 viewport → crop is 200 → cover scale 0.5 → 400×200
      expect(
        createCropper({
          sourceImageWidth: 800,
          sourceImageHeight: 400,
          viewportWidth: 200,
          viewportHeight: 200,
        }).imageStyle,
      ).toMatchObject({ width: 400, height: 200 });
    });

    it('multiplies cover scale by zoom', () => {
      const base = createCropper({
        sourceImageWidth: 800,
        sourceImageHeight: 400,
        viewportWidth: 200,
        viewportHeight: 200,
        zoom: 1,
      });
      expect(base.imageStyle).toMatchObject({ width: 400, height: 200 });

      const zoomed = createCropper({
        sourceImageWidth: 800,
        sourceImageHeight: 400,
        viewportWidth: 200,
        viewportHeight: 200,
        zoom: 2,
      });
      expect(zoomed.imageStyle).toMatchObject({ width: 800, height: 400 });
    });

    it('falls back to scale 1 when source size is invalid', () => {
      // Missing source width skips cover math, so height stays 100 × zoom 1
      expect(
        createCropper({
          sourceImageWidth: 0,
          sourceImageHeight: 100,
          viewportWidth: 200,
          viewportHeight: 200,
        }).imageStyle,
      ).toMatchObject({ width: 0, height: 100 });
    });
  });

  describe('cropSquareStyle / imageStyle (DOM positions)', () => {
    it('places the crop square on the shorter viewport edge, centered', () => {
      // Wide viewport: crop height = 200, offset 100 from the left
      expect(
        createCropper({
          sourceImageWidth: 1,
          sourceImageHeight: 1,
          viewportWidth: 400,
          viewportHeight: 200,
        }).cropSquareStyle,
      ).toEqual({ x: 100, y: 0, width: 200, height: 200 });

      // Tall viewport: crop width = 200, offset 100 from the top
      expect(
        createCropper({
          sourceImageWidth: 1,
          sourceImageHeight: 1,
          viewportWidth: 200,
          viewportHeight: 400,
        }).cropSquareStyle,
      ).toEqual({ x: 0, y: 100, width: 200, height: 200 });
    });

    it('places a centered image as a viewport box for the image element', () => {
      // Rendered 400×200, crop 200 → image top-left sits 100px left of the crop
      const cropper = createCropper({
        sourceImageWidth: 800,
        sourceImageHeight: 400,
        viewportWidth: 200,
        viewportHeight: 200,
        imageX: 0,
        imageY: 0,
      });
      expect(cropper.imageStyle).toEqual({ x: -100, y: 0, width: 400, height: 200 });
    });
  });

  describe('imagePositionBounds and panBy', () => {
    it('allows horizontal pan only when the image is wider than the crop', () => {
      // Display 400×200, crop 200 → ±X, no vertical room
      const cropper = createCropper({
        sourceImageWidth: 400,
        sourceImageHeight: 200,
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
        sourceImageWidth: 400,
        sourceImageHeight: 400,
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

    it('clamps panBy into bounds', () => {
      // Display 400×300 at zoom 1.5 → bounds ±100 X, ±50 Y
      const cropper = createCropper({
        sourceImageWidth: 400,
        sourceImageHeight: 300,
        viewportWidth: 200,
        viewportHeight: 200,
        zoom: 1.5,
      });
      cropper.panBy(-500, 50);
      expect(cropper.imageX).toBe(-100);
      expect(cropper.imageY).toBe(50);
    });

    it('resets the image center to (0, 0) on center()', () => {
      const cropper = createCropper({
        sourceImageWidth: 400,
        sourceImageHeight: 200,
        viewportWidth: 200,
        viewportHeight: 200,
        imageX: -80,
        imageY: 0,
      });
      cropper.center();
      expect(cropper.imageX).toBeCloseTo(0);
      expect(cropper.imageY).toBeCloseTo(0);
      expect(cropper.sourceImageAnchorX).toBe(200);
      expect(cropper.sourceImageAnchorY).toBe(100);
    });
  });

  describe('getRelativeCropSquarePosition', () => {
    it('maps the crop square on the image to 0–100 (left/top → 0, right/bottom → 100)', () => {
      // Bounds ±100 X, ±50 Y. Image center and crop square move in opposite directions.
      const opts = {
        sourceImageWidth: 400,
        sourceImageHeight: 300,
        viewportWidth: 200,
        viewportHeight: 200,
        zoom: 1.5,
      } as const;

      // Image at maxX / minY: crop shows the left and top edges.
      expect(
        createCropper({ ...opts, imageX: 100, imageY: -50 }).getRelativeCropSquarePosition(),
      ).toEqual({
        x: 0,
        y: 0,
      });
      // Image at minX / maxY: crop shows the right and bottom edges.
      expect(
        createCropper({ ...opts, imageX: -100, imageY: 50 }).getRelativeCropSquarePosition(),
      ).toEqual({
        x: 100,
        y: 100,
      });
      expect(
        createCropper({ ...opts, imageX: 0, imageY: 0 }).getRelativeCropSquarePosition(),
      ).toEqual({
        x: 50,
        y: 50,
      });
    });

    it('returns null on an axis that cannot pan', () => {
      // Square at cover: no pan room
      expect(
        createCropper({
          sourceImageWidth: 200,
          sourceImageHeight: 200,
          viewportWidth: 200,
          viewportHeight: 200,
        }).getRelativeCropSquarePosition(),
      ).toEqual({ x: null, y: null });

      // Landscape: only X can pan
      expect(
        createCropper({
          sourceImageWidth: 400,
          sourceImageHeight: 200,
          viewportWidth: 200,
          viewportHeight: 200,
          imageX: 0,
          imageY: 0,
        }).getRelativeCropSquarePosition(),
      ).toEqual({ x: 50, y: null });
    });
  });

  describe('anchor, pan, and zoom', () => {
    it('throws error when zoom is set below 1', () => {
      const cropper = createCropper({
        sourceWidth: 200,
        sourceHeight: 200,
        viewportWidth: 200,
        viewportHeight: 200,
      });

      expect(() => cropper.setZoom(0.9)).toThrow('Zoom cannot be less than 1.0');
      expect(cropper.zoom).toBe(1);
    });

    it('centers the image and anchor on the first setViewport', () => {
      const cropper = new ImageCropper();
      cropper.sourceImageWidth = 800;
      cropper.sourceImageHeight = 400;
      cropper.setViewport(200, 200);

      expect(cropper.imageX).toBeCloseTo(0);
      expect(cropper.imageY).toBeCloseTo(0);
      expect(cropper.sourceImageAnchorX).toBe(400);
      expect(cropper.sourceImageAnchorY).toBe(200);
    });

    it('updates the source anchor when panning', () => {
      const cropper = createCropper({
        sourceImageWidth: 800,
        sourceImageHeight: 400,
        viewportWidth: 200,
        viewportHeight: 200,
        imageX: 0,
        imageY: 0,
      });

      // Drag image left → imageX decreases; crop center sees a point further right on the source
      cropper.panBy(-50, 0);
      expect(cropper.imageX).toBe(-50);
      expect(cropper.sourceImageAnchorX).toBe(500);
      expect(cropper.sourceImageAnchorY).toBe(200);
    });

    it('keeps the same source anchor under the crop center while zooming in', () => {
      const cropper = createCropper({
        sourceImageWidth: 800,
        sourceImageHeight: 400,
        viewportWidth: 200,
        viewportHeight: 200,
        imageX: 0,
        imageY: 0,
      });
      const { sourceImageAnchorX, sourceImageAnchorY } = cropper;

      cropper.setZoom(2);
      expect(cropper.sourceImageAnchorX).toBe(sourceImageAnchorX);
      expect(cropper.sourceImageAnchorY).toBe(sourceImageAnchorY);
      // Still looking at source center → image stays centered
      expect(cropper.imageX).toBeCloseTo(0);
      expect(cropper.imageY).toBeCloseTo(0);
    });

    it('rewrites the anchor when zoom-out clamping recenters the image', () => {
      // Panned into a corner at zoom 2; zooming out removes pan room and snaps to center
      const cropper = createCropper({
        sourceImageWidth: 400,
        sourceImageHeight: 400,
        viewportWidth: 400,
        viewportHeight: 200,
        zoom: 2,
        imageX: -100,
        imageY: -100,
      });
      expect(cropper.sourceImageAnchorX).toBe(300);
      expect(cropper.sourceImageAnchorY).toBe(100);

      cropper.setZoom(1);
      expect(cropper.imageX).toBeCloseTo(0);
      expect(cropper.imageY).toBeCloseTo(0);
      expect(cropper.sourceImageAnchorX).toBe(200);
      expect(cropper.sourceImageAnchorY).toBe(200);
    });

    it('re-applies the anchor after viewport resize so the source crop stays the same', () => {
      const cropper = createCropper({
        sourceImageWidth: 800,
        sourceImageHeight: 400,
        viewportWidth: 200,
        viewportHeight: 200,
        imageX: 0,
        imageY: 0,
      });
      const before = sourceImageCropSquareRect(cropper);

      cropper.setViewport(400, 200);
      expect(sourceImageCropSquareRect(cropper)).toEqual(before);
    });
  });

  describe('source crop rect (export mapping)', () => {
    it('maps a centered landscape image to the middle of the source', () => {
      // Source 800×400, cover scale 0.5, crop 200 → source square 400×400 starting at x=200
      const cropper = createCropper({
        sourceImageWidth: 800,
        sourceImageHeight: 400,
        viewportWidth: 200,
        viewportHeight: 200,
        imageX: 0,
        imageY: 0,
      });
      expect(sourceImageCropSquareRect(cropper)).toEqual({ x: 200, y: 0, size: 400 });
    });

    it('maps a centered portrait image to the middle of the source', () => {
      // Source 400×800 → source square starts at y=200
      const cropper = createCropper({
        sourceImageWidth: 400,
        sourceImageHeight: 800,
        viewportWidth: 200,
        viewportHeight: 200,
        imageX: 0,
        imageY: 0,
      });
      expect(sourceImageCropSquareRect(cropper)).toEqual({ x: 0, y: 200, size: 400 });
    });

    it('moves the source crop up when the image is shifted down', () => {
      // imageY < 0 → image center below crop center → crop shows higher (smaller y) on the source
      const cropper = createCropper({
        sourceImageWidth: 400,
        sourceImageHeight: 800,
        viewportWidth: 200,
        viewportHeight: 200,
        imageX: 0,
        imageY: -50,
      });
      expect(sourceImageCropSquareRect(cropper)).toEqual({ x: 0, y: 100, size: 400 });
    });

    it('keeps the export rect inside the source bitmap after extreme pan', () => {
      const cropper = createCropper({
        sourceImageWidth: 800,
        sourceImageHeight: 400,
        viewportWidth: 200,
        viewportHeight: 200,
      });
      cropper.panBy(-1000, -1000);
      const rect = sourceImageCropSquareRect(cropper);

      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.size).toBeLessThanOrEqual(800);
      expect(rect.y + rect.size).toBeLessThanOrEqual(400);
    });
  });
});
