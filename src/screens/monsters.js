/**
 * @security Toda interpolação em innerHTML DEVE usar escapeHTML(). Nunca
 *   interpole valores vindos do usuário ou do Firestore sem escapar.
 *
 * Monsters Screen
 */

import {
  getState, subscribe, addMonster, reactToMonster, selectMonster, prioritizeMonsters,
  mergeMonsters, addXP, setPhase, setLocalPhase, completePhase, isSM, signalReady,
} from '../state/store.js';
import { xpForMonster } from '../services/xp.js';
import { showXPToast, showErrorToast } from '../components/xpToast.js';
import { uid, escapeHTML, preserveInputs, buildReadySignalHTML, attachReadySignal } from '../utils/dom.js';
import { getDeviceId } from '../services/presence.js';
import { createPhaseTimer } from '../components/phaseTimer.js';
import { createTypingIndicator } from '../components/typingIndicator.js';

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

function buildMonsterCard(m, draggable) {
  const card = document.createElement('div');
  card.className = `card card-sm monster-card card-appear${m.selected ? ' selected-monster' : ''}${m.mergedFrom?.length ? ' monster-card--merged' : ''}`;
  card.dataset.id = m.id;

  if (draggable) {
    card.setAttribute('draggable', 'true');
    card.setAttribute('aria-grabbed', 'false');
  }

  card.innerHTML = `
    <div class="card-header" style="align-items:flex-start">
      <span class="card-emoji">${m.mergedFrom?.length ? '🔗' : '👹'}</span>
      <div style="flex:1">
        <span class="card-text">${escapeHTML(m.text)}</span>
        ${m.mergedFrom?.length ? `<span class="badge monster-badge-merged mt-1 flex" title="Agrupa ${m.mergedFrom.length} monstros">🔗 Mesclado (${m.mergedFrom.length + 1})</span>` : ''}
        ${m.selected ? '<span class="badge badge-accent mt-1 flex">🎯 Selecionado</span>' : ''}
      </div>
      ${draggable ? '<span class="monster-drag-handle" title="Arraste sobre outro card para mesclar">⠿</span>' : ''}
    </div>
    <div class="monster-card-actions">
      ${REACTIONS.map((r) => `
        <button class="reaction-btn" aria-label="${r.title} (${r.label})" data-id="${escapeHTML(m.id)}" data-reaction="${r.key}" title="${r.title}">
          ${r.label} <span class="reaction-count">${m.reactions[r.key] || 0}</span>
        </button>
      `).join('')}
      <button class="btn btn-sm ${m.selected ? 'btn-danger' : 'btn-ghost'}" data-select="${escapeHTML(m.id)}" aria-pressed="${m.selected}" style="margin-left:auto">
        ${m.selected ? '✕ Remover' : '🎯 Selecionar'}
      </button>
    </div>
  `;

  return card;
}

/**
 * Modal de confirmação de merge.
 * Retorna Promise<{ confirmed: boolean, keepText: string }> — o keepText é o
 * texto que o SM escolheu usar como nome do card resultante.
 */
function showMergeModal(keepMonster, dropMonster) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="merge-modal-title" style="max-width:500px">
        <h2 class="modal-title" id="merge-modal-title">🔗 Mesclar Monstros?</h2>
        <p class="modal-body" style="margin-bottom:16px">
          Os dois cards serão unidos em um só. As reactions serão somadas.
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
          <label class="form-label" for="merge-name-input">Nome do card mesclado</label>
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

    // cleanup centralizado: remove o listener de teclado e o backdrop.
    // Chamado em todos os caminhos de fechar para evitar leak do onKey.
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

    // Fechar clicando fora
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        cleanup();
        resolve({ confirmed: false, keepText: '' });
      }
    });

    // Fechar com Escape
    const onKey = (e) => {
      if (e.key === 'Escape') {
        cleanup();
        resolve({ confirmed: false, keepText: '' });
      }
    };
    document.addEventListener('keydown', onKey);
  });
}

