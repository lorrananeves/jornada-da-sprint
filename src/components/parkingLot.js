/**
 * Parking Lot — botão flutuante "📌 Para depois" acessível em todas as fases
 *
 * Renderiza um botão fixo no canto inferior esquerdo. Ao clicar abre um
 * painel lateral com as notas do parking lot, input para adicionar e botões
 * para remover cada item. Sincroniza via store (Firestore).
 */

import { getState, subscribe, addParkingItem, removeParkingItem } from '../state/store.js';
import { escapeHTML } from '../utils/dom.js';

const HIDDEN_PHASES = new Set(['home', 'auth', 'smDashboard', 'roleSelect', 'lobby']);

let _unsub   = null;
let _open    = false;
let _root    = null;

export function initParkingLot() {
  _root = document.getElementById('parking-lot-root');
  if (!_root) return;

  _render();
  _unsub = subscribe(_render);
}

function _render() {
  if (!_root) return;

  const state = getState();
  if (HIDDEN_PHASES.has(state.currentPhase)) {
    _root.innerHTML = '';
    return;
  }

  const items = state.parkingLot || [];

  _root.innerHTML = `
    <button class="parking-lot-fab" id="parking-lot-toggle" aria-label="Parking lot — assuntos para depois" title="📌 Para depois (${items.length})">
      📌
      ${items.length > 0 ? `<span class="parking-lot-badge">${items.length}</span>` : ''}
    </button>
    ${_open ? `
      <div class="parking-lot-panel" role="dialog" aria-label="Parking lot">
        <div class="parking-lot-header">
          <span class="parking-lot-header-title">📌 Para depois</span>
          <button class="parking-lot-close" id="parking-lot-close" aria-label="Fechar">✕</button>
        </div>
        <p class="parking-lot-hint">Assuntos fora do escopo da fase atual. Revise ao final.</p>
        <div class="parking-lot-input-row">
          <input class="form-input parking-lot-input" id="parking-lot-input" type="text" placeholder="Anotação para depois…" />
          <button class="btn btn-primary btn-sm" id="parking-lot-add">+</button>
        </div>
        <ul class="parking-lot-list">
          ${items.length === 0
            ? '<li class="parking-lot-empty">Nenhuma nota ainda.</li>'
            : items.map((item) => `
              <li class="parking-lot-item">
                <span class="parking-lot-item-text">${escapeHTML(item.text)}</span>
                <button class="parking-lot-remove" data-id="${escapeHTML(item.id)}" aria-label="Remover">✕</button>
              </li>
            `).join('')}
        </ul>
      </div>
    ` : ''}
  `;

  _root.querySelector('#parking-lot-toggle').addEventListener('click', () => {
    _open = !_open;
    _render();
    if (_open) {
      const input = _root.querySelector('#parking-lot-input');
      if (input) input.focus();
    }
  });

  if (_open) {
    _root.querySelector('#parking-lot-close').addEventListener('click', () => {
      _open = false;
      _render();
    });

    const input = _root.querySelector('#parking-lot-input');
    const addBtn = _root.querySelector('#parking-lot-add');

    const doAdd = () => {
      const text = input.value.trim();
      if (!text) return;
      addParkingItem(text);
      input.value = '';
    };

    addBtn.addEventListener('click', doAdd);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doAdd();
    });

    _root.querySelectorAll('.parking-lot-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeParkingItem(btn.dataset.id));
    });
  }
}
