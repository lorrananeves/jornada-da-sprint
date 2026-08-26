/**
 * Typing Indicator Component
 *
 * Uso:
 *   const typing = createTypingIndicator(containerEl, 'treasures');
 *   // Anexa listeners de digitação em um ou mais campos:
 *   typing.watchField(textareaEl);
 *   // Para limpar (ao sair da tela):
 *   typing.destroy();
 *
 * O componente insere um elemento `.typing-indicator` no `container` e o
 * mantém atualizado via Firestore subscription. O elemento fica oculto quando
 * não há ninguém digitando.
 */

import { signalTyping, clearTyping, subscribeTyping } from '../services/typing.js';

/**
 * @param {HTMLElement} container - Elemento pai onde o indicador será inserido.
 * @param {string}      phase     - Nome da fase atual (ex: 'treasures').
 * @returns {{ watchField(el: HTMLElement): void, destroy(): void }}
 */
export function createTypingIndicator(container, phase) {
  // Cria o elemento do indicador e injeta no container
  const el = document.createElement('div');
  el.className = 'typing-indicator typing-indicator--hidden';
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  container.appendChild(el);

  // Subscription em tempo real
  const unsub = subscribeTyping(phase, (count) => {
    if (count === 0) {
      el.classList.add('typing-indicator--hidden');
      el.textContent = '';
      return;
    }
    const label = count === 1
      ? '1 pessoa está digitando'
      : `${count} pessoas estão digitando`;
    el.classList.remove('typing-indicator--hidden');
    el.innerHTML = `<span class="typing-dots"><span></span><span></span><span></span></span>${label}`;
  });

  // Rastreia os campos monitorados para cleanup
  const _watched = new Map(); // element → { input, blur }

  /**
   * Registra um campo (input/textarea) para sinalizar digitação.
   * Remove os listeners automaticamente em `destroy()`.
   */
  function watchField(fieldEl) {
    if (_watched.has(fieldEl)) return;

    const onInput = () => signalTyping(phase);
    const onBlur  = () => clearTyping();

    fieldEl.addEventListener('input', onInput);
    fieldEl.addEventListener('blur',  onBlur);
    _watched.set(fieldEl, { onInput, onBlur });
  }

  /** Remove todos os listeners e a subscription do Firestore. */
  function destroy() {
    unsub();
    clearTyping();
    for (const [fieldEl, { onInput, onBlur }] of _watched) {
      fieldEl.removeEventListener('input', onInput);
      fieldEl.removeEventListener('blur',  onBlur);
    }
    _watched.clear();
    el.remove();
  }

  return { watchField, destroy };
}
