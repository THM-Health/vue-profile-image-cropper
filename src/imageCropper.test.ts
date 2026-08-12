import { describe, expect, it } from 'vitest';
import { ImageCropper } from './imageCropper';

function cropperState(
  sourceWidth: number,
  sourceHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  zoom = 1,
  imageX = 0,
  imageY = 0,
): ImageCropper {
  const cropper = new ImageCropper();
  cropper.sourceWidth = sourceWidth;
  cropper.sourceHeight = sourceHeight;
  cropper.setViewport(viewportWidth, viewportHeight);
  cropper.setZoom(zoom);
  cropper.commitPosition(imageX, imageY);
  return cropper;
}

describe('ImageCropper', () => {
  describe('display size', () => {
    it('covers the crop square, not the full viewport', () => {
      expect(cropperState(400, 400, 400, 200, 1).display.scale).toBe(0.5);
      expect(cropperState(800, 400, 200, 200, 1).display.scale).toBe(0.5);
    });

    it('returns scale 1 for invalid source dimensions', () => {
      expect(cropperState(0, 100, 200, 200, 1).display.scale).toBe(1);
    });

    it('applies zoom', () => {
      const at1x = cropperState(800, 400, 200, 200, 1);
      expect(at1x.display).toEqual({ scale: 0.5, width: 400, height: 200 });

      const at2x = cropperState(800, 400, 200, 200, 2);
      expect(at2x.display).toEqual({ scale: 1, width: 800, height: 400 });
    });
  });

  describe('crop placement', () => {
    it('centers the square crop using the shorter viewport edge', () => {
      expect(cropperState(1, 1, 400, 200).cropPlacement).toEqual({ x: 100, y: 0, size: 200 });
      expect(cropperState(1, 1, 200, 400).cropPlacement).toEqual({ x: 0, y: 100, size: 200 });
    });
  });

  describe('image position bounds', () => {
    it('never allows empty space inside the crop square', () => {
      const g = cropperState(400, 200, 200, 200, 1);
      expect(g.imagePositionBounds).toEqual({
        minX: -200,
        maxX: 0,
        minY: 0,
        maxY: 0,
      });
    });

    it('allows background outside the crop in a rectangular viewport', () => {
      const g = cropperState(800, 400, 400, 200, 1);
      expect(g.imagePositionBounds).toEqual({
        minX: -200,
        maxX: 0,
        minY: 0,
        maxY: 0,
      });
    });

    it('lets a zoomed square image reach left/right regions in a wide viewport', () => {
      const g = cropperState(400, 400, 400, 200, 2);
      expect(g.imagePositionBounds).toEqual({
        minX: -200,
        maxX: 0,
        minY: -200,
        maxY: 0,
      });
    });

    it('clamps image position into bounds', () => {
      const g = cropperState(400, 300, 200, 200, 1.5);
      g.commitPosition(-500, 50);
      expect(g.imageX).toBe(-200);
      expect(g.imageY).toBe(0);
    });

    it('centers the image on the crop', () => {
      const a = cropperState(400, 200, 200, 200, 1);
      a.center();
      expect(a).toMatchObject({ imageX: -100, imageY: 0 });

      const b = cropperState(400, 200, 400, 200, 1);
      b.center();
      expect(b).toMatchObject({ imageX: -100, imageY: 0 });
    });
  });

  describe('viewport offset', () => {
    it('maps crop-space position to a CSS translate', () => {
      const g = cropperState(800, 400, 200, 200, 1, -100, 0);
      expect(g.viewportOffset).toEqual({ x: -100, y: 0 });
    });
  });

  describe('position percentages', () => {
    it('reports 0 at left/top and 100 at right/bottom', () => {
      expect(cropperState(400, 300, 200, 200, 1.5, -200, -100).getPositionPercent()).toEqual({
        x: 0,
        y: 0,
      });
      expect(cropperState(400, 300, 200, 200, 1.5, 0, 0).getPositionPercent()).toEqual({
        x: 100,
        y: 100,
      });
      expect(cropperState(400, 300, 200, 200, 1.5, -100, -50).getPositionPercent()).toEqual({
        x: 50,
        y: 50,
      });
    });

    it('reports null when an axis cannot be panned', () => {
      expect(cropperState(200, 200, 200, 200, 1).getPositionPercent()).toEqual({
        x: null,
        y: null,
      });
      expect(cropperState(400, 200, 200, 200, 1, -100, 0).getPositionPercent()).toEqual({
        x: 50,
        y: null,
      });
    });
  });

  describe('anchor and zoom', () => {
    it('defaults the anchor to the source-image center after construction', () => {
      const g = new ImageCropper();
      g.sourceWidth = 800;
      g.sourceHeight = 400;
      g.setViewport(200, 200);
      expect(g.anchorSourceX).toBe(400);
      expect(g.anchorSourceY).toBe(200);
      expect(g.imageX).toBe(-100);
      expect(g.imageY).toBe(0);
    });

    it('updates the anchor when panning', () => {
      const g = cropperState(800, 400, 200, 200, 1, -100, 0);
      g.panBy(-50, 0);
      expect(g.imageX).toBe(-150);
      expect(g.anchorSourceX).toBe(500);
      expect(g.anchorSourceY).toBe(200);
    });

    it('keeps a fixed anchor under the crop center across zoom changes', () => {
      const g = cropperState(800, 400, 200, 200, 1, -100, 0);
      const anchorX = g.anchorSourceX;
      const anchorY = g.anchorSourceY;
      g.setZoom(2);
      expect(g.imageX).toBe(-300);
      expect(g.imageY).toBe(-100);
      expect(g.anchorSourceX).toBe(anchorX);
      expect(g.anchorSourceY).toBe(anchorY);
    });

    it('shifts the anchor when zoom-out clamping moves the image', () => {
      const g = cropperState(400, 400, 400, 200, 2, -200, 0);
      expect(g.anchorSourceX).toBe(300);
      expect(g.anchorSourceY).toBe(100);

      g.setZoom(1);
      expect(g.imageX).toBe(0);
      expect(g.imageY).toBe(0);
      expect(g.anchorSourceX).toBe(200);
      expect(g.anchorSourceY).toBe(200);
    });
  });

  describe('viewport resize', () => {
    it('preserves the source crop when the viewport is resized', () => {
      const g = cropperState(800, 400, 200, 200, 1, -100, 0);
      const source = g.getUnclampedSourceCropRect();

      g.setViewport(400, 200);
      expect(g.getUnclampedSourceCropRect()).toEqual(source);
    });

    it('centers on the first viewport layout', () => {
      const g = new ImageCropper();
      g.sourceWidth = 800;
      g.sourceHeight = 400;
      g.setViewport(200, 200);
      expect(g.imageX).toBe(-100);
      expect(g.imageY).toBe(0);
      expect(g.anchorSourceX).toBe(400);
      expect(g.anchorSourceY).toBe(200);
    });
  });

  describe('source crop rect', () => {
    it('maps crop-space position back to source pixels for export', () => {
      const g = cropperState(800, 400, 200, 200, 1, -100, 0);
      expect(g.getSourceCropRect()).toEqual({ x: 200, y: 0, size: 400 });
    });

    it('uses the centered crop square for rectangular viewports', () => {
      const g = cropperState(1600, 400, 400, 200, 1, -200, 0);
      expect(g.getSourceCropRect()).toEqual({ x: 400, y: 0, size: 400 });
    });

    it('never exceeds source bounds', () => {
      const g = cropperState(800, 400, 200, 200, 1);
      g.commitPosition(-1000, -1000);
      const rect = g.getSourceCropRect();
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.size).toBeLessThanOrEqual(800);
      expect(rect.y + rect.size).toBeLessThanOrEqual(400);
    });

    it('maps vertical panning on portrait sources correctly', () => {
      const g = cropperState(400, 800, 200, 200, 1, 0, -100);
      expect(g.getSourceCropRect()).toEqual({ x: 0, y: 200, size: 400 });
    });
  });
});
