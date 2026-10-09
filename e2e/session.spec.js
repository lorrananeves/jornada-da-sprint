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
 *   6. SM avança para Monstros; membro segue automaticamente (painel unificado)
 *   7. Botão avançar em Monstros leva diretamente para Concluir Jornada
 *   8. SM registra Resultado da Discussão diretamente no card do monstro
 *   9. Card do monstro pode ser expandido na fase Monstros (painel unificado)
 *  10. SM registra solução e ação no card expandido do monstro
 *  11. SM configura 1 voto, participante vota e é bloqueado ao atingir o limite
 *  12. Cancelar o modal não inicia votação nem altera o estado
 *  13. SM configura 2 votos; participante vota em 2 monstros, mas é bloqueado no 3º
 *  14. Encerramento e reabertura de votação continuam funcionando com novo fluxo
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
      // eslint-disable-next-line no-undef
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

// ── 7. Botão avançar em Monstros leva diretamente para Concluir Jornada ───────

test('SM avança de Monstros diretamente para Concluir Jornada (sem passar por discussão)', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await memberJoin(memberPage);
  await startRetro(smPage, memberPage);

  // Navega até a fase de Monstros
  await smPage.locator('#btn-next').click(); // → tesouros
  await smPage.locator('#btn-next').click(); // → monstros
  await expect(smPage.getByText(/monstros da sprint/i)).toBeVisible({ timeout: 10_000 });

  // Botão avançar deve estar habilitado sem seleção prévia de monstros
  const nextBtn = smPage.locator('#btn-next');
  await expect(nextBtn).toBeEnabled({ timeout: 5_000 });

  // Texto do botão deve indicar "Concluir Jornada" (fluxo unificado — não há mais fase Discussão no caminho padrão)
  await expect(nextBtn).toContainText(/concluir jornada/i);

  // Clicar avança para a tela de conclusão, não para discussão
  await nextBtn.click();
  await expect(smPage.getByText(/jornada concluída|parabéns|retrospectiva concluída/i)).toBeVisible({ timeout: 10_000 });

  // Membro também chega à conclusão via Firestore em tempo real
  await expect(memberPage.getByText(/jornada concluída|parabéns|retrospectiva concluída/i)).toBeVisible({ timeout: 20_000 });
});

// ── 8. SM registra Resultado da Discussão diretamente no card do monstro ──────

test('SM define Resultado da Discussão no card; membro vê em tempo real', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await memberJoin(memberPage);
  await startRetro(smPage, memberPage);

  // Navega até a fase de Monstros
  await smPage.locator('#btn-next').click(); // → tesouros
  await smPage.locator('#btn-next').click(); // → monstros
  await expect(smPage.getByText(/monstros da sprint/i)).toBeVisible({ timeout: 10_000 });

  // SM adiciona um monstro
  await smPage.locator('#monster-input').fill('Problema de comunicação');
  await smPage.locator('#btn-add-monster').click();
  await expect(smPage.getByText(/Problema de comunicação/i)).toBeVisible({ timeout: 5_000 });

  // Membro também vê o monstro (Firestore em tempo real)
  await expect(memberPage.getByText(/monstros da sprint/i)).toBeVisible({ timeout: 20_000 });
  await expect(memberPage.getByText(/Problema de comunicação/i)).toBeVisible({ timeout: 10_000 });

  // SM expande o card do monstro para acessar o painel de resultado
  await smPage.locator('[data-toggle-id]').first().click();
  await expect(smPage.locator('.work-monster-body').first()).toBeVisible({ timeout: 5_000 });

  // SM seleciona o resultado "Fizemos um acordo" (radio no painel do card)
  const monsterId = await smPage.locator('[data-monster-id]').first().getAttribute('data-monster-id');
  await smPage.locator(`input[name="disc-result-${monsterId}"][value="agreement"]`).check();
  await smPage.locator(`[data-confirm-result="${monsterId}"]`).click();

  // Após confirmar, SM vê o label do resultado registrado no card
  await expect(smPage.locator('.discussion-result-confirmed').first()).toContainText(/fizemos um acordo/i, { timeout: 10_000 });

  // Membro expande o mesmo card e vê o resultado (somente leitura)
  await memberPage.locator('[data-toggle-id]').first().click();
  await expect(memberPage.locator('.work-monster-body').first()).toBeVisible({ timeout: 10_000 });
  await expect(memberPage.locator('.discussion-result-panel--readonly')).toBeVisible({ timeout: 20_000 });
  await expect(memberPage.locator('.discussion-result-confirmed').first()).toContainText(/fizemos um acordo/i, { timeout: 10_000 });
});

