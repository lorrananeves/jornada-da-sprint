import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Cada teste tem até 30s — o emulador + Vite podem demorar um pouco no CI
  timeout: 30_000,
  // Sem retries em ambiente local; CI usa 1 retry para flakiness de rede
  retries: process.env.CI ? 1 : 0,
  // Roda testes em paralelo mas limita workers no CI para evitar saturação
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: 'http://localhost:4173',
    // Não mostra o browser em CI
    headless: true,
    // Screenshot só em falha
    screenshot: 'only-on-failure',
    // Vídeo só em falha no CI
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Sobe o Vite preview em modo emulador antes de rodar os testes
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_FIREBASE_USE_EMULATOR: 'true',
    },
  },
});
