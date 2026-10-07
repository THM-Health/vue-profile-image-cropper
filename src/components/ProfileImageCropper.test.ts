/**
 * Component tests for ProfileImageCropper.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { imageSize } from 'image-size';
import { nextTick } from 'vue';
import ProfileImageCropper from './ProfileImageCropper.vue';

const SQUARE_IMAGE = 'profile.png';
const LANDSCAPE_IMAGE = 'profile-landscape.png';
const PORTRAIT_IMAGE = 'profile-portrait.png';

async function createImageFile(fixture: string): Promise<HTMLImageElement> {
  const bytes = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), `../../cypress/fixtures/${fixture}`),
  );
  const dataUrl = `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to decode fixture image.'));
    image.src = dataUrl;
  });
}

type CropperExpose = {
  cropImage: () => Promise<{ blob: Blob } | null>;
};

async function mountCropper(
  props: Record<string, unknown> = {},
  viewportSize = { width: 200, height: 200 },
  attrs: Record<string, unknown> = {},
  fixture: string = SQUARE_IMAGE,
  waitUntilReady: boolean = true,
): Promise<VueWrapper> {
  const wrapper = mount(ProfileImageCropper, {
    props: {
      image: await createImageFile(fixture),
      zoom: 1,
      ...props,
    },
    attrs,
    attachTo: document.body,
  });

  const viewport = wrapper.get('[role="application"]');
  Object.defineProperty(viewport.element, 'clientWidth', {
    configurable: true,
    value: viewportSize.width,
  });
  Object.defineProperty(viewport.element, 'clientHeight', {
    configurable: true,
    value: viewportSize.height,
  });

  if (waitUntilReady) {
    while (wrapper.emitted('loading')?.at(-1)?.[0] !== false) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  return wrapper;
}

describe('ProfileImageCropper', () => {
  it('renders the viewport, preview image, and finishes loading', async () => {
    const wrapper = await mountCropper({}, { width: 200, height: 200 }, { class: 'test-viewport' });
    const viewport = wrapper.get('[role="application"]');

    expect(viewport.classes()).toContain('test-viewport');
    expect(wrapper.find('img').exists()).toBe(true);
    expect(wrapper.emitted('loading')?.at(-1)?.[0]).toBe(false);

    wrapper.unmount();
  });

  it('emits error when image fails to load', async () => {
    const wrapper = await mountCropper({ image: new Image() });
    const error = wrapper.emitted('error')?.at(-1)?.[0] as Error;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Failed to create image bitmap.');
    wrapper.unmount();
  });

  it('exposes cropImage() that returns a square blob', async () => {
    const wrapper = await mountCropper({
      outputSize: 64,
      mimeType: 'image/png',
    });

    const result = await (wrapper.vm as unknown as CropperExpose).cropImage();

    expect(result).not.toBeNull();
    expect(result?.blob).toBeInstanceOf(Blob);
    expect(result?.blob.type).toBe('image/png');

    const dimensions = imageSize(new Uint8Array(await result!.blob.arrayBuffer()));
    expect(dimensions.width).toBe(64);
    expect(dimensions.height).toBe(64);

    wrapper.unmount();
  });

  it('throws error when cropImage() is called before cropper is ready', async () => {
    const wrapper = await mountCropper(
      {
        outputSize: 64,
        mimeType: 'image/png',
      },
      { width: 0, height: 100 },
      { class: 'test-viewport' },
      SQUARE_IMAGE,
      false,
    );

    const cropExpose = wrapper.vm as unknown as CropperExpose;

    await expect(cropExpose.cropImage()).rejects.toThrow('Image is not ready to crop.');

    wrapper.unmount();
  });

  it('throws error when cropImage() is not ready due to viewport width = 0', async () => {
    const wrapper = await mountCropper(
      {
        outputSize: 64,
        mimeType: 'image/png',
      },
      { width: 0, height: 100 },
      { class: 'test-viewport' },
    );

    const cropExpose = wrapper.vm as unknown as CropperExpose;

    await expect(cropExpose.cropImage()).rejects.toThrow('Image is not ready to crop.');

    wrapper.unmount();
  });

  it('throws error when cropImage() is not ready due to viewport height = 0', async () => {
    const wrapper = await mountCropper(
      {
        outputSize: 64,
        mimeType: 'image/png',
      },
      { width: 100, height: 0 },
      { class: 'test-viewport' },
    );

    const cropExpose = wrapper.vm as unknown as CropperExpose;

    await expect(cropExpose.cropImage()).rejects.toThrow('Image is not ready to crop.');

    wrapper.unmount();
  });

  describe('emits position', () => {
    it('emits null on axes that cannot pan', async () => {
      const square = await mountCropper({ zoom: 1 });
      expect(square.emitted('position')?.at(-1)?.[0]).toEqual({ x: null, y: null });
      square.unmount();

      const landscape = await mountCropper(
        { zoom: 1 },
        { width: 200, height: 200 },
        {},
        LANDSCAPE_IMAGE,
      );
      expect(landscape.emitted('position')?.at(-1)?.[0]).toEqual({ x: 50, y: null });
      landscape.unmount();

      const portrait = await mountCropper(
        { zoom: 1 },
        { width: 200, height: 200 },
        {},
        PORTRAIT_IMAGE,
      );
      expect(portrait.emitted('position')?.at(-1)?.[0]).toEqual({ x: null, y: 50 });
      portrait.unmount();
    });

    it('updates position when zooming and panning', async () => {
      const wrapper = await mountCropper({
        zoom: 1,
        keyboardStep: 10,
        minZoom: 1,
        maxZoom: 3,
        zoomStep: 1,
      });
      const viewport = wrapper.get('[role="application"]');

      expect(wrapper.emitted('position')?.at(-1)?.[0]).toEqual({ x: null, y: null });

      await viewport.trigger('wheel', { deltaY: -100 });
      await wrapper.setProps({ zoom: 2 });
      await nextTick();
      expect(wrapper.emitted('position')?.at(-1)?.[0]).toEqual({ x: 50, y: 50 });

      await viewport.trigger('keydown', { key: 'ArrowLeft' });
      await viewport.trigger('keydown', { key: 'ArrowLeft' });
      await viewport.trigger('keydown', { key: 'ArrowUp' });
      await nextTick();
      expect(wrapper.emitted('position')?.at(-1)?.[0]).toEqual({ x: 40, y: 45 });

      wrapper.unmount();
    });
  });

  it('pans the image layer when arrow keys are pressed', async () => {
    const wrapper = await mountCropper({ zoom: 2, keyboardStep: 10 });

    const viewport = wrapper.get('[role="application"]');
    const layer = wrapper.get('img[style*="will-change"]').element as HTMLElement;
    const before = layer.style.transform;

    await viewport.trigger('keydown', { key: 'ArrowUp' });
    await nextTick();

    expect(layer.style.transform).not.toBe(before);

    wrapper.unmount();
  });

  it('emits update:zoom when + / − keys are pressed', async () => {
    const wrapper = await mountCropper({
      zoom: 1.5,
      minZoom: 1,
      maxZoom: 3,
      zoomStep: 0.1,
    });
    const viewport = wrapper.get('[role="application"]');

    await viewport.trigger('keydown', { key: '+' });
    expect(wrapper.emitted('update:zoom')?.at(-1)?.[0]).toBe(1.6);

    await wrapper.setProps({ zoom: 1.6 });
    await viewport.trigger('keydown', { key: '-' });
    expect(wrapper.emitted('update:zoom')?.at(-1)?.[0]).toBe(1.5);

    wrapper.unmount();
  });

  it('emits update:zoom on mouse wheel and clamps to maxZoom', async () => {
    const wrapper = await mountCropper({
      zoom: 2.95,
      minZoom: 1,
      maxZoom: 3,
      zoomStep: 0.1,
    });
    const viewport = wrapper.get('[role="application"]');

    await viewport.trigger('wheel', { deltaY: -100 });
    expect(wrapper.emitted('update:zoom')?.at(-1)?.[0]).toBe(3);

    await wrapper.setProps({ zoom: 3 });
    await viewport.trigger('wheel', { deltaY: -100 });
    // Already at max — no additional emit
    expect(wrapper.emitted('update:zoom')).toHaveLength(1);

    wrapper.unmount();
  });

  it('ignores pointer, wheel, and keyboard input when disabled', async () => {
    const wrapper = await mountCropper({
      disabled: true,
      keyboardStep: 10,
      minZoom: 1,
      maxZoom: 3,
      zoomStep: 0.1,
    });
    const viewport = wrapper.get('[role="application"]');
    const layer = wrapper.get('img[style*="will-change"]').element as HTMLElement;
    const before = layer.style.transform;

    expect(viewport.attributes('aria-disabled')).toBe('true');
    expect(viewport.attributes('tabindex')).toBe('-1');

    await viewport.trigger('keydown', { key: 'ArrowUp' });
    await viewport.trigger('keydown', { key: '+' });
    await viewport.trigger('wheel', { deltaY: -100 });
    await viewport.trigger('pointerdown', { button: 0, clientX: 10, clientY: 10 });
    await viewport.trigger('pointermove', { button: 0, clientX: 40, clientY: 10 });
    await nextTick();

    expect(layer.style.transform).toBe(before);
    expect(wrapper.emitted('update:zoom')).toBeUndefined();

    wrapper.unmount();
  });
});
