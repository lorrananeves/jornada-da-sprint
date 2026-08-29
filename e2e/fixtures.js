/**
 * E2E helpers — fixtures e utilitários compartilhados entre os testes.
 *
 * Estratégia de sessão:
 *   1. smPage abre a home. O app inicializa sem usuário autenticado.
 *   2. smPage clica "COMEÇAR JORNADA".
 *      startNewSession() chama signInAnon() internamente, garantindo smUid != null
 *      antes de gravar a sessão no Firestore.
 *   3. Preenche o setup mínimo e chega ao Lobby — isso cria a sessão no Firestore.
 *   4. A fixture confirma via REST que o Firestore tem currentPhase='lobby',
 *      garantindo que o membro não carregue um snapshot antigo.
 *   5. memberPage abre /?s={id} — a sessão já existe, o store seta _guestAutoJoin=true
 *      e vai direto para o lobby de espera sem exibir roleSelect.
 *
 * Isso reflete o fluxo real: SM cria a sessão e compartilha o link.
 */

import { test as base, expect } from '@playwright/test';

const PROJECT_ID = 'demo-project';

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
    // ── SM: abre o app e cria a sessão ────────────────────────────────────────
    const smContext = await browser.newContext();
    const smPage    = await smContext.newPage();

    // Captura logs de erro do SM para diagnóstico
    const smConsoleLogs = [];
    smPage.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        smConsoleLogs.push(`[${msg.type()}] ${msg.text()}`);
      }
    });
    smPage.on('pageerror', (err) => {
      smConsoleLogs.push(`[pageerror] ${err.message}`);
    });

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

    // Aguarda que o Firestore confirme o estado de lobby antes de o membro abrir.
    // O setScalarState é fire-and-forget (não awaita o saveSession), então
    // waitForSelector('#btn-start-retro') pode ser satisfeito localmente antes
    // de o write chegar ao emulador. Sem esse guard, o membro pode carregar
    // o snapshot antigo (currentPhase = 'setup') do Firestore.
    //
    // Estratégia: polling na REST API do emulador até o documento confirmar lobby.
    // Aguarda até 20s (40 × 500ms).
    const firestoreUrl =
      `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents/sessions/${sessionId}`;
    let firestorePhase = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const res  = await fetch(firestoreUrl).catch(() => null);
      const body = res?.ok ? await res.json().catch(() => null) : null;
      firestorePhase = body?.fields?.currentPhase?.stringValue ?? null;
      if (firestorePhase === 'lobby') break;
      await new Promise((r) => setTimeout(r, 500));
    }

    if (firestorePhase !== 'lobby') {
      // Diagnóstico: despeja o estado do SM para entender por que o write falhou
      const smHtml = await smPage.locator('#screen-root').innerHTML().catch(() => '(sem #screen-root)');
      const smState = await smPage.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('jornada_sprint_session') || 'null'); } catch { return null; }
      }).catch(() => null);
      console.log('[DIAG fixture] Firestore não confirmou lobby após 20s. fase atual:', firestorePhase);
      console.log('[DIAG fixture] smPage HTML:', smHtml.slice(0, 1000));
      console.log('[DIAG fixture] smPage state:', JSON.stringify({
        currentPhase: smState?.currentPhase,
        smDeviceId: smState?.smDeviceId,
        smUid: smState?.smUid,
      }));
      console.log('[DIAG fixture] smPage logs:', smConsoleLogs.join('\n'));
    }

    // ── Membro: entra na sessão já criada ─────────────────────────────────────
    const memberContext = await browser.newContext();
    const memberPage    = await memberContext.newPage();

    // Captura logs e erros do membro ANTES do goto para não perder mensagens do bootstrap
    const memberConsoleLogs = [];
    memberPage.on('console', (msg) => {
      memberConsoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });
    memberPage.on('pageerror', (err) => {
      memberConsoleLogs.push(`[pageerror] ${err.message}`);
    });

    await memberPage.goto(`/?s=${sessionId}`);
    await waitForApp(memberPage);

    // Com ?s= na URL e sessão existente, o store seta _guestAutoJoin=true e vai
    // direto para o lobby de espera sem exibir roleSelect.
    // Aguarda o texto de espera aparecer — pode demorar mais no CI.
    try {
      await memberPage.waitForSelector('.lobby-title-wait', { timeout: 40_000 });
    } catch (e) {
      // Dump diagnóstico: HTML visível + logs do console
      const html = await memberPage.locator('#screen-root').innerHTML().catch(() => '(sem #screen-root)');
      const storeState = await memberPage.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('jornada_sprint_session') || 'null'); } catch { return null; }
      }).catch(() => null);
      console.log('[DIAG] memberPage HTML no timeout:\n', html.slice(0, 2000));
      console.log('[DIAG] memberPage localStorage state:', JSON.stringify(storeState, null, 2));
      console.log('[DIAG] memberPage console logs:\n', memberConsoleLogs.join('\n'));
      throw e;
    }

    await use({ smPage, memberPage, sessionId });

    await smContext.close();
    await memberContext.close();
  },
});

export { expect };
