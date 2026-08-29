/**
 * Toast notifications — XP gains and error alerts
 */

import { qs, escapeHTML } from '../utils/dom.js';

let _xpTimer   = null;
let _errTimer  = null;

/**
 * Show an XP gain toast
 * @param {number} amount - XP amount gained
 * @param {string} [reason] - Optional reason label
 */
export function showXPToast(amount, reason = '') {
  const root = qs('#toast-root');
  if (!root) return;

  const existingXP = root.querySelector('.xp-toast');
  if (existingXP) existingXP.remove();
  if (_xpTimer) clearTimeout(_xpTimer);

  const toast = document.createElement('div');
  toast.className = 'xp-toast xp-toast-enter';
  toast.innerHTML = `
    <span class="xp-toast-icon">⭐</span>
    <span>+${amount} XP${reason ? ` — ${escapeHTML(reason)}` : ''}</span>
  `;

  root.appendChild(toast);

  _xpTimer = setTimeout(() => {
    toast.classList.remove('xp-toast-enter');
    toast.classList.add('xp-toast-exit');
    setTimeout(() => {
      if (root.contains(toast)) root.removeChild(toast);
    }, 350);
  }, 2500);
}

/**
 * Show an error toast to inform the user that a Firestore write failed.
 * The toast stacks below any XP toast (uses a separate root slot via CSS
 * offset) and auto-dismisses after 5 s — longer than XP toasts because
 * the user needs time to read and decide whether to retry.
 *
 * @param {string} message - Short human-readable error description
 */
export function showErrorToast(message) {
  const root = qs('#toast-root');
  if (!root) return;

  // Remove any existing error toast before showing a new one
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
    toast.classList.add('xp-toast-exit'); /* reutiliza a mesma animação de saída */
    setTimeout(() => {
      if (root.contains(toast)) root.removeChild(toast);
    }, 350);
  }, 5000);
}
