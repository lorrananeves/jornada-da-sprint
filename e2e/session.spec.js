/**
 * E2E — fluxo completo de uma sessão com SM + membro do time.
 *
 * Pré-requisito: Firebase Emulator rodando na porta 8080.
 * O playwright.config.js sobe o Vite com VITE_FIREBASE_USE_EMULATOR=true.
 *
 * Cenários cobertos:
 *   1. SM escolhe papel e configura a sprint
 *   2. Membro entra via mesmo link e escolhe papel Team
 *   3. SM inicia a retrospectiva no Lobby
 *   4. Membro é redirecionado automaticamente para o Check-in (tempo real)
 *   5. Membro registra check-in; indicador de respostas atualiza para o SM
 *   6. SM avança para Tesouros; membro segue automaticamente
 */

import { test, expect } from './fixtures.js';

// ── 1. Setup + escolha de papel ───────────────────────────────────────────────

test('SM configura a sprint e o membro entra no lobby', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  // SM: seleciona papel Scrum Master
  await smPage.getByRole('button', { name: /scrum master/i }).click();

  // SM: preenche o formulário de setup
  await smPage.getByLabel(/nome da sprint/i).fill('Sprint 99');
  await smPage.getByLabel(/nome do time/i).fill('Time Fênix');
  await smPage.getByLabel(/número de participantes/i).fill('2');
  await smPage.getByRole('button', { name: /iniciar jornada/i }).click();

  // SM: deve chegar ao Lobby
  await expect(smPage.getByText(/sala de espera/i)).toBeVisible();

  // Membro: seleciona papel Team Member
  await memberPage.getByRole('button', { name: /team member|membro/i }).click();

  // Membro: deve ver a tela de lobby aguardando
  await expect(memberPage.getByText(/aguardando início/i)).toBeVisible();
});

// ── 2. SM inicia retro; membro é redirecionado em tempo real ──────────────────

test('SM inicia a retrospectiva e membro é redirecionado automaticamente', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  // Configura sessão pelo SM
  await smPage.getByRole('button', { name: /scrum master/i }).click();
  await smPage.getByLabel(/nome da sprint/i).fill('Sprint 42');
  await smPage.getByRole('button', { name: /iniciar jornada/i }).click();
  await expect(smPage.getByText(/sala de espera/i)).toBeVisible();

  // Membro entra no lobby
  await memberPage.getByRole('button', { name: /team member|membro/i }).click();
  await expect(memberPage.getByText(/aguardando início/i)).toBeVisible();

  // SM inicia a retrospectiva
  await smPage.getByRole('button', { name: /iniciar retrospectiva/i }).click();

  // SM deve avançar para o check-in
  await expect(smPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 8_000 });

  // Membro deve ser redirecionado automaticamente (sem reload manual)
  await expect(memberPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 8_000 });
});

// ── 3. Membro registra check-in; indicador atualiza para o SM ────────────────

test('Membro registra check-in e SM vê indicador atualizado em tempo real', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  // Setup: SM configura sprint com 2 participantes
  await smPage.getByRole('button', { name: /scrum master/i }).click();
  await smPage.getByLabel(/nome da sprint/i).fill('Sprint 42');
  await smPage.getByLabel(/número de participantes/i).fill('2');
  await smPage.getByRole('button', { name: /iniciar jornada/i }).click();

  // Membro entra
  await memberPage.getByRole('button', { name: /team member|membro/i }).click();

  // SM inicia retro
  await smPage.getByRole('button', { name: /iniciar retrospectiva/i }).click();

  // Ambos devem estar no check-in
  await expect(smPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 8_000 });
  await expect(memberPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 8_000 });

  // SM: indicador deve mostrar 0 de 2 inicialmente
  await expect(smPage.getByText(/0 de 2/i)).toBeVisible();

  // Membro: clica em nota 4 e registra
  await memberPage.locator('.score-btn[data-score="4"]').click();
  await memberPage.getByRole('button', { name: /registrar resposta/i }).click();

  // SM: indicador deve atualizar para 1 de 2 sem recarregar a página
  await expect(smPage.getByText(/1 de 2/i)).toBeVisible({ timeout: 8_000 });
});

// ── 4. SM avança fase; membro segue automaticamente ──────────────────────────

test('SM avança para Tesouros e membro é redirecionado automaticamente', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  // Setup completo
  await smPage.getByRole('button', { name: /scrum master/i }).click();
  await smPage.getByLabel(/nome da sprint/i).fill('Sprint 42');
  await smPage.getByRole('button', { name: /iniciar jornada/i }).click();
  await memberPage.getByRole('button', { name: /team member|membro/i }).click();
  await smPage.getByRole('button', { name: /iniciar retrospectiva/i }).click();

  await expect(smPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 8_000 });
  await expect(memberPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 8_000 });

  // SM avança para a próxima fase
  await smPage.getByRole('button', { name: /próxima fase/i }).click();

  // Ambos devem estar nos Tesouros
  await expect(smPage.getByText(/tesouros da sprint/i)).toBeVisible({ timeout: 8_000 });
  await expect(memberPage.getByText(/tesouros da sprint/i)).toBeVisible({ timeout: 8_000 });
});

// ── 5. Membro NÃO pode avançar de fase ───────────────────────────────────────

test('Membro do time não vê o botão de avançar fase', async ({ twoParticipants }) => {
  const { smPage, memberPage } = twoParticipants;

  await smPage.getByRole('button', { name: /scrum master/i }).click();
  await smPage.getByLabel(/nome da sprint/i).fill('Sprint 42');
  await smPage.getByRole('button', { name: /iniciar jornada/i }).click();
  await memberPage.getByRole('button', { name: /team member|membro/i }).click();
  await smPage.getByRole('button', { name: /iniciar retrospectiva/i }).click();

  await expect(memberPage.getByText(/check-in da equipe/i)).toBeVisible({ timeout: 8_000 });

  // Membro não deve ver o botão "PRÓXIMA FASE"
  await expect(memberPage.getByRole('button', { name: /próxima fase/i })).not.toBeVisible();

  // Membro deve ver a mensagem de espera
  await expect(memberPage.getByText(/aguardando o scrum master/i)).toBeVisible();
});
