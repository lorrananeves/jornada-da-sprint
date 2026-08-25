/**
 * PhaseTimer — timer de timebox visível para todos os participantes.
 *
 * Uso:
 *   const timer = createPhaseTimer(root, phase);
 *   // quando sair da tela:
 *   timer.destroy();
 *
 * Funciona assim:
 *   - Lê phaseDurations[phase] e phaseStartedAt[phase] do estado.
 *   - Se duração == 0 ou startedAt não existe, não renderiza nada.
 *   - Atualiza a cada segundo com setTimeout (sem setInterval pra evitar drift).
 *   - Nos últimos 20% do tempo (mín. 1 min) muda para estado "warning".
 *   - Quando o tempo acaba, toca um bip via Web Audio API e mostra "Tempo esgotado!".
 */

import { getState, subscribe } from '../state/store.js';

const WARNING_RATIO = 0.2;   // 20% do tempo restante → aviso
const WARNING_MIN_SECS = 60; // pelo menos 60 s de aviso independente da duração

export function createPhaseTimer(containerEl, phase) {
  let _raf = null;
  let _beeped = false;
  let _unsubStore = null;
  let _timerEl = null;

  function getTimerData() {
    const state = getState();
    const durationMins = (state.phaseDurations || {})[phase] || 0;
    const startedAt    = (state.phaseStartedAt  || {})[phase];
    return { durationMins, startedAt };
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 200, 400].forEach((delay) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime + delay / 1000);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay / 1000 + 0.3);
        osc.start(ctx.currentTime + delay / 1000);
        osc.stop(ctx.currentTime + delay / 1000 + 0.35);
      });
    } catch (_) { /* sem áudio — sem problema */ }
  }

  function formatTime(totalSecs) {
    const s = Math.max(0, totalSecs);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function tick() {
    if (!_timerEl || !_timerEl.isConnected) return;

    const { durationMins, startedAt } = getTimerData();

    if (!durationMins || !startedAt) {
      _timerEl.style.display = 'none';
      scheduleNext();
      return;
    }

    const totalSecs   = durationMins * 60;
    const elapsed     = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    const remaining   = totalSecs - elapsed;
    const isOver      = remaining <= 0;
    const warnThresh  = Math.max(WARNING_MIN_SECS, Math.floor(totalSecs * WARNING_RATIO));
    const isWarning   = !isOver && remaining <= warnThresh;

    if (isOver && !_beeped) {
      _beeped = true;
      beep();
    }

    _timerEl.style.display = '';
    _timerEl.className = `phase-timer${isWarning ? ' phase-timer--warning' : ''}${isOver ? ' phase-timer--over' : ''}`;

    const timeDisplay = isOver
      ? `<span class="phase-timer-over-text">⏰ Tempo esgotado!</span>`
      : `<span class="phase-timer-digits">${formatTime(remaining)}</span>`;

    _timerEl.innerHTML = `
      <span class="phase-timer-icon">⏱️</span>
      ${timeDisplay}
    `;

    if (!isOver) scheduleNext();
  }

  function scheduleNext() {
    _raf = setTimeout(tick, 500);
  }

  function mount() {
    const { durationMins } = getTimerData();
    if (!durationMins) return; // fase sem timer — não insere nada

    _timerEl = document.createElement('div');
    _timerEl.className = 'phase-timer';
    _timerEl.setAttribute('role', 'timer');
    _timerEl.setAttribute('aria-live', 'off');

    // Insere logo após o phase-header, se existir; senão no topo do container
    const header = containerEl.querySelector('.phase-header');
    if (header) {
      header.insertAdjacentElement('afterend', _timerEl);
    } else {
      containerEl.prepend(_timerEl);
    }

    tick();

    // Re-monta se o estado mudar (ex: SM resetou phaseStartedAt remotamente)
    _unsubStore = subscribe((state) => {
      const dur = (state.phaseDurations || {})[phase] || 0;
      if (!dur && _timerEl) {
        _timerEl.style.display = 'none';
      }
    });
  }

  function destroy() {
    clearTimeout(_raf);
    if (_unsubStore) _unsubStore();
    if (_timerEl && _timerEl.isConnected) _timerEl.remove();
    _timerEl = null;
  }

  mount();

  return { destroy };
}
