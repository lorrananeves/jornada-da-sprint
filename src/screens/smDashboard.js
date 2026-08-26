/**
 * SM Dashboard — painel do Scrum Master autenticado
 *
 * Exibe:
 *   - Saudação com nome do usuário
 *   - Botão para criar nova retrospectiva
 *   - Lista das últimas retrospectivas salvas (link para retomar / ver relatório)
 *   - Botão de logout
 */

import { getCurrentUser, signOut } from '../services/auth.js';
import { loadSmSessions, deleteSmSession } from '../services/firebase.js';
import { setLocalPhase, startNewSession } from '../state/store.js';
import { showModal } from '../components/modal.js';
import { escapeHTML } from '../utils/dom.js';

export async function renderSmDashboard(root) {
  const user = getCurrentUser();
  if (!user) {
    setLocalPhase('auth');
    return;
  }

  // Mostra loading imediato
  root.innerHTML = `
    <div class="screen-sm-dashboard screen-enter">
      <div class="dashboard-header">
        <div>
          <h2 class="dashboard-title">⚔️ Minhas Retrospectivas</h2>
          <p class="text-muted dashboard-subtitle">Olá, <strong style="color:var(--text)">${escapeHTML(user.displayName || user.email)}</strong>!</p>
        </div>
        <div class="dashboard-header-actions">
          <button class="btn btn-primary" id="btn-new-retro">+ Nova Retrospectiva</button>
          <button class="btn btn-ghost btn-sm" id="btn-logout" title="Sair da conta">Sair</button>
        </div>
      </div>
      <div id="sessions-list" class="dashboard-sessions-list">
        <div class="empty-state">
          <div class="empty-state-icon">⏳</div>
          <p class="empty-state-text">Carregando suas retrospectivas…</p>
        </div>
      </div>
    </div>
  `;

  root.querySelector('#btn-new-retro').addEventListener('click', () => {
    startNewSession();
    setLocalPhase('setup');
  });

  root.querySelector('#btn-logout').addEventListener('click', async () => {
    const confirmed = await showModal({
      title: 'Sair da conta',
      body: 'Deseja realmente sair?',
      confirmLabel: 'Sair',
      confirmClass: 'btn btn-danger',
    });
    if (confirmed) {
      await signOut();
      // onAuthStateChanged no store.js vai redirecionar para home
    }
  });

  // Carrega sessões salvas
  let sessions = [];
  try {
    sessions = await loadSmSessions(user.uid);
  } catch (e) {
    console.warn('[SmDashboard] Erro ao carregar sessões:', e);
  }

  const listEl = root.querySelector('#sessions-list');
  if (!listEl) return;

  if (sessions.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🗺️</div>
        <p class="empty-state-text">Nenhuma retrospectiva ainda.<br>Clique em <strong style="color:var(--text)">+ Nova Retrospectiva</strong> para começar!</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = sessions.map((s) => {
    const statusLabel = _statusLabel(s.status);
    const date = s.createdAt ? _formatDate(s.createdAt) : '';
    const inviteUrl = s.sessionId ? `${window.location.origin}${window.location.pathname}?s=${s.sessionId}` : '';

    return `
      <div class="dashboard-session-card" data-session-id="${escapeHTML(s.sessionId || s.id)}">
        <div class="dashboard-session-info">
          <div class="dashboard-session-name">${escapeHTML(s.sprintName || 'Sprint sem nome')}</div>
          <div class="dashboard-session-meta">
            ${date ? `<span>📅 ${date}</span>` : ''}
            ${s.teamName ? `<span>👥 ${escapeHTML(s.teamName)}</span>` : ''}
            <span class="badge ${statusLabel.cls}">${statusLabel.label}</span>
          </div>
        </div>
        <div class="dashboard-session-actions">
          ${inviteUrl ? `
            <button class="btn btn-ghost btn-sm btn-copy-link" data-url="${escapeHTML(inviteUrl)}" title="Copiar link de convite">
              🔗 Link
            </button>
          ` : ''}
          <button class="btn btn-primary btn-sm btn-open-session"
            data-session-id="${escapeHTML(s.sessionId || s.id)}"
            data-phase="${escapeHTML(s.lastPhase || 'lobby')}">
            ${s.status === 'completed' ? '📋 Ver relatório' : '▶️ Abrir'}
          </button>
          <button class="btn btn-ghost btn-sm btn-delete-session"
            data-session-id="${escapeHTML(s.sessionId || s.id)}"
            title="Remover da lista">
            🗑️
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Copiar link de convite
  listEl.querySelectorAll('.btn-copy-link').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.dataset.url;
      try {
        await navigator.clipboard.writeText(url);
        const orig = btn.textContent;
        btn.textContent = '✅ Copiado!';
        setTimeout(() => { btn.textContent = orig; }, 2000);
      } catch {
        prompt('Copie o link de convite:', url);
      }
    });
  });

  // Abrir/retomar sessão
  listEl.querySelectorAll('.btn-open-session').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sessionId = btn.dataset.sessionId;
      resumeSession(sessionId);
    });
  });

  // Remover da lista
  listEl.querySelectorAll('.btn-delete-session').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sessionId = btn.dataset.sessionId;
      const confirmed = await showModal({
        title: '🗑️ Remover da lista',
        body: 'Isso remove apenas o registro do seu painel. Os dados da sessão não são apagados.',
        confirmLabel: 'Remover',
        confirmClass: 'btn btn-danger',
      });
      if (!confirmed) return;
      try {
        await deleteSmSession(user.uid, sessionId);
        // Remove o card do DOM imediatamente (sem recarregar)
        btn.closest('.dashboard-session-card')?.remove();
        if (!listEl.querySelector('.dashboard-session-card')) {
          listEl.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-icon">🗺️</div>
              <p class="empty-state-text">Nenhuma retrospectiva ainda.</p>
            </div>
          `;
        }
      } catch (e) {
        console.warn('[SmDashboard] Erro ao remover sessão:', e);
      }
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _statusLabel(status) {
  if (status === 'completed') return { label: '✅ Concluída', cls: 'badge-success' };
  if (status === 'active')    return { label: '▶️ Em andamento', cls: 'badge-info' };
  return { label: '⏸️ Setup', cls: 'badge-accent' };
}

function _formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * Retoma uma sessão existente: atualiza a URL com o sessionId e recarrega o store.
 */
function resumeSession(sessionId) {
  const url = new URL(window.location.href);
  url.searchParams.set('s', sessionId);
  // Recarregar a página com o novo ?s= é a forma mais simples e segura de
  // trocar de sessão, pois o store.js lê o sessionId apenas no bootstrap.
  window.location.href = url.toString();
}
