import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Content scripts injected via chrome.scripting cannot be ES modules, so this
// produces a single self-contained IIFE file.
export default defineConfig(({ mode }) => ({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: mode === 'development' ? 'inline' : false,
    minify: mode !== 'development',
    target: 'chrome116',
    lib: {
      entry: resolve(import.meta.dirname, 'src/content/dribbble-content-script.ts'),
      formats: ['iife'],
      name: 'DribbbleAIAssistantContent',
      fileName: () => 'content.js',
    },
    rollupOptions: { output: { extend: true } },
  },
}));
