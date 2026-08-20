<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowReactive,
  useAttrs,
  watch,
} from 'vue';
import { ImageCropper, type CropResult } from '../imageCropper';

export type { CropResult };

export interface CropPosition {
  /** 0 at left limit, 100 at right limit. `null` when X cannot be panned. */
  x: number | null;
  /** 0 at top limit, 100 at bottom limit. `null` when Y cannot be panned. */
  y: number | null;
}

defineOptions({ inheritAttrs: false });

/** Controlled zoom (`v-model:zoom`). */
const zoom = defineModel<number>('zoom', { required: true });

const props = withDefaults(
  defineProps<{
    /** Source image file (required; fixed for the lifetime of the component). */
    image: File;
    /** Minimum zoom for wheel / +/- controls. */
    minZoom?: number;
    /** Maximum zoom for wheel / +/- controls. */
    maxZoom?: number;
    /** Zoom delta for wheel ticks and +/- keys. */
    zoomStep?: number;
    /** Pixel size of the exported square image. */
    outputSize?: number;
    /** MIME type for canvas export. */
    mimeType?: string;
    /** JPEG/WebP quality when applicable (0–1). */
    quality?: number;
    /** Keyboard nudge distance in CSS pixels per arrow key press. */
    keyboardStep?: number;
    /** Accessible label for the crop viewport. */
    ariaLabel?: string;
    rootClass?: string;
    viewportClass?: string;
    stageClass?: string;
    imageLayerClass?: string;
    imageClass?: string;
    maskClass?: string;
    ringClass?: string;
  }>(),
  {
    minZoom: 1,
    maxZoom: Number.POSITIVE_INFINITY,
    zoomStep: 0.1,
    outputSize: 512,
    mimeType: 'image/jpeg',
    quality: 0.92,
    keyboardStep: 8,
    ariaLabel:
      'Image crop area. Drag to reposition, scroll or press +/− to zoom, arrow keys to nudge.',
    ariaRoleDescription: 'Image cropper',
    rootClass: undefined,
    viewportClass: undefined,
    stageClass: undefined,
    imageLayerClass: undefined,
    imageClass: undefined,
    maskClass: undefined,
    ringClass: undefined,
  },
);

const emit = defineEmits<{
  loading: [loading: boolean];
  error: [message: string];
  /** Fired when the relative crop position changes (0–100 on each axis). */
  position: [position: CropPosition];
}>();

const attrs = useAttrs();

const viewportRef = ref<HTMLElement | null>(null);
const loading = ref(true);
/** Tracks root field writes (imageX, zoom, displayUrl, …) without deeply proxying the canvas. */
const cropper = shallowReactive(new ImageCropper());

const imageLayerStyle = computed(() => ({
  position: 'absolute' as const,
  top: '0',
  left: '0',
  width: `${cropper.display.width}px`,
  height: `${cropper.display.height}px`,
  transform: `translate(${cropper.viewportImage.x}px, ${cropper.viewportImage.y}px)`,
  transformOrigin: '0 0',
  willChange: 'transform',
}));

/**
 * Emits the loading state to the parent component.
 */
watch(
  loading,
  (next) => {
    emit('loading', next);
  },
  { immediate: true },
);

/**
 * Updates the cropper's zoom level when the parent-controlled zoom level changes.
 */
watch(
  zoom,
  (next, prev) => {
    if (loading.value || prev === undefined || prev === next) return;
    cropper.setZoom(next);
  },
  { flush: 'sync' },
);

/**
 * Emits the crop position to the parent component.
 */
watch(
  () => cropper.getPositionPercent(),
  (position) => {
    if (loading.value || !cropper.viewportWidth || !cropper.viewportHeight) {
      return;
    }
    emit('position', { x: position.x, y: position.y });
  },
  { deep: true },
);

let resizeObserver: ResizeObserver | null = null;

/**
 * Measures the viewport size and updates the cropper's viewport.
 */
function measureViewport(): void {
  const el = viewportRef.value;
  if (!el) return;
  // Use the laid-out content box; avoid flooring so export matches the visible area.
  const width = el.clientWidth;
  const height = el.clientHeight;
  if (width <= 0 || height <= 0) return;

  cropper.setViewport(width, height);
}

onMounted(async () => {
  loading.value = true;

  try {
    await cropper.loadImage(props.image);
    cropper.setZoom(zoom.value);
    loading.value = false;

    await nextTick();
    measureViewport();

    // If browser supports ResizeObserver, use it to measure the viewport size.
    // Otherwise, use window resize event to measure the viewport size.
    if (viewportRef.value && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => measureViewport());
      resizeObserver.observe(viewportRef.value);
    } else {
      window.addEventListener('resize', measureViewport);
    }
  } catch {
    loading.value = false;
    emit('error', 'Failed to load image.');
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.removeEventListener('resize', measureViewport);
  cropper.destroy();
});

/**
 * Tracks the pointer and positions for dragging the image
 */
const dragPointerId = ref<number | null>(null);
let lastPointerX = 0;
let lastPointerY = 0;

function onPointerDown(event: PointerEvent): void {
  if (loading.value || event.button !== 0) return;
  // Save pointer id to only handle one pointer at a time
  dragPointerId.value = event.pointerId;

  // Update last pointer position
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
}

function onPointerMove(event: PointerEvent): void {
  // Ignore pointer all other pointers movements, except for the one that started the drag
  if (dragPointerId.value === null || event.pointerId !== dragPointerId.value) return;

  // DOM +y is down; crop space +y is up — flip the vertical delta.
  const deltaX = event.clientX - lastPointerX;
  const deltaY = -(event.clientY - lastPointerY);
  cropper.panBy(deltaX, deltaY);

  // Update last pointer position
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
}

