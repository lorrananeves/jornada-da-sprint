/**
 * Treasures Screen — synchronous, no async/await at module level
 */

import {
  getState, subscribe, addTreasure, reactToTreasure, addXP, setPhase, setLocalPhase, completePhase, isSM,
} from '../state/store.js';
import { xpForTreasure } from '../services/xp.js';
import { showXPToast } from '../components/xpToast.js';
import { uid, escapeHTML, preserveInputs } from '../utils/dom.js';
import { createPhaseTimer } from '../components/phaseTimer.js';

const CATEGORIES = [
  { id: 'treasure',    emoji: '💎', label: 'Tesouro',        question: 'O que funcionou bem nessa Sprint?' },
  { id: 'recognition', emoji: '❤️', label: 'Reconhecimento', question: 'Quem ou o que merece um agradecimento?' },
  { id: 'learning',    emoji: '🧠', label: 'Descoberta',     question: 'O que aprendemos nessa Sprint?' },
];

const REACTIONS = [
  { key: 'heart',  label: '❤️', title: 'Amei' },
  { key: 'thumbs', label: '👍', title: 'Concordo' },
  { key: 'bulb',   label: '💡', title: 'Inspirador' },
];

function buildColumn(cat, treasures) {
  const items = treasures.filter((t) => t.category === cat.id);

  const col = document.createElement('div');
  col.dataset.category = cat.id;

  col.innerHTML = `
    <div class="treasure-column-header">
      <span>${cat.emoji}</span>
      <span>${cat.label}</span>
      <span class="badge badge-info" style="margin-left:auto">${items.length}</span>
    </div>
    <div class="treasure-add-form">
      <p class="text-muted" style="font-size:0.8125rem;margin-bottom:8px">${cat.question}</p>
      <textarea class="form-textarea treasure-input" placeholder="Escreva aqui..." style="width:100%;min-height:64px" data-cat="${cat.id}" id="treasure-input-${cat.id}"></textarea>
      <button class="btn btn-success btn-sm btn-full" style="margin-top:8px" data-add="${cat.id}">
        + Adicionar
      </button>
    </div>
    <div class="treasure-cards-list" id="list-${cat.id}">
      ${items.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon">${cat.emoji}</div><p class="empty-state-text">Nenhum item ainda</p></div>`
        : ''}
    </div>
  `;

  // Append item cards
  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'card card-sm card-appear';
    card.dataset.itemId = item.id;
    card.innerHTML = `
      <div class="card-header">
        <span class="card-emoji">${cat.emoji}</span>
        <span class="card-text">${escapeHTML(item.text)}</span>
      </div>
      <div class="card-reactions">
        ${REACTIONS.map((r) => `
          <button class="reaction-btn" aria-label="${r.title} (${r.label})" data-id="${escapeHTML(item.id)}" data-reaction="${r.key}">
            ${r.label} <span class="reaction-count">${item.reactions[r.key] || 0}</span>
          </button>
        `).join('')}
      </div>
    `;
    col.querySelector(`#list-${cat.id}`).appendChild(card);
  });

  return col;
}

export function renderTreasures(root) {
  let _timer = null;
  let _unsub = null;

  function render() {
    const state = getState();

    preserveInputs(root, () => {
      root.innerHTML = `
        <div class="screen-treasures screen-enter">
          <div class="phase-header">
            <div class="phase-header-top">
              <span class="phase-icon">💎</span>
              <h2 class="phase-title">Tesouros da Sprint</h2>
            </div>
            <p class="phase-description">
              Capture o que funcionou bem, reconhecimentos e aprendizados desta Sprint.
            </p>
          </div>
          <div class="treasure-columns" id="treasure-cols"></div>
          <div class="phase-nav">
            <button class="btn btn-ghost" id="btn-back">← Voltar</button>
            ${isSM() ? `<button class="btn btn-primary" id="btn-next">👹 PRÓXIMA FASE →</button>` : `<span class="text-muted" style="font-size:0.875rem">Aguardando o Scrum Master avançar…</span>`}
          </div>
        </div>
      `;

      const cols = root.querySelector('#treasure-cols');
      CATEGORIES.forEach((cat) => {
        cols.appendChild(buildColumn(cat, state.treasures));
      });
    });

    if (_timer) _timer.destroy();
    _timer = createPhaseTimer(root.querySelector('.screen-treasures'), 'treasures');

    attachEvents();
  }

  function attachEvents() {
    CATEGORIES.forEach((cat) => {
      const col = root.querySelector(`[data-category="${cat.id}"]`);
      if (!col) return;

      // Add item event
      col.querySelector(`[data-add="${cat.id}"]`).addEventListener('click', () => {
        const textarea = col.querySelector(`.treasure-input[data-cat="${cat.id}"]`);
        const text = textarea.value.trim();
        if (!text) {
          textarea.style.borderColor = 'var(--danger)';
          textarea.focus();
          return;
        }
        textarea.style.borderColor = '';
        addTreasure({
          id: uid(),
          text,
          category: cat.id,
          reactions: { heart: 0, thumbs: 0, bulb: 0 },
        });
        const xp = xpForTreasure(cat.id);
        addXP(xp);
        showXPToast(xp, `${cat.emoji} ${cat.label} adicionado`);
        textarea.value = '';
        render();
      });

      // Reaction events — patch cirúrgico: só atualiza o contador no DOM,
      // sem recriar a tela e sem destruir os <textarea> com texto digitado
      col.querySelectorAll('.reaction-btn[data-reaction]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const { id: itemId, reaction } = btn.dataset;
          reactToTreasure(itemId, reaction);
          // Atualiza otimisticamente o contador no DOM enquanto o Firestore
          // processa (o patchItem remoto chegará em breve via subscription)
          const span = btn.querySelector('.reaction-count');
          if (span) span.textContent = Number(span.textContent) + 1;
        });
      });
    });

    root.querySelector('#btn-back').addEventListener('click', () => {
      if (isSM()) setPhase('checkin');
      else setLocalPhase('roleSelect');
    });
    root.querySelector('#btn-next')?.addEventListener('click', () => {
      completePhase('treasures');
      setPhase('monsters');
    });
  }

  // Subscription em tempo real: re-renderiza quando tesouros mudam remotamente
  let _lastCount = getState().treasures.length;
  _unsub = subscribe((state) => {
    if (state.currentPhase !== 'treasures') {
      _unsub?.();
      _unsub = null;
      return;
    }
    if (state.treasures.length !== _lastCount) {
      _lastCount = state.treasures.length;
      render();
    }
  });

  render();
}