export function renderMonsters(root) {
  let _timer  = null;
  let _unsub  = null;
  let _typing = null;
  // Id do card sendo arrastado (só relevante para o SM)
  let _dragId = null;

  function render() {
    const state = getState();
    const monsters = state.monsters;
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
            O que atrapalhou a equipe? Identifique os problemas e priorize os mais críticos.
            ${sm ? '<span class="merge-hint">Arraste um card sobre outro para mesclar, ou selecione 2 e clique em <strong>Mesclar</strong>.</span>' : ''}
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
            ${selectedCount > 0 ? `<span class="badge badge-accent" data-selected-count>🎯 ${selectedCount} selecionado${selectedCount !== 1 ? 's' : ''}</span>` : ''}
            ${sm && selectedCount === 2 ? '<button class="btn btn-info btn-sm" id="btn-merge-selected">🔗 MESCLAR SELECIONADOS</button>' : ''}
            <button class="btn btn-ghost btn-sm" id="btn-prioritize">🔥 PRIORIZAR AUTOMATICAMENTE</button>
          </div>
        </div>

        <div class="monsters-grid" id="monsters-grid">
          ${monsters.length === 0 ? '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">👹</div><p class="empty-state-text">Nenhum monstro ainda. Adicione os problemas da Sprint.</p></div>' : ''}
        </div>

        <div class="phase-nav">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
          ${buildReadySignalHTML('monsters', state, sm, getDeviceId())}
          ${sm
            ? `<button class="btn btn-primary" id="btn-next" ${selectedCount > 0 ? '' : 'disabled'}>🛡️ IR PARA COMBATE →</button>`
            : `<span class="text-muted text-sm">Aguardando o Scrum Master avançar…</span>`}
        </div>
      </div>
    `; // end preserveInputs
      const grid = root.querySelector('#monsters-grid');
      if (monsters.length > 0) {
        monsters.forEach((m) => grid.appendChild(buildMonsterCard(m, sm)));
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
    const sm = isSM();

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

    // Prioritize
    root.querySelector('#btn-prioritize').addEventListener('click', () => {
      prioritizeMonsters();
      render();
    });

    // Reactions — patch cirúrgico.
    // reactToMonster retorna Promise<false> se o dispositivo já reagiu.
    root.querySelectorAll('.reaction-btn[data-reaction]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        // Otimismo local: atualiza imediatamente para feedback rápido
        const span = btn.querySelector('.reaction-count');
        if (span) span.textContent = Number(span.textContent) + 1;
        const accepted = await reactToMonster(btn.dataset.id, btn.dataset.reaction);
        // Reverte se rejeitado (já reagiu ou erro)
        if (!accepted && span) span.textContent = Number(span.textContent) - 1;
      });
    });

    // Select — patch cirúrgico
    root.querySelectorAll('[data-select]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.select;
        selectMonster(id);
        const card = root.querySelector(`.monster-card[data-id="${CSS.escape(id)}"]`);
        if (card) {
          const isNowSelected = !card.classList.contains('selected-monster');
          card.classList.toggle('selected-monster', isNowSelected);
          btn.className = `btn btn-sm ${isNowSelected ? 'btn-danger' : 'btn-ghost'}`;
          btn.setAttribute('aria-pressed', String(isNowSelected));
          btn.textContent = isNowSelected ? '✕ Remover' : '🎯 Selecionar';
          const badge = card.querySelector('.badge-accent');
          if (isNowSelected && !badge) {
            const textDiv = card.querySelector('.card-text').parentElement;
            const newBadge = document.createElement('span');
            newBadge.className = 'badge badge-accent mt-1 flex';
            newBadge.textContent = '🎯 Selecionado';
            textDiv.appendChild(newBadge);
          } else if (!isNowSelected && badge) {
            badge.remove();
          }
          const newCount = root.querySelectorAll('.monster-card.selected-monster').length;
          const nextBtn = root.querySelector('#btn-next');
          if (nextBtn) nextBtn.disabled = newCount === 0;
          const countBadge = root.querySelector('[data-selected-count]');
          if (countBadge) countBadge.textContent = `🎯 ${newCount} selecionado${newCount !== 1 ? 's' : ''}`;
        }
      });
    });

    // ── Drag & Drop (SM only) ──────────────────────────────────────────────
    if (sm) {
      root.querySelectorAll('.monster-card[draggable]').forEach((card) => {
        card.addEventListener('dragstart', (e) => {
          _dragId = card.dataset.id;
          card.setAttribute('aria-grabbed', 'true');
          card.classList.add('monster-card--dragging');
          e.dataTransfer.effectAllowed = 'move';
          // Pequeno delay para o browser capturar o snapshot antes de adicionar a classe
          setTimeout(() => card.classList.add('monster-card--ghost'), 0);
        });

        card.addEventListener('dragend', () => {
          _dragId = null;
          card.setAttribute('aria-grabbed', 'false');
          card.classList.remove('monster-card--dragging', 'monster-card--ghost');
          // Remove highlight de todos os alvos
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
          // render() será chamado via subscribeCollection (Firestore) ou pelo optimistic update
        });
      });
    }

    root.querySelector('#btn-back').addEventListener('click', () => {
      if (isSM()) setPhase('treasures');
      else setLocalPhase('roleSelect');
    });
    root.querySelector('#btn-next')?.addEventListener('click', () => {
      completePhase('monsters');
      setPhase('combat');
    });
  }

  // Retorna uma string que muda sempre que qualquer reação, seleção ou o
  // conjunto de monstros muda — permite detectar atualizações remotas além de length.
  function _fingerprint(monsters) {
    return monsters.map((m) =>
      `${m.id}:${m.reactions.fire||0},${m.reactions.eyes||0},${m.reactions.bulb||0},${m.selected ? 1 : 0}`
    ).join('|');
  }

  // Subscription em tempo real: re-renderiza quando monstros/reações mudam remotamente
  // ou quando participantCount sobe (entrada tardia — atualiza contador de "Terminei").
  let _lastFingerprint      = _fingerprint(getState().monsters);
  let _lastParticipantCount = parseInt(getState().team?.participantCount, 10) || 0;
  // A referência a _unsub é capturada via closure após a atribuição para evitar
  // a janela de corrida onde o callback dispara antes de _unsub ser atribuído.
  const unsub = subscribe((state) => {
    if (state.currentPhase !== 'monsters') {
      unsub();
      _unsub = null;
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
  _unsub = unsub;

  render();
}