function endPointerDrag(event?: PointerEvent): void {
  if (event && dragPointerId.value !== null && event.pointerId !== dragPointerId.value) {
    return;
  }
  dragPointerId.value = null;
}

function onPointerUp(event: PointerEvent): void {
  endPointerDrag(event);
}

function onPointerCancel(event: PointerEvent): void {
  endPointerDrag(event);
}

function onPointerLeave(event: PointerEvent): void {
  endPointerDrag(event);
}

/**
 * Update zoom via v-model (wheel / +/- keys).
 */
function setZoom(next: number): void {
  const rounded = Number((Math.round(next / props.zoomStep) * props.zoomStep).toFixed(6));
  const nextZoom = Math.min(props.maxZoom, Math.max(props.minZoom, rounded));

  zoom.value = nextZoom;
}

function onWheel(event: WheelEvent): void {
  if (loading.value) return;
  event.preventDefault();
  const direction = event.deltaY < 0 ? 1 : -1;
  setZoom(zoom.value + direction * props.zoomStep);
}

/**
 * Handles keyboard navigation for the crop viewport.
 */
function onViewportKeydown(event: KeyboardEvent): void {
  if (loading.value) return;

  // Zoom: + / = / NumpadAdd, - / _ / NumpadSubtract
  if (event.key === '+' || event.key === '=' || event.key === 'Add' || event.code === 'NumpadAdd') {
    event.preventDefault();
    setZoom(zoom.value + props.zoomStep);
    return;
  }
  if (
    event.key === '-' ||
    event.key === '_' ||
    event.key === 'Subtract' ||
    event.code === 'NumpadSubtract'
  ) {
    event.preventDefault();
    setZoom(zoom.value - props.zoomStep);
    return;
  }

  const step = props.keyboardStep;

  // Arrows move the crop over the image (inverse of dragging the image).
  // Crop space: +x right, +y up.
  let deltaX = 0;
  let deltaY = 0;
  switch (event.key) {
    case 'ArrowUp':
      deltaY = -step;
      break;
    case 'ArrowDown':
      deltaY = step;
      break;
    case 'ArrowLeft':
      deltaX = step;
      break;
    case 'ArrowRight':
      deltaX = -step;
      break;
    default:
      return;
  }

  event.preventDefault();
  cropper.panBy(deltaX, deltaY);
}

/**
 * API for cropping the image and returning the cropped image as a Blob.
 */
async function cropImage(): Promise<CropResult | null> {
  if (loading.value) {
    emit('error', 'Image is not ready to crop.');
    return null;
  }

  try {
    const result = await cropper.cropImage({
      outputSize: props.outputSize,
      mimeType: props.mimeType,
      quality: props.quality,
    });
    return result;
  } catch {
    emit('error', 'Failed to export the cropped image.');
    return null;
  }
}

defineExpose({
  cropImage,
  getCropState: () => ({
    imageX: cropper.imageX,
    imageY: cropper.imageY,
    anchorSourceX: cropper.anchorSourceX,
    anchorSourceY: cropper.anchorSourceY,
    viewportImage: { ...cropper.viewportImage },
    viewportWidth: cropper.viewportWidth,
    viewportHeight: cropper.viewportHeight,
    cropSize: cropper.viewportCrop.size,
    position: { ...cropper.getPositionPercent() },
    zoom: cropper.zoom,
    sourceW: cropper.sourceWidth,
    sourceH: cropper.sourceHeight,
    displayScale: cropper.display.scale,
    displayW: cropper.display.width,
    displayH: cropper.display.height,
    ...cropper.imagePositionBounds,
  }),
});
</script>

<template>
  <div :class="rootClass" v-bind="attrs">
    <div
      ref="viewportRef"
      :class="viewportClass"
      role="application"
      tabindex="0"
      :aria-label="ariaLabel"
      :style="{
        position: 'relative',
        overflow: 'hidden',
        touchAction: 'none',
        userSelect: 'none',
        outline: 'none',
        cursor: 'move',
      }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @pointerleave="onPointerLeave"
      @wheel="onWheel"
      @keydown="onViewportKeydown"
    >
      <div
        :class="stageClass"
        aria-hidden="true"
        :style="{ position: 'absolute', inset: '0', overflow: 'hidden' }"
      >
        <div :class="imageLayerClass" :style="imageLayerStyle">
          <img
            v-if="cropper.displayUrl"
            :class="imageClass"
            :src="cropper.displayUrl"
            aria-hidden="true"
            :style="{
              display: 'block',
              width: '100%',
              height: '100%',
              maxWidth: 'none',
              pointerEvents: 'none',
              userSelect: 'none',
            }"
          />
        </div>

        <div
          :class="maskClass"
          :style="{
            position: 'absolute',
            left: `${cropper.viewportCrop.x}px`,
            top: `${cropper.viewportCrop.y}px`,
            width: `${cropper.viewportCrop.size}px`,
            height: `${cropper.viewportCrop.size}px`,
            borderRadius: '50%',
            pointerEvents: 'none',
          }"
        />
        <div
          :class="ringClass"
          :style="{
            position: 'absolute',
            left: `${cropper.viewportCrop.x}px`,
            top: `${cropper.viewportCrop.y}px`,
            width: `${cropper.viewportCrop.size}px`,
            height: `${cropper.viewportCrop.size}px`,
            borderRadius: '50%',
            pointerEvents: 'none',
          }"
        />
      </div>
    </div>
  </div>
</template>
