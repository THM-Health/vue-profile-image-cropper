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
  shallowRef,
  useAttrs,
  watch,
} from 'vue'
import {
  clampOffset,
  getCenteredOffset,
  getCoverScale,
  getCropOrigin,
  getCropPositionPercent,
  getDisplaySize,
  getSourceCropRect,
  reanchorOffsetAfterZoom,
} from '../cropMath'

export interface CropResult {
  blob: Blob
  dataURL: string
}

export interface CropPosition {
  /** 0 at left limit, 100 at right limit. `null` when X cannot be panned. */
  x: number | null
  /** 0 at top limit, 100 at bottom limit. `null` when Y cannot be panned. */
  y: number | null
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    /** Source image file (required; parent should mount only when available). */
    image: File
    /** Controlled zoom level (parent-owned). */
    zoom: number
    /** Pixel size of the exported square image. */
    outputSize?: number
    /** MIME type for canvas export. */
    mimeType?: string
    /** JPEG/WebP quality when applicable (0–1). */
    quality?: number
    /** Keyboard nudge distance in CSS pixels per arrow key press. */
    keyboardStep?: number
    /** Extra nudge when Shift is held. */
    keyboardStepLarge?: number
    /** Accessible label for the crop viewport. */
    ariaLabel?: string
    rootClass?: string
    viewportClass?: string
    stageClass?: string
    imageLayerClass?: string
    imageClass?: string
    maskClass?: string
    ringClass?: string
  }>(),
  {
    outputSize: 512,
    mimeType: 'image/jpeg',
    quality: 0.92,
    keyboardStep: 8,
    keyboardStepLarge: 32,
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
)

const emit = defineEmits<{
  /** Fired when the image has loaded and the cropper is ready for interaction. */
  ready: []
  crop: [result: CropResult]
  error: [message: string]
  /** Fired when the relative crop position changes (0–100 on each axis). */
  position: [position: CropPosition]
}>()

const attrs = useAttrs()

const viewportRef = ref<HTMLElement | null>(null)
const imageLayerRef = ref<HTMLElement | null>(null)

const displayUrl = ref<string | null>(null)
const imageEl = shallowRef<HTMLImageElement | null>(null)
const sourceW = ref(0)
const sourceH = ref(0)
const loadToken = ref(0)
/** Tracks which load has already emitted `ready` (avoids duplicates on resize). */
const readyEmittedForToken = ref(0)
const ready = computed(() => imageEl.value !== null && sourceW.value > 0)

const viewportWidth = ref(0)
const viewportHeight = ref(0)
const offsetX = ref(0)
const offsetY = ref(0)

const coverScale = computed(() =>
  getCoverScale(sourceW.value, sourceH.value, viewportWidth.value, viewportHeight.value),
)

const display = computed(() =>
  getDisplaySize(sourceW.value, sourceH.value, coverScale.value, props.zoom),
)
const displayScale = computed(() => display.value.scale)
const displayW = computed(() => display.value.width)
const displayH = computed(() => display.value.height)
const cropOrigin = computed(() => getCropOrigin(viewportWidth.value, viewportHeight.value))
const cropPosition = computed(() =>
  getCropPositionPercent(
    offsetX.value,
    offsetY.value,
    viewportWidth.value,
    viewportHeight.value,
    displayW.value,
    displayH.value,
  ),
)

function clampOffsets(): void {
  const next = clampOffset(
    offsetX.value,
    offsetY.value,
    viewportWidth.value,
    viewportHeight.value,
    displayW.value,
    displayH.value,
  )
  offsetX.value = next.x
  offsetY.value = next.y
}

function centerImage(): void {
  const next = getCenteredOffset(
    viewportWidth.value,
    viewportHeight.value,
    displayW.value,
    displayH.value,
  )
  offsetX.value = next.x
  offsetY.value = next.y
}

function reanchorAfterZoom(prevZoom: number, nextZoom: number): void {
  const next = reanchorOffsetAfterZoom(
    offsetX.value,
    offsetY.value,
    viewportWidth.value,
    viewportHeight.value,
    prevZoom,
    nextZoom,
    displayW.value,
    displayH.value,
  )
  offsetX.value = next.x
  offsetY.value = next.y
}

function applyImageTransform(): void {
  const el = imageLayerRef.value
  if (!el) return
  el.style.width = `${displayW.value}px`
  el.style.height = `${displayH.value}px`
  el.style.transform = `translate(${offsetX.value}px, ${offsetY.value}px)`
}

watch([offsetX, offsetY, displayW, displayH], () => {
  applyImageTransform()
})

watch(
  cropPosition,
  (position) => {
    if (!ready.value || viewportWidth.value <= 0 || viewportHeight.value <= 0) return
    emit('position', { x: position.x, y: position.y })
  },
  { deep: true },
)

