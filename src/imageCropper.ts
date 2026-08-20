/**
 * Image cropper
 *
 * Contains all logic and math for cropping an image.
 *
 * ## Mental model
 *
 * The crop region is a **square** (`cropSize` × `cropSize`). The circle is CSS-only.
 *
 * **Crop space** (all pan/zoom logic lives here) — mathematical axes:
 * - Origin at the **center** of the crop square: (0, 0)
 * - x → right, y → **up**
 * - The crop fills [-half, half] × [-half, half] where half = cropSize / 2
 * - `imageX` / `imageY`: **center** of the displayed image in crop space
 * - Dragging the image left decreases `imageX`; dragging it up increases `imageY`
 * - The crop square must stay fully inside the image (see `imagePositionBounds`)
 * - `anchorSourceX` / `anchorSourceY`: source-image point kept under the crop center.
 *   Fixed while zooming; recalculated when panning or when zoom-out clamping moves the image.
 *
 * **Source / canvas space** (export only):
 * - Top-left origin, y → down (standard image pixels)
 *
 * **Viewport space** (display only, DOM top-left origin, y → down):
 * - `viewportCrop`: crop square `{ x, y, size }` relative to the viewport
 * - `viewportImage`: image layer top-left `{ x, y }` relative to the viewport (CSS `translate`)
 */

export interface Point {
  x: number;
  y: number;
}

/** Crop square `{ x, y, size }` in viewport/DOM pixels. */
export interface ViewportCrop {
  x: number;
  y: number;
  size: number;
}

export interface DisplaySize {
  width: number;
  height: number;
  scale: number;
}

export interface ImagePositionBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface CropPositionPercent {
  x: number | null;
  y: number | null;
}

export interface SourceCropRect {
  x: number;
  y: number;
  size: number;
}

export interface CropResult {
  blob: Blob;
}

export interface CropExportOptions {
  outputSize?: number;
  mimeType?: string;
  quality?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas export failed.'));
      },
      type,
      quality,
    );
  });
}

export class ImageCropper {
  // Dimensions of the source image
  sourceWidth = 0;
  sourceHeight = 0;

  // Dimensions of the viewport (dynamically changed if the user resizes the window)
  viewportWidth = 0;
  viewportHeight = 0;

  // Zoom level
  zoom = 1;

  // Center of the displayed image in crop space (origin = crop center, +y up).
  imageX = 0;
  imageY = 0;

  // Source-image coordinates for the point under the crop center
  anchorSourceX = 0;
  anchorSourceY = 0;

  // Canvas with the original image
  private sourceCanvas: HTMLCanvasElement | null = null;

  // Object URL of the rendered canvas with the original image
  // Will be transformed using CSS for panning and zooming
  private _displayUrl: string | null = null;

  /**
   * Get the object URL to show the original image in the crop area
   */
  get displayUrl(): string | null {
    return this._displayUrl;
  }

  /**
   * Calculate the size of the crop square
   * As it is a square, the size is the minimum of the viewport width and height
   */
  get cropSize(): number {
    return Math.min(this.viewportWidth, this.viewportHeight);
  }

  /** Half of the crop square edge length. */
  get cropHalf(): number {
    return this.cropSize / 2;
  }

  /**
   * Crop square position in the viewport (DOM). Centered using the shorter edge.
   */
  get viewportCrop(): ViewportCrop {
    const size = this.cropSize;
    return {
      x: (this.viewportWidth - size) / 2,
      y: (this.viewportHeight - size) / 2,
      size,
    };
  }

  /**
   * Get the display size of the image with applied zoom
   */
  get display(): DisplaySize {
    const scale = this.coverScale * this.zoom;
    return {
      scale,
      width: this.sourceWidth * scale,
      height: this.sourceHeight * scale,
    };
  }

