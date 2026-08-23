/**
 * Treasures Screen — synchronous, no async/await at module level
 */

import {
  getState, addTreasure, reactToTreasure, addXP, setPhase, completePhase,
} from '../state/store.js';
import { xpForTreasure } from '../services/xp.js';
import { showXPToast } from '../components/xpToast.js';
import { uid, escapeHTML } from '../utils/dom.js';

const CATEGORIES = [
  { id: 'treasure',    emoji: '💎', label: 'Tesouro',        question: 'O que funcionou bem nessa Sprint?' },
  { id: 'recognition', emoji: '❤️', label: 'Reconhecimento', question: 'Quem ou o que merece um agradecimento?' },
  { id: 'learning',    emoji: '🧠', label: 'Descoberta',     question: 'O que aprendemos nessa Sprint?' },
];

const REACTIONS = [
  { key: 'heart',  label: '❤️' },
  { key: 'thumbs', label: '👍' },
  { key: 'bulb',   label: '💡' },
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
      <textarea class="form-textarea treasure-input" placeholder="Escreva aqui..." style="width:100%;min-height:64px" data-cat="${cat.id}"></textarea>
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
    card.innerHTML = `
      <div class="card-header">
        <span class="card-emoji">${cat.emoji}</span>
        <span class="card-text">${escapeHTML(item.text)}</span>
      </div>
      <div class="card-reactions">
        ${REACTIONS.map((r) => `
          <button class="reaction-btn" data-id="${escapeHTML(item.id)}" data-reaction="${r.key}">
            ${r.label} <span>${item.reactions[r.key] || 0}</span>
          </button>
        `).join('')}
      </div>
    `;
    col.querySelector(`#list-${cat.id}`).appendChild(card);
  });

  return col;
}

export function renderTreasures(root) {
  function render() {
    const state = getState();

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
          <button class="btn btn-primary" id="btn-next">👹 PRÓXIMA FASE →</button>
        </div>
      </div>
    `;

    const cols = root.querySelector('#treasure-cols');
    CATEGORIES.forEach((cat) => {
      const col = buildColumn(cat, state.treasures);
      cols.appendChild(col);

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

      // Reaction events
      col.querySelectorAll('.reaction-btn[data-reaction]').forEach((btn) => {
        btn.addEventListener('click', () => {
          reactToTreasure(btn.dataset.id, btn.dataset.reaction);
          render();
        });
      });
    });

    root.querySelector('#btn-back').addEventListener('click', () => setPhase('checkin'));
    root.querySelector('#btn-next').addEventListener('click', () => {
      completePhase('treasures');
      setPhase('monsters');
    });
  }

  render();
}