watch(
  () => props.zoom,
  (next, prev) => {
    if (!ready.value || prev === undefined || prev === next) return
    // Reanchor before the display-size watch paints with a stale offset.
    reanchorAfterZoom(prev, next)
    applyImageTransform()
  },
)

function revokeDisplayUrl(): void {
  if (displayUrl.value) {
    URL.revokeObjectURL(displayUrl.value)
    displayUrl.value = null
  }
}

function resetState(): void {
  revokeDisplayUrl()
  imageEl.value = null
  sourceW.value = 0
  sourceH.value = 0
  offsetX.value = 0
  offsetY.value = 0
  viewportWidth.value = 0
  viewportHeight.value = 0
}

function emitReadyIfNeeded(): void {
  if (!ready.value || viewportWidth.value <= 0 || viewportHeight.value <= 0) return
  if (readyEmittedForToken.value === loadToken.value) return
  readyEmittedForToken.value = loadToken.value
  emit('ready')
}

async function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.decoding = 'async'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Failed to load image.'))
    img.src = url
  })
  return img
}

/**
 * Decode the file into a display/export bitmap with consistent orientation.
 * Browsers may apply EXIF orientation to <img> but not to canvas.drawImage;
 * baking orientation up-front keeps the selection and export aligned.
 */
async function normalizeImageFile(
  file: File,
): Promise<{ url: string; img: HTMLImageElement; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        bitmap.close()
        throw new Error('Canvas is not available in this browser.')
      }
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()

      const blob = await canvasToBlob(canvas, 'image/png', 1)
      const url = URL.createObjectURL(blob)
      const img = await loadHtmlImage(url)
      return { url, img, width: canvas.width, height: canvas.height }
    } catch {
      // Fall through to the plain object-URL path.
    }
  }

  const url = URL.createObjectURL(file)
  const img = await loadHtmlImage(url)
  return { url, img, width: img.naturalWidth, height: img.naturalHeight }
}

async function loadImage(file: File): Promise<void> {
  const token = ++loadToken.value

  try {
    const normalized = await normalizeImageFile(file)
    if (token !== loadToken.value) {
      URL.revokeObjectURL(normalized.url)
      return
    }

    revokeDisplayUrl()
    displayUrl.value = normalized.url
    imageEl.value = normalized.img
    sourceW.value = normalized.width
    sourceH.value = normalized.height

    await nextTick()
    measureViewport()
    centerImage()
    applyImageTransform()
    emitReadyIfNeeded()
  } catch {
    if (token === loadToken.value) {
      emit('error', 'Failed to load image.')
    }
  }
}

watch(
  () => props.image,
  (file) => {
    void loadImage(file)
  },
  { immediate: true },
)

let resizeObserver: ResizeObserver | null = null

function measureViewport(): void {
  const el = viewportRef.value
  if (!el) return
  // Use the laid-out content box; avoid flooring so export matches the visible area.
  const width = el.clientWidth
  const height = el.clientHeight
  if (width <= 0 || height <= 0) return

  const prevW = viewportWidth.value
  const prevH = viewportHeight.value
  viewportWidth.value = width
  viewportHeight.value = height

  if (!ready.value) return

  if (prevW > 0 && prevH > 0 && (prevW !== width || prevH !== height)) {
    offsetX.value *= width / prevW
    offsetY.value *= height / prevH
    clampOffsets()
  } else if (prevW === 0 || prevH === 0) {
    centerImage()
  } else {
    clampOffsets()
  }

  emitReadyIfNeeded()
}

onMounted(() => {
  measureViewport()
  if (viewportRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => measureViewport())
    resizeObserver.observe(viewportRef.value)
  } else {
    window.addEventListener('resize', measureViewport)
  }
})

onBeforeUnmount(() => {
  loadToken.value += 1
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', measureViewport)
  endPointerDrag()
  resetState()
})

const isDragging = ref(false)
const dragPointerId = ref<number | null>(null)
let dragStartX = 0
let dragStartY = 0
let dragOriginOffsetX = 0
let dragOriginOffsetY = 0

function onPointerDown(event: PointerEvent): void {
  if (!ready.value || event.button !== 0) return
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  isDragging.value = true
  dragPointerId.value = event.pointerId
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragOriginOffsetX = offsetX.value
  dragOriginOffsetY = offsetY.value
}

function onPointerMove(event: PointerEvent): void {
  if (!isDragging.value || event.pointerId !== dragPointerId.value) return
  offsetX.value = dragOriginOffsetX + (event.clientX - dragStartX)
  offsetY.value = dragOriginOffsetY + (event.clientY - dragStartY)
  clampOffsets()
}

