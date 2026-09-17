/**
 * Toast notifications — error alerts
 *
 * showXPToast foi removido com o sistema de XP.
 * showErrorToast mantido para notificar falhas de escrita no Firestore.
 */

import { qs, escapeHTML } from '../utils/dom.js';

let _errTimer = null;

/**
 * Exibe um toast de erro para informar que uma escrita no Firestore falhou.
 * Auto-descarta após 5 s.
 *
 * @param {string} message - Descrição curta do erro
 */
export function showErrorToast(message) {
  const root = qs('#toast-root');
  if (!root) return;

  const existing = root.querySelector('.error-toast');
  if (existing) existing.remove();
  if (_errTimer) clearTimeout(_errTimer);

  const toast = document.createElement('div');
  toast.className = 'error-toast error-toast-enter';
  toast.innerHTML = `
    <span class="error-toast-icon">⚠️</span>
    <span>${escapeHTML(message)}</span>
  `;

  root.appendChild(toast);

  _errTimer = setTimeout(() => {
    toast.classList.remove('error-toast-enter');
    toast.classList.add('error-toast-exit');
    setTimeout(() => {
      if (root.contains(toast)) root.removeChild(toast);
    }, 350);
  }, 5000);
}
