/**
 * @security Toda interpolação em innerHTML DEVE usar escapeHTML(). Nunca
 *   interpole valores vindos do usuário ou do Firestore sem escapar.
 *
 * SM Dashboard — painel do Scrum Master autenticado
 *
 * Exibe:
 *   - Saudação com nome do usuário
 *   - Botão para criar nova retrospectiva
 *   - Lista das últimas retrospectivas salvas (link para retomar / ver relatório)
 *   - Botão de logout
 *   - Painel de tendências: gráfico de humor + monstros recorrentes
 */

import { getCurrentUser, signOut } from '../services/auth.js';
import { loadSmSessions, deleteSmSession, loadCollection } from '../services/firebase.js';
import { setLocalPhase, startNewSession } from '../state/store.js';
import { showModal } from '../components/modal.js';
import { escapeHTML } from '../utils/dom.js';
import { calcCheckinStats, getMoodLabel } from '../services/stats.js';

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
      <div class="dashboard-trends-section">
        <h3 class="dashboard-trends-title">📊 Tendências</h3>
        <div id="trends-container">
          <p class="text-muted text-sm" style="padding:16px 0">Carregando…</p>
        </div>
      </div>
    </div>
  `;

  root.querySelector('#btn-new-retro').addEventListener('click', async () => {
    // startNewSession() é async: seta smDeviceId, smUid e currentPhase='setup'
    // internamente via setScalarState. Aguardar garante que o estado esteja
    // pronto antes de navegar — sem o await, setLocalPhase poderia disparar
    // a renderização de setup com o estado ainda vazio da sessão anterior.
    // setLocalPhase('setup') é desnecessário pois startNewSession já seta
    // currentPhase: 'setup' e notifica os listeners.
    await startNewSession();
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

  // Tendências (async, não bloqueia a renderização da lista)
  const trendsContainer = root.querySelector('#trends-container');
  if (trendsContainer) {
    renderTrends(trendsContainer, sessions).catch((e) => {
      console.warn('[SmDashboard] Erro ao renderizar tendências:', e);
      trendsContainer.innerHTML = '<p class="text-muted text-sm">Não foi possível carregar as tendências.</p>';
    });
  }

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

// ── Tendências ────────────────────────────────────────────────────────────────

async function renderTrends(container, sessions) {
  // Filtra apenas sessões concluídas com sessionId, mais recentes primeiro, até 10
  const completed = sessions
    .filter((s) => s.status === 'completed' && (s.sessionId || s.id))
    .slice(0, 10)
    .reverse(); // cronológico para o gráfico

  if (completed.length < 2) {
    container.innerHTML = '<p class="text-muted text-sm" style="padding:16px 0">Pelo menos 2 retrospectivas concluídas são necessárias para exibir tendências.</p>';
    return;
  }

  // Carrega checkins, monsters e missions de cada sessão em paralelo
  const results = await Promise.all(
    completed.map(async (s) => {
      const sid = s.sessionId || s.id;
      const [checkins, monsters, missions] = await Promise.all([
        loadCollection(sid, 'checkins').catch(() => []),
        loadCollection(sid, 'monsters').catch(() => []),
        loadCollection(sid, 'missions').catch(() => []),
      ]);
      const stats = calcCheckinStats(checkins);
      // Taxa de conclusão: missões com status 'done' / total (ignora sem status = pendente)
      const totalMissions = missions.length;
      const doneMissions  = missions.filter((m) => m.status === 'done').length;
      const completionRate = totalMissions > 0 ? doneMissions / totalMissions : null;
      return {
        label: s.sprintName || sid.slice(0, 6),
        average: stats.average,
        monsters,
        completionRate,
        totalMissions,
      };
    })
  );

  // ── SVG line chart dual: humor + taxa de conclusão de missões ───────────────
  const W = 480, H = 140, PAD = 36;

  // Linha 1: humor médio (escala 1–5 normalizada)
  const moodVals = results.map((r) => r.average);
  // Guard contra array com 1 elemento: denominator mínimo de 1 evita xStep=Infinity
  // que produziria SVG corrompido. Na prática o guard em completed.length < 2 acima
  // já previne isso, mas a defesa aqui protege contra futuros caminhos de código.
  const minV = Math.min(...moodVals, 1);
  const maxV = Math.max(...moodVals, 5);
  const range = maxV - minV || 1;
  const xStep = (W - PAD * 2) / Math.max(1, moodVals.length - 1);

  const toX = (i) => PAD + i * xStep;
  // Reserva a faixa superior (PAD → H - PAD - 20) para humor
  const toYMood = (v) => PAD + (H - PAD * 2 - 20) * (1 - (v - minV) / range);

  const moodPoints   = moodVals.map((v, i) => `${toX(i)},${toYMood(v)}`).join(' ');
  const moodAreaPts  = `${toX(0)},${H - PAD - 20} ` + moodVals.map((v, i) => `${toX(i)},${toYMood(v)}`).join(' ') + ` ${toX(moodVals.length - 1)},${H - PAD - 20}`;

  const moodDotsHTML = results.map((r, i) => {
    const mood = getMoodLabel(r.average);
    return `<circle cx="${toX(i)}" cy="${toYMood(r.average)}" r="5" fill="${mood.color}" stroke="var(--bg)" stroke-width="2">
      <title>${escapeHTML(r.label)}: humor ${r.average.toFixed(1)}</title>
    </circle>`;
  }).join('');

  // Linha 2: taxa de conclusão de missões (0–100%, mesma escala Y para comparação visual)
  const completionResults = results.filter((r) => r.completionRate !== null);
  let completionLineHTML = '';
  if (completionResults.length >= 2) {
    // Mapeia os índices dos pontos que têm dados de conclusão
    const completionPoints = results.map((r, i) =>
      r.completionRate !== null ? `${toX(i)},${toYMood(r.completionRate * 5)}` : null
    ).filter(Boolean).join(' ');
    completionLineHTML = `
      <polyline points="${completionPoints}" fill="none" stroke="var(--success)" stroke-width="2" stroke-dasharray="4 2" stroke-linejoin="round" opacity="0.8"/>
      ${results.map((r, i) => r.completionRate !== null ? `
        <circle cx="${toX(i)}" cy="${toYMood(r.completionRate * 5)}" r="4" fill="var(--success)" stroke="var(--bg)" stroke-width="2">
          <title>${escapeHTML(r.label)}: ${Math.round(r.completionRate * 100)}% das missões concluídas (${r.totalMissions} missões)</title>
        </circle>
      ` : '').join('')}
    `;
  }

  const labelsHTML = results.map((r, i) => {
    const x = toX(i);
    const anchor = i === 0 ? 'start' : (i === results.length - 1 ? 'end' : 'middle');
    return `<text x="${x}" y="${H - 4}" text-anchor="${anchor}" font-size="9" fill="var(--text-muted)">${escapeHTML(r.label.slice(0, 10))}</text>`;
  }).join('');

  // Legenda inline
  const legendHTML = `
    <div class="trend-legend">
      <span class="trend-legend-item"><span class="trend-legend-dot" style="background:var(--info)"></span> Humor médio</span>
      ${completionResults.length >= 2 ? `<span class="trend-legend-item"><span class="trend-legend-dot" style="background:var(--success)"></span> % missões concluídas</span>` : ''}
    </div>
  `;

  const chartHTML = `
    ${legendHTML}
    <svg class="trend-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-label="Humor médio e taxa de conclusão de missões por sprint">
      <polygon points="${moodAreaPts}" fill="var(--info)" opacity="0.08"/>
      <polyline points="${moodPoints}" fill="none" stroke="var(--info)" stroke-width="2.5" stroke-linejoin="round"/>
      ${completionLineHTML}
      ${moodDotsHTML}
      ${labelsHTML}
    </svg>
  `;

  // ── Monstros recorrentes ──────────────────────────────────────────────────────
  const monsterFreq = {};
  for (const r of results) {
    const seen = new Set();
    for (const m of r.monsters) {
      // Ignora monstros absorvidos por merge — seu texto já está representado
      // pelo card que os absorveu, evitando contagem duplicada de recorrências.
      if (m.merged) continue;
      const key = m.text?.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      monsterFreq[key] = (monsterFreq[key] || { text: m.text, count: 0 });
      monsterFreq[key].count++;
    }
  }
  const recurring = Object.values(monsterFreq)
    .filter((m) => m.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const recurringHTML = recurring.length > 0 ? `
    <div class="trend-recurring">
      <h4 class="trend-section-title">👹 Monstros recorrentes</h4>
      <ul class="trend-recurring-list">
        ${recurring.map((m) => `
          <li class="trend-recurring-item">
            <span class="trend-recurring-text">${escapeHTML(m.text)}</span>
            <span class="badge badge-danger">${m.count}×</span>
          </li>
        `).join('')}
      </ul>
    </div>
  ` : '<p class="text-muted text-sm" style="margin-top:12px">Nenhum monstro recorrente encontrado.</p>';

  container.innerHTML = `
    <div class="trend-panel">
      <h4 class="trend-section-title">📈 Humor médio por Sprint</h4>
      ${chartHTML}
      ${recurringHTML}
    </div>
  `;
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
