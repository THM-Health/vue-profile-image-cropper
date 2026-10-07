/**
 * Image cropper
 *
 * Contains all logic and math for cropping an image.
 * The crop square has a fixed position and size. Only the image is moved and scaled.
 *
 * ## Mental model
 *
 * The crop is a **square** (`cropSquareSize` × `cropSquareSize`). A circular shape is optional CSS only.
 *
 * **Crop space** (all pan/zoom logic lives here) — mathematical axes:
 * - Origin at the **center** of the crop square: (0, 0)
 * - x → right, y → **up**
 * - The crop fills [-half, half] × [-half, half] where half = cropSquareSize / 2
 * - `imageX` / `imageY`: **center** of the displayed image in crop space
 * - Dragging the image left decreases `imageX`; dragging it up increases `imageY`
 * - The crop square must stay fully inside the image (see `imagePositionBounds`)
 * - `sourceImageAnchorX` / `sourceImageAnchorY`: source-image point kept under the crop center.
 *   Fixed while zooming; recalculated when panning or when zoom-out clamping moves the image.
 *
 * **Source / canvas space** (export only):
 * - Top-left origin, y → down (standard image pixels)
 *
 * **Viewport space** (DOM top-left origin, y → down):
 * - `cropSquareStyle` / `imageStyle`: rectangles `{ x, y, width, height }` in viewport pixels.
 *   `x` / `y` are the top-left. The crop style is square (`width === height`).
 */

/** Axis-aligned rectangle in viewport pixels. Top-left origin. */
export interface Style {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Source size mapped into viewport pixels (cover scale × zoom). */
interface RenderedSize {
  scale: number;
  width: number;
  height: number;
}

export interface ImagePositionBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface CropSquarePositionPercent {
  x: number | null;
  y: number | null;
}

/** Crop square mapped into source-image pixels for canvas export. */
interface SourceImageCropSquareRect {
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
  /** Dimensions of the source image. */
  sourceImageWidth = 0;
  sourceImageHeight = 0;

  /** Viewport size (updates when the host element is resized). */
  viewportWidth = 0;
  viewportHeight = 0;

  /** Zoom multiplier (≥ 1 under normal use). */
  zoom = 1;

  /** Center of the displayed image in crop space (origin = crop center, +y up). */
  imageX = 0;
  imageY = 0;

  /** Source-image point kept under the crop center. */
  sourceImageAnchorX = 0;
  sourceImageAnchorY = 0;

  private sourceImageCanvas: HTMLCanvasElement | null = null;
  private _sourceImageBlobURL: string | null = null;

  // --- Lifecycle ---

  /**
   * Decode `image` with EXIF orientation applied, bake pixels to a canvas for preview
   * and export, and initialize crop geometry from the resulting dimensions.
   */
  async loadImage(image: File | HTMLImageElement): Promise<void> {
    this.destroy();

    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
    } catch {
      throw new Error('Failed to create image bitmap.');
    }

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

    this.sourceImageCanvas = canvas;
    this.sourceImageWidth = canvas.width;
    this.sourceImageHeight = canvas.height;
    this._sourceImageBlobURL = URL.createObjectURL(blob);
    this.center();
  }

  /** Export the current crop as a square blob. */
  async cropImage(options: CropExportOptions = {}): Promise<CropResult> {
    const sourceImage = this.sourceImageCanvas;
    if (!sourceImage || !this.viewportWidth || !this.viewportHeight) {
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

    // Set a white background to avoid transparency in png exports
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outputSize, outputSize);

    const { x: sx, y: sy, size: sSize } = this.getSourceImageCropSquareRect();
    ctx.drawImage(sourceImage, sx, sy, sSize, sSize, 0, 0, outputSize, outputSize);

    const blob = await canvasToBlob(canvas, mimeType, quality);
    return { blob };
  }

  /** Release resources and reset all crop state. */
  destroy(): void {
    if (this._sourceImageBlobURL) {
      URL.revokeObjectURL(this._sourceImageBlobURL);
      this._sourceImageBlobURL = null;
    }
    this.sourceImageCanvas = null;
    this.sourceImageWidth = 0;
    this.sourceImageHeight = 0;
    this.viewportWidth = 0;
    this.viewportHeight = 0;
    this.zoom = 1;
    this.imageX = 0;
    this.imageY = 0;
    this.sourceImageAnchorX = 0;
    this.sourceImageAnchorY = 0;
  }

  // --- Interaction ---

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

  /**
   * Change zoom while keeping the stored source-image anchor under the crop center.
   * If zoom-out clamping shifts the image, the anchor is updated to match.
   */
  setZoom(zoom: number): void {
    // Do not allow setting zoom below 1.0
    if (zoom < 1.0) {
      throw new Error('Zoom cannot be less than 1.0');
    }

    if (zoom === this.zoom) return;
    this.zoom = zoom;
    this.applyAnchor();
  }

  /**
   * Move the image by a crop-space delta (math: +x right, +y up), then clamp and sync the anchor.
   */
  panBy(deltaX: number, deltaY: number): void {
    this.commitPosition(this.imageX + deltaX, this.imageY + deltaY);
  }

