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

/**
 * Executa fn() (que normalmente faz root.innerHTML = ...) preservando os
 * valores de todos os inputs/textareas dentro de `root`.
 *
 * Como funciona:
 *  1. Antes do re-render: captura { id → value } de cada campo com id.
 *  2. Chama fn() que destrói e recria o DOM.
 *  3. Restaura os valores nos campos recém-criados que tenham o mesmo id.
 *  4. Se o campo focado antes do render ainda existe, devolve o foco a ele
 *     e reposiciona o cursor no fim do texto.
 *
 * @param {HTMLElement} root  - container que será re-renderizado
 * @param {Function}    fn    - função que faz o re-render (innerHTML = ...)
 */
export function preserveInputs(root, fn) {
  // Captura estado dos campos (inputs, textareas e selects com id)
  const saved = {};
  const focusedId = document.activeElement?.id || null;
  root.querySelectorAll('input[id], textarea[id], select[id]').forEach((el) => {
    saved[el.id] = { value: el.value, selectionStart: el.selectionStart, selectionEnd: el.selectionEnd };
  });
  // Captura selects sem id via data-attribute composto (usado pelas missões anteriores)
  const savedSelects = [];
  root.querySelectorAll('select[data-prev-mission-id]').forEach((el) => {
    savedSelects.push({ key: el.dataset.prevMissionId, value: el.value });
  });

  fn();

  // Restaura valores e foco para elementos com id
  for (const [id, state] of Object.entries(saved)) {
    const el = root.querySelector(`#${CSS.escape(id)}`);
    if (!el) continue;
    el.value = state.value;
    if (id === focusedId) {
      el.focus();
      try {
        el.setSelectionRange(state.selectionStart, state.selectionEnd);
      } catch {
        // inputs tipo date/number e selects não suportam setSelectionRange
      }
    }
  }
  // Restaura selects de missões anteriores pelo data-prev-mission-id
  for (const { key, value } of savedSelects) {
    const el = root.querySelector(`select[data-prev-mission-id="${CSS.escape(key)}"]`);
    if (el) el.value = value;
  }
}

/** Clear children of an element */
export function clearEl(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * Gera um ID aleatório criptograficamente seguro (128 bits / 32 chars hex).
 * Usa a mesma estratégia de generateId() em firebase.js — evita colisões
 * que Math.random() + Date.now() poderia causar em escrita concorrente.
 */
export function uid() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Add a CSS class temporarily then remove after animation */
export function animateClass(el, cls, duration = 400) {
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), duration);
}

/**
 * Sinal "Terminei essa parte" — HTML + event wiring reutilizáveis em todas as telas.
 *
 * buildReadySignalHTML(phase, state, isSM) → string HTML a inserir na phase-nav
 * attachReadySignal(root, phase, signalReadyFn) → conecta o evento do botão
 */

/**
 * Gera o HTML do sinal "Terminei" para a fase indicada.
 * @param {string}  phase          — id da fase (ex: 'checkin')
 * @param {object}  state          — snapshot do store
 * @param {boolean} isUserSM       — se o usuário atual é SM
 * @param {string}  currentDeviceId — getDeviceId()
 */
export function buildReadySignalHTML(phase, state, isUserSM, currentDeviceId) {
  const signals     = state.readySignals || {};
  const readyCount  = Object.values(signals).filter((p) => p === phase).length;
  const totalCount  = parseInt(state.team?.participantCount, 10) || 0;
  const alreadyDone = signals[currentDeviceId] === phase;

  if (isUserSM) {
    // SM vê o contador (sem o botão — ele avança a fase pelo btn-next)
    if (readyCount === 0 || totalCount === 0) return '';
    return `<span class="ready-signal-count" title="Participantes que terminaram esta parte">${readyCount}${totalCount > 0 ? `/${totalCount}` : ''} pronto${readyCount !== 1 ? 's' : ''} ✅</span>`;
  }

  // Membro do time
  if (alreadyDone) {
    return `<span class="ready-signal-done">✅ Pronto</span>`;
  }
  return `<button class="btn btn-ghost btn-sm ready-signal-btn" data-ready-phase="${phase}">✅ Terminei essa parte</button>`;
}

/**
 * Conecta o clique do botão "Terminei" gerado por buildReadySignalHTML.
 * @param {HTMLElement} root
 * @param {Function}    signalReadyFn — store.signalReady
 */
export function attachReadySignal(root, signalReadyFn) {
  root.querySelectorAll('.ready-signal-btn[data-ready-phase]').forEach((btn) => {
    btn.addEventListener('click', () => {
      signalReadyFn(btn.dataset.readyPhase);
      btn.outerHTML = `<span class="ready-signal-done">✅ Pronto</span>`;
    });
  });
}
