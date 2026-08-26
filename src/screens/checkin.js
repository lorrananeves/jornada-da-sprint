/**
 * Check-in Screen
 */

import { getState, subscribe, addCheckin, addXP, setPhase, completePhase, isSM } from '../state/store.js';
import { uid } from '../utils/dom.js';
import { xpForCheckin } from '../services/xp.js';
import { calcCheckinStats, getMoodLabel } from '../services/stats.js';
import { showXPToast } from '../components/xpToast.js';
import { getScoreEmoji, getScoreLabel } from '../utils/format.js';
import { escapeHTML, preserveInputs } from '../utils/dom.js';
import { createPhaseTimer } from '../components/phaseTimer.js';

const SCORES = [1, 2, 3, 4, 5];

export function renderCheckin(root) {
  const _state = getState();
  let selectedScore = null;
  let _timer = null;
  let _unsub = null;

  function buildCheckinForm() {
    return `
      <div class="checkin-form">
        <h3 style="margin-bottom:18px">🌡️ Como foi essa Sprint para você?</h3>
        <div class="checkin-score-section">
          <p class="text-muted mb-2" style="font-size:0.875rem">Selecione uma nota:</p>
          <div class="score-buttons">
            ${SCORES.map((s) => `
              <button class="score-btn ${selectedScore === s ? 'selected' : ''}" data-score="${s}" title="${getScoreLabel(s)}" aria-label="${getScoreLabel(s)} (${getScoreEmoji(s)})" aria-pressed="${selectedScore === s}">
                <span style="font-size:1.5rem">${getScoreEmoji(s)}</span>
                <span style="font-size:0.75rem;font-weight:600;color:var(--text-muted)">${s}</span>
              </button>
            `).join('')}
          </div>
        </div>
        <div class="form-group" style="margin-top:16px">
          <label class="form-label" for="checkin-comment">Comentário (opcional)</label>
          <textarea class="form-textarea" id="checkin-comment" placeholder="Compartilhe algo de forma anônima..."></textarea>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button class="btn btn-primary" id="btn-register" ${selectedScore ? '' : 'disabled'}>
            ✅ REGISTRAR RESPOSTA
          </button>
        </div>
      </div>
    `;
  }

  function buildResults() {
    const checkins = getState().checkins;
    const { distribution, average, total } = calcCheckinStats(checkins);
    const mood = getMoodLabel(average);
    const comments = checkins.filter((c) => c.comment).map((c) => c.comment);

    const barsHTML = SCORES.map((s) => {
      const count = distribution[s] || 0;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      return `
        <div class="stat-bar-row">
          <span class="stat-bar-label">${getScoreEmoji(s)}</span>
          <div class="stat-bar-track">
            <div class="stat-bar-fill" style="width:${pct}%"></div>
          </div>
          <span class="stat-bar-count">${count}</span>
        </div>
      `;
    }).join('');

    const commentsHTML = comments.length
      ? `<div class="checkin-comments">
          <h4 style="margin-bottom:12px">💬 Comentários anônimos</h4>
          ${comments.map((c) => `<div class="checkin-comment-item">"${escapeHTML(c)}"</div>`).join('')}
        </div>`
      : '';

    return `
      <div class="checkin-results card">
        <div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <h3 style="margin-bottom:16px">📊 Resultado do Check-in</h3>
            ${barsHTML}
          </div>
          <div style="display:flex;flex-direction:column;gap:12px;min-width:140px">
            <div style="text-align:center;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px">
              <div style="font-size:2rem;font-weight:800;color:${mood.color}">${average.toFixed(1)}</div>
              <div style="font-size:0.8125rem;color:var(--text-muted)">Média</div>
            </div>
            <div style="text-align:center;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px">
              <div style="font-size:2rem;font-weight:800;color:var(--info)">${total}</div>
              <div style="font-size:0.8125rem;color:var(--text-muted)">Respostas</div>
            </div>
            <div style="text-align:center;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px">
              <div style="font-size:1rem;font-weight:700;color:${mood.color}">${mood.label}</div>
            </div>
          </div>
        </div>
        ${commentsHTML}
      </div>
    `;
  }

  function buildResponseIndicator(answered, total) {
    if (!total) return '';
    const allDone = answered >= total;
    const pct = Math.round((answered / total) * 100);
    return `
      <div class="checkin-progress${allDone ? ' checkin-progress--done' : ''}">
        <div class="checkin-progress-label">
          <span>${allDone ? '✅' : '⏳'} <strong>${answered} de ${total}</strong> pessoa${total !== 1 ? 's' : ''} respondeu${answered !== 1 ? 'ram' : ''}</span>
          <span class="checkin-progress-pct">${pct}%</span>
        </div>
        <div class="checkin-progress-track">
          <div class="checkin-progress-fill${allDone ? ' checkin-progress-fill--done' : ''}" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }

  function render() {
    const state = getState();
    const checkins = state.checkins;
    const participantCount = parseInt(state.team?.participantCount, 10) || 0;
    preserveInputs(root, () => { root.innerHTML = `
      <div class="screen-checkin screen-enter">
        <div class="phase-header">
          <div class="phase-header-top">
            <span class="phase-icon">🌡️</span>
            <h2 class="phase-title">Check-in da Equipe</h2>
          </div>
          <p class="phase-description">
            Como cada pessoa está se sentindo sobre essa Sprint? Respostas anônimas.
          </p>
        </div>

        ${buildResponseIndicator(checkins.length, participantCount)}

        <div id="checkin-form-area">
          ${buildCheckinForm()}
        </div>

        ${checkins.length > 0 ? `
          <div style="margin-top:8px;display:flex;justify-content:flex-end">
            <button class="btn btn-ghost btn-sm" id="btn-show-results">
              📊 VER RESULTADO (${checkins.length} resposta${checkins.length !== 1 ? 's' : ''})
            </button>
          </div>
          <div id="results-area"></div>
        ` : ''}

        <div class="phase-nav">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
          ${isSM() ? `<button class="btn btn-primary" id="btn-next">💎 PRÓXIMA FASE →</button>` : `<span class="text-muted" style="font-size:0.875rem">Aguardando o Scrum Master avançar…</span>`}
        </div>
      </div>
    `; }); // end preserveInputs

    if (_timer) _timer.destroy();
    _timer = createPhaseTimer(root.querySelector('.screen-checkin'), 'checkin');

    attachEvents();
  }

  function attachEvents() {
    // Score selection
    root.querySelectorAll('.score-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedScore = parseInt(btn.dataset.score);
        root.querySelectorAll('.score-btn').forEach((b) => {
          b.classList.remove('selected');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('selected');
        btn.setAttribute('aria-pressed', 'true');
        const reg = root.querySelector('#btn-register');
        if (reg) reg.disabled = false;
      });
    });

    // Register answer
    const regBtn = root.querySelector('#btn-register');
    if (regBtn) {
      regBtn.addEventListener('click', () => {
        if (!selectedScore) return;
        const comment = root.querySelector('#checkin-comment').value.trim() || null;
        addCheckin({ id: uid(), score: selectedScore, comment });
        addXP(xpForCheckin());
        showXPToast(xpForCheckin(), 'Check-in registrado');
        selectedScore = null;
        render();
      });
    }

    // Show results
    const showResultsBtn = root.querySelector('#btn-show-results');
    if (showResultsBtn) {
      showResultsBtn.addEventListener('click', () => {
        const area = root.querySelector('#results-area');
        if (area.innerHTML) {
          area.innerHTML = '';
          showResultsBtn.textContent = `📊 VER RESULTADO (${getState().checkins.length} respostas)`;
        } else {
          area.innerHTML = buildResults();
          showResultsBtn.textContent = '🔼 OCULTAR RESULTADO';
        }
      });
    }

    root.querySelector('#btn-back').addEventListener('click', () => setPhase('setup'));
    root.querySelector('#btn-next')?.addEventListener('click', () => {
      completePhase('checkin');
      setPhase('treasures');
    });
  }

  // Re-renderiza quando checkins mudam remotamente (ex: membro faz checkin no dispositivo dele).
  // Usa o próprio subscribe para detectar mudanças, e cancela quando a fase muda
  // (o router vai chamar outro renderer, este closure já não é relevante).
  let _lastCheckinCount = getState().checkins.length;
  let _lastParticipantCount = parseInt(getState().team?.participantCount, 10) || 0;
  _unsub = subscribe((state) => {
    // Sai da tela: cancela subscription para não acionar render em closure morto
    if (state.currentPhase !== 'checkin') {
      _unsub?.();
      _unsub = null;
      return;
    }
    const currentParticipantCount = parseInt(state.team?.participantCount, 10) || 0;
    const checkinCountChanged      = state.checkins.length !== _lastCheckinCount;
    const participantCountChanged  = currentParticipantCount !== _lastParticipantCount;
    if (checkinCountChanged || participantCountChanged) {
      _lastCheckinCount      = state.checkins.length;
      _lastParticipantCount  = currentParticipantCount;
      render();
    }
  });

  render();
}