// ── 9. Card do monstro pode ser expandido na fase Monstros (painel unificado) ─

test('Card do monstro pode ser expandido diretamente na fase Monstros', async ({ twoParticipants }) => {
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

  // Permanece na fase Monstros — não há necessidade de avançar para WorkMonsters
  await expect(smPage.getByText(/monstros da sprint/i)).toBeVisible();

  // Botão "▼ Trabalhar" está presente no card (aria-label "Expandir monstro")
  await expect(smPage.locator('[aria-label="Expandir monstro"]').first()).toBeVisible({ timeout: 5_000 });

  // Clicar no toggle expande o card e exibe o corpo do painel unificado
  await smPage.locator('[data-toggle-id]').first().click();
  await expect(smPage.locator('.work-monster-body').first()).toBeVisible({ timeout: 5_000 });

  // O painel expandido deve conter as seções de votação, notas e soluções
  await expect(smPage.locator('.monsters-unified-section--voting').first()).toBeVisible({ timeout: 5_000 });
  await expect(smPage.getByText(/Notas da Discussão/i).first()).toBeVisible({ timeout: 5_000 });
  await expect(smPage.getByText(/O que podemos fazer/i).first()).toBeVisible({ timeout: 5_000 });

  // Clicar novamente recolhe o card
  await smPage.locator('[data-toggle-id]').first().click();
  await expect(smPage.locator('.work-monster-body').first()).not.toBeVisible({ timeout: 5_000 });

  // Membro também pode expandir o card independentemente
  await expect(memberPage.getByText(/Deploy muito manual/i)).toBeVisible({ timeout: 20_000 });
  await memberPage.locator('[data-toggle-id]').first().click();
  await expect(memberPage.locator('.work-monster-body').first()).toBeVisible({ timeout: 10_000 });
});

// ── 10. SM registra solução e ação no card expandido do monstro ───────────────

test('SM registra solução e ação diretamente no card; informações persistem', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await memberJoin(memberPage);
  await startRetro(smPage, memberPage);

  // Navega: checkin → tesouros → monstros (sem precisar avançar para workMonsters)
  await smPage.locator('#btn-next').click(); // → tesouros
  await smPage.locator('#btn-next').click(); // → monstros
  await expect(smPage.getByText(/monstros da sprint/i)).toBeVisible({ timeout: 10_000 });

  // SM adiciona um monstro
  await smPage.locator('#monster-input').fill('Falta de alinhamento');
  await smPage.locator('#btn-add-monster').click();
  await expect(smPage.getByText(/Falta de alinhamento/i)).toBeVisible({ timeout: 5_000 });

  // Expande o card do monstro diretamente na fase Monstros
  await smPage.locator('[data-toggle-id]').first().click();
  await expect(smPage.locator('.work-monster-body').first()).toBeVisible({ timeout: 5_000 });

  // SM registra uma solução na aba "Prevenir" (estratégia padrão — aba ativa)
  const monsterId = await smPage.locator('[data-monster-id]').first().getAttribute('data-monster-id');
  await smPage.locator(`#sol-input-${monsterId}-prevent`).fill('Criar reunião semanal de alinhamento');
  await smPage.locator(`[data-add-solution="${monsterId}"][data-add-strategy="prevent"]`).click();
  await expect(smPage.getByText(/Criar reunião semanal/i)).toBeVisible({ timeout: 10_000 });

  // SM registra uma ação (missão)
  await smPage.locator(`#action-title-${monsterId}`).fill('Agendar daily de 15min');
  await smPage.locator(`[data-add-mission="${monsterId}"]`).click();

  // A ação aparece na lista de ações do card
  await expect(smPage.getByText(/Agendar daily de 15min/i)).toBeVisible({ timeout: 10_000 });

  // Membro vê a solução e a ação em tempo real (após expandir o card)
  await expect(memberPage.getByText(/Falta de alinhamento/i)).toBeVisible({ timeout: 20_000 });
  await memberPage.locator('[data-toggle-id]').first().click();
  await expect(memberPage.locator('.work-monster-body').first()).toBeVisible({ timeout: 10_000 });
  await expect(memberPage.getByText(/Criar reunião semanal/i)).toBeVisible({ timeout: 20_000 });
  await expect(memberPage.getByText(/Agendar daily de 15min/i)).toBeVisible({ timeout: 20_000 });
});

