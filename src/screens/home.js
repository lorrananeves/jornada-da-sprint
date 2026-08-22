/**
 * Home Screen — no async/await at module level
 */

import { setPhase, setState, hasSavedSession, resetState, getState } from '../state/store.js';
import { showModal } from '../components/modal.js';

export function renderHome(root) {
  const hasSession = hasSavedSession();

  root.innerHTML = `
    <div class="screen-home">
      <div class="home-card screen-enter">
        <div class="home-logo">⚔️</div>
        <h1 class="home-title">JORNADA DA SPRINT</h1>
        <p class="home-subtitle">Uma retrospectiva diferente começa aqui.</p>
        <div class="home-actions">
          <button class="btn btn-primary btn-lg" id="btn-start">🚀 COMEÇAR JORNADA</button>
          <button class="btn btn-ghost btn-lg" id="btn-continue" ${hasSession ? '' : 'disabled'}>
            ⏩ CONTINUAR JORNADA
          </button>
          ${hasSession
            ? `<button class="btn btn-danger btn-sm" id="btn-reset">🗑️ APAGAR TODOS OS DADOS</button>`
            : ''}
        </div>
      </div>
    </div>
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
      resetState();
    }
    setState({ currentPhase: 'setup', createdAt: new Date().toISOString() });
  });

  const continueBtn = root.querySelector('#btn-continue');
  if (continueBtn && !continueBtn.disabled) {
    continueBtn.addEventListener('click', () => {
      const s = getState();
      setPhase(s.currentPhase && s.currentPhase !== 'home' ? s.currentPhase : 'setup');
    });
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
