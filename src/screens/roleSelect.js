/**
 * Role Select Screen — first screen shown to everyone
 * Asks: "Are you the Scrum Master or a team member?"
 *
 * Fluxo do membro do time:
 *   Link compartilhado (sessão já existe no Firestore) → store seta _guestAutoJoin=true
 *     → renderRoleSelect entra direto no lobby de forma síncrona
 *   Acesso direto / SM iniciando sessão nova → mostra tela de seleção normalmente
 */

import { setLocalPhase, setRole, getState } from '../state/store.js';
import { joinSession } from '../services/presence.js';
import { getCurrentUser } from '../services/auth.js';
import { loadSession } from '../services/firebase.js';

export function renderRoleSelect(root) {
  // O store.initFirebase seta _guestAutoJoin=true quando:
  //   - a sessão existe no Firestore E
  //   - nenhum role foi definido neste dispositivo (ou seja, veio de um link)
  // Leitura síncrona — sem async no renderer, sem race condition de DOM.
  if (getState()._guestAutoJoin) {
    _enterAsTeamMember();
    return;
  }

  _renderSelectionScreen(root);
}

// ── Tela de seleção de papel ──────────────────────────────────────────────────

function _renderSelectionScreen(root) {
  root.innerHTML = `
    <div class="screen-role-select">
      <div class="role-select-card screen-enter">
        <div class="home-logo">⚔️</div>
        <h1 class="home-title">JORNADA DA SPRINT</h1>
        <p class="home-subtitle">Como você está participando desta retrospectiva?</p>

        <div class="role-options">
          <button class="role-option-btn role-option-featured" id="btn-sm">
            <span class="role-option-icon">🧙</span>
            <span class="role-option-title">Scrum Master</span>
            <span class="role-option-desc">Configuro e facilito a retrospectiva</span>
          </button>
          <button class="role-option-btn" id="btn-team">
            <span class="role-option-icon">🗡️</span>
            <span class="role-option-title">Sou do Time</span>
            <span class="role-option-desc">Tenho o link ou ID da retrospectiva</span>
          </button>
        </div>
      </div>
    </div>
  `;

  root.querySelector('#btn-sm').addEventListener('click', () => {
    const user = getCurrentUser();
    if (user) {
      setLocalPhase('smDashboard');
    } else {
      setLocalPhase('auth');
    }
  });

  root.querySelector('#btn-team').addEventListener('click', () => {
    _showJoinForm(root);
  });
}

// ── Formulário "insira o link ou ID" ─────────────────────────────────────────

function _showJoinForm(root) {
  root.innerHTML = `
    <div class="screen-role-select">
      <div class="role-select-card screen-enter">
        <div class="home-logo">🗡️</div>
        <h1 class="home-title" style="font-size:1.5rem">Entrar na Retrospectiva</h1>
        <p class="home-subtitle">Cole o link ou o ID compartilhado pelo Scrum Master.</p>

        <div style="margin-top:24px;text-align:left">
          <label class="form-label" for="session-input">Link ou ID da retrospectiva</label>
          <input
            class="form-input"
            id="session-input"
            type="text"
            placeholder="https://... ou cole somente o ID"
            autocomplete="off"
            style="margin-top:6px"
          />
          <p class="text-muted" id="join-error" style="font-size:0.8125rem;margin-top:8px;color:var(--danger);min-height:1.2em"></p>
        </div>

        <div style="display:flex;gap:12px;margin-top:8px">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
          <button class="btn btn-primary" style="flex:1" id="btn-join">Entrar ⚔️</button>
        </div>
      </div>
    </div>
  `;

  const input   = root.querySelector('#session-input');
  const errorEl = root.querySelector('#join-error');
  const joinBtn = root.querySelector('#btn-join');

  root.querySelector('#btn-back').addEventListener('click', () => {
    _renderSelectionScreen(root);
  });

  // Permite pressionar Enter para confirmar
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinBtn.click();
  });

  joinBtn.addEventListener('click', async () => {
    const raw = input.value.trim();
    if (!raw) {
      errorEl.textContent = 'Cole o link ou o ID da retrospectiva.';
      input.focus();
      return;
    }

    // Extrai o ID — aceita URL completa ou somente o ID
    const sessionId = _extractSessionId(raw);
    if (!sessionId) {
      errorEl.textContent = 'Link ou ID inválido. Verifique e tente novamente.';
      input.focus();
      return;
    }

    joinBtn.disabled = true;
    joinBtn.textContent = '⏳ Verificando…';
    errorEl.textContent = '';

    // Verifica se a sessão existe no Firestore
    let session = null;
    try {
      session = await loadSession(sessionId);
    } catch {
      // falha de rede — deixa tentar mesmo assim
    }

    if (!session) {
      errorEl.textContent = 'Retrospectiva não encontrada. Verifique o link ou ID.';
      joinBtn.disabled = false;
      joinBtn.textContent = 'Entrar ⚔️';
      input.focus();
      return;
    }

    // Atualiza a URL com o ?s= e entra como membro
    const url = new URL(window.location.href);
    url.searchParams.set('s', sessionId);
    window.history.replaceState({}, '', url.toString());

    await _enterAsTeamMember();
  });

  input.focus();
}

// ── Entrada efetiva como membro do time ──────────────────────────────────────

async function _enterAsTeamMember() {
  setRole('team_member');
  await joinSession();
  setLocalPhase('lobby');
}

// ── Extrai o sessionId de uma URL ou string bruta ────────────────────────────

function _extractSessionId(raw) {
  // Tenta interpretar como URL e pegar o parâmetro ?s=
  try {
    const url = new URL(raw.includes('://') ? raw : `https://placeholder.com/?s=${raw}`);
    const s = url.searchParams.get('s');
    if (s && s.length >= 8) return s;
  } catch {
    // não é URL
  }
  // Último recurso: string pura sem espaços (pode ser o ID direto)
  if (/^[a-f0-9]{8,}$/i.test(raw)) return raw;
  return null;
}