  /** Center the image on the crop and reset the anchor to the source-image center. */
  center(): void {
    this.sourceImageAnchorX = this.sourceImageWidth / 2;
    this.sourceImageAnchorY = this.sourceImageHeight / 2;
    this.applyAnchor();
  }

  // --- Viewport / UI ---

  /** Object URL of the source image for the `<img>` preview. */
  get sourceImageBlobURL(): string | null {
    return this._sourceImageBlobURL;
  }

  /**
   * Crop square in the viewport (DOM). Centered on the shorter edge.
   * `width` and `height` are equal.
   */
  get cropSquareStyle(): Style {
    const size = this.cropSquareSize;
    return {
      x: (this.viewportWidth - size) / 2,
      y: (this.viewportHeight - size) / 2,
      width: size,
      height: size,
    };
  }

  /**
   * Image element in the viewport: top-left and zoomed size.
   * Apply `x` / `y` as a CSS `translate` and `width` / `height` as the element size.
   */
  get imageStyle(): Style {
    const { width, height } = this.renderedSize;
    const crop = this.cropSquareStyle;
    const centerX = crop.x + crop.width / 2;
    const centerY = crop.y + crop.height / 2;

    const imageTopLeftX = this.imageX - width / 2;
    const imageTopLeftY = this.imageY + height / 2;

    return {
      x: centerX + imageTopLeftX,
      y: centerY - imageTopLeftY,
      width,
      height,
    };
  }

  /**
   * Valid range for `imageX` / `imageY` so the crop stays inside the image.
   * When an axis cannot pan, min === max === 0.
   */
  get imagePositionBounds(): ImagePositionBounds {
    const { width, height } = this.renderedSize;
    const size = this.cropSquareSize;
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
   * Where the crop square sits on the image, as a percent of the pan range (0–100).
   * 0 = crop shows the left / top edge, 100 = crop shows the right / bottom edge.
   * `null` when an axis cannot pan.
   */
  getRelativeCropSquarePosition(): CropSquarePositionPercent {
    const { minX, maxX, minY, maxY } = this.imagePositionBounds;
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;

    return {
      // imageX at max (image shifted right) → crop shows the left edge → 0
      x: rangeX <= 0 ? null : clamp(((maxX - this.imageX) / rangeX) * 100, 0, 100),
      // imageY at min (image shifted down; +y is up) → crop shows the top edge → 0
      y: rangeY <= 0 ? null : clamp(((this.imageY - minY) / rangeY) * 100, 0, 100),
    };
  }

  // --- Private helpers ---

  /**
   * Set image position, clamp into bounds, then refresh the anchor from the crop center.
   * Single path for any position change (pan, zoom, resize, center).
   */
  private commitPosition(imageX = this.imageX, imageY = this.imageY): void {
    const { minX, maxX, minY, maxY } = this.imagePositionBounds;
    this.imageX = clamp(imageX, minX, maxX);
    this.imageY = clamp(imageY, minY, maxY);

    const { width, height, scale } = this.renderedSize;
    this.sourceImageAnchorX = (width / 2 - this.imageX) / scale;
    this.sourceImageAnchorY = (this.imageY + height / 2) / scale;
  }

  /** Place the image so the stored source anchor sits under the crop center, then commit. */
  private applyAnchor(): void {
    const { width, height, scale } = this.renderedSize;
    // Crop center (0,0) = image center + offset of anchor from image center,
    // with source Y flipped into math +y up.
    this.commitPosition(
      width / 2 - this.sourceImageAnchorX * scale,
      this.sourceImageAnchorY * scale - height / 2,
    );
  }

  /** Edge length of the crop square (shorter viewport side). */
  private get cropSquareSize(): number {
    return Math.min(this.viewportWidth, this.viewportHeight);
  }

  /** Image size in viewport pixels, including zoom. */
  private get renderedSize(): RenderedSize {
    const scale = this.coverScale * this.zoom;
    return {
      scale,
      width: this.sourceImageWidth * scale,
      height: this.sourceImageHeight * scale,
    };
  }

  /** Scale that makes the image cover the crop square at zoom 1. */
  private get coverScale(): number {
    const size = this.cropSquareSize;
    if (!this.sourceImageWidth || !this.sourceImageHeight || !size) return 1;
    return Math.max(size / this.sourceImageWidth, size / this.sourceImageHeight);
  }

  /**
   * Map the visible crop square to source-image pixels for export.
   * Clamps so the rect stays inside the bitmap (e.g. floating-point drift).
   */
  private getSourceImageCropSquareRect(): SourceImageCropSquareRect {
    const { width, height, scale } = this.renderedSize;

    const imageTopLeftX = this.imageX - width / 2;
    const imageTopLeftY = this.imageY + height / 2;
    const cropTopLeftX = -this.cropSquareSize / 2;
    const cropTopLeftY = this.cropSquareSize / 2;

    const sx = (cropTopLeftX - imageTopLeftX) / scale;
    const sy = (imageTopLeftY - cropTopLeftY) / scale;
    const sSize = this.cropSquareSize / scale;

    const x = clamp(sx, 0, Math.max(0, this.sourceImageWidth - sSize));
    const y = clamp(sy, 0, Math.max(0, this.sourceImageHeight - sSize));
    const size = Math.min(sSize, this.sourceImageWidth - x, this.sourceImageHeight - y);

    return { x, y, size };
  }
}