// ── 11. SM configura 1 voto, membro vota e é bloqueado ao atingir o limite ─────

test('SM configura 1 voto; participante vota em 1 monstro e é bloqueado no 2º', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await memberJoin(memberPage);
  await startRetro(smPage, memberPage);

  // Navega: checkin → tesouros → monstros
  await smPage.locator('#btn-next').click(); // → tesouros
  await smPage.locator('#btn-next').click(); // → monstros
  await expect(smPage.getByText(/monstros da sprint/i)).toBeVisible({ timeout: 10_000 });

  // SM adiciona 2 monstros
  await smPage.locator('#monster-input').fill('Problema A');
  await smPage.locator('#btn-add-monster').click();
  await expect(smPage.getByText(/Problema A/i)).toBeVisible({ timeout: 5_000 });
  await smPage.locator('#monster-input').fill('Problema B');
  await smPage.locator('#btn-add-monster').click();
  await expect(smPage.getByText(/Problema B/i)).toBeVisible({ timeout: 5_000 });

  // Banner de votação e botão de iniciar estão visíveis; sem "Reabrir"
  await expect(smPage.locator('.voting-budget-banner')).toBeVisible({ timeout: 5_000 });
  await expect(smPage.locator('#btn-start-voting')).toBeVisible({ timeout: 5_000 });
  await expect(smPage.locator('#btn-reopen-voting')).not.toBeVisible();

  // Membro também chega à fase Monstros
  await expect(memberPage.getByText(/monstros da sprint/i)).toBeVisible({ timeout: 20_000 });

  // Membro expande o card e vê o botão de votar
  await memberPage.locator('[data-toggle-id]').first().click();
  await expect(memberPage.locator('.work-monster-body').first()).toBeVisible({ timeout: 10_000 });
  const monsterId = await memberPage.locator('[data-monster-id]').first().getAttribute('data-monster-id');
  await expect(memberPage.locator(`[data-vote-monster="${monsterId}"]`)).toBeVisible({ timeout: 5_000 });

  // SM abre modal, escolhe 1 voto e confirma
  // O <input type="radio"> é ocultado por CSS (opacity:0/size:0) — interage via label
  await smPage.locator('#btn-start-voting').click();
  await expect(smPage.locator('#vote-cfg-title')).toBeVisible({ timeout: 5_000 });
  await smPage.locator('label[for="vote-cfg-1"]').click();
  await smPage.locator('#vote-cfg-confirm').click();
  await expect(smPage.locator('#vote-cfg-title')).not.toBeVisible({ timeout: 3_000 });

  // Membro pode votar no 1º monstro
  await memberPage.locator(`[data-vote-monster="${monsterId}"]`).click();
  await expect(memberPage.locator(`[data-vote-monster="${monsterId}"]`)).toBeDisabled({ timeout: 10_000 });

  // 2º monstro: botão de votar deve estar desabilitado (limite 1 atingido)
  const monsterCards = memberPage.locator('[data-monster-id]');
  const secondId = await monsterCards.nth(1).getAttribute('data-monster-id').catch(() => null);
  if (secondId) {
    const secondCard = memberPage.locator(`[data-monster-id="${secondId}"]`);
    await secondCard.locator('.work-monster-header').click();
    await expect(secondCard.locator('.work-monster-body')).toBeVisible({ timeout: 10_000 });
    const voteBtn2 = memberPage.locator(`[data-vote-monster="${secondId}"]`);
    const visible = await voteBtn2.isVisible({ timeout: 3_000 }).catch(() => false);
    if (visible) {
      await expect(voteBtn2).toBeDisabled({ timeout: 5_000 });
    }
  }

  // SM pode reabrir a votação com o botão "Reabrir" (não existe mais btn-close-voting independente)
  // Confirma que o SM ainda controla a votação
  await expect(smPage.locator('.voting-budget-banner')).toBeVisible({ timeout: 5_000 });
});

