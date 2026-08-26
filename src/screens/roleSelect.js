/**
 * Role Select Screen — first screen shown to everyone
 * Asks: "Are you the Scrum Master or a team member?"
 */

import { setLocalPhase } from '../state/store.js';
import { joinSession } from '../services/presence.js';
import { getCurrentUser } from '../services/auth.js';

export function renderRoleSelect(root) {
  // Se entrando via link compartilhado (?s=...), destaca a opção de membro do time
  const params = new URLSearchParams(window.location.search);
  const hasSession = params.has('s');

  root.innerHTML = `
    <div class="screen-role-select">
      <div class="role-select-card screen-enter">
        <div class="home-logo">⚔️</div>
        <h1 class="home-title">JORNADA DA SPRINT</h1>
        <p class="home-subtitle">Como você está participando desta retrospectiva?</p>

        <div class="role-options">
          <button class="role-option-btn ${hasSession ? '' : 'role-option-featured'}" id="btn-sm">
            <span class="role-option-icon">🧙</span>
            <span class="role-option-title">Scrum Master</span>
            <span class="role-option-desc">Configuro e facilito a retrospectiva</span>
          </button>
          <button class="role-option-btn ${hasSession ? 'role-option-featured' : ''}" id="btn-team">
            <span class="role-option-icon">🗡️</span>
            <span class="role-option-title">Sou do Time</span>
            <span class="role-option-desc">Participo da retrospectiva</span>
          </button>
        </div>
      </div>
    </div>
  `;

  root.querySelector('#btn-sm').addEventListener('click', () => {
    // SM já autenticado → vai direto para o dashboard
    // SM não autenticado → vai para a tela de login
    const user = getCurrentUser();
    if (user) {
      setLocalPhase('smDashboard');
    } else {
      setLocalPhase('auth');
    }
  });

  root.querySelector('#btn-team').addEventListener('click', async () => {
    // Membros do time nunca precisam de login — entram direto pelo link
    const { setRole } = await import('../state/store.js');
    setRole('team_member');
    await joinSession();
    setLocalPhase('lobby');
  });
}
