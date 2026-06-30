import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Cross-origin isolation enables SharedArrayBuffer, which wasm threads will
// need later. Keeping it on from day one so nothing assumes its absence.
// The React/Tailwind plugins must not strip these — crossOriginIsolated
// stays true (verified by the S0 stack-setup slice).
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
});
