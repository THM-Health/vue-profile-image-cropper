import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import ProfileImageCropper from './ProfileImageCropper.vue';

/** Minimal valid 1×1 PNG. Dimensions are mocked on HTMLImageElement. */
const TINY_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (char) => char.charCodeAt(0),
);

function createImageFile(name = 'portrait.png'): File {
  return new File([TINY_PNG], name, { type: 'image/png' });
}

function mockImageLoad(width = 120, height = 180) {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({
      width,
      height,
      close: vi.fn(),
    })),
  );

  Object.defineProperty(globalThis.Image.prototype, 'src', {
    configurable: true,
    set(this: HTMLImageElement, value: string) {
      this.setAttribute('src', value);
      Object.defineProperty(this, 'naturalWidth', { configurable: true, value: width });
      Object.defineProperty(this, 'naturalHeight', { configurable: true, value: height });
      queueMicrotask(() => this.onload?.(new Event('load')));
    },
    get(this: HTMLImageElement) {
      return this.getAttribute('src');
    },
  });

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
    callback(new Blob(['preview'], { type: type ?? 'image/jpeg' }));
  };
}

describe('ProfileImageCropper', () => {
  beforeEach(() => {
    mockImageLoad();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders an accessible crop viewport', async () => {
    const file = createImageFile();
    const zoom = ref(1);

    const wrapper = mount(ProfileImageCropper, {
      props: {
        image: file,
        zoom: zoom.value,
        viewportClass: 'test-viewport',
      },
      attachTo: document.body,
    });

    const viewport = wrapper.get('[role="application"]');
    Object.defineProperty(viewport.element, 'clientWidth', { value: 200 });
    Object.defineProperty(viewport.element, 'clientHeight', { value: 200 });

    await flushPromises();
    await nextTick();

    expect(viewport.classes()).toContain('test-viewport');
    expect(wrapper.find('img').exists()).toBe(true);
    expect(wrapper.emitted('loading')?.at(-1)?.[0]).toBe(false);

    wrapper.unmount();
  });

  it('exports a square crop result', async () => {
    const file = createImageFile();

    const wrapper = mount(ProfileImageCropper, {
      props: {
        image: file,
        zoom: 1,
        outputSize: 64,
        mimeType: 'image/png',
      },
      attachTo: document.body,
    });

    const viewport = wrapper.get('[role="application"]');
    Object.defineProperty(viewport.element, 'clientWidth', { value: 200 });
    Object.defineProperty(viewport.element, 'clientHeight', { value: 200 });

    await flushPromises();
    await nextTick();

    const result = await (
      wrapper.vm as unknown as {
        cropImage: () => Promise<{ blob: Blob } | null>;
      }
    ).cropImage();

    expect(result).not.toBeNull();
    expect(result?.blob).toBeInstanceOf(Blob);

    wrapper.unmount();
  });

  it('moves the image with arrow keys', async () => {
    const file = createImageFile();

    const wrapper = mount(ProfileImageCropper, {
      props: {
        image: file,
        zoom: 1,
        keyboardStep: 10,
      },
      attachTo: document.body,
    });

    const viewport = wrapper.get('[role="application"]');
    Object.defineProperty(viewport.element, 'clientWidth', { value: 200 });
    Object.defineProperty(viewport.element, 'clientHeight', { value: 200 });

    await flushPromises();
    await nextTick();

    const layer = wrapper.get('div[style*="will-change"]').element as HTMLElement;
    const before = layer.style.transform;

    await viewport.trigger('keydown', { key: 'ArrowUp' });
    await nextTick();

    expect(layer.style.transform).not.toBe(before);

    wrapper.unmount();
  });
});
