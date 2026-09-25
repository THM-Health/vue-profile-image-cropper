# Vue 3 Profile Image Cropper

Minimal unstyled, accessible profile-image cropper for **Vue.js 3** with zero-runtime dependencies and small in size (< 12kB).

## Install

```bash
npm install @thm-health/vue-profile-image-cropper
```

Peer dependency: `vue@^3.4`.

```ts
import { ProfileImageCropper, type CropResult } from '@thm-health/vue-profile-image-cropper';
```

## Usage

Mount only when a `File` is available. Own zoom bounds and controls in the parent.
Use `v-model:zoom` with optional `minZoom` / `maxZoom` / `zoomStep` for wheel and `+`/`−` zoom.
The classes in this example are Tailwind CSS.

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { ProfileImageCropper, type CropResult } from '@thm-health/vue-profile-image-cropper';

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const cropperRef = ref<InstanceType<typeof ProfileImageCropper> | null>(null);
const selectedImage = ref<File | null>(null);
const zoom = ref(MIN_ZOOM);

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  selectedImage.value = input.files?.[0] ?? null;
  zoom.value = MIN_ZOOM;
  input.value = '';
}

async function onCropClick() {
  const result = await cropperRef.value?.cropImage();
  if (result) {
    // result.blob
  }
}

function onLoading(loading: boolean) {
  // disable controls while loading
}
</script>

<template>
  <input type="file" accept="image/*" @change="onFileChange" />

  <ProfileImageCropper
    v-if="selectedImage"
    ref="cropperRef"
    v-model:zoom="zoom"
    :min-zoom="MIN_ZOOM"
    :max-zoom="MAX_ZOOM"
    :image="selectedImage"
    aria-label="Image crop area. Drag to reposition, scroll or press +/− to zoom, arrow keys to nudge."
    class="h-[200px] w-full max-h-[200px] max-w-md rounded-xl border bg-slate-100"
    mask-class="rounded-full shadow-[0_0_0_9999px_rgb(17_24_39_/_0.55)]"
    ring-class="rounded-full border-2 border-white"
    @loading="onLoading"
  />

  <input
    type="range"
    :min="MIN_ZOOM"
    :max="MAX_ZOOM"
    step="0.1"
    v-model.number="zoom"
    :disabled="!selectedImage"
  />

  <button type="button" :disabled="!selectedImage" @click="onCropClick">Crop</button>
</template>
```

### Props

| Name           | Type      | Default        | Required | Description                                                                                |
| -------------- | --------- | -------------- | -------- | ------------------------------------------------------------------------------------------ |
| `image`        | `File`    | —              | yes      | Source image. Fixed for the component lifetime — remount (e.g. `:key`) to load a new file. |
| `zoom`         | `number`  | —              | yes      | Zoom multiplier via `v-model:zoom` (typically `≥ 1`).                                      |
| `minZoom`      | `number`  | `1`            | no       | Lower bound for wheel / `+` `−` zoom.                                                      |
| `maxZoom`      | `number`  | `Infinity`     | no       | Upper bound for wheel / `+` `−` zoom.                                                      |
| `zoomStep`     | `number`  | `0.1`          | no       | Zoom delta per wheel tick or `+` / `−` key.                                                |
| `outputSize`   | `number`  | `512`          | no       | Edge length in pixels of the exported square image.                                        |
| `mimeType`     | `string`  | `'image/jpeg'` | no       | MIME type used for canvas export (`image/jpeg`, `image/png`, `image/webp`).                |
| `quality`      | `number`  | `0.92`         | no       | Encoder quality for JPEG/WebP (`0`–`1`). Ignored for PNG.                                  |
| `keyboardStep` | `number`  | `8`            | no       | Arrow-key nudge distance in CSS pixels.                                                    |
| `disabled`     | `boolean` | `false`        | no       | Disables pointer, wheel, and keyboard interactions on the viewport.                        |
| `maskClass`    | `string`  | —              | no       | Class(es) on the crop-square mask. `rounded-full` shows it as a circle.                    |
| `ringClass`    | `string`  | —              | no       | Class(es) on the crop-square outline. `rounded-full` draws a circle.                       |

### Events

| Name       | Type           | Description                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loading`  | `boolean`      | Fired when decode/load state changes (`true` while loading, then `false`).                                                                                                                                                                                                                                                                                                                                      |
| `error`    | `string`       | Fired when loading or cropping fails; payload is an error message.                                                                                                                                                                                                                                                                                                                                              |
| `position` | `CropPosition` | Relative position of the crop square on the image (`x`/`y` 0–100, or `null` if that axis cannot pan, as it covers the whole image width or height). x=0: Crop square is at the left edge of the image, x=100: Crop square is at the right edge; y=0: Crop square is at the top of the image, y=100: Crop square is at the bottom of the image. Can be used to announce the position for assistive technologies. |

#### Example providing feedback on crop position for screen readers

```ts
function cropAriaLabel(pos: CropPosition): string {
  if (pos.x === null && pos.y === null) {
    return 'Crop fills the image. Zoom in to reposition.';
  }
  if (pos.x === null) {
    return `Vertical position ${Math.round(pos.y)} percent. Horizontal position fixed.`;
  }
  if (pos.y === null) {
    return `Horizontal position ${Math.round(pos.x)} percent. Vertical position fixed.`;
  }
  return `Horizontal ${Math.round(pos.x)} percent, vertical ${Math.round(pos.y)} percent.`;
}
```

### Exposed methods

| Name                                         | Description                                                                                                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cropImage() => Promise<CropResult \| null>` | Exports the current crop; emits `error` on failure. Returns `null` on failure. `CropResult`: `{ blob: Blob }` — use `URL.createObjectURL(result.blob)` for previews. |
| `getCropState() => object`                   | Snapshot including `position` (`x`/`y` 0–100), offsets, viewport W/H, crop size.                                                                                     |

### Styling

The cropper has no size of its own. Set a height and width with `class`, or it is not visible. `mask-class` dims the area outside the crop square, and `ring-class` draws its edge. The classes below are Tailwind CSS.

```vue
<ProfileImageCropper
  class="h-[200px] w-full max-h-[200px] border"
  mask-class="shadow-[0_0_0_9999px_rgb(0_0_0_/_0.55)]"
  ring-class="border-2 border-white"
/>
```

#### Circle

`cropImage()` always exports a square image. To show the crop square as a circle, set `border-radius: 50%` on the mask and ring (Tailwind: `rounded-full`). That CSS changes only the overlay.

```vue
<ProfileImageCropper
  class="h-[200px] w-full max-h-[200px] border"
  mask-class="rounded-full shadow-[0_0_0_9999px_rgb(0_0_0_/_0.55)]"
  ring-class="rounded-full border-2 border-white"
/>
```

## Development

```bash
npm install
npm run dev         # demo app
npm run build       # library bundle + types → dist/
npm run build:demo  # demo production build
npm run lint
npm run format
npm run test        # Vitest unit tests
npm run test:e2e    # Cypress against the demo (upload, zoom, pan, crop, debug)
npm run check       # typecheck + lint + format + unit + lib build
```

## License

MIT
