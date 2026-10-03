import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const root = import.meta.dirname;

/** Emits manifest.json with the version taken from package.json. */
function manifestPlugin(): Plugin {
  return {
    name: 'extension-manifest',
    generateBundle() {
      const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string };
      const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8')) as Record<string, unknown>;
      manifest.version = pkg.version;
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(manifest, null, 2) });
    },
  };
}

// Builds the popup (HTML entry) and the background service worker (ES module).
// The content script is built separately (vite.content.config.ts) because
// content scripts must be classic, self-contained scripts.
export default defineConfig(({ mode }) => ({
  plugins: [react(), manifestPlugin()],
  build: {
    outDir: 'dist',
    // In watch mode the two builds share dist/; scripts/dev.mjs clears it once instead.
    emptyOutDir: mode !== 'development',
    sourcemap: mode === 'development' ? 'inline' : false,
    minify: mode !== 'development',
    target: 'chrome116',
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: resolve(root, 'index.html'),
        background: resolve(root, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
}));
