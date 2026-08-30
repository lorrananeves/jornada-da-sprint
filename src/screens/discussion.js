/**
 * @security Toda interpolação em innerHTML DEVE usar escapeHTML(). Nunca
 *   interpole valores vindos do usuário ou do Firestore sem escapar.
 *
 * Discussion Screen
 *
 * O Scrum Master conduz a discussão dos monstros e registra notas por tipo:
 *   💡 insight | 🛡️ mitigation | 🤝 agreement | 🚀 action | 📌 observation
 *
 * Notas não geram XP — são ferramentas de facilitação.
 * Ações podem ser transformadas em Missões pelo SM.
 *
 * Participantes veem o monstro em foco e as notas em modo somente-leitura.
 * O SM sincroniza o foco da discussão em tempo real via discussionFocus.
 */

import {
  getState, subscribe, setState, setPhase, setLocalPhase, completePhase, isSM, signalReady,
  addDiscussionNote, editDiscussionNote, removeDiscussionNote, setMonsterDiscussionResult,
} from '../state/store.js';
import { showErrorToast } from '../components/xpToast.js';
import { uid, escapeHTML, preserveInputs, buildReadySignalHTML, attachReadySignal } from '../utils/dom.js';
import { canManageDiscussionNotes, canSetDiscussionFocus, canConvertToMission, canSetDiscussionResult } from '../utils/permissions.js';
import { getDeviceId } from '../services/presence.js';
import { createPhaseTimer } from '../components/phaseTimer.js';
import { DISCUSSION_TYPES, getDiscussionTypeEmoji, getDiscussionTypeLabel, DISCUSSION_RESULTS, getDiscussionResultEmoji, getDiscussionResultLabel } from '../utils/format.js';

/** Persiste o foco do SM no store (sincroniza para todos via Firestore). */
function setDiscussionFocus(monsterIdx) {
  setState({ discussionFocus: monsterIdx });
}

/** Gera as opções do select de tipo */
function typeOptions(selected = 'insight') {
  return DISCUSSION_TYPES.map((t) =>
    `<option value="${t.id}" ${t.id === selected ? 'selected' : ''}>${t.emoji} ${t.label}</option>`
  ).join('');
}

/** Constrói um card de nota individual */
function buildNoteCard(note, canManage) {
  const emoji = getDiscussionTypeEmoji(note.type);
  const label = getDiscussionTypeLabel(note.type);
  return `
    <div class="discussion-note discussion-note--${note.type}" data-note-id="${escapeHTML(note.id)}">
      <div class="discussion-note-header">
        <span class="discussion-note-type">${emoji} ${label}</span>
        ${canManage ? `
          <div class="discussion-note-actions">
            <button class="btn btn-ghost btn-sm btn-icon" data-edit-note="${escapeHTML(note.id)}" title="Editar nota">✏️</button>
            <button class="btn btn-danger btn-sm btn-icon" data-remove-note="${escapeHTML(note.id)}" title="Remover nota">🗑️</button>
          </div>
        ` : ''}
        ${!canManage && note.type === 'action' && canConvertToMission() ? `
          <button class="btn btn-ghost btn-sm" data-to-mission-note="${escapeHTML(note.id)}" title="Transformar em Missão">🚀 Criar Missão</button>
        ` : ''}
      </div>
      <p class="discussion-note-text">${escapeHTML(note.text)}</p>
      ${canManage && note.type === 'action' ? `
        <button class="btn btn-ghost btn-sm" style="margin-top:8px" data-to-mission-note="${escapeHTML(note.id)}">🚀 Transformar em Missão</button>
      ` : ''}
    </div>
  `;
}

/** Painel de resultado da discussão (SM: seletor; participante: somente-leitura) */
function buildDiscussionResultPanel(monster, canSet) {
  const current = monster.discussionResult ?? null;

  if (!canSet) {
    // Participantes só veem se já houver resultado confirmado
    if (!current) return '';
    return `
      <div class="discussion-result-panel discussion-result-panel--readonly">
        <div class="discussion-result-title">🎯 RESULTADO DA DISCUSSÃO</div>
        <div class="discussion-result-confirmed">
          ${getDiscussionResultEmoji(current)} ${escapeHTML(getDiscussionResultLabel(current))}
        </div>
      </div>
    `;
  }

  // SM: seletor de resultado + botão de confirmação (e limpeza se já confirmado)
  const optionsHTML = DISCUSSION_RESULTS.map((r) => `
    <label class="discussion-result-option ${current === r.id ? 'discussion-result-option--selected' : ''}">
      <input type="radio" name="discussion-result" value="${r.id}" ${current === r.id ? 'checked' : ''}>
      ${r.emoji} ${r.label}
    </label>
  `).join('');

  return `
    <div class="discussion-result-panel" id="discussion-result-panel">
      <div class="discussion-result-title">🎯 COMO TERMINAMOS ESSA DISCUSSÃO?</div>
      <div class="discussion-result-options" id="discussion-result-options">
        ${optionsHTML}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" id="btn-confirm-result">
          ${current ? '✓ Atualizar resultado' : '✓ Confirmar resultado'}
        </button>
        ${current ? `<button class="btn btn-ghost btn-sm" id="btn-clear-result">✕ Remover resultado</button>` : ''}
      </div>
      ${current ? `
        <div class="discussion-result-confirmed" style="margin-top:8px">
          Resultado atual: ${getDiscussionResultEmoji(current)} ${escapeHTML(getDiscussionResultLabel(current))}
        </div>
      ` : ''}
    </div>
  `;
}

