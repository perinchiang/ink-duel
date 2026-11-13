import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5190, strictPort: true, host: '0.0.0.0' },
  preview: { port: 5191, host: '0.0.0.0' },
  build: { target: 'es2022' },
});
