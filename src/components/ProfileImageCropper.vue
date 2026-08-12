<script setup lang="ts">
/**
 * ProfileImageCropper — unstyled Vue 3 crop viewport.
 *
 * Pure Vue + native browser APIs (Canvas, Pointer Events).
 * Assumes a File `image` is provided on mount. Parent owns zoom bounds,
 * file selection, and action controls. Style via class props.
 */

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

const props = withDefaults(
  defineProps<{
    /** Source image file (required; fixed for the lifetime of the component). */
    image: File;
    /** Controlled zoom level (parent-owned). */
    zoom: number;
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
    outputSize: 512,
    mimeType: 'image/jpeg',
    quality: 0.92,
    keyboardStep: 8,
    ariaLabel:
      'Image crop area. Drag or use arrow keys to reposition the image under the circular mask.',
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
  transform: `translate(${cropper.viewportOffset.x}px, ${cropper.viewportOffset.y}px)`,
  transformOrigin: '0 0',
  willChange: 'transform',
}));

watch(
  loading,
  (next) => {
    emit('loading', next);
  },
  { immediate: true },
);

watch(
  () => props.zoom,
  (next, prev) => {
    if (loading.value || prev === undefined || prev === next) return;
    cropper.setZoom(next);
  },
  { flush: 'sync' },
);

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
    cropper.setZoom(props.zoom);
    loading.value = false;

    await nextTick();
    measureViewport();
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

  // Calculate delta and move the image by the delta
  const deltaX = event.clientX - lastPointerX;
  const deltaY = event.clientY - lastPointerY;
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

function onViewportKeydown(event: KeyboardEvent): void {
  if (loading.value) return;

  const step = props.keyboardStep;

  let deltaX = 0;
  let deltaY = 0;
  switch (event.key) {
    case 'ArrowUp':
      deltaY = step;
      break;
    case 'ArrowDown':
      deltaY = -step;
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

  // Move the image by the delta
  event.preventDefault();
  cropper.panBy(deltaX, deltaY);
}

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
    viewportOffset: { ...cropper.viewportOffset },
    viewportWidth: cropper.viewportWidth,
    viewportHeight: cropper.viewportHeight,
    cropSize: cropper.cropPlacement.size,
    position: { ...cropper.getPositionPercent() },
    zoom: cropper.zoom,
    sourceW: cropper.sourceWidth,
    sourceH: cropper.sourceHeight,
    displayScale: cropper.display.scale,
    displayW: cropper.display.width,
    displayH: cropper.display.height,
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
            left: `${cropper.cropPlacement.x}px`,
            top: `${cropper.cropPlacement.y}px`,
            width: `${cropper.cropPlacement.size}px`,
            height: `${cropper.cropPlacement.size}px`,
            borderRadius: '50%',
            pointerEvents: 'none',
          }"
        />
        <div
          :class="ringClass"
          :style="{
            position: 'absolute',
            left: `${cropper.cropPlacement.x}px`,
            top: `${cropper.cropPlacement.y}px`,
            width: `${cropper.cropPlacement.size}px`,
            height: `${cropper.cropPlacement.size}px`,
            borderRadius: '50%',
            pointerEvents: 'none',
          }"
        />
      </div>
    </div>
  </div>
</template>
