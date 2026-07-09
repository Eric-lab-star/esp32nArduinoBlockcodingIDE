import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages 등 하위 경로 배포를 위해 상대 경로 사용
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
