import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Preview config — swaps in mock backend so the UI can be reviewed in a browser
// without the Wails/Go runtime.
//
// Usage:
//   npm run preview:chooser   → chooser mode
//   npm run preview:settings  → settings mode
//
// The VITE_PREVIEW_MODE env var is read by the mock to decide which mode to fake.

export default defineConfig({
  resolve: {
    alias: {
      // Replace the real Wails-generated App.js with our mock
      '../wailsjs/go/main/App.js': path.resolve(__dirname, 'wailsjs/go/main/App.mock.js'),
      // Stub out the Wails runtime (not needed in browser)
      '../wailsjs/runtime/runtime.js': path.resolve(__dirname, 'wailsjs/runtime/runtime.mock.js'),
    },
  },
  server: {
    port: 5174,
    open: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html',
    },
  },
});
