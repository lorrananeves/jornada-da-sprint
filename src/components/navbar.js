/**
 * Navbar + Phase Progress Bar Component
 */

import { getState, subscribe, setPhase, setLocalPhase, setState, isSM } from '../state/store.js';
import { subscribeParticipants } from '../services/presence.js';
import { subscribeConnectivity } from '../services/firebase.js';
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
const HIDDEN_PHASES = new Set(['home', 'roleSelect', 'lobby', 'auth', 'smDashboard']);

/** Unsubscribe handle para a assinatura de presença atual */
let _unsubPresence = null;
/** Unsubscribe handle para o indicador de conectividade */
let _unsubConnectivity = null;
/** Estado atual de conectividade (true = online) */
let _isOnline = true;

function renderNavbar() {
  const root = qs('#navbar-root');
  if (!root) return;

  const state = getState();
  const { currentPhase, xp, completedPhases } = state;

  // hide navbar on pre-retro screens
  if (HIDDEN_PHASES.has(currentPhase)) {
    _stopPresence();
    _stopConnectivity();
    root.innerHTML = '';
    return;
  }

  root.innerHTML = `
    <nav class="navbar">
      <div class="navbar-inner">
        <div class="navbar-top">
          <span class="navbar-brand">⚔️ Jornada da Sprint</span>
          <div class="navbar-top-right">
            <span class="connectivity-badge connectivity-badge--${_isOnline ? 'online' : 'offline'}" id="connectivity-badge" title="${_isOnline ? 'Conectado ao Firestore' : 'Sem conexão — alterações podem não ser salvas'}">
              <span class="connectivity-dot"></span>
              <span class="connectivity-label">${_isOnline ? 'conectado' : 'offline'}</span>
            </span>
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

  // Assina conectividade — cancela assinatura anterior se houver
  _stopConnectivity();
  _unsubConnectivity = subscribeConnectivity((online) => {
    _isOnline = online;
    const badge = qs('#connectivity-badge');
    if (!badge) return;
    badge.className = `connectivity-badge connectivity-badge--${online ? 'online' : 'offline'}`;
    badge.title = online ? 'Conectado ao Firestore' : 'Sem conexão — alterações podem não ser salvas';
    badge.querySelector('.connectivity-dot').className = 'connectivity-dot';
    badge.querySelector('.connectivity-label').textContent = online ? 'conectado' : 'offline';
  });

  // Assina contagem de presença — cancela assinatura anterior se houver
  _stopPresence();
  _unsubPresence = subscribeParticipants((count) => {
    // Atualiza o pill de presença na navbar
    const pill = qs('#online-pill');
    if (pill) {
      pill.querySelector('.online-count').textContent = count;
      pill.title = `${count} participante${count !== 1 ? 's' : ''} online`;
    }

    // SM sincroniza participantCount em tempo real para que os contadores de
    // check-in e "Terminei" reflitam entradas tardias durante a retro.
    // Histerese: participantCount só sobe, nunca desce — evita que quedas de rede
    // momentâneas (celular bloqueado, Wi-Fi instável) reduzam o denominador e
    // revelem prematuramente o resultado do check-in.
    if (isSM() && count > 0) {
      const state = getState();
      const current = parseInt(state.team?.participantCount, 10) || 0;
      if (state.retroStarted && count > current) {
        setState({ team: { ...state.team, participantCount: count } });
      }
    }
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
        // SM avança globalmente (persiste no Firestore); membros do time
        // navegam só localmente, igual ao padrão dos botões "← Voltar"
        if (isSM()) setPhase(phase);
        else setLocalPhase(phase);
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

function _stopConnectivity() {
  if (_unsubConnectivity) {
    _unsubConnectivity();
    _unsubConnectivity = null;
  }
}

export function initNavbar() {
  renderNavbar();
  subscribe(renderNavbar);
}