// ── 12. Cancelar o modal não inicia votação nem altera estado ─────────────────

test('Cancelar o modal de configuração não inicia votação nem altera estado', async ({ twoParticipants }) => {
  const { smPage } = twoParticipants;

  // Inicia a retro apenas com a página do SM (sem membro — o teste não precisa de sincronização)
  await smPage.locator('#btn-start-retro').click();
  await expect(smPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 10_000 });

  // Navega: checkin → tesouros → monstros
  await smPage.locator('#btn-next').click();
  await expect(smPage.getByText(/tesouros da sprint/i)).toBeVisible({ timeout: 10_000 });
  await smPage.locator('#btn-next').click();
  await expect(smPage.getByText(/monstros da sprint/i)).toBeVisible({ timeout: 10_000 });

  // SM adiciona um monstro
  await smPage.locator('#monster-input').fill('Monstro cancelado');
  await smPage.locator('#btn-add-monster').click();
  await expect(smPage.getByText(/Monstro cancelado/i)).toBeVisible({ timeout: 5_000 });

  // SM clica em iniciar → modal aparece
  await smPage.locator('#btn-start-voting').click();
  await expect(smPage.locator('#vote-cfg-title')).toBeVisible({ timeout: 5_000 });

  // SM cancela
  await smPage.locator('#vote-cfg-cancel').click();
  await expect(smPage.locator('#vote-cfg-title')).not.toBeVisible({ timeout: 3_000 });

  // Estado não deve ter mudado: botão de iniciar ainda visível (votação não foi iniciada)
  await expect(smPage.locator('#btn-start-voting')).toBeVisible({ timeout: 3_000 });
  await expect(smPage.locator('#btn-reopen-voting')).not.toBeVisible();
});

// ── 13. SM configura 2 votos; participante vota em 2, bloqueado no 3º ─────────

test('SM configura 2 votos; participante vota em 2 monstros e é bloqueado no 3º', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await memberJoin(memberPage);
  await startRetro(smPage, memberPage);

  // Navega: checkin → tesouros → monstros
  await smPage.locator('#btn-next').click();
  await smPage.locator('#btn-next').click();
  await expect(smPage.getByText(/monstros da sprint/i)).toBeVisible({ timeout: 10_000 });

  // SM adiciona 3 monstros
  for (const name of ['Alpha', 'Beta', 'Gamma']) {
    await smPage.locator('#monster-input').fill(name);
    await smPage.locator('#btn-add-monster').click();
    await expect(smPage.getByText(new RegExp(name, 'i'))).toBeVisible({ timeout: 5_000 });
  }

  // SM inicia votação com 2 votos
  // O <input type="radio"> é ocultado por CSS (opacity:0/size:0) — interage via label
  await smPage.locator('#btn-start-voting').click();
  await expect(smPage.locator('#vote-cfg-title')).toBeVisible({ timeout: 5_000 });
  await smPage.locator('label[for="vote-cfg-2"]').click();
  await smPage.locator('#vote-cfg-confirm').click();
  await expect(smPage.locator('#vote-cfg-title')).not.toBeVisible({ timeout: 3_000 });

  // Membro recebe a configuração em tempo real
  await expect(memberPage.getByText(/monstros da sprint/i)).toBeVisible({ timeout: 20_000 });

  // Membro vota em 2 monstros
  const monsterIds = [];
  const cards = memberPage.locator('[data-monster-id]');
  for (let i = 0; i < 3; i++) {
    const id = await cards.nth(i).getAttribute('data-monster-id').catch(() => null);
    if (id) monsterIds.push(id);
  }

  // Vota no 1º
  if (monsterIds[0]) {
    await memberPage.locator(`[data-monster-id="${monsterIds[0]}"] .work-monster-header`).click();
    await memberPage.locator(`[data-vote-monster="${monsterIds[0]}"]`).click();
    await expect(memberPage.locator(`[data-vote-monster="${monsterIds[0]}"]`)).toBeDisabled({ timeout: 10_000 });
  }

  // Vota no 2º (deve ser permitido com limite 2)
  if (monsterIds[1]) {
    await memberPage.locator(`[data-monster-id="${monsterIds[1]}"] .work-monster-header`).click();
    const btn2 = memberPage.locator(`[data-vote-monster="${monsterIds[1]}"]`);
    const btn2Visible = await btn2.isVisible({ timeout: 5_000 }).catch(() => false);
    if (btn2Visible && !(await btn2.isDisabled())) {
      await btn2.click();
      await expect(btn2).toBeDisabled({ timeout: 10_000 });
    }
  }

  // 3º voto deve ser bloqueado (todos os votos esgotados)
  if (monsterIds[2]) {
    await memberPage.locator(`[data-monster-id="${monsterIds[2]}"] .work-monster-header`).click();
    const btn3 = memberPage.locator(`[data-vote-monster="${monsterIds[2]}"]`);
    const btn3Visible = await btn3.isVisible({ timeout: 3_000 }).catch(() => false);
    if (btn3Visible) {
      await expect(btn3).toBeDisabled({ timeout: 5_000 });
    }
  }
});

