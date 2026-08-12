/**
 * Image cropper: geometry + oriented source canvas for preview/export.
 *
 * ## Mental model
 *
 * The crop region is a **square** (`cropSize` × `cropSize`). The circle is CSS-only.
 *
 * **Crop space** (all pan/zoom logic lives here):
 * - Origin at the **top-left** of the crop square: (0, 0)
 * - x → right, y → down
 * - The crop fills [0, cropSize] × [0, cropSize]
 * - `imageX` / `imageY`: top-left corner of the displayed image
 * - The image may move, but the crop square must stay fully inside the image:
 *   - imageX ≤ 0, imageY ≤ 0
 *   - imageX + displayWidth ≥ cropSize, imageY + displayHeight ≥ cropSize
 * - `anchorSourceX` / `anchorSourceY`: source-image point kept under the crop center.
 *   Fixed while zooming; recalculated when panning or when zoom-out clamping moves the image.
 *
 * **Viewport space** (display only):
 * - DOM top-left origin; the crop square is centered via `cropPlacement`
 * - `viewportOffset`: image layer top-left for CSS `translate()`
 */

export interface Point {
  x: number;
  y: number;
}

/** Top-left of the crop square in viewport pixels (for CSS placement). */
export interface CropPlacement {
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
  sourceWidth = 0;
  sourceHeight = 0;

  viewportWidth = 0;
  viewportHeight = 0;
  zoom = 1;
  /** Top-left of the displayed image in crop space. */
  imageX = 0;
  imageY = 0;
  /** Source-image point kept under the crop center. */
  anchorSourceX = 0;
  anchorSourceY = 0;

  /** Oriented source pixels — shared coordinate space for preview and export. */
  private sourceCanvas: HTMLCanvasElement | null = null;
  private _displayUrl: string | null = null;

  /** Object URL for the oriented preview JPEG. */
  get displayUrl(): string | null {
    return this._displayUrl;
  }

  /** Edge length of the square crop region. */
  get cropSize(): number {
    return Math.min(this.viewportWidth, this.viewportHeight);
  }

  /** Where the crop square sits in the viewport (circle/mask CSS uses this). */
  get cropPlacement(): CropPlacement {
    const size = this.cropSize;
    return {
      x: (this.viewportWidth - size) / 2,
      y: (this.viewportHeight - size) / 2,
      size,
    };
  }

  /** Display size of the image layer after cover + zoom. */
  get display(): DisplaySize {
    const scale = this.coverScale * this.zoom;
    return {
      scale,
      width: this.sourceWidth * scale,
      height: this.sourceHeight * scale,
    };
  }

  /** Scale that makes the image cover the crop square at zoom 1. */
  get coverScale(): number {
    const size = this.cropSize;
    if (!this.sourceWidth || !this.sourceHeight || !size) return 1;
    return Math.max(size / this.sourceWidth, size / this.sourceHeight);
  }

  /** Center of the crop square in crop space. */
  get cropCenter(): Point {
    const center = this.cropSize / 2;
    return { x: center, y: center };
  }

  /**
   * Valid range for `imageX` / `imageY` so the crop square stays inside the image.
   * max is always 0 (image edge aligned with crop top-left); min is negative when pannable.
   */
  get imagePositionBounds(): ImagePositionBounds {
    const { width, height } = this.display;
    const size = this.cropSize;
    return {
      minX: size - width,
      maxX: 0,
      minY: size - height,
      maxY: 0,
    };
  }

  /** Image layer top-left in viewport pixels (for CSS `translate`). */
  get viewportOffset(): Point {
    const { x, y } = this.cropPlacement;
    return {
      x: x + this.imageX,
      y: y + this.imageY,
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

    const rect = this.getSourceCropRect();
    const sx = Math.round(rect.x);
    const sy = Math.round(rect.y);
    const sSize = Math.round(rect.size);
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

  /** Relative position within the pan range (0–100). `null` when an axis cannot pan. */
  getPositionPercent(): CropPositionPercent {
    const { minX, maxX, minY, maxY } = this.imagePositionBounds;
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;

    return {
      x: rangeX <= 0 ? null : clamp(((this.imageX - minX) / rangeX) * 100, 0, 100),
      y: rangeY <= 0 ? null : clamp(((this.imageY - minY) / rangeY) * 100, 0, 100),
    };
  }

  /** Map the visible crop region back to source-image coordinates for export. */
  getUnclampedSourceCropRect(): SourceCropRect {
    const scale = this.display.scale;
    if (!scale) return { x: 0, y: 0, size: 0 };

    return {
      x: -this.imageX / scale,
      y: -this.imageY / scale,
      size: this.cropSize / scale,
    };
  }

  getSourceCropRect(): SourceCropRect {
    const { x: sx, y: sy, size: sSize } = this.getUnclampedSourceCropRect();

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
   * Clamp the image position and refresh the anchor from whatever sits under the crop center.
   * Use after a user pan.
   */
  commitPosition(imageX = this.imageX, imageY = this.imageY): void {
    this.imageX = imageX;
    this.imageY = imageY;
    this.clamp();
    this.syncAnchorFromPosition();
  }

  /** Move the image by a crop-space delta, then clamp and sync the anchor. */
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
   * Preserves the visible source crop when resizing an already-laid-out viewport;
   * otherwise centers (first layout) or clamps.
   */
  setViewport(viewportWidth: number, viewportHeight: number): void {
    if (viewportWidth === this.viewportWidth && viewportHeight === this.viewportHeight) {
      return;
    }

    const hadLayout = this.viewportWidth > 0 && this.viewportHeight > 0;
    const preserved = hadLayout ? this.getUnclampedSourceCropRect() : null;

    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;

    if (preserved) {
      this.setImagePositionFromSourceRect(preserved);
      this.syncAnchorFromPosition();
      return;
    }
    if (!hadLayout) {
      this.center();
      return;
    }
    this.commitPosition();
  }

  private applyAnchor(): void {
    this.setImagePositionFromAnchor();
    this.syncAnchorFromPosition();
  }

  private setImagePositionFromAnchor(): void {
    const { x, y } = this.cropCenter;
    const { scale } = this.display;
    this.imageX = x - this.anchorSourceX * scale;
    this.imageY = y - this.anchorSourceY * scale;
    this.clamp();
  }

  private setImagePositionFromSourceRect(rect: SourceCropRect): void {
    const { scale } = this.display;
    if (!scale) {
      this.clamp();
      return;
    }
    this.imageX = -rect.x * scale;
    this.imageY = -rect.y * scale;
    this.clamp();
  }

  private syncAnchorFromPosition(): void {
    const { scale } = this.display;
    if (!scale) {
      this.anchorSourceX = 0;
      this.anchorSourceY = 0;
      return;
    }
    const { x, y } = this.cropCenter;
    this.anchorSourceX = (x - this.imageX) / scale;
    this.anchorSourceY = (y - this.imageY) / scale;
  }

  private clamp(): void {
    const { minX, maxX, minY, maxY } = this.imagePositionBounds;
    this.imageX = clamp(this.imageX, minX, maxX);
    this.imageY = clamp(this.imageY, minY, maxY);
  }
}
