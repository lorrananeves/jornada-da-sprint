/**
 * PhaseTimer — timer de timebox controlável diretamente na tela de cada fase.
 *
 * Comportamento:
 *   - O SM vê controles para definir a duração (input), iniciar, pausar e
 *     zerar o timer — tudo inline, sem sair da fase.
 *   - Membros do time só veem o timer quando ele está rodando.
 *   - Todos os participantes veem o mesmo estado em tempo real (via store/Firestore).
 *   - Nos últimos 20% do tempo (mín. 1 min) muda para estado "warning".
 *   - Quando o tempo acaba, toca um bip e mostra "Tempo esgotado!".
 *
 * API:
 *   const timer = createPhaseTimer(containerEl, phase);
 *   timer.destroy(); // ao sair da tela
 */

import { getState, setState, subscribe, isSM } from '../state/store.js';

const WARNING_RATIO    = 0.2;   // 20% restante → aviso
const WARNING_MIN_SECS = 60;    // mínimo 60 s de aviso

export function createPhaseTimer(containerEl, phase) {
  let _tickTimer   = null;
  let _beeped      = false;
  let _unsubStore  = null;
  let _wrapEl      = null;   // container raiz do componente

  // ── Áudio ────────────────────────────────────────────────────────────────────

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
    } catch { /* sem áudio — sem problema */ }
  }

  function formatTime(totalSecs) {
    const s   = Math.max(0, totalSecs);
    const m   = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  // ── Leitura do estado ─────────────────────────────────────────────────────────

  function getTimerData() {
    const state = getState();
    const durationMins = (state.phaseDurations || {})[phase] || 0;
    const startedAt    = (state.phaseStartedAt  || {})[phase] || null;
    return { durationMins, startedAt };
  }

  // ── Escrita no estado (SM only) ───────────────────────────────────────────────

  function saveDuration(mins) {
    const state = getState();
    setState({
      phaseDurations: { ...(state.phaseDurations || {}), [phase]: mins },
    });
  }

  function saveStart() {
    const state = getState();
    const startedAt = new Date().toISOString();
    setState({
      phaseStartedAt: { ...(state.phaseStartedAt || {}), [phase]: startedAt },
    });
    _beeped = false;
  }

  function saveStop() {
    const state = getState();
    setState({
      phaseStartedAt: { ...(state.phaseStartedAt || {}), [phase]: null },
    });
    _beeped = false;
  }

  // ── Renderização ──────────────────────────────────────────────────────────────

  function renderTimerEl() {
    const { durationMins, startedAt } = getTimerData();
    const sm      = isSM();
    const running = !!startedAt && durationMins > 0;

    // Nenhum timer configurado e não é SM → não mostra nada
    if (!running && !sm) {
      if (_wrapEl) _wrapEl.style.display = 'none';
      return;
    }

    if (_wrapEl) _wrapEl.style.display = '';

    if (running) {
      // ── Modo exibição do timer ────────────────────────────────────────────────
      const totalSecs  = durationMins * 60;
      const elapsed    = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      const remaining  = totalSecs - elapsed;
      const isOver     = remaining <= 0;
      const warnThresh = Math.max(WARNING_MIN_SECS, Math.floor(totalSecs * WARNING_RATIO));
      const isWarning  = !isOver && remaining <= warnThresh;

      if (isOver && !_beeped) {
        _beeped = true;
        beep();
      }

      const timerClass = `phase-timer${isWarning ? ' phase-timer--warning' : ''}${isOver ? ' phase-timer--over' : ''}`;

      const timeDisplay = isOver
        ? `<span class="phase-timer-over-text">⏰ Tempo esgotado!</span>`
        : `<span class="phase-timer-digits">${formatTime(remaining)}</span>`;

      _wrapEl.innerHTML = `
        <div class="${timerClass}" role="timer" aria-live="off">
          <span class="phase-timer-icon">⏱️</span>
          ${timeDisplay}
          ${sm ? `<button class="btn btn-ghost btn-sm phase-timer-stop-btn" title="Parar timer" style="margin-left:8px;padding:4px 10px">⏹ Parar</button>` : ''}
        </div>
      `;

      if (sm) {
        _wrapEl.querySelector('.phase-timer-stop-btn').addEventListener('click', () => {
          saveStop();
        });
      }

      if (!isOver) scheduleNext();

    } else if (sm) {
      // ── Modo configuração (SM, timer parado) ─────────────────────────────────
      const currentDur = durationMins || '';
      _wrapEl.innerHTML = `
        <div class="phase-timer-setup">
          <span class="phase-timer-icon" style="font-size:1rem">⏱️</span>
          <input
            class="form-input phase-timer-input"
            type="number"
            min="1"
            max="60"
            placeholder="min"
            value="${currentDur}"
            title="Duração em minutos"
          />
          <span class="phase-timer-unit">min</span>
          <button class="btn btn-ghost btn-sm phase-timer-start-btn" ${durationMins < 1 ? 'disabled' : ''}>
            ▶ Iniciar timer
          </button>
        </div>
      `;

      const input    = _wrapEl.querySelector('.phase-timer-input');
      const startBtn = _wrapEl.querySelector('.phase-timer-start-btn');

      input.addEventListener('input', () => {
        const val = parseInt(input.value, 10);
        const valid = !isNaN(val) && val >= 1;
        startBtn.disabled = !valid;
        if (valid) saveDuration(val);
      });

      startBtn.addEventListener('click', () => {
        const val = parseInt(input.value, 10);
        if (isNaN(val) || val < 1) return;
        saveDuration(val);
        saveStart();
      });
    }
  }

  function scheduleNext() {
    _tickTimer = setTimeout(renderTimerEl, 500);
  }

  // ── Montagem ──────────────────────────────────────────────────────────────────

  function mount() {
    _wrapEl = document.createElement('div');
    _wrapEl.className = 'phase-timer-wrap';

    const header = containerEl.querySelector('.phase-header');
    if (header) {
      header.insertAdjacentElement('afterend', _wrapEl);
    } else {
      containerEl.prepend(_wrapEl);
    }

    renderTimerEl();

    // Re-renderiza quando o estado remoto muda (ex: SM inicia/para remotamente)
    let _prevDur       = (getState().phaseDurations || {})[phase] || 0;
    let _prevStartedAt = (getState().phaseStartedAt || {})[phase] || null;
    _unsubStore = subscribe((state) => {
      const dur       = (state.phaseDurations || {})[phase] || 0;
      const startedAt = (state.phaseStartedAt  || {})[phase] || null;
      if (dur !== _prevDur || startedAt !== _prevStartedAt) {
        _prevDur       = dur;
        _prevStartedAt = startedAt;
        clearTimeout(_tickTimer);
        _beeped = false;
        renderTimerEl();
      }
    });
  }

  // ── Destruição ────────────────────────────────────────────────────────────────

  function destroy() {
    clearTimeout(_tickTimer);
    if (_unsubStore) _unsubStore();
    if (_wrapEl && _wrapEl.isConnected) _wrapEl.remove();
    _wrapEl = null;
  }

  mount();

  return { destroy };
}