  /**
   * Calculate the scale that makes the image cover the crop square at zoom 1
   */
  get coverScale(): number {
    const size = this.cropSize;
    if (!this.sourceWidth || !this.sourceHeight || !size) return 1;
    return Math.max(size / this.sourceWidth, size / this.sourceHeight);
  }

  /**
   * Valid range for `imageX` / `imageY` (image center) so the crop stays inside the image.
   * When an axis cannot pan, min === max === 0.
   */
  get imagePositionBounds(): ImagePositionBounds {
    const { width, height } = this.display;
    const size = this.cropSize;
    const maxX = (width - size) / 2;
    const maxY = (height - size) / 2;
    return {
      minX: -maxX,
      maxX,
      minY: -maxY,
      maxY,
    };
  }

  /**
   * Image layer top-left position in the viewport (DOM), for CSS `translate`.
   * Converts math crop space → viewport coordinates.
   */
  get viewportImage(): Point {
    // Get the center of the crop square in the viewport
    const { x, y } = this.viewportCrop;
    const centerX = x + this.cropHalf;
    const centerY = y + this.cropHalf;

    // Get the display size of the image with applied zoom
    const { width, height } = this.display;

    // Get the image top-left position in the math space
    const imageTopLeftMathX = this.imageX - width / 2;
    const imageTopLeftMathY = this.imageY + height / 2;

    // Convert the image top-left position to the viewport coordinates
    return {
      x: centerX + imageTopLeftMathX,
      y: centerY - imageTopLeftMathY,
    };
  }

  /**
   * Decode `image` with EXIF orientation applied, bake pixels to a canvas for preview
   * and export, and initialize crop geometry from the resulting dimensions.
   */
  async loadImage(image: File): Promise<void> {
    this.destroy();

    const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      throw new Error('Canvas is not available in this browser.');
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);

