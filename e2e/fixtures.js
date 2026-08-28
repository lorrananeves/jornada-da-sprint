/**
 * E2E helpers — fixtures e utilitários compartilhados entre os testes.
 *
 * Estratégia de sessão:
 *   1. smPage abre a home, clica "COMEÇAR JORNADA".
 *      O app chama startNewSession() → vai direto para a tela de setup
 *      (sem passar por roleSelect ou auth).
 *   2. Preenche o setup mínimo e chega ao Lobby — isso cria a sessão no Firestore.
 *   3. A fixture captura o ?s= da URL do smPage.
 *   4. memberPage abre /?s={id} — a sessão já existe, o store seta _guestAutoJoin=true
 *      e vai direto para o lobby de espera sem exibir roleSelect.
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
 *   - memberPage → membro, já no Lobby de espera da mesma sessão
 *   - sessionId  → ID capturado da URL
 *
 * O SM está no Lobby com o botão de iniciar; o membro está no Lobby aguardando.
 * Como o membro abre /?s=ID, o store entra direto no lobby sem exibir roleSelect.
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

    // Clica em COMEÇAR JORNADA — se o app já tem ?s= na URL (getOrCreateSessionId),
    // o modal de confirmação pode aparecer.
    await smPage.locator('#btn-start').click();

    // Confirma o modal caso tenha aparecido
    const confirmBtn = smPage.getByRole('button', { name: /sim, nova jornada/i });
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // startNewSession() vai direto para a tela de setup (sem roleSelect/auth)
    await smPage.waitForSelector('#sprint-name', { timeout: 10_000 });

    // Preenche o mínimo e cria a sessão no Firestore
    await smPage.locator('#sprint-name').fill('Sprint E2E');
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

    // Com ?s= na URL e sessão existente, o store seta _guestAutoJoin=true e vai
    // direto para o lobby de espera sem exibir roleSelect.
    // Aguarda o texto de espera aparecer — pode demorar mais no CI.
    await memberPage.waitForSelector('.lobby-title-wait', { timeout: 40_000 });

    await use({ smPage, memberPage, sessionId });

    await smContext.close();
    await memberContext.close();
  },
});

export { expect };
