/**
 * DOM Utility Helpers
 */

/**
 * Escape a string for safe insertion into HTML.
 * Converts &, <, >, ", ' to their HTML entities.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHTML(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Query selector shorthand */
export const qs = (selector, root = document) => root.querySelector(selector);

/** Query selector all shorthand */
export const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

/**
 * Create an element with optional props and children
 * @param {string} tag
 * @param {object} [attrs]
 * @param {...(string|Node)} children
 */
export function createElement(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'class') {
      el.className = val;
    } else if (key === 'style' && typeof val === 'object') {
      Object.assign(el.style, val);
    } else if (key.startsWith('on') && typeof val === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (key === 'dataset' && typeof val === 'object') {
      Object.assign(el.dataset, val);
    } else {
      el.setAttribute(key, val);
    }
  }
  for (const child of children) {
    if (child == null) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      el.appendChild(child);
    }
  }
  return el;
}

/** Set the inner HTML of an element safely */
export function setHTML(el, html) {
  el.innerHTML = html;
}

/** Clear children of an element */
export function clearEl(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Generate a simple unique ID */
export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Add a CSS class temporarily then remove after animation */
export function animateClass(el, cls, duration = 400) {
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), duration);
}
