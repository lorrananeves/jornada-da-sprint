/**
 * Monsters Screen
 */

import {
  getState, addMonster, reactToMonster, selectMonster, prioritizeMonsters,
  addXP, setPhase, completePhase,
} from '../state/store.js';
import { xpForMonster } from '../services/xp.js';
import { showXPToast } from '../components/xpToast.js';
import { uid, escapeHTML } from '../utils/dom.js';

const SUGGESTIONS = [
  'Dependências externas', 'Problemas técnicos', 'Comunicação',
  'Falta de clareza', 'Interrupções', 'Mudanças de prioridade',
  'Bloqueios', 'Processos',
];

const REACTIONS = [
  { key: 'fire', label: '🔥', title: 'Alto impacto' },
  { key: 'eyes', label: '👀', title: 'Precisamos discutir' },
  { key: 'bulb', label: '💡', title: 'Tenho uma ideia' },
];

function buildMonsterCard(m) {
  const card = document.createElement('div');
  card.className = `card card-sm monster-card card-appear${m.selected ? ' selected-monster' : ''}`;
  card.dataset.id = m.id;

  card.innerHTML = `
    <div class="card-header" style="align-items:flex-start">
      <span class="card-emoji">👹</span>
      <div style="flex:1">
        <span class="card-text">${escapeHTML(m.text)}</span>
        ${m.selected ? '<span class="badge badge-accent" style="margin-top:4px;display:inline-flex">🎯 Selecionado</span>' : ''}
      </div>
    </div>
    <div class="monster-card-actions">
      ${REACTIONS.map((r) => `
        <button class="reaction-btn" data-id="${escapeHTML(m.id)}" data-reaction="${r.key}" title="${r.title}">
          ${r.label} <span>${m.reactions[r.key] || 0}</span>
        </button>
      `).join('')}
      <button class="btn btn-sm ${m.selected ? 'btn-danger' : 'btn-ghost'}" data-select="${escapeHTML(m.id)}" style="margin-left:auto">
        ${m.selected ? '✕ Remover' : '🎯 Selecionar'}
      </button>
    </div>
  `;

  return card;
}

export function renderMonsters(root) {
  function render() {
    const state = getState();
    const monsters = state.monsters;
    const selectedCount = monsters.filter((m) => m.selected).length;

    root.innerHTML = `
      <div class="screen-monsters screen-enter">
        <div class="phase-header">
          <div class="phase-header-top">
            <span class="phase-icon">👹</span>
            <h2 class="phase-title">Monstros da Sprint</h2>
          </div>
          <p class="phase-description">
            O que atrapalhou a equipe? Identifique os problemas e priorize os mais críticos.
          </p>
        </div>

        <div class="card" style="margin-bottom:20px">
          <h4 style="margin-bottom:12px">Adicionar um Monstro</h4>
          <div style="display:flex;gap:8px">
            <textarea class="form-textarea" id="monster-input" placeholder="Descreva um problema que a equipe enfrentou..." style="flex:1;min-height:64px"></textarea>
          </div>
          <div class="chip-group" id="suggestion-chips" style="margin-top:10px">
            ${SUGGESTIONS.map((s) => `<button class="chip" data-suggestion="${s}">${s}</button>`).join('')}
          </div>
          <button class="btn btn-danger btn-sm" id="btn-add-monster" style="margin-top:12px">
            👹 ADICIONAR MONSTRO
          </button>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h4>Monstros identificados <span class="badge badge-info">${monsters.length}</span></h4>
          <div style="display:flex;gap:8px;align-items:center">
            ${selectedCount > 0 ? `<span class="badge badge-accent">🎯 ${selectedCount} selecionado${selectedCount !== 1 ? 's' : ''}</span>` : ''}
            <button class="btn btn-ghost btn-sm" id="btn-prioritize">🔥 PRIORIZAR AUTOMATICAMENTE</button>
          </div>
        </div>

        <div class="monsters-grid" id="monsters-grid">
          ${monsters.length === 0 ? '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">👹</div><p class="empty-state-text">Nenhum monstro ainda. Adicione os problemas da Sprint.</p></div>' : ''}
        </div>

        <div class="phase-nav">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
          <button class="btn btn-primary" id="btn-next" ${selectedCount > 0 ? '' : 'disabled'}>
            🛡️ IR PARA COMBATE →
          </button>
        </div>
      </div>
    `;

    // Render monster cards
    const grid = root.querySelector('#monsters-grid');
    if (monsters.length > 0) {
      monsters.forEach((m) => grid.appendChild(buildMonsterCard(m)));
    }

    attachEvents();
  }

  function attachEvents() {
    // Suggestion chips
    root.querySelectorAll('[data-suggestion]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const input = root.querySelector('#monster-input');
        input.value = input.value ? `${input.value} ${chip.dataset.suggestion}` : chip.dataset.suggestion;
        input.focus();
      });
    });

    // Add monster
    root.querySelector('#btn-add-monster').addEventListener('click', () => {
      const input = root.querySelector('#monster-input');
      const text = input.value.trim();
      if (!text) {
        input.style.borderColor = 'var(--danger)';
        input.focus();
        return;
      }
      input.style.borderColor = '';
      addMonster({ id: uid(), text, reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false });
      addXP(xpForMonster());
      showXPToast(xpForMonster(), 'Monstro adicionado');
      input.value = '';
      render();
    });

    // Prioritize
    root.querySelector('#btn-prioritize').addEventListener('click', () => {
      prioritizeMonsters();
      render();
    });

    // Reactions
    root.querySelectorAll('.reaction-btn[data-reaction]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        reactToMonster(btn.dataset.id, btn.dataset.reaction);
        render();
      });
    });

    // Select
    root.querySelectorAll('[data-select]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectMonster(btn.dataset.select);
        render();
      });
    });

    root.querySelector('#btn-back').addEventListener('click', () => setPhase('treasures'));
    root.querySelector('#btn-next').addEventListener('click', () => {
      completePhase('monsters');
      setPhase('combat');
    });
  }

  render();
}
