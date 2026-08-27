/**
 * @security Toda interpolação em innerHTML DEVE usar escapeHTML(). Nunca
 *   interpole valores vindos do usuário ou do Firestore sem escapar.
 *
 * Setup Screen — only accessible by Scrum Master
 */

import { getState, setState, setPhase, completePhase, setRole } from '../state/store.js';
import { getCurrentUser } from '../services/auth.js';
import { escapeHTML } from '../utils/dom.js';

export function renderSetup(root) {
  const state = getState();
  const s = state.sprint;
  const t = state.team;

  root.innerHTML = `
    <main class="screen-setup screen-enter" role="main" aria-label="Configurar a jornada">
      <div class="phase-header">
        <div class="phase-header-top">
          <span class="phase-icon" aria-hidden="true">⚙️</span>
          <h2 class="phase-title">Configurar a Jornada</h2>
        </div>
        <p class="phase-description">Defina as informações básicas antes de começar a retrospectiva.</p>
      </div>

      <div class="card">
        <h3 class="mb-5">📋 Dados da Sprint</h3>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="form-group">
            <label class="form-label" for="sprint-name">Nome da Sprint *</label>
            <input class="form-input" type="text" id="sprint-name" placeholder="Ex: Sprint 42"
              value="${escapeHTML(s.name || '')}" required aria-required="true" aria-describedby="setup-required-note" />
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
        <h3 class="mb-5">👥 Dados do Time</h3>
        <div class="form-group">
          <label class="form-label" for="team-name">Nome do Time</label>
          <input class="form-input" type="text" id="team-name" placeholder="Ex: Time Fênix"
            value="${escapeHTML(t.name || '')}" />
        </div>
      </div>

      <div class="phase-nav">
        <button class="btn btn-ghost" id="btn-back" aria-label="Voltar à tela anterior">← Voltar</button>
        <button class="btn btn-primary" id="btn-start-journey" aria-label="Confirmar configurações e iniciar a jornada">⚔️ INICIAR JORNADA</button>
      </div>

      <p class="text-muted" id="setup-required-note" style="margin-top:10px;font-size:0.8125rem;text-align:right">* Campo obrigatório</p>
    </main>
  `;

  root.querySelector('#btn-back').addEventListener('click', async () => {
    // SM autenticado volta ao dashboard; SM sem conta volta ao roleSelect
    const user = getCurrentUser();
    const { setLocalPhase } = await import('../state/store.js');
    setLocalPhase(user ? 'smDashboard' : 'roleSelect');
  });

  root.querySelector('#btn-start-journey').addEventListener('click', async () => {
    const name = root.querySelector('#sprint-name').value.trim();
    if (!name) {
      root.querySelector('#sprint-name').focus();
      root.querySelector('#sprint-name').style.borderColor = 'var(--danger)';
      return;
    }

    // Garante que o role de SM está definido antes de persistir
    // (necessário quando SM vem do dashboard sem ter passado pelo roleSelect)
    const { getRole } = await import('../state/store.js');
    if (!getRole() || getRole() === 'team_member') {
      setRole('scrum_master');
    }

    setState({
      sprint: {
        name,
        startDate: root.querySelector('#start-date').value,
        endDate: root.querySelector('#end-date').value,
      },
      team: {
        name: root.querySelector('#team-name').value.trim(),
        participantCount: '',
      },
    });

    completePhase('setup');
    setPhase('lobby');
  });
}
