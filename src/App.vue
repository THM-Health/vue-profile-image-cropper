<script setup lang="ts">
import { computed, ref } from 'vue'
import ProfileImageCropper, { type CropResult } from './components/ProfileImageCropper.vue'

const MIN_ZOOM = 1
const MAX_ZOOM = 3

const fileInputRef = ref<HTMLInputElement | null>(null)
const cropperRef = ref<InstanceType<typeof ProfileImageCropper> | null>(null)

const selectedImage = ref<File | null>(null)
const zoom = ref(MIN_ZOOM)
const isCropping = ref(false)

const previewUrl = ref<string | null>(null)
const croppedBlob = ref<Blob | null>(null)
const statusMessage = ref('')
const errorMessage = ref('')

const hasImage = computed(() => selectedImage.value !== null)

const outputSize = 512
const mimeType = 'image/png'
const quality = 1
const keyboardStep = 8
const rootClass = 'w-full max-w-md'
const viewportClass =
  'h-[200px] w-full max-h-[200px] rounded-xl border border-slate-300 bg-slate-100 focus-visible:shadow-[0_0_0_3px_#fff,0_0_0_6px_#2563eb]'

function openFilePicker(): void {
  fileInputRef.value?.click()
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  input.value = ''

  if (!file) return

  if (!file.type.startsWith('image/')) {
    errorMessage.value = 'Please choose an image file.'
    statusMessage.value = ''
    return
  }

  selectedImage.value = file
  zoom.value = MIN_ZOOM
  errorMessage.value = ''
  statusMessage.value = ''

  if (previewUrl.value?.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl.value)
  }
  previewUrl.value = null
  croppedBlob.value = null
}

function clearSelectedImage(): void {
  selectedImage.value = null
  zoom.value = MIN_ZOOM
  if (previewUrl.value?.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl.value)
  }
  previewUrl.value = null
  croppedBlob.value = null
  statusMessage.value = ''
  errorMessage.value = ''
}

function onZoomInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function onCrop(result: CropResult): void {
  if (previewUrl.value?.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl.value)
  }
  previewUrl.value = URL.createObjectURL(result.blob)
  croppedBlob.value = result.blob
  errorMessage.value = ''
  statusMessage.value = `Cropped square image (${result.blob.type}, ${result.blob.size} bytes).`
}

function onError(message: string): void {
  errorMessage.value = message
  statusMessage.value = ''
}

async function onCropClick(): Promise<void> {
  if (!cropperRef.value || isCropping.value || !hasImage.value) return
  isCropping.value = true
  try {
    await cropperRef.value.cropImage()
  } finally {
    isCropping.value = false
  }
}