/** Formulário inline de adição de nota (painel do SM) */
function buildAddNoteForm() {
  return `
    <div class="discussion-add-note" id="discussion-add-note">
      <div class="form-row" style="gap:8px;align-items:flex-start">
        <div class="form-group" style="min-width:180px;flex-shrink:0">
          <label class="form-label">Tipo</label>
          <select class="form-select" id="note-type-select">
            ${typeOptions('insight')}
          </select>
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label">Nota</label>
          <textarea class="form-textarea" id="note-text-input"
            placeholder="Registre um ponto da conversa…"
            style="min-height:64px"></textarea>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" id="btn-add-note">+ Adicionar nota</button>
    </div>
  `;
}

/** Formulário inline de edição de nota (substituí o card no DOM) */
function buildEditNoteForm(note) {
  return `
    <div class="discussion-note discussion-note--editing" data-edit-form="${escapeHTML(note.id)}">
      <div class="form-row" style="gap:8px;align-items:flex-start">
        <div class="form-group" style="min-width:180px;flex-shrink:0">
          <label class="form-label">Tipo</label>
          <select class="form-select" id="edit-note-type-${escapeHTML(note.id)}">
            ${typeOptions(note.type)}
          </select>
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label">Nota</label>
          <textarea class="form-textarea" id="edit-note-text-${escapeHTML(note.id)}"
            style="min-height:64px">${escapeHTML(note.text)}</textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" data-save-note="${escapeHTML(note.id)}">✓ Salvar</button>
        <button class="btn btn-ghost btn-sm" data-cancel-edit="${escapeHTML(note.id)}">Cancelar</button>
      </div>
    </div>
  `;
}

