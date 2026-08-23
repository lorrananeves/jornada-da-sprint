/**
 * Setup Screen — only accessible by Scrum Master
 */

import { getState, setState, setPhase, completePhase } from '../state/store.js';

export function renderSetup(root) {
  const state = getState();
  const s = state.sprint;
  const t = state.team;

  root.innerHTML = `
    <div class="screen-setup screen-enter">
      <div class="phase-header">
        <div class="phase-header-top">
          <span class="phase-icon">⚙️</span>
          <h2 class="phase-title">Configurar a Jornada</h2>
        </div>
        <p class="phase-description">Defina as informações básicas antes de começar a retrospectiva.</p>
      </div>

      <div class="card">
        <h3 style="margin-bottom:20px">📋 Dados da Sprint</h3>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="form-group">
            <label class="form-label" for="sprint-name">Nome da Sprint *</label>
            <input class="form-input" type="text" id="sprint-name" placeholder="Ex: Sprint 42"
              value="${s.name || ''}" required />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="start-date">Data de Início</label>
              <input class="form-input" type="date" id="start-date" value="${s.startDate || ''}" />
            </div>
            <div class="form-group">
              <label class="form-label" for="end-date">Data de Fim</label>
              <input class="form-input" type="date" id="end-date" value="${s.endDate || ''}" />
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <h3 style="margin-bottom:20px">👥 Dados do Time</h3>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="form-group">
            <label class="form-label" for="team-name">Nome do Time</label>
            <input class="form-input" type="text" id="team-name" placeholder="Ex: Time Fênix"
              value="${t.name || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="participant-count">Número de Participantes</label>
            <input class="form-input" type="number" id="participant-count" placeholder="Ex: 8" min="1"
              value="${t.participantCount || ''}" />
          </div>
        </div>
      </div>

      <div class="phase-nav">
        <button class="btn btn-ghost" id="btn-back">← Voltar</button>
        <button class="btn btn-primary" id="btn-start-journey">⚔️ INICIAR JORNADA</button>
      </div>

      <p class="text-muted" style="margin-top:10px;font-size:0.8125rem;text-align:right">* Campo obrigatório</p>
    </div>
  `;

  root.querySelector('#btn-back').addEventListener('click', () => setPhase('roleSelect'));

  root.querySelector('#btn-start-journey').addEventListener('click', () => {
    const name = root.querySelector('#sprint-name').value.trim();
    if (!name) {
      root.querySelector('#sprint-name').focus();
      root.querySelector('#sprint-name').style.borderColor = 'var(--danger)';
      return;
    }

    setState({
      sprint: {
        name,
        startDate: root.querySelector('#start-date').value,
        endDate: root.querySelector('#end-date').value,
      },
      team: {
        name: root.querySelector('#team-name').value.trim(),
        participantCount: root.querySelector('#participant-count').value,
      },
    });

    completePhase('setup');
    setPhase('lobby');
  });
}