async function downloadCropped(): Promise<void> {
  if (!croppedBlob.value) return
  const url = URL.createObjectURL(croppedBlob.value)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'profile-image.png'
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div
    class="min-h-screen bg-slate-50 bg-[radial-gradient(ellipse_80%_50%_at_10%_0%,#ccfbf1_0%,transparent_55%),radial-gradient(ellipse_70%_45%_at_100%_10%,#e0e7ff_0%,transparent_50%)] px-[clamp(1rem,3vw,2rem)] py-[clamp(1rem,3vw,2rem)] text-slate-900"
  >
    <header class="mx-auto mb-7 max-w-4xl">
      <h1 class="m-0 mb-1 text-[clamp(1.5rem,2.5vw,2rem)] tracking-tight">Profile image cropper</h1>
      <p class="m-0 text-[0.95rem] text-slate-600">
        Unstyled Vue 3 cropper · parent-owned controls · Tailwind classes
      </p>
    </header>

    <main
      class="mx-auto grid max-w-4xl grid-cols-1 items-start gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
    >
      <section
        class="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgb(15_23_42_/_0.04)]"
        aria-labelledby="cropper-heading"
      >
        <h2 id="cropper-heading" class="mb-4 mt-0 text-base font-bold">Crop</h2>

        <div class="mb-4 flex flex-wrap gap-2">
          <input
            ref="fileInputRef"
            class="sr-only"
            type="file"
            accept="image/*"
            aria-label="Choose a profile image"
            @change="onFileChange"
          />

          <button
            type="button"
            class="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-[0.9375rem] font-semibold text-slate-900 hover:border-slate-400 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            @click="openFilePicker"
          >
            {{ selectedImage ? 'Change image' : 'Choose image' }}
          </button>

          <button
            v-if="selectedImage"
            type="button"
            class="cursor-pointer rounded-lg border border-transparent bg-transparent px-4 py-2.5 text-[0.9375rem] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            @click="clearSelectedImage"
          >
            Clear
          </button>
        </div>

        <div
          v-if="!selectedImage"
          class="grid h-[200px] w-full max-h-[200px] max-w-md place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-100 p-6 text-center text-[0.95rem] leading-snug text-slate-500"
        >
          Select an image to crop your profile photo
        </div>

        <ProfileImageCropper
          v-else
          ref="cropperRef"
          :zoom="zoom"
          :image="selectedImage"
          :output-size="outputSize"
          :mime-type="mimeType"
          :quality="quality"
          :keyboard-step="keyboardStep"
          :root-class="rootClass"
          :viewport-class="viewportClass"
          mask-class="shadow-[0_0_0_9999px_rgb(17_24_39_/_0.55)]"
          ring-class="border-2 border-white shadow-[inset_0_0_0_1px_rgb(17_24_39_/_0.35)]"
          @crop="onCrop"
          @error="onError"
        />

        <div class="mt-4 flex flex-col gap-3.5">
          <div class="flex flex-col gap-1.5">
            <label
              class="flex items-baseline justify-between text-sm font-semibold"
              for="profile-zoom"
            >
              Zoom
              <span class="font-medium tabular-nums text-slate-500"> {{ zoom.toFixed(2) }}× </span>
            </label>
            <input
              id="profile-zoom"
              class="w-full accent-teal-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              type="range"
              :min="MIN_ZOOM"
              :max="MAX_ZOOM"
              step="0.01"
              :value="zoom"
              :disabled="!hasImage"
              :aria-valuemin="MIN_ZOOM"
              :aria-valuemax="MAX_ZOOM"
              :aria-valuenow="Number(zoom.toFixed(2))"
              :aria-valuetext="`${zoom.toFixed(2)} times`"
              aria-describedby="profile-zoom-hint"
              @input="onZoomInput"
            />
            <p id="profile-zoom-hint" class="m-0 text-[0.8rem] leading-snug text-slate-500">
              Drag the image or use arrow keys to reposition. Zoom from {{ MIN_ZOOM }}× to
              {{ MAX_ZOOM }}×.
            </p>
          </div>

          <button
            type="button"
            class="w-full cursor-pointer rounded-lg border border-transparent bg-teal-700 px-4 py-2.5 text-[0.9375rem] font-semibold text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            :disabled="!hasImage || isCropping"
            :aria-busy="isCropping"
            @click="onCropClick"
          >
            {{ isCropping ? 'Cropping…' : 'Crop' }}
          </button>
        </div>
      </section>

      <section
        class="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgb(15_23_42_/_0.04)]"
        aria-labelledby="preview-heading"
      >
        <h2 id="preview-heading" class="mb-4 mt-0 text-base font-bold">Result</h2>

        <p
          v-if="errorMessage"
          class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
          role="alert"
        >
          {{ errorMessage }}
        </p>
        <p
          v-else-if="statusMessage"
          class="mb-4 text-sm leading-snug"
          role="status"
          aria-live="polite"
        >
          {{ statusMessage }}
        </p>
        <p v-else class="mb-4 text-sm leading-snug text-slate-500">
          The Crop button exports a square rectangular image. The circular mask is visual only and
          is not baked into the result.
        </p>

        <div class="mb-4 grid grid-cols-2 gap-4">
          <figure class="m-0">
            <figcaption class="mb-2 text-xs font-semibold text-slate-600">Square export</figcaption>
            <div
              class="grid aspect-square w-full place-items-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-100"
            >
              <img
                data-test="cropped-image"
                v-if="previewUrl"
                class="block size-full object-cover"
                :src="previewUrl"
                alt="Cropped square profile image"
              />
              <span v-else class="p-2 text-center text-xs text-slate-400">No crop yet</span>
            </div>
          </figure>

          <figure class="m-0">
            <figcaption class="mb-2 text-xs font-semibold text-slate-600">
              As a circular avatar
            </figcaption>
            <div
              class="grid aspect-square w-full place-items-center overflow-hidden rounded-full border border-dashed border-slate-300 bg-slate-100"
            >
              <img
                v-if="previewUrl"
                class="block size-full object-cover"
                :src="previewUrl"
                alt="Cropped image shown in a circular avatar frame"
              />
              <span v-else class="p-2 text-center text-xs text-slate-400">No crop yet</span>
            </div>
          </figure>
        </div>

        <button
          type="button"
          class="w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          :disabled="!croppedBlob"
          @click="downloadCropped"
        >
          Download cropped image
        </button>
      </section>
    </main>
  </div>
</template>

<style>
.accuracy-viewport {
  box-sizing: content-box;
  width: 200px !important;
  height: 200px !important;
  aspect-ratio: auto !important;
}
</style>
