/**
 * Reusable Card Component
 */

/**
 * Create a content card element
 * @param {object} opts
 * @param {string} opts.text - Main text content
 * @param {string} [opts.emoji] - Prefix emoji
 * @param {Array<{key: string, label: string, count: number}>} [opts.reactions]
 * @param {function} [opts.onReact]
 * @param {boolean} [opts.selected]
 * @param {function} [opts.onSelect]
 * @param {string} [opts.extraClass]
 * @returns {HTMLElement}
 */
export function createCard({
  text,
  emoji = '',
  reactions = [],
  onReact = null,
  selected = false,
  onSelect = null,
  extraClass = '',
}) {
  const card = document.createElement('div');
  card.className = `card card-sm card-appear${selected ? ' selected-monster' : ''}${extraClass ? ' ' + extraClass : ''}`;

  if (onSelect) {
    card.style.cursor = 'pointer';
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.reaction-btn') && !e.target.closest('button')) {
        onSelect();
      }
    });
  }

  const emojiHTML = emoji ? `<span class="card-emoji">${emoji}</span>` : '';

  let reactionsHTML = '';
  if (reactions.length) {
    reactionsHTML = `
      <div class="card-reactions">
        ${reactions
          .map(
            (r) => `
          <button class="reaction-btn" data-reaction="${r.key}" title="${r.label}">
            ${r.label} <span class="reaction-count">${r.count}</span>
          </button>
        `
          )
          .join('')}
      </div>
    `;
  }

  card.innerHTML = `
    <div class="card-header">
      ${emojiHTML}
      <span class="card-text">${text}</span>
    </div>
    ${reactionsHTML}
  `;

  if (onReact) {
    card.querySelectorAll('.reaction-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onReact(btn.dataset.reaction);
      });
    });
  }

  return card;
}
