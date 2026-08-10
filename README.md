# Vue 3 Circular Profile Image Cropper

Minimal unstyled, accessible profile-image cropper for **Vue.js 3** with zero-runtime dependencies and small in size (< 10kB).

## Install

```bash
npm install @thm-health/vue-profile-image-cropper
```

Peer dependency: `vue@^3.4`.

```ts
import { ProfileImageCropper, type CropResult } from '@thm-health/vue-profile-image-cropper'
```

## Usage

Mount only when a `File` is available. Own zoom bounds and controls in the parent.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { ProfileImageCropper, type CropResult } from '@thm-health/vue-profile-image-cropper'

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const cropperRef = ref<InstanceType<typeof ProfileImageCropper> | null>(null)
const selectedImage = ref<File | null>(null)
const zoom = ref(MIN_ZOOM)

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  selectedImage.value = input.files?.[0] ?? null
  zoom.value = MIN_ZOOM
  input.value = ''
}

async function onCropClick() {
  await cropperRef.value?.cropImage()
}

function onCrop(result: CropResult) {
  // result.blob | result.dataURL
}
</script>

<template>
  <input type="file" accept="image/*" @change="onFileChange" />

  <ProfileImageCropper
    v-if="selectedImage"
    ref="cropperRef"
    :zoom="zoom"
    :image="selectedImage"
    root-class="w-full max-w-md"
    viewport-class="aspect-square w-full rounded-xl border bg-slate-100"
    mask-class="shadow-[0_0_0_9999px_rgb(17_24_39_/_0.55)]"
    ring-class="border-2 border-white"
    @crop="onCrop"
  />

  <input
    type="range"
    :min="MIN_ZOOM"
    :max="MAX_ZOOM"
    step="0.01"
    v-model.number="zoom"
    :disabled="!selectedImage"
  />

  <button type="button" :disabled="!selectedImage" @click="onCropClick">Crop</button>
</template>
```

### Props

| Name                | Type     | Default                                                                                      | Required | Description                                                                 |
| ------------------- | -------- | -------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| `image`             | `File`   | —                                                                                            | yes      | Source image. Mount the component only when a file is available.            |
| `zoom`              | `number` | —                                                                                            | yes      | Controlled zoom multiplier (parent-owned; typically `≥ 1`).                 |
| `outputSize`        | `number` | `512`                                                                                        | no       | Edge length in pixels of the exported square image.                         |
| `mimeType`          | `string` | `'image/jpeg'`                                                                               | no       | MIME type used for canvas export (`image/jpeg`, `image/png`, `image/webp`). |
| `quality`           | `number` | `0.92`                                                                                       | no       | Encoder quality for JPEG/WebP (`0`–`1`). Ignored for PNG.                   |
| `keyboardStep`      | `number` | `8`                                                                                          | no       | Arrow-key nudge distance in CSS pixels.                                     |
| `keyboardStepLarge` | `number` | `32`                                                                                         | no       | Arrow-key nudge distance when Shift is held.                                |
| `ariaLabel`         | `string` | `'Image crop area. Drag or use arrow keys to reposition the image under the circular mask.'` | no       | Accessible label for the crop viewport.                                     |
| `rootClass`         | `string` | —                                                                                            | no       | Class(es) on the root element.                                              |
| `viewportClass`     | `string` | —                                                                                            | no       | Class(es) on the square viewport.                                           |
| `stageClass`        | `string` | —                                                                                            | no       | Class(es) on the stage that clips the image.                                |
| `imageLayerClass`   | `string` | —                                                                                            | no       | Class(es) on the positioned image layer.                                    |
| `imageClass`        | `string` | —                                                                                            | no       | Class(es) on the `<img>`.                                                   |
| `maskClass`         | `string` | —                                                                                            | no       | Class(es) on the circular mask overlay.                                     |
| `ringClass`         | `string` | —                                                                                            | no       | Class(es) on the circular ring outline.                                     |

### Events

| Name    | Type         | Default | Required | Description                                                        |
| ------- | ------------ | ------- | -------- | ------------------------------------------------------------------ |
| `ready` | —            | —       | no       | Image has loaded and the cropper is ready for interaction.         |
| `crop`  | `CropResult` | —       | no       | Fired after a successful crop (`cropImage()` or equivalent).       |
| `error` | `string`     | —       | no       | Fired when loading or cropping fails; payload is an error message. |

`CropResult`: `{ blob: Blob; dataURL: string }`

### Exposed methods

Call via template ref:

| Name           | Signature                           | Description                                                                       |
| -------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| `cropImage`    | `() => Promise<CropResult \| null>` | Exports the current crop; also emits `crop` / `error`. Returns `null` on failure. |
| `remeasure`    | `() => void`                        | Re-reads viewport size (useful after layout changes).                             |
| `getCropState` | `() => object`                      | Snapshot of offsets, viewport size, zoom, source/display dimensions.              |

## Development

```bash
npm install
npm run dev         # demo app
npm run build       # library bundle + types → dist/
npm run build:demo  # demo production build
npm run lint
npm run format
npm run test        # Vitest unit tests (includes crop accuracy pixelmatch)
npm run test:e2e    # Cypress against the demo + accuracy harness
npm run check       # typecheck + lint + format + unit + lib build
```

## License

MIT
