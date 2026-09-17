/**
 * E2E — fluxo completo de uma sessão com SM + membro do time.
 *
 * A fixture `twoParticipants` entrega:
 *   - smPage     → SM no Lobby (sessão já criada no Firestore)
 *   - memberPage → membro já no Lobby de espera (entrou direto via ?s=)
 *
 * Cenários cobertos:
 *   1. Membro entra no lobby após abrir o link
 *   2. SM inicia retro; membro é redirecionado automaticamente (tempo real)
 *   3. Membro registra check-in; indicador atualiza para o SM (tempo real)
 *   4. SM avança para Tesouros; membro segue automaticamente (tempo real)
 *   5. Membro não vê o botão de avançar fase
 *   6. SM avança para Monstros; membro segue automaticamente (novo fluxo)
 *   7. SM avança para Discussão (sem exigir seleção de monstros)
 *   8. Resultado da Discussão por Monstro
 *   9. SM avança até WorkMonsters; card do monstro pode ser expandido
 *  10. SM registra solução e ação dentro do card do monstro
 */

import { test, expect } from './fixtures.js';

// Helper: confirma que o membro já está no lobby de espera (fixture já garante isso)
async function memberJoin(memberPage) {
  await expect(memberPage.getByText(/aguardando início/i)).toBeVisible({ timeout: 10_000 });
}

// Helper: SM inicia e ambas as páginas chegam ao check-in
async function startRetro(smPage, memberPage) {
  await smPage.locator('#btn-start-retro').click();
  await expect(smPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 10_000 });
  try {
    await expect(memberPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 10_000 });
  } catch (e) {
    const memberHtml = await memberPage.locator('#screen-root').innerHTML().catch(() => '(sem #screen-root)');
    const memberState = await memberPage.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('jornada_sprint_session') || 'null'); } catch { return null; }
    }).catch(() => null);
    console.log('[DIAG startRetro] memberPage HTML:', memberHtml.slice(0, 1500));
    console.log('[DIAG startRetro] memberPage state:', JSON.stringify({
      currentPhase: memberState?.currentPhase,
      retroStarted: memberState?.retroStarted,
      updatedAt: memberState?.updatedAt,
      smDeviceId: memberState?.smDeviceId,
    }));
    throw e;
  }
}

// ── 1. Membro entra no lobby ──────────────────────────────────────────────────

test('Membro entra no lobby ao abrir o link da retrospectiva', async ({ twoParticipants }) => {
  const { memberPage } = twoParticipants;
  await memberJoin(memberPage);
});

// ── 2. SM inicia retro; membro é redirecionado em tempo real ──────────────────

test('SM inicia a retrospectiva e membro é redirecionado automaticamente', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await memberJoin(memberPage);
  await startRetro(smPage, memberPage);
});

// ── 3. Membro registra check-in; indicador atualiza para o SM ────────────────
// participantCount real é capturado do lobby no momento em que o SM inicia a retro.

test('Membro registra check-in e SM vê indicador atualizado em tempo real', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await memberJoin(memberPage);
  await startRetro(smPage, memberPage);

  // Membro registra check-in com nota 4
  await memberPage.locator('.score-btn[data-score="4"]').click();
  await memberPage.locator('#btn-register').click();

  // Aguarda o formulário desaparecer (confirma que o Firestore recebeu)
  await expect(memberPage.locator('.checkin-already-done')).toBeVisible({ timeout: 10_000 });

  // SM vê o indicador de respostas atualizado via subscription em tempo real
  await expect(smPage.getByText(/1 de \d+/i)).toBeVisible({ timeout: 20_000 });
});

// ── 4. SM avança fase; membro segue automaticamente ──────────────────────────

test('SM avança para Tesouros e membro é redirecionado automaticamente', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await memberJoin(memberPage);
  await startRetro(smPage, memberPage);

  // SM avança para Tesouros
  await smPage.locator('#btn-next').click();

  // SM chega imediatamente (navegação local)
  await expect(smPage.getByText(/tesouros da sprint/i)).toBeVisible({ timeout: 10_000 });
  // Membro recebe o redirect via Firestore subscription — pode levar mais tempo no CI
  await expect(memberPage.getByText(/tesouros da sprint/i)).toBeVisible({ timeout: 20_000 });
});