function endPointerDrag(event?: PointerEvent): void {
  if (event && dragPointerId.value !== null && event.pointerId !== dragPointerId.value) {
    return
  }
  isDragging.value = false
  dragPointerId.value = null
}

function onPointerUp(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture?.(event.pointerId)) {
    target.releasePointerCapture(event.pointerId)
  }
  endPointerDrag(event)
}

function onPointerCancel(event: PointerEvent): void {
  endPointerDrag(event)
}

function onViewportKeydown(event: KeyboardEvent): void {
  if (!ready.value) return

  const step = event.shiftKey ? props.keyboardStepLarge : props.keyboardStep

  let handled = true
  switch (event.key) {
    case 'ArrowUp':
      offsetY.value += step
      break
    case 'ArrowDown':
      offsetY.value -= step
      break
    case 'ArrowLeft':
      offsetX.value += step
      break
    case 'ArrowRight':
      offsetX.value -= step
      break
    default:
      handled = false
  }

  if (handled) {
    event.preventDefault()
    clampOffsets()
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas export failed.'))
      },
      type,
      quality,
    )
  })
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Failed to read cropped image.'))
    reader.readAsDataURL(blob)
  })
}

async function cropImage(): Promise<CropResult | null> {
  const img = imageEl.value
  if (!img || !viewportWidth.value || !viewportHeight.value || !displayScale.value) {
    emit('error', 'Image is not ready to crop.')
    return null
  }

  const scale = displayScale.value
  const rect = getSourceCropRect(
    offsetX.value,
    offsetY.value,
    viewportWidth.value,
    viewportHeight.value,
    scale,
    sourceW.value,
    sourceH.value,
  )

  const out = Math.max(1, Math.round(props.outputSize))
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    emit('error', 'Canvas is not available in this browser.')
    return null
  }

  // Prefer nearest-neighbor when not resampling so export matches on-screen pixels.
  ctx.imageSmoothingEnabled = Math.abs(rect.size - out) > 0.01
  ctx.imageSmoothingQuality = 'high'
  if (props.mimeType === 'image/jpeg' || props.mimeType === 'image/webp') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out, out)
  } else {
    ctx.clearRect(0, 0, out, out)
  }
  ctx.drawImage(img, rect.x, rect.y, rect.size, rect.size, 0, 0, out, out)

  try {
    const blob = await canvasToBlob(canvas, props.mimeType, props.quality)
    const dataURL = await blobToDataURL(blob)
    const result: CropResult = { blob, dataURL }
    emit('crop', result)
    return result
  } catch {
    emit('error', 'Failed to export the cropped image.')
    return null
  }
}

defineExpose({
  cropImage,
  remeasure: measureViewport,
  getCropState: () => ({
    offsetX: offsetX.value,
    offsetY: offsetY.value,
    viewportWidth: viewportWidth.value,
    viewportHeight: viewportHeight.value,
    cropSize: cropOrigin.value.size,
    position: { ...cropPosition.value },
    zoom: props.zoom,
    sourceW: sourceW.value,
    sourceH: sourceH.value,
    displayScale: displayScale.value,
    displayW: displayW.value,
    displayH: displayH.value,
  }),
})
</script>

<template>
  <div :class="rootClass" v-bind="attrs">
    <div
      ref="viewportRef"
      :class="viewportClass"
      role="application"
      tabindex="0"
      :aria-label="ariaLabel"
      :data-dragging="isDragging ? 'true' : 'false'"
      :style="{
        position: 'relative',
        overflow: 'hidden',
        touchAction: 'none',
        userSelect: 'none',
        outline: 'none',
        cursor: isDragging ? 'grabbing' : 'grab',
      }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @keydown="onViewportKeydown"
    >
      <div
        :class="stageClass"
        aria-hidden="true"
        :style="{ position: 'absolute', inset: '0', overflow: 'hidden' }"
      >
        <div
          ref="imageLayerRef"
          :class="imageLayerClass"
          :style="{
            position: 'absolute',
            top: '0',
            left: '0',
            transformOrigin: '0 0',
            willChange: 'transform',
          }"
        >
          <img
            v-if="displayUrl"
            :class="imageClass"
            :src="displayUrl"
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
            left: `${cropOrigin.x}px`,
            top: `${cropOrigin.y}px`,
            width: `${cropOrigin.size}px`,
            height: `${cropOrigin.size}px`,
            borderRadius: '50%',
            pointerEvents: 'none',
          }"
        />
        <div
          :class="ringClass"
          :style="{
            position: 'absolute',
            left: `${cropOrigin.x}px`,
            top: `${cropOrigin.y}px`,
            width: `${cropOrigin.size}px`,
            height: `${cropOrigin.size}px`,
            borderRadius: '50%',
            pointerEvents: 'none',
          }"
        />
      </div>
    </div>
  </div>
</template>
