/**
 * E2E helpers — fixtures e utilitários compartilhados entre os testes.
 *
 * Estratégia de sessão:
 *   1. smPage abre a home sem ?s=, clica "COMEÇAR JORNADA", escolhe SM,
 *      preenche o setup mínimo e chega ao Lobby — isso cria a sessão no Firestore.
 *   2. A fixture captura o ?s= da URL do smPage.
 *   3. memberPage abre /?s={id} — a sessão já existe, o store vai direto
 *      para roleSelect sem precisar clicar em nada.
 *
 * Isso reflete o fluxo real: SM cria a sessão e compartilha o link.
 */

import { test as base, expect } from '@playwright/test';

/**
 * Aguarda o app renderizar e garante que não estamos na tela de erro.
 */
async function waitForApp(page) {
  await page.waitForSelector('#screen-root > *', { timeout: 20_000 });
  const hasError = await page.getByText(/variáveis de ambiente ausentes|erro ao iniciar/i)
    .isVisible().catch(() => false);
  if (hasError) {
    throw new Error('App renderizou tela de erro — verifique a configuração do emulador.');
  }
}

/**
 * Fixture `twoParticipants`:
 *   - smPage     → SM, já no Lobby após criar a sessão
 *   - memberPage → membro, já no roleSelect da mesma sessão
 *   - sessionId  → ID capturado da URL
 *
 * O SM está no Lobby; o membro está no roleSelect aguardando escolher papel.
 * Os testes podem começar a partir desse estado.
 */
export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  twoParticipants: async ({ browser }, use) => {
    // ── SM: cria a sessão ────────────────────────────────────────────────
    const smContext = await browser.newContext();
    const smPage    = await smContext.newPage();

    await smPage.goto('/');
    await waitForApp(smPage);

    // Clica em COMEÇAR JORNADA — se o app já inseriu ?s= na URL (comportamento
    // normal do getOrCreateSessionId), o modal de confirmação pode aparecer.
    await smPage.locator('#btn-start').click();

    // Confirma o modal caso tenha aparecido
    const confirmBtn = smPage.getByRole('button', { name: /sim, nova jornada/i });
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await smPage.waitForSelector('#btn-sm', { timeout: 10_000 });

    // Escolhe papel SM → vai para setup
    await smPage.locator('#btn-sm').click();
    await smPage.waitForSelector('#sprint-name', { timeout: 10_000 });

    // Preenche o mínimo e cria a sessão no Firestore
    await smPage.locator('#sprint-name').fill('Sprint E2E');
    await smPage.locator('#participant-count').fill('2');
    await smPage.locator('#btn-start-journey').click();

    // Aguarda o Lobby — neste ponto a sessão já existe no Firestore
    await smPage.waitForSelector('#btn-start-retro', { timeout: 15_000 });

    // ── Captura o sessionId da URL ────────────────────────────────────────
    const sessionId = new URL(smPage.url()).searchParams.get('s');
    if (!sessionId) throw new Error('App não gerou ?s= na URL — setup falhou.');

    // ── Membro: entra na sessão já criada ─────────────────────────────────
    const memberContext = await browser.newContext();
    const memberPage    = await memberContext.newPage();

    await memberPage.goto(`/?s=${sessionId}`);
    await waitForApp(memberPage);

    // Sessão existe → store vai para roleSelect automaticamente
    await memberPage.waitForSelector('#btn-team', { timeout: 15_000 });

    await use({ smPage, memberPage, sessionId });

    await smContext.close();
    await memberContext.close();
  },
});

export { expect };
