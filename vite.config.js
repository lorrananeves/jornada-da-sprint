import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  test: {
    environment: 'jsdom',
    // Limpa mocks entre testes automaticamente
    clearMocks: true,
    // Cobertura via v8 — sem instrumentação de código
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'src/state/**', 'src/utils/**'],
      exclude: ['src/services/firebase.js', 'src/services/presence.js'],
    },
  },
});
