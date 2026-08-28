/**
 * @security Toda interpolação em innerHTML DEVE usar escapeHTML(). Nunca
 *   interpole valores vindos do usuário ou do Firestore sem escapar.
 *
 * Home Screen — redirects to role selection or SM dashboard
 */

import { setLocalPhase, hasSavedSession, resetState, getState, startNewSession } from '../state/store.js';
import { getCurrentUser } from '../services/auth.js';
import { showModal } from '../components/modal.js';

export function renderHome(root) {
  const hasSession = hasSavedSession();
  const user       = getCurrentUser();

  root.innerHTML = `
    <main class="screen-home" role="main" aria-label="Tela inicial — Jornada da Sprint">
      <div class="home-card screen-enter">
        <div class="home-logo" aria-hidden="true">⚔️</div>
        <h1 class="home-title">JORNADA DA SPRINT</h1>
        <p class="home-subtitle">Uma retrospectiva diferente começa aqui.</p>
        <div class="home-actions">
          <button class="btn btn-primary btn-lg" id="btn-start" aria-label="Começar nova jornada">🚀 COMEÇAR JORNADA</button>
          <button class="btn btn-ghost btn-lg" id="btn-continue" ${hasSession ? '' : 'disabled'} aria-label="Continuar jornada em andamento" ${!hasSession ? 'aria-disabled="true"' : ''}>
            ⏩ CONTINUAR JORNADA
          </button>
          ${user ? `
            <button class="btn btn-ghost btn-lg" id="btn-dashboard" aria-label="Acessar meu painel de retrospectivas (${user.displayName || user.email})">🧙 MEU PAINEL (${user.displayName || user.email})</button>
          ` : ''}
          ${hasSession
            ? `<button class="btn btn-danger btn-sm" id="btn-reset" aria-label="Apagar todos os dados salvos">🗑️ APAGAR TODOS OS DADOS</button>`
            : ''}
        </div>
      </div>
    </main>
  `;

  root.querySelector('#btn-start').addEventListener('click', async () => {
    if (hasSession) {
      const confirmed = await showModal({
        title: '⚠️ Nova Jornada',
        body: 'Isso irá apagar todos os dados da sessão atual. Tem certeza?',
        confirmLabel: 'Sim, nova jornada',
        confirmClass: 'btn btn-danger',
      });
      if (!confirmed) return;
      // resetState() garante que não haverá escrita na sessão antiga depois
      resetState();
    }
    // startNewSession() gera um novo ID, inicializa o Firestore e vai para setup
    startNewSession();
  });

  const continueBtn = root.querySelector('#btn-continue');
  if (continueBtn && !continueBtn.disabled) {
    continueBtn.addEventListener('click', () => {
      const s = getState();
      const phase = s.currentPhase && s.currentPhase !== 'home' ? s.currentPhase : 'roleSelect';
      // Usa setLocalPhase para não exigir que seja SM para navegar
      setLocalPhase(phase);
    });
  }

  const dashBtn = root.querySelector('#btn-dashboard');
  if (dashBtn) {
    dashBtn.addEventListener('click', () => setLocalPhase('smDashboard'));
  }

  const resetBtn = root.querySelector('#btn-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const confirmed = await showModal({
        title: '🗑️ Apagar Todos os Dados',
        body: 'Esta ação irá remover permanentemente todos os dados da sessão. Deseja continuar?',
        confirmLabel: 'Apagar tudo',
        confirmClass: 'btn btn-danger',
      });
      if (confirmed) resetState();
    });
  }
}
