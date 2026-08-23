/**
 * Lobby Screen — waiting room before the retrospective starts
 *
 * Scrum Master view:
 *   - Shareable link, real-time participant counter, "Start" button
 *
 * Team member view:
 *   - Sprint name/period, "waiting for SM" message, live participant count
 */

import { getState, setState, setPhase } from '../state/store.js';
import { getRole } from '../state/store.js';
import { getSessionUrl, subscribeParticipants } from '../services/presence.js';

let _unsubscribe = null;

export function renderLobby(root) {
  const state  = getState();
  const sprint = state.sprint;
  const role   = getRole();
  const isSM   = role === 'scrum_master';
  const sessionUrl = getSessionUrl();

  const sprintLabel = sprint.name
    ? `${sprint.name}${sprint.startDate ? ` · ${formatDate(sprint.startDate)} – ${formatDate(sprint.endDate)}` : ''}`
    : 'Sprint';

  if (isSM) {
    root.innerHTML = `
      <div class="screen-lobby screen-enter">
        <div class="lobby-card">
          <div class="lobby-header">
            <div class="lobby-icon">🏰</div>
            <h2 class="lobby-title">Sala de Espera</h2>
            <p class="lobby-sprint-name">${sprintLabel}</p>
          </div>

          <div class="lobby-participants">
            <div class="lobby-count" id="participant-count">0</div>
            <div class="lobby-count-label">participante(s) na sala</div>
          </div>

          <div class="lobby-share">
            <p class="lobby-share-label">🔗 Compartilhe este link com o time:</p>
            <div class="lobby-link-row">
              <input class="form-input lobby-link-input" id="session-link" readonly value="${sessionUrl}" />
              <button class="btn btn-ghost btn-sm" id="btn-copy">📋 Copiar</button>
            </div>
            <p class="lobby-share-hint text-muted" id="copy-feedback"></p>
          </div>

          <div class="lobby-actions">
            <button class="btn btn-ghost" id="btn-back-setup">← Voltar ao Setup</button>
            <button class="btn btn-primary btn-lg" id="btn-start-retro">⚔️ INICIAR RETROSPECTIVA</button>
          </div>
        </div>
      </div>
    `;

    // Copy link
    root.querySelector('#btn-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(sessionUrl);
        const fb = root.querySelector('#copy-feedback');
        if (fb) {
          fb.textContent = '✅ Link copiado!';
          setTimeout(() => { if (fb) fb.textContent = ''; }, 2500);
        }
      } catch {
        root.querySelector('#session-link').select();
      }
    });

    // Back to setup
    root.querySelector('#btn-back-setup').addEventListener('click', () => {
      cleanup();
      setPhase('setup');
    });

    // Start retrospective — moves all participants to checkin via shared state
    root.querySelector('#btn-start-retro').addEventListener('click', () => {
      cleanup();
      setState({ retroStarted: true, currentPhase: 'checkin' });
    });

  } else {
    // ── Team member view ─────────────────────────────────────────────────────
    root.innerHTML = `
      <div class="screen-lobby screen-enter">
        <div class="lobby-card">
          <div class="lobby-header">
            <div class="lobby-icon">⏳</div>
            <h2 class="lobby-title lobby-title-wait">Aguardando início…</h2>
            <p class="lobby-sprint-name">${sprintLabel}</p>
          </div>

          <div class="lobby-waiting-msg">
            <p>O Scrum Master ainda não iniciou a retrospectiva.</p>
            <p class="lobby-waiting-hint">Você será redirecionado automaticamente quando ela começar.</p>
          </div>

          <div class="lobby-participants lobby-participants-team">
            <div class="lobby-count" id="participant-count">0</div>
            <div class="lobby-count-label">participante(s) na sala</div>
          </div>
        </div>
      </div>
    `;
  }

  // Real-time participant counter (both views)
  _unsubscribe = subscribeParticipants((count) => {
    const el = root.querySelector('#participant-count');
    if (el) el.textContent = count;
  });
}

function cleanup() {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}