export function renderDiscussion(root) {
  let _timer = null;
  const state = getState();

  // Monstros ativos (não merged)
  const monsters = state.monsters;

  if (!monsters.length) {
    root.innerHTML = `
      <div class="screen-discussion screen-enter">
        <div class="phase-header">
          <div class="phase-header-top">
            <span class="phase-icon">🗣️</span>
            <h2 class="phase-title">Discussão</h2>
          </div>
          <p class="phase-description text-muted">Nenhum monstro identificado. Volte e adicione problemas.</p>
        </div>
        <div class="phase-nav">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
        </div>
      </div>
    `;
    root.querySelector('#btn-back').addEventListener('click', () => {
      if (isSM()) setPhase('monsters');
      else setLocalPhase('roleSelect');
    });
    return;
  }

  // Índice do monstro em foco (SM controla, participantes seguem)
  let currentIdx = Math.min(state.discussionFocus ?? 0, Math.max(0, monsters.length - 1));

  function render() {
    const currentState = getState();
    const monster = monsters[currentIdx];
    const notes = currentState.discussions.filter((n) => n.monsterId === monster.id);
    const canManage = canManageDiscussionNotes();
    const userSM = isSM();

    preserveInputs(root, () => { root.innerHTML = `
      <div class="screen-discussion screen-enter">
        <div class="phase-header">
          <div class="phase-header-top">
            <span class="phase-icon">🗣️</span>
            <h2 class="phase-title">Discussão</h2>
          </div>
          <p class="phase-description">
            Conduza a conversa sobre cada problema. Registre insights, mitigações, acordos e ações.
            (${currentIdx + 1}/${monsters.length})
          </p>
        </div>

        <!-- Banner do monstro em foco -->
        <div class="combat-monster-banner">
          <span class="combat-monster-icon">${monster.mergedFrom?.length ? '🔗' : '👹'}</span>
          <div style="flex:1;min-width:0">
            <h3 style="color:var(--danger);margin-bottom:4px;word-break:break-word">${escapeHTML(monster.text)}</h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <span class="badge badge-danger">🔥 ${monster.reactions?.fire || 0}</span>
              <span class="badge badge-info">👀 ${monster.reactions?.eyes || 0}</span>
              <span class="badge badge-accent">💡 ${monster.reactions?.bulb || 0}</span>
              ${monster.mergedFrom?.length ? `<span class="badge" style="background:var(--purple-dim);color:var(--purple)">🔗 ${monster.mergedFrom.length + 1} relatos</span>` : ''}
            </div>
          </div>
          ${monsters.length > 1 ? `
            <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-shrink:0">
              ${!userSM ? '<span class="combat-focus-badge">📡 foco do SM</span>' : ''}
              ${userSM ? `
                <button class="btn btn-ghost btn-sm" id="btn-prev-monster" ${currentIdx === 0 ? 'disabled' : ''}>← Anterior</button>
                <button class="btn btn-ghost btn-sm" id="btn-next-monster" ${currentIdx === monsters.length - 1 ? 'disabled' : ''}>Próximo →</button>
              ` : ''}
            </div>
          ` : (!userSM ? '<span class="combat-focus-badge" style="margin-left:auto">📡 foco do SM</span>' : '')}
        </div>

        <!-- Notas da discussão -->
        <div class="discussion-notes-section">
          <h4 class="discussion-notes-title">
            📝 Notas da discussão
            ${notes.length > 0 ? `<span class="badge badge-info" style="margin-left:8px">${notes.length}</span>` : ''}
          </h4>

          ${notes.length > 0 ? `
            <div class="discussion-notes-list" id="discussion-notes-list">
              ${notes.map((n) => buildNoteCard(n, canManage)).join('')}
            </div>
          ` : `
            <div class="discussion-notes-empty" id="discussion-notes-list">
              <p class="text-muted text-sm">
                ${canManage
                  ? 'Nenhuma nota ainda. Use o formulário abaixo para registrar pontos da conversa.'
                  : 'O Scrum Master ainda não registrou notas para este monstro.'}
              </p>
            </div>
          `}

          <!-- Formulário de adição (somente SM) -->
          ${canManage ? buildAddNoteForm() : ''}
        </div>

        <!-- Resultado da discussão -->
        ${buildDiscussionResultPanel(monster, canSetDiscussionResult())}

        <div class="phase-nav">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
          ${buildReadySignalHTML('discussion', currentState, userSM, getDeviceId())}
          ${userSM
            ? `<button class="btn btn-primary" id="btn-next">🗳️ IR PARA PRIORIZAÇÃO →</button>`
            : `<span class="text-muted text-sm">Aguardando o Scrum Master avançar…</span>`}
        </div>
      </div>
    `; }); // end preserveInputs

    if (_timer) _timer.destroy();
    _timer = createPhaseTimer(root.querySelector('.screen-discussion'), 'discussion');

    attachEvents();
  }

  function attachEvents() {
    attachReadySignal(root, signalReady);

    // Navegação entre monstros — somente SM (sincroniza foco para todos)
    root.querySelector('#btn-prev-monster')?.addEventListener('click', () => {
      if (!canSetDiscussionFocus() || currentIdx <= 0) return;
      currentIdx--;
      setDiscussionFocus(currentIdx);
      render();
    });

    root.querySelector('#btn-next-monster')?.addEventListener('click', () => {
      if (!canSetDiscussionFocus() || currentIdx >= monsters.length - 1) return;
      currentIdx++;
      setDiscussionFocus(currentIdx);
      render();
    });

    // Adicionar nota (somente SM)
    root.querySelector('#btn-add-note')?.addEventListener('click', async () => {
      if (!canManageDiscussionNotes()) return;
      const typeEl = root.querySelector('#note-type-select');
      const textEl = root.querySelector('#note-text-input');
      const text = textEl?.value.trim();
      if (!text) {
        if (textEl) { textEl.style.borderColor = 'var(--danger)'; textEl.focus(); }
        return;
      }
      if (textEl) textEl.style.borderColor = '';
      const btn = root.querySelector('#btn-add-note');
      if (btn) btn.disabled = true;

      const note = {
        id: uid(),
        monsterId: monsters[currentIdx].id,
        type: typeEl?.value || 'insight',
        text,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        await addDiscussionNote(note);
        if (textEl) textEl.value = '';
        render();
      } catch (e) {
        console.warn('Firestore addDiscussionNote failed:', e);
        showErrorToast('Nota não foi salva — verifique sua conexão.');
        if (btn) btn.disabled = false;
      }
    });

    // Editar nota — substitui o card pelo formulário inline
    root.querySelectorAll('[data-edit-note]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!canManageDiscussionNotes()) return;
        const noteId = btn.dataset.editNote;
        const note = getState().discussions.find((n) => n.id === noteId);
        if (!note) return;

        const noteCard = root.querySelector(`[data-note-id="${CSS.escape(noteId)}"]`);
        if (!noteCard) return;

        // Substitui o card pelo form de edição (sem re-render completo)
        noteCard.outerHTML = buildEditNoteForm(note);

        // Foca o textarea de edição
        const editTextEl = root.querySelector(`#edit-note-text-${CSS.escape(noteId)}`);
        if (editTextEl) { editTextEl.focus(); editTextEl.select(); }

        // Salvar edição
        root.querySelector(`[data-save-note="${CSS.escape(noteId)}"]`)?.addEventListener('click', async () => {
          const typeVal = root.querySelector(`#edit-note-type-${CSS.escape(noteId)}`)?.value || 'insight';
          const textVal = root.querySelector(`#edit-note-text-${CSS.escape(noteId)}`)?.value.trim();
          if (!textVal) return;
          try {
            await editDiscussionNote(noteId, { type: typeVal, text: textVal });
            render();
          } catch (e) {
            console.warn('Firestore editDiscussionNote failed:', e);
            showErrorToast('Falha ao salvar edição — verifique sua conexão.');
          }
        });

        // Cancelar edição — restaura o card original sem re-render completo
        root.querySelector(`[data-cancel-edit="${CSS.escape(noteId)}"]`)?.addEventListener('click', () => {
          render();
        });
      });
    });

    // Remover nota
    root.querySelectorAll('[data-remove-note]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!canManageDiscussionNotes()) return;
        const noteId = btn.dataset.removeNote;
        try {
          await removeDiscussionNote(noteId);
          render();
        } catch (e) {
          console.warn('Firestore removeDiscussionNote failed:', e);
          showErrorToast('Falha ao remover nota — verifique sua conexão.');
        }
      });
    });

    // Transformar ação em missão
    root.querySelectorAll('[data-to-mission-note]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!canConvertToMission()) return;
        const noteId = btn.dataset.toMissionNote;
        const note = getState().discussions.find((n) => n.id === noteId);
        if (!note) return;
        // Pré-preenche o form de missões com o texto da ação e o vínculo
        setState({
          _prefillMission: {
            text:         note.text,
            monsterId:    note.monsterId,
            discussionId: note.id,
          },
        });
        completePhase('discussion');
        setPhase('missions');
      });
    });

    // Confirmar resultado da discussão (somente SM)
    root.querySelector('#btn-confirm-result')?.addEventListener('click', async () => {
      if (!canSetDiscussionResult()) return;
      const selected = root.querySelector('input[name="discussion-result"]:checked')?.value;
      if (!selected) {
        showErrorToast('Selecione um resultado antes de confirmar.');
        return;
      }
      const btn = root.querySelector('#btn-confirm-result');
      if (btn) btn.disabled = true;
      try {
        await setMonsterDiscussionResult(monsters[currentIdx].id, selected);
        render();
      } catch (e) {
        console.warn('Firestore setMonsterDiscussionResult failed:', e);
        showErrorToast('Falha ao salvar resultado — verifique sua conexão.');
        if (btn) btn.disabled = false;
      }
    });

    // Remover resultado (somente SM)
    root.querySelector('#btn-clear-result')?.addEventListener('click', async () => {
      if (!canSetDiscussionResult()) return;
      const btn = root.querySelector('#btn-clear-result');
      if (btn) btn.disabled = true;
      try {
        await setMonsterDiscussionResult(monsters[currentIdx].id, null);
        render();
      } catch (e) {
        console.warn('Firestore setMonsterDiscussionResult (clear) failed:', e);
        showErrorToast('Falha ao remover resultado — verifique sua conexão.');
        if (btn) btn.disabled = false;
      }
    });

    root.querySelector('#btn-back').addEventListener('click', () => {
      if (isSM()) setPhase('monsters');
      else setLocalPhase('roleSelect');
    });

    root.querySelector('#btn-next')?.addEventListener('click', () => {
      completePhase('discussion');
      setPhase('voting');
    });
  }

  // ── Fingerprint para detectar mudanças remotas ───────────────────────────────
  function _fingerprint(state) {
    const notes = state.discussions.map((n) => `${n.id}:${n.type}:${n.text}:${n.updatedAt || ''}`).join('|');
    const focus = state.discussionFocus ?? 0;
    const count = parseInt(state.team?.participantCount, 10) || 0;
    // Inclui discussionResult de cada monstro para disparar re-render quando o SM define o resultado
    const results = state.monsters.map((m) => `${m.id}:${m.discussionResult ?? ''}`).join('|');
    return `${notes}|${focus}|${count}|${results}`;
  }

  let _lastFp = _fingerprint(getState());

  const unsub = subscribe((state) => {
    if (state.currentPhase !== 'discussion') {
      unsub();
      return;
    }
    const fp = _fingerprint(state);
    if (fp !== _lastFp) {
      _lastFp = fp;
      // Membros seguem o foco do SM automaticamente
      if (!isSM()) {
        currentIdx = Math.min(state.discussionFocus ?? 0, Math.max(0, monsters.length - 1));
      }
      render();
    }
  });

  render();
}
