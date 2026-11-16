import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The build is a single self-contained index.html so it can be opened from
// disk, hosted anywhere, or published as one page.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
