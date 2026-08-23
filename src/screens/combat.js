/**
 * Combat Screen
 */

import {
  getState, setState, addSolution, voteSolution, addXP, setPhase, completePhase,
} from '../state/store.js';
import { xpForSolution } from '../services/xp.js';
import { showXPToast } from '../components/xpToast.js';
import { uid, escapeHTML } from '../utils/dom.js';
import { getStrategyLabel } from '../utils/format.js';

const STRATEGIES = [
  { id: 'prevent', label: '🛡️ PREVENIR',        question: 'Como podemos evitar que isso aconteça?' },
  { id: 'reduce',  label: '🧪 REDUZIR IMPACTO',  question: 'Se isso acontecer novamente, como podemos diminuir o impacto?' },
  { id: 'handle',  label: '🤝 LIDAR MELHOR',     question: 'O que podemos fazer diferente quando isso acontecer?' },
];

export function renderCombat(root) {
  const state = getState();
  const selectedMonsters = state.monsters.filter((m) => m.selected);
  let currentMonsterIdx = 0;
  let currentStrategy = 'prevent';

  if (!selectedMonsters.length) {
    root.innerHTML = `
      <div class="screen-combat screen-enter">
        <div class="phase-header">
          <div class="phase-header-top">
            <span class="phase-icon">🛡️</span>
            <h2 class="phase-title">Combate aos Monstros</h2>
          </div>
          <p class="phase-description text-danger">Nenhum monstro foi selecionado. Volte e selecione ao menos um.</p>
        </div>
        <div class="phase-nav">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
        </div>
      </div>
    `;
    root.querySelector('#btn-back').addEventListener('click', () => setPhase('monsters'));
    return;
  }

  function render() {
    const monster = selectedMonsters[currentMonsterIdx];
    const solutions = getState().solutions.filter(
      (s) => s.monsterId === monster.id && s.strategy === currentStrategy
    );
    const strategy = STRATEGIES.find((s) => s.id === currentStrategy);

    root.innerHTML = `
      <div class="screen-combat screen-enter">
        <div class="phase-header">
          <div class="phase-header-top">
            <span class="phase-icon">🛡️</span>
            <h2 class="phase-title">Combate aos Monstros</h2>
          </div>
          <p class="phase-description">
            Desenvolva estratégias para enfrentar cada monstro identificado.
            (${currentMonsterIdx + 1}/${selectedMonsters.length})
          </p>
        </div>

        <!-- Monster Banner -->
        <div class="combat-monster-banner">
          <span class="combat-monster-icon">👹</span>
          <div>
            <h3 style="color:var(--danger);margin-bottom:4px">${escapeHTML(monster.text)}</h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <span class="badge badge-danger">🔥 ${monster.reactions.fire || 0} impacto</span>
              <span class="badge badge-info">👀 ${monster.reactions.eyes || 0} discussões</span>
              <span class="badge badge-accent">💡 ${monster.reactions.bulb || 0} ideias</span>
            </div>
          </div>
          ${selectedMonsters.length > 1 ? `
            <div style="margin-left:auto;display:flex;gap:8px">
              <button class="btn btn-ghost btn-sm" id="btn-prev-monster" ${currentMonsterIdx === 0 ? 'disabled' : ''}>← Anterior</button>
              <button class="btn btn-ghost btn-sm" id="btn-next-monster" ${currentMonsterIdx === selectedMonsters.length - 1 ? 'disabled' : ''}>Próximo →</button>
            </div>
          ` : ''}
        </div>

        <!-- Strategy Tabs -->
        <div class="tabs" style="margin-bottom:20px">
          ${STRATEGIES.map((s) => `
            <button class="tab-btn ${currentStrategy === s.id ? 'active' : ''}" data-strategy="${s.id}">
              ${s.label}
            </button>
          `).join('')}
        </div>

        <!-- Strategy Content -->
        <div class="card">
          <p class="text-muted" style="margin-bottom:14px;font-size:0.9375rem">${strategy.question}</p>
          <div style="display:flex;gap:8px">
            <textarea class="form-textarea" id="solution-input" placeholder="Escreva uma ideia de solução..." style="flex:1;min-height:64px"></textarea>
          </div>
          <button class="btn btn-info btn-sm" id="btn-add-solution" style="margin-top:10px">
            + ADICIONAR SOLUÇÃO
          </button>
        </div>

        <!-- Solutions List -->
        ${solutions.length > 0 ? `
          <div style="margin-top:20px">
            <h4 style="margin-bottom:12px">💡 Soluções propostas — ${getStrategyLabel(currentStrategy)}</h4>
            <div class="solutions-list">
              ${solutions.map((sol) => `
                <div class="solution-card">
                  <span class="solution-text">${escapeHTML(sol.text)}</span>
                  <button class="vote-btn" data-vote="${escapeHTML(sol.id)}">
                    👍 ${sol.votes || 0}
                  </button>
                  <button class="btn btn-ghost btn-sm" data-to-mission="${escapeHTML(sol.id)}" title="Transformar em Missão">
                    🚀
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="phase-nav">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
          <button class="btn btn-primary" id="btn-next">🚀 PRÓXIMA FASE →</button>
        </div>
      </div>
    `;

    attachEvents(monster);
  }

  function attachEvents(monster) {
    // Strategy tabs
    root.querySelectorAll('[data-strategy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentStrategy = btn.dataset.strategy;
        render();
      });
    });

    // Add solution
    root.querySelector('#btn-add-solution').addEventListener('click', () => {
      const input = root.querySelector('#solution-input');
      const text = input.value.trim();
      if (!text) {
        input.style.borderColor = 'var(--danger)';
        input.focus();
        return;
      }
      input.style.borderColor = '';
      addSolution({
        id: uid(),
        monsterId: monster.id,
        text,
        strategy: currentStrategy,
        votes: 0,
      });
      addXP(xpForSolution());
      showXPToast(xpForSolution(), 'Solução adicionada');
      input.value = '';
      render();
    });

    // Vote
    root.querySelectorAll('[data-vote]').forEach((btn) => {
      btn.addEventListener('click', () => {
        voteSolution(btn.dataset.vote);
        render();
      });
    });

    // Transform to mission
    root.querySelectorAll('[data-to-mission]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const solId = btn.dataset.toMission;
        const sol = getState().solutions.find((s) => s.id === solId);
        if (sol) {
          setState({ _prefillMission: { text: sol.text, strategy: sol.strategy } });
          completePhase('combat');
          setPhase('missions');
        }
      });
    });

    // Monster navigation
    const prevBtn = root.querySelector('#btn-prev-monster');
    const nextMonBtn = root.querySelector('#btn-next-monster');
    if (prevBtn) prevBtn.addEventListener('click', () => { currentMonsterIdx--; render(); });
    if (nextMonBtn) nextMonBtn.addEventListener('click', () => { currentMonsterIdx++; render(); });

    root.querySelector('#btn-back').addEventListener('click', () => setPhase('monsters'));
    root.querySelector('#btn-next').addEventListener('click', () => {
      completePhase('combat');
      setPhase('missions');
    });
  }

  render();
}
