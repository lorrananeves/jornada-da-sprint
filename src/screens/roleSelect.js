/**
 * Role Select Screen — first screen shown to everyone
 * Asks: "Are you the Scrum Master or a team member?"
 */

import { setPhase, setLocalPhase, setRole } from '../state/store.js';
import { joinSession } from '../services/presence.js';

export function renderRoleSelect(root) {
  // If entering via a shared link (?s=...), highlight team member option
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
    setRole('scrum_master');
    setPhase('setup');
  });

  root.querySelector('#btn-team').addEventListener('click', async () => {
    setRole('team_member');
    // Register presence then go to lobby (waiting room for the team)
    await joinSession();
    // setLocalPhase: navegação local — não persiste no Firestore, não exige SM
    setLocalPhase('lobby');
  });
}
