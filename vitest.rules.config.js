/**
 * Configuração do Vitest para a suite de testes de Firestore Rules.
 *
 * Rodada separadamente de `npm test` porque requer o emulador Firebase:
 *   npm run emulator   (em outro terminal)
 *   npm run test:rules
 *
 * Usa o ambiente Node (não jsdom) — os testes interagem diretamente com o
 * SDK do Firestore Admin sem precisar de DOM.
 */
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'node',
    include:     ['rules/rules.test.js'],
    // Sem clearMocks global — os testes de Rules não usam vi.mock
    clearMocks: false,
    // Timeout generoso: cada teste faz I/O real com o emulador
    testTimeout: 10_000,
    hookTimeout: 30_000,
  },
});
