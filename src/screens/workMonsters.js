/**
 * @security Toda interpolação em innerHTML DEVE usar escapeHTML(). Nunca
 *   interpole valores vindos do usuário ou do Firestore sem escapar.
 *
 * WorkMonsters Screen — Tela unificada de trabalho nos monstros
 *
 * Substitui as telas separadas de Combat e Missions.
 *
 * Cada monstro é um card expansível onde:
 *   1. O SM e participantes veem as informações do monstro (reações, votos, prioridade)
 *   2. Ao expandir: campo de solução (💡) e campo de ação/missão (🎯) aparecem dentro do card
 *   3. Soluções e Missões ficam vinculadas ao monstro via monsterId
 *   4. Tudo é colaborativo em tempo real via Firestore
 *
 * Compatibilidade com dados legados:
 *   - Sessões antigas que usavam combat/missions continuam funcionando normalmente:
 *     o relatório e a tela complete ainda exibem solutions e missions da subcoleção.
 */

import {
  getState, subscribe, addSolution, voteSolution, addMission, removeMission,
  setState, setPhase, setLocalPhase, completePhase, isSM, signalReady,
} from '../state/store.js';
import { showErrorToast } from '../components/toast.js';
import { showModal } from '../components/modal.js';
import { uid, escapeHTML, buildReadySignalHTML, attachReadySignal } from '../utils/dom.js';
import { canCreateMission, canRemoveMission } from '../utils/permissions.js';
import { getDeviceId } from '../services/presence.js';
import { createPhaseTimer } from '../components/phaseTimer.js';
import { getPriorityLabel, getStrategyLabel, formatDate } from '../utils/format.js';
import { loadSmSessions, loadCollection, patchItem } from '../services/firebase.js';
import { getCurrentUser } from '../services/auth.js';

const STRATEGIES = [
  { id: 'prevent', label: '🛡️ Prevenir',       question: 'Como podemos evitar que isso aconteça?' },
  { id: 'reduce',  label: '🧪 Reduzir impacto', question: 'Se acontecer, como diminuir o impacto?' },
  { id: 'handle',  label: '🤝 Lidar melhor',    question: 'O que podemos fazer diferente quando acontecer?' },
];

const PRIORITIES = [
  { id: 'high',   label: 'Alta',  cls: 'priority-badge-high' },
  { id: 'medium', label: 'Média', cls: 'priority-badge-medium' },
  { id: 'low',    label: 'Baixa', cls: 'priority-badge-low' },
];

const PREV_MISSION_STATUS_KEY = '_jornada_prev_mission_status';

/** Carrega missões da última sessão concluída do SM (para revisão de ações anteriores). */
async function loadPreviousMissions(currentSessionId, currentTeamName) {
  const user = getCurrentUser();
  if (!user) return [];
  try {
    const sessions = await loadSmSessions(user.uid);
    const prev = sessions.find(
      (s) => (s.sessionId || s.id) !== currentSessionId && s.status === 'completed'
        && (!currentTeamName || !s.teamName || s.teamName === currentTeamName)
    );
    if (!prev) return [];
    const prevId = prev.sessionId || prev.id;
    const missions = await loadCollection(prevId, 'missions');
    return missions.map((m) => ({
      ...m,
      _fromSession:   prev.sprintName || prevId,
      _prevSessionId: prevId,
    }));
  } catch (e) {
    console.warn('[WorkMonsters] Erro ao carregar missões anteriores:', e);
    return [];
  }
}

/** Renderiza o badge de prioridade de um monstro */
function priorityBadge(rank, totalMonsters) {
  if (rank === undefined || rank === null) return '';
  const isTop = rank === 0;
  return `<span class="badge ${isTop ? 'badge-danger' : 'badge-info'}" style="font-size:0.7rem">
    ${isTop ? '🔥' : '📌'} Prioridade #${rank + 1}
  </span>`;
}

