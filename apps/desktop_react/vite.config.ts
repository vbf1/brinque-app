import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'github-pages-spa-fallback',
      generateBundle(_options, bundle) {
        const index = bundle['index.html'];
        if (index?.type === 'asset') {
          this.emitFile({
            type: 'asset',
            fileName: '404.html',
            source: index.source,
          });
        }
      },
    },
  ],
  base: '/kidsloc-app/',
});
