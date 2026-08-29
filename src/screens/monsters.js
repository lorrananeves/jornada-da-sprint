/**
 * @security Toda interpolação em innerHTML DEVE usar escapeHTML(). Nunca
 *   interpole valores vindos do usuário ou do Firestore sem escapar.
 *
 * Monsters Screen
 *
 * Mudanças em relação à versão anterior:
 *   - Seleção obrigatória removida: todos os monstros vão para a discussão
 *   - SM pode renomear monstros (inline ou via modal)
 *   - SM pode excluir monstros (com confirmação)
 *   - SM pode desfazer merge de monstros agrupados
 *   - Botão "Ir para Combate" substituído por "Ir para Discussão"
 *   - Botão "Ordenar por votos" (antes "Priorizar automaticamente") — comportamento inalterado
 */

import {
  getState, subscribe, addMonster, reactToMonster, prioritizeMonsters,
  mergeMonsters, unmergeMonster, renameMonster, deleteMonster,
  addXP, setPhase, setLocalPhase, completePhase, isSM, signalReady,
} from '../state/store.js';
import { xpForMonster } from '../services/xp.js';
import { showXPToast, showErrorToast } from '../components/xpToast.js';
import { uid, escapeHTML, preserveInputs, buildReadySignalHTML, attachReadySignal } from '../utils/dom.js';
import { getDeviceId } from '../services/presence.js';
import { createPhaseTimer } from '../components/phaseTimer.js';
import { createTypingIndicator } from '../components/typingIndicator.js';
import { canMergeMonsters, canUnmergeMonster, canRenameMonster, canDeleteMonster, canPrioritizeMonsters } from '../utils/permissions.js';
import { showModal } from '../components/modal.js';

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

