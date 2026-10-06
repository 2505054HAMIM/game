import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build works from any folder or GitHub Pages.
  base: './',
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
