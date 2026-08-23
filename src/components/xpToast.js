/**
 * XP Toast — animated notification when XP is earned
 */

import { qs, escapeHTML } from '../utils/dom.js';

let hideTimer = null;

/**
 * Show an XP gain toast
 * @param {number} amount - XP amount gained
 * @param {string} [reason] - Optional reason label
 */
export function showXPToast(amount, reason = '') {
  const root = qs('#toast-root');
  if (!root) return;

  // Clear existing
  root.innerHTML = '';
  if (hideTimer) clearTimeout(hideTimer);

  const toast = document.createElement('div');
  toast.className = 'xp-toast xp-toast-enter';
  toast.innerHTML = `
    <span class="xp-toast-icon">⭐</span>
    <span>+${amount} XP${reason ? ` — ${escapeHTML(reason)}` : ''}</span>
  `;

  root.appendChild(toast);

  hideTimer = setTimeout(() => {
    toast.classList.remove('xp-toast-enter');
    toast.classList.add('xp-toast-exit');
    setTimeout(() => {
      if (root.contains(toast)) root.removeChild(toast);
    }, 350);
  }, 2500);
}
