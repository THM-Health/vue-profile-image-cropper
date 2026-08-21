/**
 * Component tests for ProfileImageCropper.
 * Image decoding / canvas are mocked; focus is mount, export, and keyboard pan.
 */
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import ProfileImageCropper from './ProfileImageCropper.vue';

/** Minimal valid 1×1 PNG (pixel size is overridden by createImageBitmap mock). */
const TINY_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (char) => char.charCodeAt(0),
);

function createImageFile(name = 'portrait.png'): File {
  return new File([TINY_PNG], name, { type: 'image/png' });
}

/** Stub bitmap decode + canvas so tests do not depend on real image decoding. */
function mockImagePipeline(width = 120, height = 180): void {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({
      width,
      height,
      close: vi.fn(),
    })),
  );

  HTMLCanvasElement.prototype.getContext = vi.fn(() => {
    return {
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      fillStyle: '',
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.toBlob = function toBlob(callback: BlobCallback, type?: string) {
    callback(new Blob(['cropped'], { type: type ?? 'image/jpeg' }));
  };
}

type CropperExpose = {
  cropImage: () => Promise<{ blob: Blob } | null>;
};

async function mountCropper(
  props: Record<string, unknown> = {},
  viewportSize = { width: 200, height: 200 },
): Promise<VueWrapper> {
  const wrapper = mount(ProfileImageCropper, {
    props: {
      image: createImageFile(),
      zoom: 1,
      ...props,
    },
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

  await flushPromises();
  await nextTick();
  return wrapper;
}

describe('ProfileImageCropper', () => {
  beforeEach(() => {
    mockImagePipeline();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the viewport, preview image, and finishes loading', async () => {
    const wrapper = await mountCropper({ viewportClass: 'test-viewport' });
    const viewport = wrapper.get('[role="application"]');

    expect(viewport.classes()).toContain('test-viewport');
    expect(wrapper.find('img').exists()).toBe(true);
    expect(wrapper.emitted('loading')?.at(-1)?.[0]).toBe(false);

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

    wrapper.unmount();
  });

  it('pans the image layer when arrow keys are pressed', async () => {
    // Default mock is a portrait source → vertical pan is available at zoom 1
    const wrapper = await mountCropper({ keyboardStep: 10 });

    const viewport = wrapper.get('[role="application"]');
    const layer = wrapper.get('div[style*="will-change"]').element as HTMLElement;
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
    const layer = wrapper.get('div[style*="will-change"]').element as HTMLElement;
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
