/**
 * E2E helpers — fixtures e utilitários compartilhados entre os testes.
 *
 * `twoParticipants` abre dois contextos de browser independentes (cookies, storage
 * e service workers isolados) navegando para a mesma URL de sessão, simulando um
 * Scrum Master e um membro do time em dispositivos distintos.
 */

import { test as base, expect } from '@playwright/test';

/**
 * Gera um ID de sessão de 32 chars hex — mesmo formato que o app usa.
 */
export function generateSessionId() {
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

/**
 * Aguarda o app renderizar (qualquer tela) e garante que não estamos
 * na tela de erro de configuração.
 */
async function waitForApp(page) {
  // Espera o #screen-root ter algum conteúdo renderizado
  await page.waitForSelector('#screen-root > *', { timeout: 15_000 });
  // Garante que não caímos na tela de erro do Firebase
  const errorText = page.getByText(/variáveis de ambiente ausentes|erro ao iniciar/i);
  const hasError = await errorText.isVisible().catch(() => false);
  if (hasError) {
    throw new Error('App renderizou tela de erro do Firebase — emulador não configurado corretamente.');
  }
}

/**
 * Navega até a tela de seleção de papel.
 * O fluxo é: home → clicar "COMEÇAR JORNADA" → roleSelect.
 * Se já estiver em roleSelect (URL com ?s= pode ir direto), apenas aguarda.
 */
async function goToRoleSelect(page) {
  await waitForApp(page);
  // Se a tela de início estiver visível, clica para avançar
  const startBtn = page.getByRole('button', { name: /começar jornada/i });
  if (await startBtn.isVisible().catch(() => false)) {
    await startBtn.click();
  }
  // Aguarda os botões de papel aparecerem
  await page.waitForSelector('#btn-sm', { timeout: 10_000 });
}

/**
 * Fixture `twoParticipants`:
 *   - smPage     → contexto do Scrum Master
 *   - memberPage → contexto do membro do time
 *   - sessionId  → ID da sessão compartilhada
 *
 * Ambas as páginas apontam para /?s={sessionId} em contextos isolados,
 * e já chegam à tela de seleção de papel prontas para interação.
 */
export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  twoParticipants: async ({ browser }, use) => {
    const sessionId = generateSessionId();
    const sessionUrl = `/?s=${sessionId}`;

    const smContext     = await browser.newContext();
    const memberContext = await browser.newContext();

    const smPage     = await smContext.newPage();
    const memberPage = await memberContext.newPage();

    await smPage.goto(sessionUrl);
    await memberPage.goto(sessionUrl);

    // Avança ambas as páginas até roleSelect antes de entregar a fixture
    await Promise.all([
      goToRoleSelect(smPage),
      goToRoleSelect(memberPage),
    ]);

    await use({ smPage, memberPage, sessionId, sessionUrl });

    await smContext.close();
    await memberContext.close();
  },
});

export { expect };