// ── 5. Membro NÃO pode avançar de fase ───────────────────────────────────────

test('Membro do time não vê o botão de avançar fase', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await memberJoin(memberPage);
  await startRetro(smPage, memberPage);

  // Membro não vê o botão de avançar
  await expect(memberPage.locator('#btn-next')).not.toBeVisible();

  // Membro vê a mensagem de espera
  await expect(memberPage.getByText(/aguardando o scrum master/i)).toBeVisible();
});

// ── 6. SM avança para Monstros; membro segue automaticamente ─────────────────

test('SM avança para Monstros e membro é redirecionado automaticamente', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await memberJoin(memberPage);
  await startRetro(smPage, memberPage);

  // SM avança: checkin → treasures → monsters
  await smPage.locator('#btn-next').click();
  await expect(smPage.getByText(/tesouros da sprint/i)).toBeVisible({ timeout: 10_000 });
  await smPage.locator('#btn-next').click();
  await expect(smPage.getByText(/monstros da sprint/i)).toBeVisible({ timeout: 10_000 });

  // Membro segue para monstros em tempo real
  await expect(memberPage.getByText(/monstros da sprint/i)).toBeVisible({ timeout: 20_000 });
});

// ── 7. SM avança para Discussão sem exigir seleção de monstros ───────────────

test('SM avança para Discussão a partir de Monstros (botão sempre habilitado)', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await memberJoin(memberPage);
  await startRetro(smPage, memberPage);

  // Navega até a fase de Monstros
  await smPage.locator('#btn-next').click(); // → tesouros
  await smPage.locator('#btn-next').click(); // → monstros
  await expect(smPage.getByText(/monstros da sprint/i)).toBeVisible({ timeout: 10_000 });

  // Botão deve estar habilitado sem precisar selecionar monstros
  const nextBtn = smPage.locator('#btn-next');
  await expect(nextBtn).toBeEnabled({ timeout: 5_000 });

  // Verifica que o texto do botão indica "Discussão"
  await expect(nextBtn).toContainText(/discussão/i);
});

// ── 8. Resultado da Discussão por Monstro ─────────────────────────────────────

test('SM define Resultado da Discussão; monstro exibe o resultado em tempo real', async ({ twoParticipants }) => {
  const { smPage, memberPage, sessionId } = twoParticipants;

  await memberJoin(memberPage);
  await startRetro(smPage, memberPage);

  // Navega até a fase de Monstros e avança para Discussão
  await smPage.locator('#btn-next').click(); // → tesouros
  await smPage.locator('#btn-next').click(); // → monstros
  await expect(smPage.getByText(/monstros da sprint/i)).toBeVisible({ timeout: 10_000 });

  // SM adiciona um monstro para garantir que haverá algo em discussão
  await smPage.locator('#monster-input').fill('Problema de comunicação');
  await smPage.locator('#btn-add-monster').click();
  await expect(smPage.getByText(/Problema de comunicação/i)).toBeVisible({ timeout: 5_000 });

  // Avança para Discussão
  await smPage.locator('#btn-next').click(); // → discussão
  await expect(smPage.locator('h2.phase-title').getByText(/discussão/i)).toBeVisible({ timeout: 10_000 });

  // SM vê o painel "COMO TERMINAMOS ESSA DISCUSSÃO?"
  await expect(smPage.getByText(/como terminamos essa discussão/i)).toBeVisible({ timeout: 5_000 });

  // Aguarda o membro chegar à fase de Discussão (segue o SM via Firestore em tempo real)
  await expect(memberPage.locator('h2.phase-title').getByText(/discussão/i)).toBeVisible({ timeout: 20_000 });

  // Membro não deve ver o painel de seleção (somente SM gerencia)
  await expect(memberPage.getByText(/como terminamos essa discussão/i)).not.toBeVisible();

  // SM seleciona "Fizemos um acordo" e confirma
  await smPage.locator('input[name="discussion-result"][value="agreement"]').check();
  await smPage.locator('#btn-confirm-result').click();

  // Após confirmar, SM deve ver "Resultado atual" com o label correto
  await expect(smPage.locator('.discussion-result-confirmed')).toContainText(/fizemos um acordo/i, { timeout: 10_000 });

  // Membro vê o resultado no painel somente-leitura (sincronização em tempo real)
  await expect(memberPage.locator('.discussion-result-panel--readonly')).toBeVisible({ timeout: 20_000 });
  await expect(memberPage.locator('.discussion-result-confirmed')).toContainText(/fizemos um acordo/i, { timeout: 10_000 });
});

