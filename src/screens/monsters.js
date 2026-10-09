/**
 * @security Toda interpolação em innerHTML DEVE usar escapeHTML(). Nunca
 *   interpole valores vindos do usuário ou do Firestore sem escapar.
 *
 * Monsters Screen — Painel Central de Monstros
 *
 * Esta tela unifica o fluxo de monsters + discussion + voting + workMonsters
 * em uma única página. O SM conduz toda a dinâmica sem navegar entre telas:
 *
 *   1. Cadastro de problemas (monstros) com reações e merge/rename/delete
 *   2. Votação diretamente nos cards (3 votos por dispositivo)
 *   3. Notas de discussão por monstro (5 tipos: insight, mitigation, agreement, action, observation)
 *   4. Soluções por estratégia (prevent, reduce, handle)
 *   5. Ações/missões vinculadas ao monstro
 *   6. Resultado da discussão por monstro
 *
 * Cards expansíveis reutilizados de workMonsters.js.
 * Funções de votação reutilizadas de voting.js.
 * Funções de notas reutilizadas de discussion.js.
 */

import {
  getState, subscribe,
  // monstros
  addMonster, reactToMonster, prioritizeMonsters,
  mergeMonsters, unmergeMonster, renameMonster, deleteMonster,
  // votação
  voteOnMonster, setVotingClosed,
  // notas de discussão
  addDiscussionNote, editDiscussionNote, removeDiscussionNote,
  setMonsterDiscussionResult,
  // soluções
  addSolution, voteSolution,
  // missões
  addMission, removeMission,
  // fase
  setPhase, setLocalPhase, completePhase, isSM, signalReady,
} from '../state/store.js';
import { showErrorToast } from '../components/toast.js';
import { showModal } from '../components/modal.js';
import { uid, escapeHTML, preserveInputs, buildReadySignalHTML, attachReadySignal } from '../utils/dom.js';
import { getDeviceId } from '../services/presence.js';
import { createPhaseTimer } from '../components/phaseTimer.js';
import { createTypingIndicator } from '../components/typingIndicator.js';
import {
  canMergeMonsters, canUnmergeMonster, canRenameMonster, canDeleteMonster,
  canPrioritizeMonsters, canVoteOnMonster, canManageDiscussionNotes,
  canSetDiscussionResult, canCreateMission, canRemoveMission,
} from '../utils/permissions.js';
import {
  DISCUSSION_TYPES, getDiscussionTypeEmoji, getDiscussionTypeLabel,
  DISCUSSION_RESULTS, getDiscussionResultEmoji, getDiscussionResultLabel,
  getPriorityLabel, formatDate,
} from '../utils/format.js';
import { hasReacted } from '../services/reactions.js';
import { loadSmSessions, loadCollection, patchItem } from '../services/firebase.js';
import { getCurrentUser } from '../services/auth.js';

// ── Constantes ────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Dependências externas', 'Problemas técnicos', 'Comunicação',
  'Falta de clareza', 'Interrupções', 'Mudanças de prioridade',
  'Bloqueios', 'Processos',
];

const REACTIONS = [
  { key: 'fire', label: '🔥', title: 'Alto impacto' },
  { key: 'eyes', label: '👀', title: 'Precisamos discutir' },
  { key: 'bulb', label: '💡', title: 'Tenho uma ideia' },
];

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

const MAX_VOTES = 3;
const PREV_MISSION_STATUS_KEY = '_jornada_prev_mission_status';

// ── Helpers de votação ────────────────────────────────────────────────────────

function myVoteCount(monsterVotes) {
  const deviceId = getDeviceId();
  return monsterVotes.filter((v) => v.deviceId === deviceId).length;
}

function hasVotedOnMonster(sessionId, monsterId) {
  return hasReacted(sessionId, 'monsterVotes', monsterId, getDeviceId(), 'vote');
}

// ── Helpers de notas ──────────────────────────────────────────────────────────

function typeOptions(selected = 'insight') {
  return DISCUSSION_TYPES.map((t) =>
    `<option value="${t.id}" ${t.id === selected ? 'selected' : ''}>${t.emoji} ${t.label}</option>`
  ).join('');
}

// ── Helpers de missões anteriores ─────────────────────────────────────────────

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
    console.warn('[Monsters] Erro ao carregar missões anteriores:', e);
    return [];
  }
}

// ── Badge de prioridade ───────────────────────────────────────────────────────

function priorityBadge(rank) {
  if (rank === undefined || rank === null) return '';
  const isTop = rank === 0;
  return `<span class="badge ${isTop ? 'badge-danger' : 'badge-info'}" style="font-size:0.7rem">
    ${isTop ? '🔥' : '📌'} Prioridade #${rank + 1}
  </span>`;
}

// ── Modais (reutilizados de monsters original) ────────────────────────────────

function showMergeModal(keepMonster, dropMonster) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="merge-modal-title" style="max-width:500px">
        <h2 class="modal-title" id="merge-modal-title">🔗 Mesclar Monstros?</h2>
        <p class="modal-body" style="margin-bottom:16px">
          Os dois cards serão unidos em um só. Os relatos originais ficam preservados.
          Edite o nome do card resultante se quiser.
        </p>
        <div class="merge-preview">
          <div class="merge-preview-card">
            <span style="font-size:0.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.06em">Card A</span>
            <p class="merge-preview-text">${escapeHTML(keepMonster.text)}</p>
          </div>
          <div class="merge-preview-plus">+</div>
          <div class="merge-preview-card">
            <span style="font-size:0.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.06em">Card B</span>
            <p class="merge-preview-text">${escapeHTML(dropMonster.text)}</p>
          </div>
        </div>
        <div class="form-group" style="margin:16px 0">
          <label class="form-label" for="merge-name-input">Nome do card agrupado</label>
          <input class="form-input" id="merge-name-input" type="text" value="${escapeHTML(keepMonster.text)}" />
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="btn-merge-cancel">Cancelar</button>
          <button class="btn btn-primary" id="btn-merge-confirm">🔗 Mesclar</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const input = backdrop.querySelector('#merge-name-input');
    input.focus(); input.select();
    const cleanup = () => { document.removeEventListener('keydown', onKey); backdrop.remove(); };
    backdrop.querySelector('#btn-merge-cancel').addEventListener('click', () => { cleanup(); resolve({ confirmed: false, keepText: '' }); });
    backdrop.querySelector('#btn-merge-confirm').addEventListener('click', () => {
      const keepText = input.value.trim() || keepMonster.text;
      cleanup(); resolve({ confirmed: true, keepText });
    });
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) { cleanup(); resolve({ confirmed: false, keepText: '' }); } });
    const onKey = (e) => { if (e.key === 'Escape') { cleanup(); resolve({ confirmed: false, keepText: '' }); } };
    document.addEventListener('keydown', onKey);
  });
}

