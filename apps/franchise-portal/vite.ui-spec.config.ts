import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// A separate entry and output keep fixtures out of the production CRM bundle.
export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: 'dist-ui-spec',
    rollupOptions: { input: 'ui-spec.html' },
  },
});
