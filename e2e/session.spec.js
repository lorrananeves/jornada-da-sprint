/**
 * E2E — fluxo completo de uma sessão com SM + membro do time.
 *
 * Pré-requisito: Firebase Emulator rodando na porta 8080.
 * O playwright.config.js sobe o Vite com VITE_FIREBASE_USE_EMULATOR=true.
 *
 * A fixture `twoParticipants` já entrega smPage e memberPage na tela de
 * seleção de papel (roleSelect) — os testes começam a partir daí.
 *
 * Cenários cobertos:
 *   1. SM configura sprint e membro entra no lobby
 *   2. SM inicia retro; membro é redirecionado automaticamente (tempo real)
 *   3. Membro registra check-in; indicador atualiza para o SM (tempo real)
 *   4. SM avança para Tesouros; membro segue automaticamente (tempo real)
 *   5. Membro não vê o botão de avançar fase
 */

import { test, expect } from './fixtures.js';

// Helper: seleciona o papel SM na smPage e preenche o setup
async function setupSession(smPage, { sprintName = 'Sprint 42', participantCount = '2' } = {}) {
  await smPage.locator('#btn-sm').click();
  await smPage.getByLabel(/nome da sprint/i).fill(sprintName);
  if (participantCount) {
    await smPage.getByLabel(/número de participantes/i).fill(participantCount);
  }
  await smPage.locator('#btn-start-journey').click();
  await expect(smPage.getByText(/sala de espera/i)).toBeVisible({ timeout: 10_000 });
}

// Helper: seleciona o papel Team Member na memberPage
async function joinAsTeamMember(memberPage) {
  await memberPage.locator('#btn-team').click();
  await expect(memberPage.getByText(/aguardando início/i)).toBeVisible({ timeout: 10_000 });
}

// ── 1. Setup + escolha de papel ───────────────────────────────────────────────

test('SM configura a sprint e o membro entra no lobby', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await setupSession(smPage, { sprintName: 'Sprint 99', participantCount: '2' });
  await joinAsTeamMember(memberPage);
});

// ── 2. SM inicia retro; membro é redirecionado em tempo real ──────────────────

test('SM inicia a retrospectiva e membro é redirecionado automaticamente', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await setupSession(smPage);
  await joinAsTeamMember(memberPage);

  // SM dispara o início
  await smPage.locator('#btn-start-retro').click();

  // Ambos devem chegar ao check-in via Firestore em tempo real
  await expect(smPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 10_000 });
  await expect(memberPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 10_000 });
});

// ── 3. Membro registra check-in; indicador atualiza para o SM ────────────────

test('Membro registra check-in e SM vê indicador atualizado em tempo real', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await setupSession(smPage, { participantCount: '2' });
  await joinAsTeamMember(memberPage);
  await smPage.locator('#btn-start-retro').click();

  await expect(smPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 10_000 });
  await expect(memberPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 10_000 });

  // SM vê o indicador com 0 respostas
  await expect(smPage.getByText(/0 de 2/i)).toBeVisible();

  // Membro registra check-in com nota 4
  await memberPage.locator('.score-btn[data-score="4"]').click();
  await memberPage.locator('#btn-register').click();

  // SM vê o indicador atualizado para 1 de 2 sem reload
  await expect(smPage.getByText(/1 de 2/i)).toBeVisible({ timeout: 10_000 });
});

// ── 4. SM avança fase; membro segue automaticamente ──────────────────────────

test('SM avança para Tesouros e membro é redirecionado automaticamente', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await setupSession(smPage);
  await joinAsTeamMember(memberPage);
  await smPage.locator('#btn-start-retro').click();

  await expect(smPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 10_000 });
  await expect(memberPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 10_000 });

  // SM avança
  await smPage.locator('#btn-next').click();

  // Ambos devem estar nos Tesouros
  await expect(smPage.getByText(/tesouros da sprint/i)).toBeVisible({ timeout: 10_000 });
  await expect(memberPage.getByText(/tesouros da sprint/i)).toBeVisible({ timeout: 10_000 });
});

// ── 5. Membro NÃO pode avançar de fase ───────────────────────────────────────

test('Membro do time não vê o botão de avançar fase', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await setupSession(smPage);
  await joinAsTeamMember(memberPage);
  await smPage.locator('#btn-start-retro').click();

  await expect(memberPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 10_000 });

  // Membro não deve ver o botão de avançar
  await expect(memberPage.locator('#btn-next')).not.toBeVisible();

  // Membro deve ver a mensagem de espera
  await expect(memberPage.getByText(/aguardando o scrum master/i)).toBeVisible();
});