// ── 9. SM avança até WorkMonsters; card aparece expandível ────────────────────

test('SM avança até WorkMonsters; card do monstro pode ser expandido', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await memberJoin(memberPage);
  await startRetro(smPage, memberPage);

  // Navega: checkin → tesouros → monstros
  await smPage.locator('#btn-next').click();
  await expect(smPage.getByText(/tesouros da sprint/i)).toBeVisible({ timeout: 10_000 });
  await smPage.locator('#btn-next').click();
  await expect(smPage.getByText(/monstros da sprint/i)).toBeVisible({ timeout: 10_000 });

  // SM adiciona um monstro
  await smPage.locator('#monster-input').fill('Deploy muito manual');
  await smPage.locator('#btn-add-monster').click();
  await expect(smPage.getByText(/Deploy muito manual/i)).toBeVisible({ timeout: 5_000 });

  // Avança: monstros → discussão → priorização → workMonsters
  await smPage.locator('#btn-next').click(); // → discussão
  await expect(smPage.locator('h2.phase-title').getByText(/discussão/i)).toBeVisible({ timeout: 10_000 });
  await smPage.locator('#btn-next').click(); // → priorização
  await expect(smPage.getByText(/priorização/i)).toBeVisible({ timeout: 10_000 });
  await smPage.locator('#btn-next').click(); // → workMonsters
  await expect(smPage.getByText(/trabalho nos monstros/i)).toBeVisible({ timeout: 10_000 });

  // Membro também chega ao WorkMonsters via Firestore em tempo real
  await expect(memberPage.getByText(/trabalho nos monstros/i)).toBeVisible({ timeout: 20_000 });

  // O card do monstro está visível na lista
  await expect(smPage.getByText(/Deploy muito manual/i)).toBeVisible({ timeout: 5_000 });

  // O botão para expandir o card está presente
  await expect(smPage.getByText(/▼ Trabalhar/i)).toBeVisible({ timeout: 5_000 });
});

// ── 10. SM registra solução e ação dentro do card do monstro ──────────────────

test('SM registra solução e ação dentro do card; informações persistem', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await memberJoin(memberPage);
  await startRetro(smPage, memberPage);

  // Navega até WorkMonsters
  await smPage.locator('#btn-next').click(); // → tesouros
  await smPage.locator('#btn-next').click(); // → monstros

  await smPage.locator('#monster-input').fill('Falta de alinhamento');
  await smPage.locator('#btn-add-monster').click();
  await expect(smPage.getByText(/Falta de alinhamento/i)).toBeVisible({ timeout: 5_000 });

  await smPage.locator('#btn-next').click(); // → discussão
  await expect(smPage.locator('h2.phase-title').getByText(/discussão/i)).toBeVisible({ timeout: 10_000 });
  await smPage.locator('#btn-next').click(); // → priorização
  await expect(smPage.getByText(/priorização/i)).toBeVisible({ timeout: 10_000 });
  await smPage.locator('#btn-next').click(); // → workMonsters
  await expect(smPage.getByText(/trabalho nos monstros/i)).toBeVisible({ timeout: 10_000 });

  // Expande o card do monstro
  await smPage.locator('[data-toggle-id]').first().click();
  await expect(smPage.locator('.work-monster-body').first()).toBeVisible({ timeout: 5_000 });

  // SM registra uma solução
  const monsterId = await smPage.locator('[data-monster-id]').first().getAttribute('data-monster-id');
  await smPage.locator(`#sol-input-${monsterId}`).fill('Criar reunião semanal de alinhamento');
  await smPage.locator('[data-add-solution]').first().click();
  await expect(smPage.getByText(/Criar reunião semanal/i)).toBeVisible({ timeout: 10_000 });

  // SM registra uma ação
  await smPage.locator(`#action-title-${monsterId}`).fill('Agendar daily de 15min');
  await smPage.locator('[data-add-mission]').first().click();

  // A ação aparece na lista de ações do card
  await expect(smPage.getByText(/Agendar daily de 15min/i)).toBeVisible({ timeout: 10_000 });
});
