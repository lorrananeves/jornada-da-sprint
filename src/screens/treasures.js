/**
 * @security Toda interpolação em innerHTML DEVE usar escapeHTML(). Nunca
 *   interpole valores vindos do usuário ou do Firestore sem escapar.
 *
 * Treasures Screen — synchronous, no async/await at module level
 */

import {
  getState, subscribe, addTreasure, reactToTreasure, addXP, setPhase, setLocalPhase, completePhase, isSM, signalReady,
} from '../state/store.js';
import { xpForTreasure } from '../services/xp.js';
import { showXPToast } from '../components/xpToast.js';
import { uid, escapeHTML, preserveInputs, buildReadySignalHTML, attachReadySignal } from '../utils/dom.js';
import { getDeviceId } from '../services/presence.js';
import { createPhaseTimer } from '../components/phaseTimer.js';
import { createTypingIndicator } from '../components/typingIndicator.js';

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
  let _timer   = null;
  let _unsub   = null;
  let _typing  = null;

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
            ${buildReadySignalHTML('treasures', state, isSM(), getDeviceId())}
            ${isSM() ? `<button class="btn btn-primary" id="btn-next">👹 PRÓXIMA FASE →</button>` : `<span class="text-muted text-sm">Aguardando o Scrum Master avançar…</span>`}
          </div>
        </div>
      `;

      const cols = root.querySelector('#treasure-cols');
      CATEGORIES.forEach((cat) => {
        cols.appendChild(buildColumn(cat, state.treasures));
      });
    });

    if (_timer)  _timer.destroy();
    _timer = createPhaseTimer(root.querySelector('.screen-treasures'), 'treasures');

    // Indicador de digitação — recria após cada render (preserveInputs recria o DOM)
    if (_typing) _typing.destroy();
    _typing = createTypingIndicator(root.querySelector('#treasure-cols'), 'treasures');
    root.querySelectorAll('.treasure-input').forEach((ta) => _typing.watchField(ta));

    attachEvents();
  }

  function attachEvents() {
    attachReadySignal(root, signalReady);
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
          if (_typing) _typing.destroy();
          render();
      });

      // Reaction events — patch cirúrgico: só atualiza o contador no DOM,
      // sem recriar a tela e sem destruir os <textarea> com texto digitado.
      // reactToTreasure retorna Promise<false> se o dispositivo já reagiu.
      col.querySelectorAll('.reaction-btn[data-reaction]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const { id: itemId, reaction } = btn.dataset;
          // Otimismo local: atualiza imediatamente para feedback rápido
          const span = btn.querySelector('.reaction-count');
          if (span) span.textContent = Number(span.textContent) + 1;
          const accepted = await reactToTreasure(itemId, reaction);
          // Reverte se rejeitado (já reagiu ou erro)
          if (!accepted && span) span.textContent = Number(span.textContent) - 1;
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
      if (_typing) { _typing.destroy(); _typing = null; }
      return;
    }
    if (state.treasures.length !== _lastCount) {
      _lastCount = state.treasures.length;
      render();
    }
  });

  render();
}
