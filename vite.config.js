import { resolve } from 'node:path';
import { copyFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { defineConfig } from 'vite';

const root = process.cwd();
const pages = ['popup', 'dashboard', 'options', 'library', 'resources', 'offscreen'];

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'chrome-extension',
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries([
        ...pages.map((page) => [page, resolve(root, `${page}.html`)]),
        ['background', resolve(root, 'background.js')],
        ['content', resolve(root, 'content.js')],
      ]),
      output: {
        entryFileNames: '[name].js',
        assetFileNames: 'assets/[name][extname]',
        chunkFileNames: 'assets/[name].js',
      },
    },
  },
  plugins: [
    {
      name: 'extension-files',
      async closeBundle() {
        await mkdir(resolve(root, 'chrome-extension/icons'), { recursive: true });
        await mkdir(resolve(root, 'chrome-extension/branding'), { recursive: true });
        await copyFile(
          resolve(root, 'manifest.json'),
          resolve(root, 'chrome-extension/manifest.json'),
        );
        await copyFile(
          resolve(root, 'branding/krypton-ultimate-inc-ii.svg'),
          resolve(root, 'chrome-extension/branding/krypton-ultimate-inc-ii.svg'),
        );
        for (const state of ['default', 'detected', 'protected', 'active', 'complete']) {
          const source = resolve(root, `icons/icon-${state}.svg`);
          await copyFile(source, resolve(root, `chrome-extension/icons/icon-${state}.svg`));
          for (const size of [16, 32])
            await sharp(source)
              .resize(size, size)
              .png()
              .toFile(resolve(root, `chrome-extension/icons/icon-${state}-${size}.png`));
        }
        for (const size of [48, 128])
          await sharp(resolve(root, 'icons/icon-default.svg'))
            .resize(size, size)
            .png()
            .toFile(resolve(root, `chrome-extension/icons/icon-${size}.png`));
      },
    },
  ],
});
