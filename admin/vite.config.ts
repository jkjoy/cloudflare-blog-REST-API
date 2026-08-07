import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/_cfblog/admin/',
  plugins: [vue()],
  build: {
    outDir: fileURLToPath(new URL('../public/_cfblog/admin', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/admin.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) =>
          assetInfo.names.some((name) => name.endsWith('.css'))
            ? 'assets/admin.css'
            : 'assets/[name][extname]',
      },
    },
  },
});
