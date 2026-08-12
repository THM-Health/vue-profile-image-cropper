import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const isLib = mode === 'lib';

  if (isLib) {
    return {
      plugins: [
        vue(),
        dts({
          include: [
            'src/index.ts',
            'src/imageCropper.ts',
            'src/components/ProfileImageCropper.vue',
          ],
          outDirs: ['dist'],
          tsconfigPath: './tsconfig.app.json',
        }),
      ],
      build: {
        copyPublicDir: false,
        lib: {
          entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
          name: 'VueProfileImageCropper',
          formats: ['es'],
          fileName: 'vue-profile-image-cropper',
        },
        rollupOptions: {
          external: ['vue'],
          output: {
            globals: {
              vue: 'Vue',
            },
          },
        },
      },
    };
  }

  const basePath = process.env.BASE_PATH;
  const base = basePath ? (basePath.endsWith('/') ? basePath : `${basePath}/`) : '/';

  return {
    base,
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    },
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        include: ['src/imageCropper.ts', 'src/components/ProfileImageCropper.vue'],
      },
    },
  };
});
