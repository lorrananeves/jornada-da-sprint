/**
 * @security Toda interpolação em innerHTML DEVE usar escapeHTML(). Nunca
 *   interpole valores vindos do usuário ou do Firestore sem escapar.
 *
 * Lobby Screen — waiting room before the retrospective starts
 *
 * Scrum Master view:
 *   - Shareable link, real-time participant counter, "Start" button
 *
 * Team member view:
 *   - Sprint name/period, "waiting for SM" message, live participant count
 */

import { getState, setState, setPhase, setLocalPhase } from '../state/store.js';
import { getRole } from '../state/store.js';
import { joinSession, getSessionUrl, subscribeParticipants, stopHeartbeat, leaveSession } from '../services/presence.js';
import { escapeHTML } from '../utils/dom.js';
import { formatDate } from '../utils/format.js';

// Contagem atual de participantes vivos no lobby (atualizada pelo subscribe)
let _liveParticipantCount = 0;

let _unsubscribe = null;

export function renderLobby(root) {
  const state  = getState();
  const sprint = state.sprint;
  const role   = getRole();
  const isSM   = role === 'scrum_master';
  const sessionUrl = getSessionUrl();

  const sprintLabel = sprint.name
    ? `${escapeHTML(sprint.name)}${sprint.startDate ? ` · ${formatDate(sprint.startDate)} – ${formatDate(sprint.endDate)}` : ''}`
    : 'Sprint';

  if (isSM) {
    // Registra o SM como presente para que subscribeParticipants o contabilize
    joinSession();

    root.innerHTML = `
      <main class="screen-lobby screen-enter" role="main" aria-label="Sala de espera — Scrum Master">
        <div class="lobby-card">
          <div class="lobby-header">
            <div class="lobby-icon" aria-hidden="true">🏰</div>
            <h2 class="lobby-title">Sala de Espera</h2>
            <p class="lobby-sprint-name">${sprintLabel}</p>
          </div>

          <div class="lobby-participants" role="status" aria-live="polite" aria-label="Contagem de participantes">
            <div class="lobby-count" id="participant-count">0</div>
            <div class="lobby-count-label">participante(s) na sala</div>
          </div>

          <div class="lobby-share">
            <p class="lobby-share-label" id="link-share-label">🔗 Compartilhe este link com o time:</p>
            <div class="lobby-link-row">
              <input class="form-input lobby-link-input" id="session-link" readonly value="${escapeHTML(sessionUrl)}" aria-labelledby="link-share-label" aria-describedby="copy-feedback" />
              <button class="btn btn-ghost btn-sm" id="btn-copy" aria-label="Copiar link da sessão">📋 Copiar</button>
            </div>
            <p class="lobby-share-hint text-muted" id="copy-feedback" role="status" aria-live="polite"></p>
          </div>

          <div class="lobby-actions">
            <button class="btn btn-ghost" id="btn-back-setup">← Voltar ao Setup</button>
            <button class="btn btn-primary btn-lg" id="btn-start-retro" aria-label="Iniciar a retrospectiva para todos os participantes">⚔️ INICIAR RETROSPECTIVA</button>
          </div>
        </div>
      </main>
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

    // Back to setup — saída voluntária: para heartbeat e remove presença
    root.querySelector('#btn-back-setup').addEventListener('click', () => {
      cleanupFull();
      setPhase('setup');
    });

    // Start retrospective — mantém heartbeat ativo para rastrear entradas tardias
    root.querySelector('#btn-start-retro').addEventListener('click', () => {
      const state = getState();
      // Cancela apenas o listener da UI do lobby, sem parar o heartbeat
      cleanupView();
      setState({
        retroStarted: true,
        currentPhase: 'checkin',
        team: { ...state.team, participantCount: _liveParticipantCount },
      });
    });

  } else {
    // ── Team member view ─────────────────────────────────────────────────────
    // Reinicia o heartbeat após F5: o setInterval estava em memória e foi
    // perdido no reload — sem isso a presença expira em ≤ EXPIRE_MS e o
    // membro some do contador sem poder voltar sem reentrar pelo link.
    joinSession();

    root.innerHTML = `
      <main class="screen-lobby screen-enter" role="main" aria-label="Sala de espera — aguardando início">
        <div class="lobby-card">
          <div class="lobby-header">
            <div class="lobby-icon" aria-hidden="true">⏳</div>
            <h2 class="lobby-title lobby-title-wait">Aguardando início…</h2>
            <p class="lobby-sprint-name">${sprintLabel}</p>
          </div>

          <div class="lobby-waiting-msg" role="status" aria-live="polite">
            <p>O Scrum Master ainda não iniciou a retrospectiva.</p>
            <p class="lobby-waiting-hint">Você será redirecionado automaticamente quando ela começar.</p>
          </div>

          <div class="lobby-participants lobby-participants-team" aria-label="Participantes na sala" aria-live="polite">
            <div class="lobby-count" id="participant-count">0</div>
            <div class="lobby-count-label">participante(s) na sala</div>
          </div>

          <div class="lobby-actions" style="justify-content:center;margin-top:16px">
            <button class="btn btn-ghost" id="btn-leave-lobby" aria-label="Sair da sala de espera">← Sair</button>
          </div>
        </div>
      </main>
    `;

    root.querySelector('#btn-leave-lobby').addEventListener('click', () => {
      cleanupFull();
      setLocalPhase('roleSelect');
    });
  }

  // Real-time participant counter (both views)
  _unsubscribe = subscribeParticipants((count) => {
    _liveParticipantCount = count;
    const el = root.querySelector('#participant-count');
    if (el) el.textContent = count;
  });
}

/** Cancela o listener de presença da UI do lobby sem tocar no heartbeat.
 *  Chamado ao iniciar a retro — o heartbeat deve continuar durante toda a retro. */
function cleanupView() {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
}

/** Para o heartbeat e remove a presença. Chamado apenas ao sair voluntariamente. */
function cleanupFull() {
  cleanupView();
  stopHeartbeat();
  leaveSession();
}

