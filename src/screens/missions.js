/**
 * Missions Screen
 */

import {
  getState, addMission, removeMission, addXP, setPhase, setLocalPhase, completePhase, setState, isSM,
} from '../state/store.js';
import { xpForMission } from '../services/xp.js';
import { showXPToast } from '../components/xpToast.js';
import { showModal } from '../components/modal.js';
import { uid, escapeHTML, preserveInputs } from '../utils/dom.js';
import { getPriorityLabel, getStrategyLabel, formatDate } from '../utils/format.js';
import { createPhaseTimer } from '../components/phaseTimer.js';

const PRIORITIES = [
  { id: 'high',   label: 'Alta',  class: 'priority-badge-high' },
  { id: 'medium', label: 'Média', class: 'priority-badge-medium' },
  { id: 'low',    label: 'Baixa', class: 'priority-badge-low' },
];

export function renderMissions(root) {
  let _timer = null;

  function render() {
    const state = getState();
    const missions = state.missions;
    const prefill = state._prefillMission || null;
    const showWarning = missions.length > 3;

    preserveInputs(root, () => { root.innerHTML = `
      <div class="screen-missions screen-enter">
        <div class="phase-header">
          <div class="phase-header-top">
            <span class="phase-icon">🚀</span>
            <h2 class="phase-title">Missões da Próxima Sprint</h2>
          </div>
          <p class="phase-description">
            Transforme soluções em compromissos concretos para a próxima Sprint.
          </p>
        </div>

        <div class="warning-banner" style="margin-bottom:16px">
          <span>💡</span>
          <span>Recomendação: Foque nas missões mais impactantes e realistas. Menos missões, melhor execução.</span>
        </div>

        ${showWarning ? `
          <div class="warning-banner" style="margin-bottom:16px;border-color:rgba(248,81,73,0.4);background:var(--danger-dim);color:var(--danger)">
            <span>⚠️</span>
            <span><strong>Temos muitas missões!</strong> Quais realmente merecem entrar na próxima Sprint? Considere remover algumas.</span>
          </div>
        ` : ''}

        <!-- Add Mission Form -->
        <div class="card" style="margin-bottom:20px">
          <h4 style="margin-bottom:16px">+ Nova Missão</h4>
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="form-group">
              <label class="form-label">Título *</label>
              <input class="form-input" type="text" id="mission-title"
                placeholder="Ex: Estabelecer cerimônia de alinhamento semanal"
                value="${escapeHTML(prefill ? prefill.text : '')}" />
            </div>
            <div class="form-group">
              <label class="form-label">Descrição</label>
              <textarea class="form-textarea" id="mission-desc" placeholder="Detalhe a missão..." style="min-height:64px"></textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Estratégia</label>
                <select class="form-select" id="mission-strategy">
                  <option value="">— Nenhuma —</option>
                  <option value="prevent" ${prefill && prefill.strategy === 'prevent' ? 'selected' : ''}>🛡️ Prevenir</option>
                  <option value="reduce" ${prefill && prefill.strategy === 'reduce' ? 'selected' : ''}>🧪 Reduzir Impacto</option>
                  <option value="handle" ${prefill && prefill.strategy === 'handle' ? 'selected' : ''}>🤝 Lidar Melhor</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Prioridade</label>
                <select class="form-select" id="mission-priority">
                  <option value="high">🔴 Alta</option>
                  <option value="medium" selected>🟡 Média</option>
                  <option value="low">🟢 Baixa</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Responsável (opcional)</label>
                <input class="form-input" type="text" id="mission-owner" placeholder="Nome ou função" />
              </div>
              <div class="form-group">
                <label class="form-label">Prazo (opcional)</label>
                <input class="form-input" type="date" id="mission-deadline" />
              </div>
            </div>
            <button class="btn btn-primary" id="btn-add-mission">🚀 ADICIONAR MISSÃO</button>
          </div>
        </div>

        <!-- Missions List -->
        ${missions.length > 0 ? `
          <div>
            <h4 style="margin-bottom:12px">
              Missões definidas
              <span class="badge badge-info" style="margin-left:8px">${missions.length}</span>
            </h4>
            <div class="missions-list">
              ${missions.map((m) => `
                <div class="card mission-card">
                  <div class="mission-header">
                    <div>
                      <div class="mission-title">🚀 ${escapeHTML(m.title)}</div>
                      ${m.description ? `<p style="font-size:0.875rem;color:var(--text-muted);margin-top:4px">${escapeHTML(m.description)}</p>` : ''}
                    </div>
                    <button class="btn btn-danger btn-sm btn-icon" data-remove="${escapeHTML(m.id)}" title="Remover missão">🗑️</button>
                  </div>
                  <div class="mission-meta">
                    <span class="badge ${PRIORITIES.find((p) => p.id === m.priority)?.class || 'badge-info'}">
                      ${getPriorityLabel(m.priority)}
                    </span>
                    ${m.strategy ? `<span class="badge badge-info">${getStrategyLabel(m.strategy)}</span>` : ''}
                    ${m.owner ? `<span class="badge" style="background:var(--purple-dim);color:var(--purple)">👤 ${escapeHTML(m.owner)}</span>` : ''}
                    ${m.deadline ? `<span class="badge badge-accent">📅 ${formatDate(m.deadline)}</span>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : `
          <div class="empty-state">
            <div class="empty-state-icon">🚀</div>
            <p class="empty-state-text">Nenhuma missão adicionada ainda.</p>
          </div>
        `}

        <div class="phase-nav">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
          ${isSM() ? `<button class="btn btn-primary" id="btn-next">🏆 CONCLUIR JORNADA →</button>` : `<span class="text-muted" style="font-size:0.875rem">Aguardando o Scrum Master avançar…</span>`}
        </div>
      </div>
    `; }); // end preserveInputs

    if (_timer) _timer.destroy();
    _timer = createPhaseTimer(root.querySelector('.screen-missions'), 'missions');

    attachEvents(prefill);
  }

  function attachEvents(prefill) {
    root.querySelector('#btn-add-mission').addEventListener('click', () => {
      const title = root.querySelector('#mission-title').value.trim();
      if (!title) {
        root.querySelector('#mission-title').style.borderColor = 'var(--danger)';
        root.querySelector('#mission-title').focus();
        return;
      }
      root.querySelector('#mission-title').style.borderColor = '';

      const mission = {
        id: uid(),
        title,
        description: root.querySelector('#mission-desc').value.trim(),
        strategy: root.querySelector('#mission-strategy').value,
        priority: root.querySelector('#mission-priority').value,
        owner: root.querySelector('#mission-owner').value.trim(),
        deadline: root.querySelector('#mission-deadline').value,
      };

      // Clear prefill
      if (prefill) setState({ _prefillMission: null });

      addMission(mission);
      addXP(xpForMission());
      showXPToast(xpForMission(), 'Missão adicionada');
      render();
    });

    // Remove missions
    root.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const confirmed = await showModal({
          title: 'Remover Missão',
          body: 'Deseja remover esta missão?',
          confirmLabel: 'Remover',
          confirmClass: 'btn btn-danger',
        });
        if (confirmed) {
          removeMission(btn.dataset.remove);
          render();
        }
      });
    });

    root.querySelector('#btn-back').addEventListener('click', () => {
      if (isSM()) setPhase('combat');
      else setLocalPhase('roleSelect');
    });
    root.querySelector('#btn-next')?.addEventListener('click', () => {
      completePhase('missions');
      setPhase('complete');
    });
  }

  render();
}
