/**
 * E2E — fluxo completo de uma sessão com SM + membro do time.
 *
 * A fixture `twoParticipants` entrega:
 *   - smPage     → SM no Lobby (sessão já criada no Firestore)
 *   - memberPage → membro no roleSelect, pronto para escolher papel
 *
 * Cenários cobertos:
 *   1. Membro entra no lobby após escolher papel
 *   2. SM inicia retro; membro é redirecionado automaticamente (tempo real)
 *   3. Membro registra check-in; indicador atualiza para o SM (tempo real)
 *   4. SM avança para Tesouros; membro segue automaticamente (tempo real)
 *   5. Membro não vê o botão de avançar fase
 */

import { test, expect } from './fixtures.js';

// Helper: membro escolhe papel e chega ao lobby de espera
async function memberJoin(memberPage) {
  await memberPage.locator('#btn-team').click();
  await expect(memberPage.getByText(/aguardando início/i)).toBeVisible({ timeout: 10_000 });
}

// Helper: SM inicia e ambas as páginas chegam ao check-in
async function startRetro(smPage, memberPage) {
  await smPage.locator('#btn-start-retro').click();
  await expect(smPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 10_000 });
  await expect(memberPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 10_000 });
}

// ── 1. Membro entra no lobby ──────────────────────────────────────────────────

test('Membro entra no lobby após escolher papel', async ({ twoParticipants }) => {
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

test('Membro registra check-in e SM vê indicador atualizado em tempo real', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  // Captura todos os logs do console do SM para diagnóstico
  const smLogs = [];
  smPage.on('console', (msg) => smLogs.push(`[SM ${msg.type()}] ${msg.text()}`));
  const memberLogs = [];
  memberPage.on('console', (msg) => memberLogs.push(`[MB ${msg.type()}] ${msg.text()}`));

  await memberJoin(memberPage);
  await startRetro(smPage, memberPage);

  // SM vê o indicador com 0 respostas — aguarda participantCount=2 chegar via Firestore
  await expect(smPage.getByText(/0 de 2/i)).toBeVisible({ timeout: 15_000 });

  // Membro registra check-in com nota 4
  await memberPage.locator('.score-btn[data-score="4"]').click();
  await memberPage.locator('#btn-register').click();

  // Aguarda o membro ver o feedback de envio (confirma que o Firestore recebeu)
  await expect(memberPage.locator('.xp-toast')).toBeVisible({ timeout: 10_000 });

  // Aguarda propagação Firestore → SM
  await smPage.waitForTimeout(5_000);

  // Dump diagnóstico completo
  const smHTML = await smPage.locator('#screen-root').innerHTML();
  console.log('=== DIAG SM HTML ===\n', smHTML.slice(0, 3000));
  console.log('=== DIAG SM LOGS ===\n', smLogs.join('\n'));
  console.log('=== DIAG MEMBER LOGS ===\n', memberLogs.join('\n'));

  // SM vê o indicador atualizado para 1 de 2 via subscription em tempo real
  await expect(smPage.getByText(/1 de 2/i)).toBeVisible({ timeout: 20_000 });
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
