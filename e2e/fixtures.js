/**
 * E2E helpers — fixtures e utilitários compartilhados entre os testes.
 *
 * Estratégia de sessão:
 *   1. smPage abre a home, clica "COMEÇAR JORNADA", escolhe SM.
 *   2. Como o SM ainda não está autenticado, cai na tela de auth.
 *      O fixture cria uma conta via formulário no emulador de Auth.
 *   3. Após login, o SM vai ao dashboard → clica "Nova Retrospectiva" → setup.
 *   4. Preenche o setup mínimo e chega ao Lobby — isso cria a sessão no Firestore.
 *   5. A fixture captura o ?s= da URL do smPage.
 *   6. memberPage abre /?s={id} — a sessão já existe, o store vai direto
 *      para roleSelect sem precisar de login.
 *
 * Isso reflete o fluxo real: SM cria a sessão e compartilha o link.
 */

import { test as base, expect } from '@playwright/test';

// Credenciais do SM nos testes E2E — podem ser sobrescritas por variáveis de ambiente.
// O emulador de Auth é limpo a cada execução do CI, portanto qualquer valor serve.
const E2E_EMAIL    = process.env.E2E_SM_EMAIL    ?? 'sm-e2e@test.local';
const E2E_PASSWORD = process.env.E2E_SM_PASSWORD ?? 'emulator-only-pw';
const E2E_NAME     = process.env.E2E_SM_NAME     ?? 'SM E2E';

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
 * Passa pela tela de auth: tenta criar a conta (signup); se o e-mail já existir
 * (segunda tentativa do retry do CI), faz login normalmente.
 */
async function authenticateSM(page) {
  // Aguarda a tela de auth aparecer
  await page.waitForSelector('#auth-email', { timeout: 15_000 });

  // Tenta signup primeiro
  const toggleBtn = page.locator('#btn-toggle-mode');
  const isLogin = await toggleBtn.innerText().then((t) => /criar/i.test(t)).catch(() => false);
  if (isLogin) {
    // Já está no modo login — muda para signup
    await toggleBtn.click();
    await page.waitForSelector('#auth-name', { timeout: 5_000 });
  }

  // Preenche o formulário de cadastro
  const nameField = page.locator('#auth-name');
  if (await nameField.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await nameField.fill(E2E_NAME);
  }
  await page.locator('#auth-email').fill(E2E_EMAIL);
  await page.locator('#auth-password').fill(E2E_PASSWORD);
  await page.locator('#btn-email-auth').click();

  // Se aparecer erro de "e-mail já em uso", troca para login
  const errorEl = page.locator('#auth-error');
  const hasError = await errorEl.isVisible({ timeout: 3_000 }).catch(() => false);
  if (hasError) {
    const errorText = await errorEl.innerText().catch(() => '');
    if (/já está em uso/i.test(errorText)) {
      // Muda para login
      await page.locator('#btn-toggle-mode').click();
      await page.locator('#auth-email').fill(E2E_EMAIL);
      await page.locator('#auth-password').fill(E2E_PASSWORD);
      await page.locator('#btn-email-auth').click();
    }
  }

  // Aguarda chegar ao dashboard do SM
  await page.waitForSelector('#btn-new-retro', { timeout: 15_000 });
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

    // Aguarda a tela de seleção de papel
    await smPage.waitForSelector('#btn-sm', { timeout: 10_000 });

    // Escolhe papel SM → vai para tela de auth (login/cadastro)
    await smPage.locator('#btn-sm').click();

    // Autentica no emulador de Auth (cria conta ou faz login)
    await authenticateSM(smPage);

    // No dashboard: clica "Nova Retrospectiva" → vai para setup
    await smPage.locator('#btn-new-retro').click();
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

    // Sessão existe → store vai para roleSelect automaticamente.
    // Pode demorar mais no CI: primeiro request do Firestore num contexto fresh.
    await memberPage.waitForSelector('#btn-team', { timeout: 40_000 });

    await use({ smPage, memberPage, sessionId });

    await smContext.close();
    await memberContext.close();
  },
});

export { expect };