function buildMonsterCard(m, isSMUser) {
  const card = document.createElement('div');
  card.className = `card card-sm monster-card card-appear${m.mergedFrom?.length ? ' monster-card--merged' : ''}`;
  card.dataset.id = m.id;

  if (isSMUser) {
    card.setAttribute('draggable', 'true');
    card.setAttribute('aria-grabbed', 'false');
  }

  // Conta quantos relatos originais o monstro agrupou
  const mergedCount = m.mergedFrom?.length ?? 0;
  // Número de relatos = originais absorvidos + 1 (o próprio card)
  const relatosCount = mergedCount > 0 ? mergedCount + 1 : null;

  card.innerHTML = `
    <div class="card-header" style="align-items:flex-start">
      <span class="card-emoji">${mergedCount > 0 ? '🔗' : '👹'}</span>
      <div style="flex:1;min-width:0">
        <span class="card-text">${escapeHTML(m.text)}</span>
        ${mergedCount > 0 ? `<span class="badge monster-badge-merged mt-1 flex" title="Agrupa ${relatosCount} relatos">🔗 ${relatosCount} relatos</span>` : ''}
        ${m.priorityRank != null ? `<span class="badge badge-info mt-1 flex" title="Posição no ranking de votos">#${m.priorityRank + 1}</span>` : ''}
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        ${isSMUser ? `<span class="monster-drag-handle" title="Arraste sobre outro card para mesclar">⠿</span>` : ''}
      </div>
    </div>
    <div class="monster-card-actions">
      ${REACTIONS.map((r) => `
        <button class="reaction-btn" aria-label="${r.title} (${r.label})" data-id="${escapeHTML(m.id)}" data-reaction="${r.key}" title="${r.title}">
          ${r.label} <span class="reaction-count">${m.reactions[r.key] || 0}</span>
        </button>
      `).join('')}
      ${isSMUser ? `
        <div style="margin-left:auto;display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm btn-icon" data-rename="${escapeHTML(m.id)}" title="Renomear monstro">✏️</button>
          ${mergedCount > 0 ? `<button class="btn btn-ghost btn-sm btn-icon" data-unmerge="${escapeHTML(m.id)}" title="Desfazer agrupamento">↩️</button>` : ''}
          <button class="btn btn-danger btn-sm btn-icon" data-delete="${escapeHTML(m.id)}" title="Excluir monstro">🗑️</button>
        </div>
      ` : ''}
    </div>
  `;

  return card;
}

/**
 * Modal de confirmação de merge.
 * Retorna Promise<{ confirmed: boolean, keepText: string }>
 */
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
    input.focus();
    input.select();

    const cleanup = () => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
    };

    backdrop.querySelector('#btn-merge-cancel').addEventListener('click', () => {
      cleanup();
      resolve({ confirmed: false, keepText: '' });
    });

    backdrop.querySelector('#btn-merge-confirm').addEventListener('click', () => {
      const keepText = input.value.trim() || keepMonster.text;
      cleanup();
      resolve({ confirmed: true, keepText });
    });

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        cleanup();
        resolve({ confirmed: false, keepText: '' });
      }
    });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        cleanup();
        resolve({ confirmed: false, keepText: '' });
      }
    };
    document.addEventListener('keydown', onKey);
  });
}

/**
 * Modal inline para renomear um monstro.
 * Retorna Promise<string | null> — o novo texto, ou null se cancelado.
 */
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
    input.focus();
    input.select();

    const cleanup = () => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
    };

    backdrop.querySelector('#btn-rename-cancel').addEventListener('click', () => {
      cleanup(); resolve(null);
    });

    backdrop.querySelector('#btn-rename-confirm').addEventListener('click', () => {
      const val = input.value.trim();
      cleanup();
      resolve(val || null);
    });

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) { cleanup(); resolve(null); }
    });

    const onKey = (e) => {
      if (e.key === 'Escape') { cleanup(); resolve(null); }
    };
    document.addEventListener('keydown', onKey);
  });
}

export function renderMonsters(root) {
  let _timer  = null;
  let _typing = null;
  let _dragId = null;

  function render() {
    const state = getState();
    const monsters = state.monsters;
    // Selecionar não é mais necessário para avançar — mantemos canMergeMonsters para merge
    const selectedCount = monsters.filter((m) => m.selected).length;
    const sm = isSM();

    preserveInputs(root, () => { root.innerHTML = `
      <div class="screen-monsters screen-enter">
        <div class="phase-header">
          <div class="phase-header-top">
            <span class="phase-icon">👹</span>
            <h2 class="phase-title">Monstros da Sprint</h2>
          </div>
          <p class="phase-description">
            O que atrapalhou a equipe? Identifique os problemas enfrentados nessa Sprint.
            ${canMergeMonsters() ? '<span class="merge-hint">Arraste um card sobre outro para mesclar, ou selecione 2 e clique em <strong>Mesclar</strong>.</span>' : ''}
          </p>
        </div>

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

        <div class="monsters-toolbar">
          <h4>Monstros identificados <span class="badge badge-info">${monsters.length}</span></h4>
          <div class="monsters-toolbar-actions">
            ${canMergeMonsters() && selectedCount === 2 ? '<button class="btn btn-info btn-sm" id="btn-merge-selected">🔗 MESCLAR SELECIONADOS</button>' : ''}
            ${canPrioritizeMonsters() ? '<button class="btn btn-ghost btn-sm" id="btn-prioritize">↕️ ORDENAR POR VOTOS</button>' : ''}
          </div>
        </div>

        <div class="monsters-grid" id="monsters-grid">
          ${monsters.length === 0 ? '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">👹</div><p class="empty-state-text">Nenhum monstro ainda. Adicione os problemas da Sprint.</p></div>' : ''}
        </div>

        <div class="phase-nav">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
          ${buildReadySignalHTML('monsters', state, sm, getDeviceId())}
          ${sm
            ? `<button class="btn btn-primary" id="btn-next">🗣️ IR PARA DISCUSSÃO →</button>`
            : `<span class="text-muted text-sm">Aguardando o Scrum Master avançar…</span>`}
        </div>
      </div>
    `; // end preserveInputs
      const grid = root.querySelector('#monsters-grid');
      if (monsters.length > 0) {
        monsters.forEach((m) => grid.appendChild(buildMonsterCard(m, canMergeMonsters())));
      }
    });

    if (_timer)  _timer.destroy();
    _timer = createPhaseTimer(root.querySelector('.screen-monsters'), 'monsters');

    if (_typing) _typing.destroy();
    _typing = createTypingIndicator(root.querySelector('.screen-monsters'), 'monsters');
    const monsterInput = root.querySelector('#monster-input');
    if (monsterInput) _typing.watchField(monsterInput);

    attachEvents();
  }

  function attachEvents() {
    attachReadySignal(root, signalReady);

    // Suggestion chips
    root.querySelectorAll('[data-suggestion]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const input = root.querySelector('#monster-input');
        input.value = input.value ? `${input.value} ${chip.dataset.suggestion}` : chip.dataset.suggestion;
        input.focus();
      });
    });

    // Add monster
    root.querySelector('#btn-add-monster').addEventListener('click', async () => {
      const input = root.querySelector('#monster-input');
      const text = input.value.trim();
      if (!text) {
        input.style.borderColor = 'var(--danger)';
        input.focus();
        return;
      }
      input.style.borderColor = '';
      const addBtn = root.querySelector('#btn-add-monster');
      addBtn.disabled = true;
      try {
        await addMonster({ id: uid(), text, reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false });
        addXP(xpForMonster());
        showXPToast(xpForMonster(), 'Monstro adicionado');
        input.value = '';
        if (_typing) _typing.destroy();
        render();
      } catch (e) {
        console.warn('Firestore addMonster failed:', e);
        showErrorToast('Monstro não foi salvo — verifique sua conexão.');
        addBtn.disabled = false;
      }
    });

    // Renomear monstro (SM only)
    root.querySelectorAll('[data-rename]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!canRenameMonster()) return;
        const id = btn.dataset.rename;
        const monster = getState().monsters.find((m) => m.id === id);
        if (!monster) return;
        const newText = await showRenameModal(monster);
        if (!newText || newText === monster.text) return;
        try {
          await renameMonster(id, newText);
        } catch (err) {
          console.warn('Firestore renameMonster failed:', err);
          showErrorToast('Falha ao renomear — verifique sua conexão.');
        }
      });
    });

    // Excluir monstro (SM only)
    root.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!canDeleteMonster()) return;
        const id = btn.dataset.delete;
        const confirmed = await showModal({
          title: 'Excluir Monstro',
          body: 'Deseja excluir este monstro? Esta ação não pode ser desfeita.',
          confirmLabel: 'Excluir',
          confirmClass: 'btn btn-danger',
        });
        if (!confirmed) return;
        try {
          await deleteMonster(id);
        } catch (err) {
          console.warn('Firestore deleteMonster failed:', err);
          showErrorToast('Falha ao excluir — verifique sua conexão.');
        }
      });
    });

    // Desfazer merge (SM only)
    root.querySelectorAll('[data-unmerge]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!canUnmergeMonster()) return;
        const id = btn.dataset.unmerge;
        const confirmed = await showModal({
          title: '↩️ Desfazer Agrupamento',
          body: 'Os relatos originais voltarão como cards individuais. Notas de discussão associadas a este agrupamento serão mantidas.',
          confirmLabel: 'Desfazer',
          confirmClass: 'btn btn-primary',
        });
        if (!confirmed) return;
        try {
          unmergeMonster(id);
        } catch (err) {
          console.warn('Firestore unmergeMonster failed:', err);
          showErrorToast('Falha ao desfazer merge — verifique sua conexão.');
        }
      });
    });

    // Mesclar selecionados (fallback mobile — disponível quando exatamente 2 cards estão selecionados)
    root.querySelector('#btn-merge-selected')?.addEventListener('click', async () => {
      const state = getState();
      const selected = state.monsters.filter((m) => m.selected);
      if (selected.length !== 2) return;
      const [keepMon, dropMon] = selected;
      const { confirmed, keepText } = await showMergeModal(keepMon, dropMon);
      if (!confirmed) return;
      mergeMonsters(keepMon.id, dropMon.id, keepText);
    });

    // Ordenar por votos (antes "Priorizar automaticamente")
    root.querySelector('#btn-prioritize')?.addEventListener('click', () => {
      prioritizeMonsters();
      render();
    });

    // Reactions — patch cirúrgico
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

    // ── Drag & Drop (SM only — merge é ação destrutiva) ───────────────────
    if (canMergeMonsters()) {
      root.querySelectorAll('.monster-card[draggable]').forEach((card) => {
        card.addEventListener('dragstart', (e) => {
          _dragId = card.dataset.id;
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
          if (!_dragId || card.dataset.id === _dragId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          card.classList.add('monster-card--drop-target');
        });

        card.addEventListener('dragleave', () => {
          card.classList.remove('monster-card--drop-target');
        });

        card.addEventListener('drop', async (e) => {
          e.preventDefault();
          card.classList.remove('monster-card--drop-target');

          const dropId  = _dragId;
          const keepId  = card.dataset.id;
          if (!dropId || dropId === keepId) return;

          const state    = getState();
          const keepMon  = state.monsters.find((m) => m.id === keepId);
          const dropMon  = state.monsters.find((m) => m.id === dropId);
          if (!keepMon || !dropMon) return;

          const { confirmed, keepText } = await showMergeModal(keepMon, dropMon);
          if (!confirmed) return;

          mergeMonsters(keepId, dropId, keepText);
        });
      });
    }

    root.querySelector('#btn-back').addEventListener('click', () => {
      if (isSM()) setPhase('treasures');
      else setLocalPhase('roleSelect');
    });

    // Avança para a nova fase de Discussão (não mais Combat)
    root.querySelector('#btn-next')?.addEventListener('click', () => {
      completePhase('monsters');
      setPhase('discussion');
    });
  }

  function _fingerprint(monsters) {
    return monsters.map((m) =>
      `${m.id}:${m.reactions.fire||0},${m.reactions.eyes||0},${m.reactions.bulb||0},${m.selected ? 1 : 0},${m.priorityRank ?? ''},${m.text}`
    ).join('|');
  }

  let _lastFingerprint      = _fingerprint(getState().monsters);
  let _lastParticipantCount = parseInt(getState().team?.participantCount, 10) || 0;
  const unsub = subscribe((state) => {
    if (state.currentPhase !== 'monsters') {
      unsub();
      if (_typing) { _typing.destroy(); _typing = null; }
      return;
    }
    const fp       = _fingerprint(state.monsters);
    const newCount = parseInt(state.team?.participantCount, 10) || 0;
    if (fp !== _lastFingerprint || newCount !== _lastParticipantCount) {
      _lastFingerprint      = fp;
      _lastParticipantCount = newCount;
      render();
    }
  });

  render();
}