function showRenameModal(monster) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="rename-modal-title" style="max-width:460px">
        <h2 class="modal-title" id="rename-modal-title">✏️ Renomear Monstro</h2>
        <div class="form-group" style="margin:16px 0">
          <label class="form-label" for="rename-monster-input">Novo nome</label>
          <textarea class="form-textarea" id="rename-monster-input" style="min-height:64px">${escapeHTML(monster.text)}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="btn-rename-cancel">Cancelar</button>
          <button class="btn btn-primary" id="btn-rename-confirm">✏️ Salvar</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const input = backdrop.querySelector('#rename-monster-input');
    input.focus(); input.select();
    const cleanup = () => { document.removeEventListener('keydown', onKey); backdrop.remove(); };
    backdrop.querySelector('#btn-rename-cancel').addEventListener('click', () => { cleanup(); resolve(null); });
    backdrop.querySelector('#btn-rename-confirm').addEventListener('click', () => { const val = input.value.trim(); cleanup(); resolve(val || null); });
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) { cleanup(); resolve(null); } });
    const onKey = (e) => { if (e.key === 'Escape') { cleanup(); resolve(null); } };
    document.addEventListener('keydown', onKey);
  });
}

// ── Construtor do card expandido ───────────────────────────────────────────────

function buildExpandedBody(m, state, sessionId) {
  const solutions  = state.solutions;
  const missions   = state.missions;
  const discussions= state.discussions;
  const monsterVotes = state.monsterVotes;
  const discussionResults = state.discussionResults ?? {};
  const votingClosed = state.votingClosed ?? false;

  const monsterSolutions = solutions.filter((s) => s.monsterId === m.id);
  const monsterMissions  = missions.filter((mis) => mis.monsterId === m.id);
  const monsterNotes     = discussions.filter((n) => n.monsterId === m.id);
  const used = myVoteCount(monsterVotes);
  const voted = hasVotedOnMonster(sessionId, m.id);
  const canVote = canVoteOnMonster() && !votingClosed;
  const canManageNotes = canManageDiscussionNotes();
  const currentResult = discussionResults[m.id] ?? null;

  return `
    <div class="work-monster-body monsters-unified-body" style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px">

      <!-- ── Seção de Votação ──────────────────────────────────────────── -->
      <div class="monsters-unified-section monsters-unified-section--voting">
        <h4 class="monsters-unified-section-title">🗳️ Votação</h4>
        ${votingClosed
          ? `<div class="discussion-result-panel discussion-result-panel--readonly" style="margin-bottom:0">
               <span style="color:var(--text-muted);font-size:0.875rem">Votação encerrada • ${m.voteCount || 0} voto${(m.voteCount || 0) !== 1 ? 's' : ''}</span>
             </div>`
          : canVote
            ? `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                 <button class="btn ${voted ? 'btn-success' : 'btn-ghost'} btn-sm monster-vote-btn"
                   data-vote-monster="${escapeHTML(m.id)}"
                   ${voted || used >= MAX_VOTES ? 'disabled' : ''}
                   aria-pressed="${voted}"
                   title="${voted ? 'Já votou neste problema' : used >= MAX_VOTES ? 'Você já usou todos os votos' : 'Votar neste problema'}">
                   ${voted ? '✅ Votou' : used >= MAX_VOTES ? '— Votos esgotados' : '🗳️ Votar'}
                 </button>
                 <span class="text-muted text-sm">${m.voteCount || 0} voto${(m.voteCount || 0) !== 1 ? 's' : ''}</span>
               </div>`
            : `<span class="text-muted text-sm">${m.voteCount || 0} voto${(m.voteCount || 0) !== 1 ? 's' : ''}</span>`
        }
      </div>

      <!-- ── Seção de Notas de Discussão ──────────────────────────────── -->
      <div class="monsters-unified-section">
        <h4 class="monsters-unified-section-title">
          📝 Notas da Discussão
          ${monsterNotes.length > 0 ? `<span class="badge badge-info" style="margin-left:8px;font-size:0.7rem">${monsterNotes.length}</span>` : ''}
        </h4>

        ${monsterNotes.length > 0
          ? `<div class="discussion-notes-list" id="notes-list-${escapeHTML(m.id)}">
               ${monsterNotes.map((n) => `
                 <div class="discussion-note discussion-note--${n.type}" data-note-id="${escapeHTML(n.id)}">
                   <div class="discussion-note-header">
                     <span class="discussion-note-type">${getDiscussionTypeEmoji(n.type)} ${getDiscussionTypeLabel(n.type)}</span>
                     ${canManageNotes ? `
                       <div class="discussion-note-actions">
                         <button class="btn btn-ghost btn-sm btn-icon" data-edit-note="${escapeHTML(n.id)}" title="Editar nota">✏️</button>
                         <button class="btn btn-danger btn-sm btn-icon" data-remove-note="${escapeHTML(n.id)}" title="Remover nota">🗑️</button>
                       </div>
                     ` : ''}
                   </div>
                   <p class="discussion-note-text">${escapeHTML(n.text)}</p>
                 </div>
               `).join('')}
             </div>`
          : `<p class="text-muted text-sm" style="margin-bottom:10px">
               ${canManageNotes ? 'Nenhuma nota ainda. Use o formulário abaixo.' : 'Nenhuma nota registrada para este monstro.'}
             </p>`
        }

        ${canManageNotes ? `
          <div class="discussion-add-note" id="add-note-form-${escapeHTML(m.id)}" style="margin-top:10px">
            <div class="form-row" style="gap:8px;align-items:flex-start">
              <div class="form-group" style="min-width:160px;flex-shrink:0">
                <label class="form-label">Tipo</label>
                <select class="form-select" id="note-type-${escapeHTML(m.id)}">
                  ${typeOptions('insight')}
                </select>
              </div>
              <div class="form-group" style="flex:1">
                <label class="form-label">Nota</label>
                <textarea class="form-textarea" id="note-text-${escapeHTML(m.id)}"
                  placeholder="Registre um ponto da conversa…"
                  style="min-height:56px"></textarea>
              </div>
            </div>
            <button class="btn btn-primary btn-sm" data-add-note="${escapeHTML(m.id)}">+ Adicionar nota</button>
          </div>
        ` : ''}
      </div>

      <!-- ── Seção de Resultado da Discussão ──────────────────────────── -->
      ${canSetDiscussionResult()
        ? `<div class="monsters-unified-section">
             <h4 class="monsters-unified-section-title">🎯 Resultado da Discussão</h4>
             <div class="discussion-result-panel" id="result-panel-${escapeHTML(m.id)}" style="margin-bottom:0">
               <div class="discussion-result-options" style="margin-bottom:8px">
                 ${DISCUSSION_RESULTS.map((r) => `
                   <label class="discussion-result-option ${currentResult === r.id ? 'discussion-result-option--selected' : ''}">
                     <input type="radio" name="disc-result-${escapeHTML(m.id)}" value="${r.id}" ${currentResult === r.id ? 'checked' : ''}>
                     ${r.emoji} ${r.label}
                   </label>
                 `).join('')}
               </div>
               <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                 <button class="btn btn-primary btn-sm" data-confirm-result="${escapeHTML(m.id)}">
                   ${currentResult ? '✓ Atualizar' : '✓ Confirmar'}
                 </button>
                 ${currentResult ? `<button class="btn btn-ghost btn-sm" data-clear-result="${escapeHTML(m.id)}">✕ Remover</button>` : ''}
               </div>
               ${currentResult ? `
                 <div class="discussion-result-confirmed" style="margin-top:8px">
                   Atual: ${getDiscussionResultEmoji(currentResult)} ${escapeHTML(getDiscussionResultLabel(currentResult))}
                 </div>
               ` : ''}
             </div>
           </div>`
        : currentResult
          ? `<div class="monsters-unified-section">
               <h4 class="monsters-unified-section-title">🎯 Resultado da Discussão</h4>
               <div class="discussion-result-panel discussion-result-panel--readonly" style="margin-bottom:0">
                 <div class="discussion-result-confirmed">
                   ${getDiscussionResultEmoji(currentResult)} ${escapeHTML(getDiscussionResultLabel(currentResult))}
                 </div>
               </div>
             </div>`
          : ''
      }

      <!-- ── Seção de Soluções ─────────────────────────────────────────── -->
      <div class="monsters-unified-section">
        <h4 class="monsters-unified-section-title">💡 O que podemos fazer?</h4>

        <div class="tabs mb-4" role="tablist" aria-label="Estratégias" data-strategy-group="${escapeHTML(m.id)}">
          ${STRATEGIES.map((s, idx) => `
            <button class="tab-btn ${idx === 0 ? 'active' : ''}"
              data-strategy-tab="${escapeHTML(s.id)}"
              data-monster-id-tab="${escapeHTML(m.id)}"
              role="tab" aria-selected="${idx === 0}">
              ${s.label}
            </button>
          `).join('')}
        </div>

        ${STRATEGIES.map((strat, idx) => {
          const filteredSols = monsterSolutions.filter((s) => s.strategy === strat.id);
          return `
            <div class="strategy-panel" data-strategy-panel="${escapeHTML(strat.id)}" data-monster-panel="${escapeHTML(m.id)}" style="${idx !== 0 ? 'display:none' : ''}">
              <p class="text-muted" style="font-size:0.875rem;margin-bottom:10px">${strat.question}</p>
              <div style="display:flex;gap:8px;margin-bottom:10px">
                <textarea class="form-textarea"
                  id="sol-input-${escapeHTML(m.id)}-${escapeHTML(strat.id)}"
                  placeholder="Escreva uma ideia de solução..."
                  style="flex:1;min-height:56px"></textarea>
              </div>
              <button class="btn btn-info btn-sm"
                data-add-solution="${escapeHTML(m.id)}"
                data-add-strategy="${escapeHTML(strat.id)}"
                style="margin-bottom:14px">
                + Adicionar solução
              </button>
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
          `;
        }).join('')}
      </div>

      <!-- ── Seção de Ações/Missões ────────────────────────────────────── -->
      <div class="monsters-unified-section" style="padding-top:16px;border-top:1px solid var(--border)">
        <h4 class="monsters-unified-section-title">🎯 Ações</h4>

        ${canCreateMission() ? `
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
          <button class="btn btn-primary btn-sm" data-add-mission="${escapeHTML(m.id)}" style="margin-bottom:14px">
            🎯 REGISTRAR AÇÃO
          </button>
        ` : ''}

        ${monsterMissions.length > 0 ? `
          <div>
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

    </div>
  `;
}

// ── Construtor do card de monstro (header, sem expansão) ──────────────────────

function buildMonsterCard(m, state, sessionId, expanded) {
  const sm = isSM();
  const mergedCount = m.mergedFrom?.length ?? 0;
  const relatosCount = mergedCount > 0 ? mergedCount + 1 : null;
  const missions   = state.missions.filter((mis) => mis.monsterId === m.id);
  const notes      = state.discussions.filter((n) => n.monsterId === m.id);
  const voteCount  = m.voteCount || 0;
  const result     = (state.discussionResults ?? {})[m.id] ?? null;
  const voted      = hasVotedOnMonster(sessionId, m.id);

  return `
    <div class="work-monster-card card${expanded ? ' work-monster-card--expanded' : ''}" data-monster-id="${escapeHTML(m.id)}"
      ${sm ? 'draggable="true"' : ''}>
      <!-- Cabeçalho sempre visível -->
      <div class="work-monster-header" data-toggle-id="${escapeHTML(m.id)}" style="cursor:pointer;display:flex;align-items:flex-start;gap:12px">
        ${sm ? `<span class="monster-drag-handle" title="Arraste sobre outro card para mesclar" style="font-size:1.1rem;flex-shrink:0">⠿</span>` : ''}
        <span style="font-size:1.5rem;flex-shrink:0">${mergedCount > 0 ? '🔗' : '👹'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:var(--danger);word-break:break-word;font-size:1rem">${escapeHTML(m.text)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;align-items:center">
            <span class="badge badge-danger" style="font-size:0.7rem">🔥 ${m.reactions?.fire || 0}</span>
            <span class="badge badge-info" style="font-size:0.7rem">👀 ${m.reactions?.eyes || 0}</span>
            <span class="badge badge-accent" style="font-size:0.7rem">💡 ${m.reactions?.bulb || 0}</span>
            ${voteCount > 0 ? `<span class="badge badge-info" style="font-size:0.7rem">🗳️ ${voteCount} voto${voteCount !== 1 ? 's' : ''}${voted ? ' ✅' : ''}</span>` : (voted ? `<span class="badge badge-success" style="font-size:0.7rem">🗳️ Votou</span>` : '')}
            ${mergedCount > 0 ? `<span class="badge" style="background:var(--purple-dim);color:var(--purple);font-size:0.7rem">🔗 ${relatosCount} relatos</span>` : ''}
            ${priorityBadge(m.priorityRank)}
            ${missions.length > 0 ? `<span class="badge badge-success" style="font-size:0.7rem">✅ ${missions.length} ação${missions.length !== 1 ? 'ões' : ''}</span>` : ''}
            ${notes.length > 0 ? `<span class="badge badge-info" style="font-size:0.7rem">📝 ${notes.length} nota${notes.length !== 1 ? 's' : ''}</span>` : ''}
            ${result ? `<span class="badge" style="background:var(--accent-dim,#1e3a5f);color:var(--accent,#3b82f6);font-size:0.7rem">${getDiscussionResultEmoji(result)} ${escapeHTML(getDiscussionResultLabel(result))}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0;align-items:flex-start">
          ${sm ? `
            <button class="btn btn-ghost btn-sm btn-icon" data-rename="${escapeHTML(m.id)}" title="Renomear monstro" style="z-index:2">✏️</button>
            ${mergedCount > 0 ? `<button class="btn btn-ghost btn-sm btn-icon" data-unmerge="${escapeHTML(m.id)}" title="Desfazer agrupamento" style="z-index:2">↩️</button>` : ''}
            <button class="btn btn-danger btn-sm btn-icon" data-delete="${escapeHTML(m.id)}" title="Excluir monstro" style="z-index:2">🗑️</button>
          ` : ''}
          <button class="btn btn-ghost btn-sm" data-toggle-id="${escapeHTML(m.id)}"
            style="flex-shrink:0;margin-left:4px" aria-expanded="${expanded}"
            aria-label="${expanded ? 'Recolher monstro' : 'Expandir monstro'}">
            ${expanded ? '▲ Fechar' : '▼ Trabalhar'}
          </button>
        </div>
      </div>

      <!-- Reações (sempre visíveis) -->
      <div class="monster-card-actions" style="margin-top:8px">
        ${REACTIONS.map((r) => `
          <button class="reaction-btn" aria-label="${r.title} (${r.label})" data-id="${escapeHTML(m.id)}" data-reaction="${r.key}" title="${r.title}">
            ${r.label} <span class="reaction-count">${m.reactions[r.key] || 0}</span>
          </button>
        `).join('')}
      </div>

      <!-- Conteúdo expandido -->
      ${expanded ? buildExpandedBody(m, state, sessionId) : ''}
    </div>
  `;
}

// ── Renderer principal ────────────────────────────────────────────────────────

export function renderMonsters(root) {
  let _timer  = null;
  let _typing = null;
  let _dragId = null;

  /** Conjunto de IDs de monstros com o card expandido */
  const _expanded = new Set();
  /** Missões da retro anterior — carregadas uma vez pelo SM */
  let _prevMissions = null;

  function render() {
    const state = getState();
    const monsters = state.monsters;
    const sm = isSM();
    const selectedCount = monsters.filter((m) => m.selected).length;
    const votingClosed = state.votingClosed ?? false;
    const monsterVotes = state.monsterVotes;
    const sessionId = new URLSearchParams(window.location.search).get('s') || '';
    const used = myVoteCount(monsterVotes);
    const remaining = MAX_VOTES - used;

    preserveInputs(root, () => {
      root.innerHTML = `
        <div class="screen-monsters screen-enter">
          <div class="phase-header">
            <div class="phase-header-top">
              <span class="phase-icon">👹</span>
              <h2 class="phase-title">Monstros da Sprint</h2>
            </div>
            <p class="phase-description">
              O que atrapalhou a equipe? Identifique os problemas, discuta, vote e planeje ações.
              ${canMergeMonsters() ? '<span class="merge-hint">Arraste um card sobre outro para mesclar, ou selecione 2 e clique em <strong>Mesclar</strong>.</span>' : ''}
            </p>
          </div>

          <!-- Adicionar monstro -->
          <div class="card mb-5">
            <h4 style="margin-bottom:12px">Adicionar um Monstro</h4>
            <div style="display:flex;gap:8px">
              <textarea class="form-textarea" id="monster-input" placeholder="Descreva um problema que a equipe enfrentou..." style="flex:1;min-height:64px"></textarea>
            </div>
            <div class="chip-group" id="suggestion-chips" style="margin-top:10px">
              ${SUGGESTIONS.map((s) => `<button class="chip" data-suggestion="${s}">${s}</button>`).join('')}
            </div>
            <button class="btn btn-danger btn-sm" id="btn-add-monster" style="margin-top:12px">
              👹 ADICIONAR MONSTRO
            </button>
          </div>

          <!-- Toolbar -->
          <div class="monsters-toolbar">
            <h4>Monstros identificados <span class="badge badge-info">${monsters.length}</span></h4>
            <div class="monsters-toolbar-actions">
              ${canMergeMonsters() && selectedCount === 2 ? '<button class="btn btn-info btn-sm" id="btn-merge-selected">🔗 MESCLAR SELECIONADOS</button>' : ''}
              ${canPrioritizeMonsters() ? '<button class="btn btn-ghost btn-sm" id="btn-prioritize">↕️ ORDENAR POR VOTOS</button>' : ''}
            </div>
          </div>

          <!-- Banner de votação -->
          <div class="voting-budget-banner" style="margin-bottom:16px">
            <span class="voting-budget-icon">🗳️</span>
            <div>
              <div class="voting-budget-title">
                ${votingClosed ? 'Votação encerrada' : 'Seus votos disponíveis'}
              </div>
              ${!votingClosed ? `
                <div class="voting-budget-dots">
                  ${Array.from({ length: MAX_VOTES }, (_, i) =>
                    `<span class="voting-budget-dot${i < used ? ' voting-budget-dot--used' : ''}"></span>`
                  ).join('')}
                </div>
              ` : ''}
            </div>
            ${!votingClosed
              ? `<span class="voting-budget-remaining ${remaining === 0 ? 'text-muted' : 'text-accent'}">
                   ${remaining > 0 ? `${remaining} restante${remaining !== 1 ? 's' : ''}` : 'Todos os votos usados'}
                 </span>`
              : ''
            }
            ${sm ? `
              <div style="margin-left:auto;display:flex;gap:8px">
                ${votingClosed
                  ? `<button class="btn btn-ghost btn-sm" id="btn-reopen-voting">🔓 Reabrir votação</button>`
                  : `<button class="btn btn-primary btn-sm" id="btn-close-voting">🔒 Encerrar votação</button>`
                }
              </div>
            ` : ''}
          </div>

          <!-- Revisão de missões anteriores (SM only) -->
          ${(_prevMissions && _prevMissions.length > 0) ? `
            <div class="prev-missions-section" style="margin-bottom:20px">
              <h4 class="prev-missions-title">📋 Ações da retro anterior — <span class="text-muted">${escapeHTML(_prevMissions[0]._fromSession || '')}</span></h4>
              <div class="prev-missions-list">
                ${_prevMissions.map((pm) => {
                  const cached = (JSON.parse(sessionStorage.getItem(PREV_MISSION_STATUS_KEY) || '{}'))[pm.id];
                  const statusRaw = pm.status || cached || 'pending';
                  const statusOpts = [
                    { val: 'done',    label: '✅ Feito',        cls: 'prev-mission-status--done' },
                    { val: 'partial', label: '🔄 Em andamento', cls: 'prev-mission-status--partial' },
                    { val: 'pending', label: '⏳ Não feito',    cls: 'prev-mission-status--pending' },
                  ];
                  const cur = statusOpts.find((o) => o.val === statusRaw) || statusOpts[2];
                  return `
                    <div class="prev-mission-card">
                      <div class="prev-mission-info">
                        <span class="prev-mission-title">🎯 ${escapeHTML(pm.title)}</span>
                        ${pm.owner ? `<span class="text-xs text-muted">👤 ${escapeHTML(pm.owner)}</span>` : ''}
                      </div>
                      <select class="prev-mission-status-select ${cur.cls}"
                        data-prev-mission-id="${escapeHTML(pm.id)}"
                        data-prev-session-id="${escapeHTML(pm._prevSessionId || '')}">
                        ${statusOpts.map((o) => `<option value="${o.val}" ${o.val === statusRaw ? 'selected' : ''}>${o.label}</option>`).join('')}
                      </select>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Grid de monstros -->
          ${monsters.length === 0
            ? `<div class="empty-state" style="margin-bottom:24px">
                 <div class="empty-state-icon">👹</div>
                 <p class="empty-state-text">Nenhum monstro ainda. Adicione os problemas da Sprint.</p>
               </div>`
            : `<div class="work-monsters-list" id="monsters-list">
                 ${monsters.map((m) => buildMonsterCard(m, state, sessionId, _expanded.has(m.id))).join('')}
               </div>`
          }

          <!-- Navegação -->
          <div class="phase-nav">
            <button class="btn btn-ghost" id="btn-back">← Voltar</button>
            ${buildReadySignalHTML('monsters', state, sm, getDeviceId())}
            ${sm
              ? `<button class="btn btn-primary" id="btn-next">🏆 CONCLUIR JORNADA →</button>`
              : `<span class="text-muted text-sm">Aguardando o Scrum Master avançar…</span>`}
          </div>
        </div>
      `;
    }); // end preserveInputs

    if (_timer)  _timer.destroy();
    _timer = createPhaseTimer(root.querySelector('.screen-monsters'), 'monsters');

    if (_typing) _typing.destroy();
    _typing = createTypingIndicator(root.querySelector('.screen-monsters'), 'monsters');
    const monsterInput = root.querySelector('#monster-input');
    if (monsterInput) _typing.watchField(monsterInput);

    attachEvents(state, sessionId);

    // Carrega missões anteriores na primeira vez (SM only)
    if (_prevMissions === null && canCreateMission()) {
      loadPreviousMissions(
        sessionId,
        state.team?.name || ''
      ).then((prev) => {
        _prevMissions = prev;
        if (prev.length > 0) render();
      });
    }
  }

  function attachEvents(state, sessionId) {
    attachReadySignal(root, signalReady);

    // ── Chips de sugestão ──────────────────────────────────────────────────────
    root.querySelectorAll('[data-suggestion]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const input = root.querySelector('#monster-input');
        input.value = input.value ? `${input.value} ${chip.dataset.suggestion}` : chip.dataset.suggestion;
        input.focus();
      });
    });

    // ── Adicionar monstro ──────────────────────────────────────────────────────
    root.querySelector('#btn-add-monster').addEventListener('click', async () => {
      const input = root.querySelector('#monster-input');
      const text = input.value.trim();
      if (!text) { input.style.borderColor = 'var(--danger)'; input.focus(); return; }
      input.style.borderColor = '';
      const addBtn = root.querySelector('#btn-add-monster');
      addBtn.disabled = true;
      try {
        await addMonster({ id: uid(), text, reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false });
        input.value = '';
        if (_typing) _typing.destroy();
        render();
      } catch (e) {
        console.warn('Firestore addMonster failed:', e);
        showErrorToast('Monstro não foi salvo — verifique sua conexão.');
        addBtn.disabled = false;
      }
    });

    // ── Expandir / recolher card ───────────────────────────────────────────────
    root.querySelectorAll('[data-toggle-id]').forEach((el) => {
      el.addEventListener('click', (e) => {
        // Não propaga para botões filhos dentro do card expandido
        if (e.target.closest('[data-add-solution],[data-vote-sol],[data-add-mission],[data-remove-mission],[data-add-note],[data-remove-note],[data-edit-note],[data-rename],[data-delete],[data-unmerge],[data-vote-monster],[data-confirm-result],[data-clear-result]')) return;
        const id = el.dataset.toggleId;
        if (!id) return;
        if (_expanded.has(id)) {
          _expanded.delete(id);
        } else {
          _expanded.add(id);
        }
        render();
      });
    });

    // ── Reações ────────────────────────────────────────────────────────────────
    root.querySelectorAll('.reaction-btn[data-reaction]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        btn.disabled = true;
        const span = btn.querySelector('.reaction-count');
        if (span) span.textContent = Number(span.textContent) + 1;
        const accepted = await reactToMonster(btn.dataset.id, btn.dataset.reaction);
        if (!accepted && span) span.textContent = Number(span.textContent) - 1;
        btn.disabled = false;
      });
    });

    // ── Renomear monstro (SM only) ─────────────────────────────────────────────
    root.querySelectorAll('[data-rename]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!canRenameMonster()) return;
        const id = btn.dataset.rename;
        const monster = getState().monsters.find((m) => m.id === id);
        if (!monster) return;
        const newText = await showRenameModal(monster);
        if (!newText || newText === monster.text) return;
        try { await renameMonster(id, newText); }
        catch (err) { console.warn('Firestore renameMonster failed:', err); showErrorToast('Falha ao renomear.'); }
      });
    });

    // ── Excluir monstro (SM only) ──────────────────────────────────────────────
    root.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!canDeleteMonster()) return;
        const id = btn.dataset.delete;
        const confirmed = await showModal({ title: 'Excluir Monstro', body: 'Deseja excluir este monstro?', confirmLabel: 'Excluir', confirmClass: 'btn btn-danger' });
        if (!confirmed) return;
        try { await deleteMonster(id); }
        catch (err) { console.warn('Firestore deleteMonster failed:', err); showErrorToast('Falha ao excluir.'); }
      });
    });

    // ── Desfazer merge (SM only) ───────────────────────────────────────────────
    root.querySelectorAll('[data-unmerge]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!canUnmergeMonster()) return;
        const id = btn.dataset.unmerge;
        const confirmed = await showModal({ title: '↩️ Desfazer Agrupamento', body: 'Os relatos originais voltarão como cards individuais.', confirmLabel: 'Desfazer', confirmClass: 'btn btn-primary' });
        if (!confirmed) return;
        try { unmergeMonster(id); }
        catch (err) { console.warn('Firestore unmergeMonster failed:', err); showErrorToast('Falha ao desfazer merge.'); }
      });
    });

    // ── Mesclar selecionados ───────────────────────────────────────────────────
    root.querySelector('#btn-merge-selected')?.addEventListener('click', async () => {
      const selected = getState().monsters.filter((m) => m.selected);
      if (selected.length !== 2) return;
      const [keepMon, dropMon] = selected;
      const { confirmed, keepText } = await showMergeModal(keepMon, dropMon);
      if (!confirmed) return;
      mergeMonsters(keepMon.id, dropMon.id, keepText);
    });

    // ── Ordenar por votos ──────────────────────────────────────────────────────
    root.querySelector('#btn-prioritize')?.addEventListener('click', () => {
      prioritizeMonsters();
      render();
    });

    // ── Encerrar / Reabrir votação (SM only) ──────────────────────────────────
    root.querySelector('#btn-close-voting')?.addEventListener('click', () => {
      if (!isSM()) return;
      setVotingClosed(true);
      render();
    });

    root.querySelector('#btn-reopen-voting')?.addEventListener('click', () => {
      if (!isSM()) return;
      setVotingClosed(false);
      render();
    });

    // ── Votar em monstro ───────────────────────────────────────────────────────
    root.querySelectorAll('[data-vote-monster]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!canVoteOnMonster()) return;
        const monsterId = btn.dataset.voteMonster;
        const curState = getState();
        if (curState.votingClosed) return;
        if (hasVotedOnMonster(sessionId, monsterId)) return;
        if (myVoteCount(curState.monsterVotes) >= MAX_VOTES) return;

        btn.disabled = true;
        // Otimismo local
        const countEl = btn.closest('.monsters-unified-section--voting')?.querySelector('.text-muted.text-sm');
        btn.textContent = '✅ Votou';
        btn.className = 'btn btn-success btn-sm monster-vote-btn';

        const accepted = await voteOnMonster(monsterId);
        if (!accepted) {
          btn.textContent = '🗳️ Votar';
          btn.className = 'btn btn-ghost btn-sm monster-vote-btn';
          btn.disabled = false;
          showErrorToast('Não foi possível registrar seu voto.');
        } else {
          const usedNow = myVoteCount(getState().monsterVotes);
          const rem = MAX_VOTES - usedNow;
          // Atualiza o banner de votos sem re-render completo
          const dots = root.querySelectorAll('.voting-budget-dot');
          dots.forEach((d, i) => d.classList.toggle('voting-budget-dot--used', i < usedNow));
          const label = root.querySelector('.voting-budget-remaining');
          if (label) {
            label.textContent = rem > 0 ? `${rem} restante${rem !== 1 ? 's' : ''}` : 'Todos os votos usados';
            label.className = `voting-budget-remaining ${rem === 0 ? 'text-muted' : 'text-accent'}`;
          }
          if (usedNow >= MAX_VOTES) {
            root.querySelectorAll('[data-vote-monster]').forEach((b) => {
              if (!b.classList.contains('btn-success')) {
                b.disabled = true; b.textContent = '— Votos esgotados';
              }
            });
          }
          if (countEl) {
            const newCount = (getState().monsters.find((m) => m.id === monsterId)?.voteCount || 0);
            countEl.textContent = `${newCount} voto${newCount !== 1 ? 's' : ''}`;
          }
        }
      });
    });

    // ── Tabs de estratégia ─────────────────────────────────────────────────────
    root.querySelectorAll('[data-strategy-tab]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const monsterId   = btn.dataset.monsterIdTab;
        const strategyId  = btn.dataset.strategyTab;

        // Atualiza classes das tabs
        const group = root.querySelector(`[data-strategy-group="${CSS.escape(monsterId)}"]`);
        if (group) {
          group.querySelectorAll('.tab-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.strategyTab === strategyId);
            b.setAttribute('aria-selected', b.dataset.strategyTab === strategyId);
          });
        }
        // Mostra/esconde painéis
        root.querySelectorAll(`[data-monster-panel="${CSS.escape(monsterId)}"]`).forEach((panel) => {
          panel.style.display = panel.dataset.strategyPanel === strategyId ? '' : 'none';
        });
      });
    });

    // ── Adicionar solução ──────────────────────────────────────────────────────
    root.querySelectorAll('[data-add-solution]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const monsterId = btn.dataset.addSolution;
        const strategy  = btn.dataset.addStrategy || 'prevent';
        const input = root.querySelector(`#sol-input-${CSS.escape(monsterId)}-${CSS.escape(strategy)}`);
        const text = input?.value.trim();
        if (!text) {
          if (input) { input.style.borderColor = 'var(--danger)'; input.focus(); }
          return;
        }
        if (input) input.style.borderColor = '';
        btn.disabled = true;
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

    // ── Votar em solução ───────────────────────────────────────────────────────
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

    // ── Adicionar nota de discussão (SM only) ──────────────────────────────────
    root.querySelectorAll('[data-add-note]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!canManageDiscussionNotes()) return;
        const monsterId = btn.dataset.addNote;
        const typeEl = root.querySelector(`#note-type-${CSS.escape(monsterId)}`);
        const textEl = root.querySelector(`#note-text-${CSS.escape(monsterId)}`);
        const text = textEl?.value.trim();
        if (!text) {
          if (textEl) { textEl.style.borderColor = 'var(--danger)'; textEl.focus(); }
          return;
        }
        if (textEl) textEl.style.borderColor = '';
        btn.disabled = true;
        const note = {
          id: uid(),
          monsterId,
          type: typeEl?.value || 'insight',
          text,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        try {
          await addDiscussionNote(note);
          if (textEl) textEl.value = '';
          render();
        } catch (e2) {
          console.warn('Firestore addDiscussionNote failed:', e2);
          showErrorToast('Nota não foi salva — verifique sua conexão.');
          btn.disabled = false;
        }
      });
    });

    // ── Editar nota (SM only) ─────────────────────────────────────────────────
    root.querySelectorAll('[data-edit-note]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!canManageDiscussionNotes()) return;
        const noteId = btn.dataset.editNote;
        const note = getState().discussions.find((n) => n.id === noteId);
        if (!note) return;
        const noteCard = root.querySelector(`[data-note-id="${CSS.escape(noteId)}"]`);
        if (!noteCard) return;
        // Substituir card por formulário inline
        noteCard.outerHTML = `
          <div class="discussion-note discussion-note--editing" data-edit-form="${escapeHTML(noteId)}">
            <div class="form-row" style="gap:8px;align-items:flex-start">
              <div class="form-group" style="min-width:160px;flex-shrink:0">
                <label class="form-label">Tipo</label>
                <select class="form-select" id="edit-note-type-${escapeHTML(noteId)}">
                  ${typeOptions(note.type)}
                </select>
              </div>
              <div class="form-group" style="flex:1">
                <label class="form-label">Nota</label>
                <textarea class="form-textarea" id="edit-note-text-${escapeHTML(noteId)}"
                  style="min-height:56px">${escapeHTML(note.text)}</textarea>
              </div>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary btn-sm" data-save-note="${escapeHTML(noteId)}">✓ Salvar</button>
              <button class="btn btn-ghost btn-sm" data-cancel-edit-note="${escapeHTML(noteId)}">Cancelar</button>
            </div>
          </div>
        `;
        const editTextEl = root.querySelector(`#edit-note-text-${CSS.escape(noteId)}`);
        if (editTextEl) { editTextEl.focus(); editTextEl.select(); }

        root.querySelector(`[data-save-note="${CSS.escape(noteId)}"]`)?.addEventListener('click', async () => {
          const typeVal = root.querySelector(`#edit-note-type-${CSS.escape(noteId)}`)?.value || 'insight';
          const textVal = root.querySelector(`#edit-note-text-${CSS.escape(noteId)}`)?.value.trim();
          if (!textVal) return;
          try { await editDiscussionNote(noteId, { type: typeVal, text: textVal }); render(); }
          catch (e2) { console.warn('editDiscussionNote failed:', e2); showErrorToast('Falha ao salvar edição.'); }
        });
        root.querySelector(`[data-cancel-edit-note="${CSS.escape(noteId)}"]`)?.addEventListener('click', () => render());
      });
    });

    // ── Remover nota (SM only) ────────────────────────────────────────────────
    root.querySelectorAll('[data-remove-note]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!canManageDiscussionNotes()) return;
        const noteId = btn.dataset.removeNote;
        try { await removeDiscussionNote(noteId); render(); }
        catch (e2) { console.warn('removeDiscussionNote failed:', e2); showErrorToast('Falha ao remover nota.'); }
      });
    });

    // ── Confirmar resultado da discussão (SM only) ────────────────────────────
    root.querySelectorAll('[data-confirm-result]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!canSetDiscussionResult()) return;
        const monsterId = btn.dataset.confirmResult;
        const selected = root.querySelector(`input[name="disc-result-${CSS.escape(monsterId)}"]:checked`)?.value;
        if (!selected) { showErrorToast('Selecione um resultado antes de confirmar.'); return; }
        setMonsterDiscussionResult(monsterId, selected);
        render();
      });
    });

    // ── Remover resultado da discussão (SM only) ──────────────────────────────
    root.querySelectorAll('[data-clear-result]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!canSetDiscussionResult()) return;
        const monsterId = btn.dataset.clearResult;
        setMonsterDiscussionResult(monsterId, null);
        render();
      });
    });

    // ── Adicionar ação/missão (SM only) ───────────────────────────────────────
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
        try { await addMission(mission); render(); }
        catch (err) {
          console.warn('Firestore addMission failed:', err);
          showErrorToast('Ação não foi salva — verifique sua conexão.');
          btn.disabled = false;
        }
      });
    });

    // ── Remover ação/missão (SM only) ─────────────────────────────────────────
    root.querySelectorAll('[data-remove-mission]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!canRemoveMission()) return;
        const confirmed = await showModal({ title: 'Remover Ação', body: 'Deseja remover esta ação?', confirmLabel: 'Remover', confirmClass: 'btn btn-danger' });
        if (!confirmed) return;
        try { await removeMission(btn.dataset.removeMission); render(); }
        catch (err) { console.warn('Firestore removeMission failed:', err); showErrorToast('Falha ao remover.'); }
      });
    });

    // ── Status das ações anteriores ────────────────────────────────────────────
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
            .catch((e) => console.warn('[Monsters] Erro ao persistir status:', e));
        }
        sel.className = `prev-mission-status-select prev-mission-status--${newStatus}`;
        const pm = _prevMissions?.find((m) => m.id === missionId);
        if (pm) pm.status = newStatus;
      });
    });

    // ── Drag & Drop (SM only — merge) ─────────────────────────────────────────
    if (canMergeMonsters()) {
      root.querySelectorAll('.work-monster-card[draggable]').forEach((card) => {
        card.addEventListener('dragstart', (e) => {
          _dragId = card.dataset.monsterId;
          card.setAttribute('aria-grabbed', 'true');
          card.classList.add('monster-card--dragging');
          e.dataTransfer.effectAllowed = 'move';
          setTimeout(() => card.classList.add('monster-card--ghost'), 0);
        });
        card.addEventListener('dragend', () => {
          _dragId = null;
          card.setAttribute('aria-grabbed', 'false');
          card.classList.remove('monster-card--dragging', 'monster-card--ghost');
          root.querySelectorAll('.monster-card--drop-target').forEach((c) =>
            c.classList.remove('monster-card--drop-target')
          );
        });
        card.addEventListener('dragover', (e) => {
          if (!_dragId || card.dataset.monsterId === _dragId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          card.classList.add('monster-card--drop-target');
        });
        card.addEventListener('dragleave', () => card.classList.remove('monster-card--drop-target'));
        card.addEventListener('drop', async (e) => {
          e.preventDefault();
          card.classList.remove('monster-card--drop-target');
          const dropId = _dragId;
          const keepId = card.dataset.monsterId;
          if (!dropId || dropId === keepId) return;
          const s = getState();
          const keepMon = s.monsters.find((m) => m.id === keepId);
          const dropMon = s.monsters.find((m) => m.id === dropId);
          if (!keepMon || !dropMon) return;
          const { confirmed, keepText } = await showMergeModal(keepMon, dropMon);
          if (!confirmed) return;
          mergeMonsters(keepId, dropId, keepText);
        });
      });
    }

    // ── Navegação ──────────────────────────────────────────────────────────────
    root.querySelector('#btn-back').addEventListener('click', () => {
      if (isSM()) setPhase('treasures');
      else setLocalPhase('roleSelect');
    });

    root.querySelector('#btn-next')?.addEventListener('click', () => {
      completePhase('monsters');
      setPhase('complete');
    });
  }

  // ── Fingerprint para detectar mudanças remotas ────────────────────────────────
  function _fingerprint(state) {
    const mons = state.monsters.map((m) =>
      `${m.id}:${m.reactions?.fire||0},${m.reactions?.eyes||0},${m.reactions?.bulb||0},${m.priorityRank??''},${m.text},${m.voteCount||0}`
    ).join('|');
    const votes = state.monsterVotes.filter((v) => v.deviceId === getDeviceId()).length;
    const sols  = state.solutions.map((s) => `${s.id}:${s.votes||0}`).join('|');
    const mis   = state.missions.map((m) => `${m.id}:${m.title}`).join('|');
    const notes = state.discussions.map((n) => `${n.id}:${n.updatedAt||''}`).join('|');
    const count = parseInt(state.team?.participantCount, 10) || 0;
    const results = JSON.stringify(state.discussionResults ?? {});
    const closed = state.votingClosed ? '1' : '0';
    return `${mons}|${votes}|${sols}|${mis}|${notes}|${count}|${results}|${closed}`;
  }

  let _lastFp = _fingerprint(getState());

  const unsub = subscribe((state) => {
    if (state.currentPhase !== 'monsters') {
      unsub();
      if (_typing) { _typing.destroy(); _typing = null; }
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