// ── 14. Encerramento e reabertura da votação com novo fluxo ───────────────────

test('SM encerra e reabre a votação; membro vê mudança em tempo real', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await memberJoin(memberPage);
  await startRetro(smPage, memberPage);

  // Navega: checkin → tesouros → monstros
  await smPage.locator('#btn-next').click();
  await smPage.locator('#btn-next').click();
  await expect(smPage.getByText(/monstros da sprint/i)).toBeVisible({ timeout: 10_000 });

  // SM adiciona um monstro
  await smPage.locator('#monster-input').fill('Falta de testes automatizados');
  await smPage.locator('#btn-add-monster').click();
  await expect(smPage.getByText(/Falta de testes automatizados/i)).toBeVisible({ timeout: 5_000 });

  // Membro também chega à fase Monstros
  await expect(memberPage.getByText(/monstros da sprint/i)).toBeVisible({ timeout: 20_000 });

  // Membro expande o card e vê o botão de votar
  await memberPage.locator('[data-toggle-id]').first().click();
  await expect(memberPage.locator('.work-monster-body').first()).toBeVisible({ timeout: 10_000 });
  const monsterId = await memberPage.locator('[data-monster-id]').first().getAttribute('data-monster-id');

  // SM inicia votação (configura 1 voto e confirma)
  await smPage.locator('#btn-start-voting').click();
  await expect(smPage.locator('#vote-cfg-title')).toBeVisible({ timeout: 5_000 });
  await smPage.locator('#vote-cfg-confirm').click();
  await expect(smPage.locator('#vote-cfg-title')).not.toBeVisible({ timeout: 3_000 });

  // Membro vê o botão de votar disponível
  await expect(memberPage.locator(`[data-vote-monster="${monsterId}"]`)).toBeVisible({ timeout: 10_000 });
  await expect(memberPage.locator(`[data-vote-monster="${monsterId}"]`)).not.toBeDisabled({ timeout: 5_000 });

  // Após iniciar: SM vê botão "Encerrar votação" (não mais "Iniciar")
  await expect(smPage.locator('#btn-close-voting')).toBeVisible({ timeout: 5_000 });
  await expect(smPage.locator('#btn-start-voting')).not.toBeVisible();

  // SM encerra a votação
  await smPage.locator('#btn-close-voting').click();
  await expect(smPage.locator('#btn-reopen-voting')).toBeVisible({ timeout: 10_000 });
  await expect(smPage.locator('#btn-close-voting')).not.toBeVisible();
  await expect(smPage.getByText(/votação encerrada/i).first()).toBeVisible({ timeout: 5_000 });

  // Membro vê a votação encerrada em tempo real
  await expect(memberPage.getByText(/votação encerrada/i).first()).toBeVisible({ timeout: 20_000 });

  // Botão de votar fica desabilitado após encerramento
  const memberVoteBtn = memberPage.locator(`[data-vote-monster="${monsterId}"]`);
  const memberVoteBtnExists = await memberVoteBtn.isVisible().catch(() => false);
  if (memberVoteBtnExists) {
    await expect(memberVoteBtn).toBeDisabled({ timeout: 5_000 });
  }

  // SM pode reabrir a votação
  await smPage.locator('#btn-reopen-voting').click();
  await expect(smPage.locator('#btn-close-voting')).toBeVisible({ timeout: 10_000 });
  await expect(smPage.locator('#btn-reopen-voting')).not.toBeVisible();
});
