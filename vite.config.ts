import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Keep React/shared UI out of the lazy WebGL chunks and their dependency graph.
          includeDependenciesRecursively: false,
          groups: [
            {
              name: 'three-core',
              test: /node_modules[\\/]three[\\/]/,
              priority: 20,
              minSize: 40_000,
              maxSize: 260_000,
            },
            {
              name: 'react-three',
              test: /node_modules[\\/]@react-three[\\/](?:fiber|drei)[\\/]/,
              priority: 15,
              minSize: 40_000,
              maxSize: 260_000,
            },
          ],
        },
      },
    },
  },
});
