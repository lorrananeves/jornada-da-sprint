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

// Senha fixa para todas as contas E2E — sem valor sensível real (emulador local).
const E2E_PASSWORD = process.env.E2E_SM_PASSWORD ?? 'emulator-only-pw';

/**
 * Gera um e-mail único por invocação para evitar colisão entre testes paralelos
 * ou retries (o emulador de Auth mantém usuários durante toda a execução).
 */
function makeUniqueEmail() {
  return `sm-e2e-${Date.now()}@test.local`;
}

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
 * Passa pela tela de auth: cria uma conta nova com e-mail único e aguarda
 * o redirecionamento automático para o dashboard do SM.
 */
async function authenticateSM(page) {
  // Aguarda a tela de auth aparecer
  await page.waitForSelector('#auth-email', { timeout: 15_000 });

  // A tela começa no modo login; muda para signup
  const toggleBtn = page.locator('#btn-toggle-mode');
  // O botão no modo login diz "Criar agora" — clica para ir ao signup
  const btnText = await toggleBtn.innerText().catch(() => '');
  if (/criar/i.test(btnText)) {
    await toggleBtn.click();
    await page.waitForSelector('#auth-name', { timeout: 5_000 });
  }

  // Preenche e envia o formulário de cadastro
  const nameField = page.locator('#auth-name');
  if (await nameField.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await nameField.fill('SM E2E');
  }
  await page.locator('#auth-email').fill(makeUniqueEmail());
  await page.locator('#auth-password').fill(E2E_PASSWORD);
  await page.locator('#btn-email-auth').click();

  // Aguarda chegar ao dashboard (redirecionamento via onAuthStateChanged → store)
  await page.waitForSelector('#btn-new-retro', { timeout: 20_000 });
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