    this.sourceCanvas = canvas;
    this.sourceWidth = canvas.width;
    this.sourceHeight = canvas.height;
    this._displayUrl = URL.createObjectURL(blob);
    this.anchorSourceX = this.sourceWidth / 2;
    this.anchorSourceY = this.sourceHeight / 2;
    this.imageX = 0;
    this.imageY = 0;
    this.center();
  }

  /** Export the current crop as a square blob. */
  async cropImage(options: CropExportOptions = {}): Promise<CropResult> {
    const source = this.sourceCanvas;
    if (!source || !this.viewportWidth || !this.viewportHeight || !this.display.scale) {
      throw new Error('Image is not ready to crop.');
    }

    const outputSize = Math.max(1, Math.round(options.outputSize ?? 512));
    const mimeType = options.mimeType ?? 'image/jpeg';
    const quality = options.quality ?? 0.92;

    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;

    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (mimeType === 'image/jpeg' || mimeType === 'image/webp') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outputSize, outputSize);
    } else {
      ctx.clearRect(0, 0, outputSize, outputSize);
    }

    const { x: sx, y: sy, size: sSize } = this.getSourceCropRect();
    ctx.drawImage(source, sx, sy, sSize, sSize, 0, 0, outputSize, outputSize);

    const blob = await canvasToBlob(canvas, mimeType, quality);
    return { blob };
  }

  /** Release resources and reset all crop state. */
  destroy(): void {
    if (this._displayUrl) {
      URL.revokeObjectURL(this._displayUrl);
      this._displayUrl = null;
    }
    this.sourceCanvas = null;
    this.sourceWidth = 0;
    this.sourceHeight = 0;
    this.viewportWidth = 0;
    this.viewportHeight = 0;
    this.zoom = 1;
    this.imageX = 0;
    this.imageY = 0;
    this.anchorSourceX = 0;
    this.anchorSourceY = 0;
  }

  /**
   * Relative position within the pan range (0–100).
   * 0 = left / top limit, 100 = right / bottom limit. `null` when an axis cannot pan.
   */
  getPositionPercent(): CropPositionPercent {
    const { minX, maxX, minY, maxY } = this.imagePositionBounds;
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;

    return {
      x: rangeX <= 0 ? null : clamp(((this.imageX - minX) / rangeX) * 100, 0, 100),
      // Top (maxY) → 0, bottom (minY) → 100
      y: rangeY <= 0 ? null : clamp(((maxY - this.imageY) / rangeY) * 100, 0, 100),
    };
  }

  /**
   * Map the visible crop window to source-image pixels for export.
   * Clamps so the rect stays inside the bitmap (e.g. floating-point drift).
   */
  getSourceCropRect(): SourceCropRect {
    const scale = this.display.scale;
    if (!scale) return { x: 0, y: 0, size: 0 };

    const { width, height } = this.display;

    // Image top-left and crop top-left in math space
    const imageTopLeftX = this.imageX - width / 2;
    const imageTopLeftY = this.imageY + height / 2;
    const cropTopLeftX = -this.cropHalf;
    const cropTopLeftY = this.cropHalf;

    const sx = -(imageTopLeftX - cropTopLeftX) / scale;
    const sy = (imageTopLeftY - cropTopLeftY) / scale;
    const sSize = this.cropSize / scale;

    const x = clamp(sx, 0, Math.max(0, this.sourceWidth - sSize));
    const y = clamp(sy, 0, Math.max(0, this.sourceHeight - sSize));
    const size = Math.min(sSize, this.sourceWidth - x, this.sourceHeight - y);

    return { x, y, size };
  }

  /** Center the image on the crop and reset the anchor to the source-image center. */
  center(): void {
    this.anchorSourceX = this.sourceWidth / 2;
    this.anchorSourceY = this.sourceHeight / 2;
    this.applyAnchor();
  }

  /**
   * Set image position, clamp into bounds, then refresh the anchor from the crop center.
   * Single path for any position change (pan, zoom, resize, center).
   */
  commitPosition(imageX = this.imageX, imageY = this.imageY): void {
    // Clamp the image position into the bounds
    const { minX, maxX, minY, maxY } = this.imagePositionBounds;
    this.imageX = clamp(imageX, minX, maxX);
    this.imageY = clamp(imageY, minY, maxY);

    // Update the anchor position
    // Anchor is the point in the source image that is kept under the crop center
    const { width, height, scale } = this.display;
    if (!scale) {
      this.anchorSourceX = 0;
      this.anchorSourceY = 0;
      return;
    }
    this.anchorSourceX = (width / 2 - this.imageX) / scale;
    this.anchorSourceY = (this.imageY + height / 2) / scale;
  }

  /**
   * Move the image by a crop-space delta (math: +x right, +y up), then clamp and sync the anchor.
   */
  panBy(deltaX: number, deltaY: number): void {
    this.commitPosition(this.imageX + deltaX, this.imageY + deltaY);
  }

  /**
   * Change zoom while keeping the stored source-image anchor under the crop center.
   * If zoom-out clamping shifts the image, the anchor is updated to match.
   */
  setZoom(zoom: number): void {
    if (zoom === this.zoom) return;
    this.zoom = zoom;
    this.applyAnchor();
  }

  /**
   * Update the viewport size.
   * Re-applies the current source anchor under the crop center after resize;
   * centers on the first layout.
   */
  setViewport(viewportWidth: number, viewportHeight: number): void {
    if (viewportWidth === this.viewportWidth && viewportHeight === this.viewportHeight) {
      return;
    }

    const hadLayout = this.viewportWidth > 0 && this.viewportHeight > 0;

    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;

    if (hadLayout) {
      this.applyAnchor();
      return;
    }
    this.center();
  }

  /** Place the image so the stored source anchor sits under the crop center, then commit. */
  private applyAnchor(): void {
    const { width, height, scale } = this.display;
    // Crop center (0,0) = image center + offset of anchor from image center,
    // with source Y flipped into math +y up.
    this.commitPosition(
      width / 2 - this.anchorSourceX * scale,
      this.anchorSourceY * scale - height / 2,
    );
  }
}
