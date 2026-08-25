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
    // Exclui testes e2e do Playwright — esses rodam via `npm run test:e2e`
    exclude: ['e2e/**', 'node_modules/**'],
    // Cobertura via v8 — sem instrumentação de código
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'src/state/**', 'src/utils/**'],
      exclude: ['src/services/firebase.js', 'src/services/presence.js'],
    },
  },
});
