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
 * Fixture `twoParticipants`:
 *   - smPage    → contexto do Scrum Master (abre primeiro, escolhe papel SM)
 *   - memberPage → contexto do membro do time (abre depois, escolhe papel Team)
 *   - sessionId  → ID da sessão compartilhada
 *
 * Ambas as páginas apontam para /?s={sessionId}, mas em contextos de browser
 * diferentes (sem estado compartilhado — cookies, localStorage, etc. isolados).
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

    await use({ smPage, memberPage, sessionId, sessionUrl });

    await smContext.close();
    await memberContext.close();
  },
});

export { expect };
