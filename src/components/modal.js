/**
 * Modal Component — confirmation dialogs
 */

import { qs, escapeHTML } from '../utils/dom.js';

let activeModal = null;

/**
 * Show a confirmation modal
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.confirmLabel]
 * @param {string} [opts.cancelLabel]
 * @param {string} [opts.confirmClass]
 * @returns {Promise<boolean>}
 */
export function showModal({
  title,
  body,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmClass = 'btn btn-danger',
}) {
  return new Promise((resolve) => {
    closeModal();

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3 class="modal-title">${escapeHTML(title)}</h3>
        <p class="modal-body">${escapeHTML(body)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="modal-cancel">${escapeHTML(cancelLabel)}</button>
          <button class="${confirmClass}" id="modal-confirm">${escapeHTML(confirmLabel)}</button>
        </div>
      </div>
    `;

    // cleanup centralizado: remove o listener de teclado e fecha o modal.
    // Chamado em todos os caminhos de fechar para evitar leak do onKey
    // (mesmo padrão aplicado ao modal de merge em monsters.js).
    const cleanup = (result) => {
      document.removeEventListener('keydown', onKey);
      closeModal();
      resolve(result);
    };

    backdrop.querySelector('#modal-cancel').addEventListener('click', () => cleanup(false));
    backdrop.querySelector('#modal-confirm').addEventListener('click', () => cleanup(true));

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) cleanup(false);
    });

    // Fecha com Escape
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(false);
    };
    document.addEventListener('keydown', onKey);

    const root = qs('#modal-root');
    root.appendChild(backdrop);
    activeModal = backdrop;
  });
}

export function closeModal() {
  if (activeModal) {
    activeModal.remove();
    activeModal = null;
  }
}
