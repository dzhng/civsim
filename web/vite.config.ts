import { defineConfig } from 'vite';

// Cross-origin isolation enables SharedArrayBuffer, which wasm threads will
// need later. Keeping it on from day one so nothing assumes its absence.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
});
