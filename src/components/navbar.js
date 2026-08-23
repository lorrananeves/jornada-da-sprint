/**
 * Navbar + Phase Progress Bar Component
 */

import { getState, subscribe, setPhase } from '../state/store.js';
import { subscribeParticipants } from '../services/presence.js';
import { qs } from '../utils/dom.js';

const PHASES = [
  { id: 'setup',     label: 'Setup',      emoji: '⚙️' },
  { id: 'checkin',   label: 'Check-in',   emoji: '🌡️' },
  { id: 'treasures', label: 'Tesouros',   emoji: '💎' },
  { id: 'monsters',  label: 'Monstros',   emoji: '👹' },
  { id: 'combat',    label: 'Combate',    emoji: '🛡️' },
  { id: 'missions',  label: 'Missões',    emoji: '🚀' },
  { id: 'complete',  label: 'Conclusão',  emoji: '🏆' },
  { id: 'report',    label: 'Relatório',  emoji: '📋' },
];

// Phases where navbar is hidden (no progress bar needed)
const HIDDEN_PHASES = new Set(['home', 'roleSelect', 'lobby']);

/** Unsubscribe handle para a assinatura de presença atual */
let _unsubPresence = null;

function renderNavbar() {
  const root = qs('#navbar-root');
  if (!root) return;

  const state = getState();
  const { currentPhase, xp, completedPhases } = state;

  // hide navbar on pre-retro screens
  if (HIDDEN_PHASES.has(currentPhase)) {
    _stopPresence();
    root.innerHTML = '';
    return;
  }

  root.innerHTML = `
    <nav class="navbar">
      <div class="navbar-inner">
        <div class="navbar-top">
          <span class="navbar-brand">⚔️ Jornada da Sprint</span>
          <div class="navbar-top-right">
            <span class="online-pill" id="online-pill" title="Participantes online">
              <span class="online-dot"></span>
              <span class="online-count">–</span>
            </span>
            <span class="xp-badge">⭐ ${xp.toLocaleString('pt-BR')} XP</span>
          </div>
        </div>
        <div class="progress-bar-track" role="progressbar">
          ${PHASES.map((phase) => {
            const isActive = phase.id === currentPhase;
            const isCompleted = completedPhases.includes(phase.id);
            let cls = 'phase-step';
            if (isActive) cls += ' active';
            else if (isCompleted) cls += ' completed';
            return `
              <div class="${cls}" data-phase="${phase.id}" title="${phase.emoji} ${phase.label}">
                <div class="phase-step-dot"></div>
                <span class="phase-step-label">${phase.label}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </nav>
  `;

  // Assina contagem de presença — cancela assinatura anterior se houver
  _stopPresence();
  _unsubPresence = subscribeParticipants((count) => {
    const pill = qs('#online-pill');
    if (!pill) return;
    pill.querySelector('.online-count').textContent = count;
    pill.title = `${count} participante${count !== 1 ? 's' : ''} online`;
  });

  // Phase step click — allow navigating to completed phases
  root.querySelectorAll('.phase-step').forEach((el) => {
    el.addEventListener('click', () => {
      const phase = el.dataset.phase;
      const state = getState();
      if (
        state.completedPhases.includes(phase) ||
        phase === state.currentPhase
      ) {
        setPhase(phase);
      }
    });
  });
}

function _stopPresence() {
  if (_unsubPresence) {
    _unsubPresence();
    _unsubPresence = null;
  }
}

export function initNavbar() {
  renderNavbar();
  subscribe(renderNavbar);
}