export function renderWorkMonsters(root) {
  let _timer = null;
  /** Conjunto de IDs de monstros com o card expandido */
  const _expanded = new Set();
  /** Estratégia selecionada por monstro { [monsterId]: strategyId } */
  const _strategy = {};
  /** Missões da retro anterior — carregadas uma vez pelo SM */
  let _prevMissions = null;

  function render() {
    const state = getState();
    const monsters = state.monsters;
    const solutions = state.solutions;
    const missions = state.missions;
    const sm = isSM();

    if (!monsters.length) {
      root.innerHTML = `
        <div class="screen-work-monsters screen-enter">
          <div class="phase-header">
            <div class="phase-header-top">
              <span class="phase-icon">🛠️</span>
              <h2 class="phase-title">Trabalho nos Monstros</h2>
            </div>
            <p class="phase-description text-muted">Nenhum monstro identificado. Volte e adicione problemas.</p>
          </div>
          <div class="phase-nav">
            <button class="btn btn-ghost" id="btn-back">← Voltar</button>
          </div>
        </div>
      `;
      root.querySelector('#btn-back').addEventListener('click', () => {
        if (sm) setPhase('voting');
        else setLocalPhase('roleSelect');
      });
      return;
    }

    // Constrói o HTML dos cards de monstros
    const monstersHTML = monsters.map((m, idx) => {
      const expanded = _expanded.has(m.id);
      const monsterSolutions = solutions.filter((s) => s.monsterId === m.id);
      const monsterMissions  = missions.filter((mis) => mis.monsterId === m.id);
      const strategy = _strategy[m.id] || 'prevent';
      const stratObj = STRATEGIES.find((s) => s.id === strategy) || STRATEGIES[0];
      const filteredSols = monsterSolutions.filter((s) => s.strategy === strategy);
      const mergedCount = m.mergedFrom?.length ?? 0;

      return `
        <div class="work-monster-card card${expanded ? ' work-monster-card--expanded' : ''}" data-monster-id="${escapeHTML(m.id)}">
          <!-- Cabeçalho sempre visível -->
          <div class="work-monster-header" data-toggle-id="${escapeHTML(m.id)}" style="cursor:pointer;display:flex;align-items:flex-start;gap:12px">
            <span style="font-size:1.5rem;flex-shrink:0">${mergedCount > 0 ? '🔗' : '👹'}</span>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;color:var(--danger);word-break:break-word;font-size:1rem">${escapeHTML(m.text)}</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;align-items:center">
                <span class="badge badge-danger" style="font-size:0.7rem">🔥 ${m.reactions?.fire || 0}</span>
                <span class="badge badge-info" style="font-size:0.7rem">👀 ${m.reactions?.eyes || 0}</span>
                <span class="badge badge-accent" style="font-size:0.7rem">💡 ${m.reactions?.bulb || 0}</span>
                ${m.voteCount ? `<span class="badge badge-info" style="font-size:0.7rem">🗳️ ${m.voteCount} voto${m.voteCount !== 1 ? 's' : ''}</span>` : ''}
                ${mergedCount > 0 ? `<span class="badge" style="background:var(--purple-dim);color:var(--purple);font-size:0.7rem">🔗 ${mergedCount + 1} relatos</span>` : ''}
                ${priorityBadge(m.priorityRank, monsters.length)}
                ${monsterMissions.length > 0 ? `<span class="badge badge-success" style="font-size:0.7rem">✅ ${monsterMissions.length} ação${monsterMissions.length !== 1 ? 'ões' : ''}</span>` : ''}
              </div>
            </div>
            <button class="btn btn-ghost btn-sm" data-toggle-id="${escapeHTML(m.id)}" style="flex-shrink:0;margin-left:auto" aria-expanded="${expanded}" aria-label="${expanded ? 'Recolher monstro' : 'Expandir monstro'}">
              ${expanded ? '▲ Fechar' : '▼ Trabalhar'}
            </button>
          </div>

          <!-- Conteúdo expandido -->
          ${expanded ? `
            <div class="work-monster-body" style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px">

              <!-- Seção de Solução -->
              <div class="work-monster-section">
                <h4 style="margin-bottom:10px;display:flex;align-items:center;gap:8px">
                  💡 O que podemos fazer?
                </h4>

                <!-- Tabs de estratégia (disponível para todos) -->
                <div class="tabs mb-4" role="tablist" aria-label="Estratégias">
                  ${STRATEGIES.map((s) => `
                    <button class="tab-btn ${strategy === s.id ? 'active' : ''}"
                      data-strategy-tab="${escapeHTML(s.id)}"
                      data-monster-id-tab="${escapeHTML(m.id)}"
                      role="tab" aria-selected="${strategy === s.id}">
                      ${s.label}
                    </button>
                  `).join('')}
                </div>

                <p class="text-muted" style="font-size:0.875rem;margin-bottom:10px">${stratObj.question}</p>

                <!-- Formulário de adição de solução -->
                <div style="display:flex;gap:8px;margin-bottom:10px">
                  <textarea class="form-textarea"
                    id="sol-input-${escapeHTML(m.id)}"
                    placeholder="Escreva uma ideia de solução..."
                    aria-label="Solução para: ${escapeHTML(m.text)}"
                    style="flex:1;min-height:56px"></textarea>
                </div>
                <button class="btn btn-info btn-sm"
                  data-add-solution="${escapeHTML(m.id)}"
                  style="margin-bottom:14px">
                  + Adicionar solução
                </button>

                <!-- Lista de soluções desta estratégia -->
                ${filteredSols.length > 0 ? `
                  <div class="solutions-list" style="margin-bottom:8px">
                    ${filteredSols.map((sol) => `
                      <div class="solution-card">
                        <span class="solution-text">${escapeHTML(sol.text)}</span>
                        <button class="vote-btn" data-vote-sol="${escapeHTML(sol.id)}"
                          aria-label="Votar nesta solução (${sol.votes || 0} votos)">
                          👍 ${sol.votes || 0}
                        </button>
                      </div>
                    `).join('')}
                  </div>
                ` : `<p class="text-muted text-sm" style="margin-bottom:8px">Nenhuma solução para esta estratégia ainda.</p>`}
              </div>

              <!-- Seção de Ação/Missão -->
              ${canCreateMission() ? `
                <div class="work-monster-section" style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
                  <h4 style="margin-bottom:10px">🎯 Ação</h4>
                  <p class="text-muted text-sm" style="margin-bottom:12px">Defina uma ação concreta para resolver este problema.</p>
                  <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">
                    <input class="form-input" type="text"
                      id="action-title-${escapeHTML(m.id)}"
                      placeholder="Título da ação *" />
                    <textarea class="form-textarea"
                      id="action-desc-${escapeHTML(m.id)}"
                      placeholder="Descrição (opcional)"
                      style="min-height:44px"></textarea>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                      <div class="form-group" style="flex:1;min-width:140px">
                        <label class="form-label">Responsável (opcional)</label>
                        <input class="form-input" type="text"
                          id="action-owner-${escapeHTML(m.id)}"
                          placeholder="Nome ou função" />
                      </div>
                      <div class="form-group" style="flex:1;min-width:140px">
                        <label class="form-label">Prazo (opcional)</label>
                        <input class="form-input" type="date"
                          id="action-deadline-${escapeHTML(m.id)}" />
                      </div>
                      <div class="form-group" style="flex:1;min-width:130px">
                        <label class="form-label">Prioridade</label>
                        <select class="form-select" id="action-priority-${escapeHTML(m.id)}">
                          <option value="high">🔴 Alta</option>
                          <option value="medium" selected>🟡 Média</option>
                          <option value="low">🟢 Baixa</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <button class="btn btn-primary btn-sm"
                    data-add-mission="${escapeHTML(m.id)}">
                    🎯 REGISTRAR AÇÃO
                  </button>
                </div>
              ` : ''}

              <!-- Ações existentes deste monstro -->
              ${monsterMissions.length > 0 ? `
                <div style="margin-top:16px">
                  <h5 style="margin-bottom:8px;color:var(--success)">✅ Ações registradas</h5>
                  <div class="missions-list">
                    ${monsterMissions.map((mis) => `
                      <div class="card mission-card" style="margin-bottom:8px">
                        <div class="mission-header">
                          <div>
                            <div class="mission-title">🎯 ${escapeHTML(mis.title)}</div>
                            ${mis.description ? `<p style="font-size:0.8125rem;color:var(--text-muted);margin-top:3px">${escapeHTML(mis.description)}</p>` : ''}
                          </div>
                          ${canRemoveMission() ? `<button class="btn btn-danger btn-sm btn-icon" data-remove-mission="${escapeHTML(mis.id)}" title="Remover ação">🗑️</button>` : ''}
                        </div>
                        <div class="mission-meta" style="margin-top:6px">
                          <span class="badge ${PRIORITIES.find((p) => p.id === mis.priority)?.cls || 'badge-info'}">
                            ${getPriorityLabel(mis.priority)}
                          </span>
                          ${mis.owner ? `<span class="badge" style="background:var(--purple-dim);color:var(--purple)">👤 ${escapeHTML(mis.owner)}</span>` : ''}
                          ${mis.deadline ? `<span class="badge badge-accent">📅 ${formatDate(mis.deadline)}</span>` : ''}
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}

            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // Painel de revisão das ações anteriores (SM only)
    const prevMissionsHTML = (_prevMissions && _prevMissions.length > 0) ? `
      <div class="prev-missions-section" style="margin-bottom:20px">
        <h4 class="prev-missions-title">📋 Ações da retro anterior — <span class="text-muted">${escapeHTML(_prevMissions[0]._fromSession || '')}</span></h4>
        <div class="prev-missions-list">
          ${_prevMissions.map((m) => {
            const cached = (JSON.parse(sessionStorage.getItem(PREV_MISSION_STATUS_KEY) || '{}'))[m.id];
            const statusRaw = m.status || cached || 'pending';
            const statusOpts = [
              { val: 'done',    label: '✅ Feito',        cls: 'prev-mission-status--done' },
              { val: 'partial', label: '🔄 Em andamento', cls: 'prev-mission-status--partial' },
              { val: 'pending', label: '⏳ Não feito',    cls: 'prev-mission-status--pending' },
            ];
            const cur = statusOpts.find((o) => o.val === statusRaw) || statusOpts[2];
            return `
              <div class="prev-mission-card">
                <div class="prev-mission-info">
                  <span class="prev-mission-title">🎯 ${escapeHTML(m.title)}</span>
                  ${m.owner ? `<span class="text-xs text-muted">👤 ${escapeHTML(m.owner)}</span>` : ''}
                </div>
                <select class="prev-mission-status-select ${cur.cls}"
                  data-prev-mission-id="${escapeHTML(m.id)}"
                  data-prev-session-id="${escapeHTML(m._prevSessionId || '')}">
                  ${statusOpts.map((o) => `<option value="${o.val}" ${o.val === statusRaw ? 'selected' : ''}>${o.label}</option>`).join('')}
                </select>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : '';

    root.innerHTML = `
      <div class="screen-work-monsters screen-enter">
        <div class="phase-header">
          <div class="phase-header-top">
            <span class="phase-icon">🛠️</span>
            <h2 class="phase-title">Trabalho nos Monstros</h2>
          </div>
          <p class="phase-description">
            Abra cada monstro, discuta a solução e registre as ações concretas da equipe.
          </p>
        </div>

        <div class="warning-banner" style="margin-bottom:16px">
          <span>💡</span>
          <span>Clique em <strong>▼ Trabalhar</strong> em cada monstro para expandir e registrar soluções e ações.</span>
        </div>

        ${prevMissionsHTML}

        <div class="work-monsters-list" id="work-monsters-list">
          ${monstersHTML}
        </div>

        <div class="phase-nav">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
          ${buildReadySignalHTML('workMonsters', state, sm, getDeviceId())}
          ${sm
            ? `<button class="btn btn-primary" id="btn-next">🏆 CONCLUIR JORNADA →</button>`
            : `<span class="text-muted text-sm">Aguardando o Scrum Master avançar…</span>`}
        </div>
      </div>
    `;

    if (_timer) _timer.destroy();
    _timer = createPhaseTimer(root.querySelector('.screen-work-monsters'), 'workMonsters');

    attachEvents(state);

    // Carrega ações anteriores na primeira vez (SM only)
    if (_prevMissions === null && canCreateMission()) {
      loadPreviousMissions(
        new URLSearchParams(window.location.search).get('s') || '',
        state.team?.name || ''
      ).then((prev) => {
        _prevMissions = prev;
        if (prev.length > 0) render();
      });
    }
  }

  function attachEvents(state) {
    attachReadySignal(root, signalReady);

    // ── Expandir / recolher card ────────────────────────────────────────────
    root.querySelectorAll('[data-toggle-id]').forEach((el) => {
      el.addEventListener('click', (e) => {
        // Evita propagar para botões filhos (e.g. votar dentro do card)
        if (e.target.closest('[data-add-solution],[data-vote-sol],[data-add-mission],[data-remove-mission]')) return;
        const id = el.dataset.toggleId;
        if (_expanded.has(id)) {
          _expanded.delete(id);
        } else {
          _expanded.add(id);
        }
        render();
      });
    });

    // ── Tabs de estratégia ──────────────────────────────────────────────────
    root.querySelectorAll('[data-strategy-tab]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const monsterId = btn.dataset.monsterIdTab;
        _strategy[monsterId] = btn.dataset.strategyTab;
        render();
      });
    });

    // ── Adicionar solução ───────────────────────────────────────────────────
    root.querySelectorAll('[data-add-solution]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const monsterId = btn.dataset.addSolution;
        const input = root.querySelector(`#sol-input-${CSS.escape(monsterId)}`);
        const text = input?.value.trim();
        if (!text) {
          if (input) { input.style.borderColor = 'var(--danger)'; input.focus(); }
          return;
        }
        if (input) input.style.borderColor = '';
        btn.disabled = true;
        const strategy = _strategy[monsterId] || 'prevent';
        try {
          await addSolution({ id: uid(), monsterId, text, strategy, votes: 0 });
          if (input) input.value = '';
          render();
        } catch (err) {
          console.warn('Firestore addSolution failed:', err);
          showErrorToast('Solução não foi salva — verifique sua conexão.');
          btn.disabled = false;
        }
      });
    });

    // ── Votar em solução ────────────────────────────────────────────────────
    root.querySelectorAll('[data-vote-sol]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        btn.disabled = true;
        const match = btn.textContent.match(/\d+/);
        if (match) btn.textContent = `👍 ${Number(match[0]) + 1}`;
        const accepted = await voteSolution(btn.dataset.voteSol);
        if (!accepted) {
          const after = btn.textContent.match(/\d+/);
          if (after) btn.textContent = `👍 ${Number(after[0]) - 1}`;
        }
        btn.disabled = false;
      });
    });

    // ── Adicionar ação/missão ───────────────────────────────────────────────
    root.querySelectorAll('[data-add-mission]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!canCreateMission()) return;
        const monsterId = btn.dataset.addMission;
        const titleEl = root.querySelector(`#action-title-${CSS.escape(monsterId)}`);
        const title = titleEl?.value.trim();
        if (!title) {
          if (titleEl) { titleEl.style.borderColor = 'var(--danger)'; titleEl.focus(); }
          return;
        }
        if (titleEl) titleEl.style.borderColor = '';
        btn.disabled = true;
        const mission = {
          id:          uid(),
          monsterId,
          title,
          description: root.querySelector(`#action-desc-${CSS.escape(monsterId)}`)?.value.trim() || '',
          owner:       root.querySelector(`#action-owner-${CSS.escape(monsterId)}`)?.value.trim() || '',
          deadline:    root.querySelector(`#action-deadline-${CSS.escape(monsterId)}`)?.value || '',
          priority:    root.querySelector(`#action-priority-${CSS.escape(monsterId)}`)?.value || 'medium',
        };
        try {
          await addMission(mission);
          render();
        } catch (err) {
          console.warn('Firestore addMission failed:', err);
          showErrorToast('Ação não foi salva — verifique sua conexão.');
          btn.disabled = false;
        }
      });
    });

    // ── Remover ação/missão ─────────────────────────────────────────────────
    root.querySelectorAll('[data-remove-mission]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!canRemoveMission()) return;
        const confirmed = await showModal({
          title: 'Remover Ação',
          body: 'Deseja remover esta ação?',
          confirmLabel: 'Remover',
          confirmClass: 'btn btn-danger',
        });
        if (!confirmed) return;
        try {
          await removeMission(btn.dataset.removeMission);
          render();
        } catch (err) {
          console.warn('Firestore removeMission failed:', err);
          showErrorToast('Falha ao remover — verifique sua conexão.');
        }
      });
    });

    // ── Status das ações anteriores ─────────────────────────────────────────
    root.querySelectorAll('.prev-mission-status-select').forEach((sel) => {
      sel.addEventListener('change', () => {
        const missionId  = sel.dataset.prevMissionId;
        const prevSessId = sel.dataset.prevSessionId;
        const newStatus  = sel.value;
        const stored = JSON.parse(sessionStorage.getItem(PREV_MISSION_STATUS_KEY) || '{}');
        stored[missionId] = newStatus;
        sessionStorage.setItem(PREV_MISSION_STATUS_KEY, JSON.stringify(stored));
        if (prevSessId) {
          patchItem(prevSessId, 'missions', missionId, { status: newStatus })
            .catch((e) => console.warn('[WorkMonsters] Erro ao persistir status:', e));
        }
        sel.className = `prev-mission-status-select prev-mission-status--${newStatus}`;
        const mission = _prevMissions?.find((m) => m.id === missionId);
        if (mission) mission.status = newStatus;
      });
    });

    // ── Navegação ───────────────────────────────────────────────────────────
    root.querySelector('#btn-back').addEventListener('click', () => {
      if (isSM()) setPhase('voting');
      else setLocalPhase('roleSelect');
    });

    root.querySelector('#btn-next')?.addEventListener('click', () => {
      completePhase('workMonsters');
      setPhase('complete');
    });
  }

  // ── Fingerprint para detectar mudanças remotas ─────────────────────────────
  function _fingerprint(state) {
    const sols = state.solutions.map((s) => `${s.id}:${s.votes || 0}`).join('|');
    const mis  = state.missions.map((m) => `${m.id}:${m.title}`).join('|');
    const count = parseInt(state.team?.participantCount, 10) || 0;
    return `${sols}|${mis}|${count}`;
  }

  let _lastFp = _fingerprint(getState());

  const unsub = subscribe((state) => {
    if (state.currentPhase !== 'workMonsters') {
      unsub();
      return;
    }
    const fp = _fingerprint(state);
    if (fp !== _lastFp) {
      _lastFp = fp;
      render();
    }
  });

  render();
}
