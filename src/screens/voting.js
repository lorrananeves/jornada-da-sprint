/**
 * @security Toda interpolação em innerHTML DEVE usar escapeHTML(). Nunca
 *   interpole valores vindos do usuário ou do Firestore sem escapar.
 *
 * Voting Screen — Priorização dos monstros
 *
 * Pergunta ao time: "Em quais problemas vale a pena investirmos energia?"
 *
 * Mecânica:
 *   - Cada participante tem 3 votos
 *   - Máximo de 1 voto por monstro por dispositivo
 *   - Voto é atômico (transação Firestore): garante consistência entre
 *     monsterVotes/{token} e monsters.voteCount
 *   - SM pode ordenar monstros por votos após a votação
 *   - SM avança para Missões
 *
 * Notas de discussão são exibidas em sumário para contextualizar a votação.
 */

import {
  getState, subscribe, prioritizeMonsters, voteOnMonster,
  addXP, setPhase, setLocalPhase, completePhase, isSM, signalReady,
} from '../state/store.js';
import { xpForMonsterVote } from '../services/xp.js';
import { showXPToast, showErrorToast } from '../components/xpToast.js';
import { escapeHTML, preserveInputs, buildReadySignalHTML, attachReadySignal } from '../utils/dom.js';
import { canVoteOnMonster, canPrioritizeMonsters } from '../utils/permissions.js';
import { getDeviceId } from '../services/presence.js';
import { createPhaseTimer } from '../components/phaseTimer.js';
import { getDiscussionTypeEmoji } from '../utils/format.js';
import { hasReacted } from '../services/reactions.js';

const MAX_VOTES = 3;

/** Conta quantos votos o dispositivo atual já deu nessa sessão */
function myVoteCount(monsterVotes) {
  const deviceId = getDeviceId();
  return monsterVotes.filter((v) => v.deviceId === deviceId).length;
}

/** Verifica se o dispositivo já votou em um monstro específico */
function hasVotedOnMonster(sessionId, monsterId) {
  return hasReacted(sessionId, 'monsterVotes', monsterId, getDeviceId(), 'vote');
}

/** Retorna as notas do tipo mais relevante para exibir como sumário */
function getNoteSummary(discussions, monsterId) {
  const notes = discussions.filter((n) => n.monsterId === monsterId);
  // Mostra até 2 notas — prioriza actions e agreements
  const priority = ['action', 'agreement', 'insight', 'mitigation', 'observation'];
  const sorted = [...notes].sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));
  return sorted.slice(0, 2);
}

function buildMonsterVoteCard(m, discussions, sessionId, myVotes, canVote) {
  const voted = hasVotedOnMonster(sessionId, m.id);
  const noteSummary = getNoteSummary(discussions, m.id);
  const voteCount = m.voteCount || 0;
  const mergedCount = m.mergedFrom?.length ?? 0;

  return `
    <div class="card monster-vote-card${voted ? ' monster-vote-card--voted' : ''}" data-monster-id="${escapeHTML(m.id)}">
      <div class="monster-vote-card-header">
        <span class="card-emoji">${mergedCount > 0 ? '🔗' : '👹'}</span>
        <div style="flex:1;min-width:0">
          <span class="card-text">${escapeHTML(m.text)}</span>
          ${mergedCount > 0 ? `<span class="badge monster-badge-merged mt-1 flex" style="display:inline-flex">🔗 ${mergedCount + 1} relatos</span>` : ''}
        </div>
        <div class="monster-vote-count">
          <span class="monster-vote-count-number">${voteCount}</span>
          <span class="monster-vote-count-label">voto${voteCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      ${noteSummary.length > 0 ? `
        <div class="monster-vote-notes">
          ${noteSummary.map((n) => `
            <span class="monster-vote-note-tag">
              ${getDiscussionTypeEmoji(n.type)} ${escapeHTML(n.text.length > 60 ? n.text.slice(0, 60) + '…' : n.text)}
            </span>
          `).join('')}
        </div>
      ` : ''}

      ${canVote ? `
        <button class="btn ${voted ? 'btn-success' : 'btn-ghost'} btn-sm monster-vote-btn"
          data-vote-monster="${escapeHTML(m.id)}"
          ${voted || myVotes >= MAX_VOTES ? 'disabled' : ''}
          aria-pressed="${voted}"
          title="${voted ? 'Já votou neste problema' : myVotes >= MAX_VOTES ? 'Você já usou todos os votos' : 'Votar neste problema'}">
          ${voted ? '✅ Votou' : myVotes >= MAX_VOTES ? '— Votos esgotados' : '🗳️ Votar'}
        </button>
      ` : ''}
    </div>
  `;
}

export function renderVoting(root) {
  let _timer = null;

  function render() {
    const state = getState();
    const { monsters, discussions, monsterVotes } = state;
    const sm = isSM();
    const sessionId = new URLSearchParams(window.location.search).get('s') || '';
    const used = myVoteCount(monsterVotes);
    const remaining = MAX_VOTES - used;

    preserveInputs(root, () => { root.innerHTML = `
      <div class="screen-voting screen-enter">
        <div class="phase-header">
          <div class="phase-header-top">
            <span class="phase-icon">🗳️</span>
            <h2 class="phase-title">Priorização</h2>
          </div>
          <p class="phase-description">
            Em quais problemas vale a pena investirmos energia para melhorar?
          </p>
        </div>

        <div class="voting-budget-banner">
          <span class="voting-budget-icon">🗳️</span>
          <div>
            <div class="voting-budget-title">Seus votos disponíveis</div>
            <div class="voting-budget-dots">
              ${Array.from({ length: MAX_VOTES }, (_, i) =>
                `<span class="voting-budget-dot${i < used ? ' voting-budget-dot--used' : ''}"></span>`
              ).join('')}
            </div>
          </div>
          <span class="voting-budget-remaining ${remaining === 0 ? 'text-muted' : 'text-accent'}">
            ${remaining > 0 ? `${remaining} restante${remaining !== 1 ? 's' : ''}` : 'Todos os votos usados'}
          </span>
        </div>

        ${sm ? `
          <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
            ${canPrioritizeMonsters() ? `<button class="btn btn-ghost btn-sm" id="btn-sort-votes">↕️ ORDENAR POR VOTOS</button>` : ''}
          </div>
        ` : ''}

        <div class="voting-monsters-list" id="voting-monsters-list">
          ${monsters.map((m) =>
            buildMonsterVoteCard(m, discussions, sessionId, used, canVoteOnMonster())
          ).join('')}
        </div>

        <div class="phase-nav">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
          ${buildReadySignalHTML('voting', state, sm, getDeviceId())}
          ${sm
            ? `<button class="btn btn-primary" id="btn-next">🎯 IR PARA MISSÕES →</button>`
            : `<span class="text-muted text-sm">Aguardando o Scrum Master avançar…</span>`}
        </div>
      </div>
    `; }); // end preserveInputs

    if (_timer) _timer.destroy();
    _timer = createPhaseTimer(root.querySelector('.screen-voting'), 'voting');

    attachEvents(sessionId);
  }

  function attachEvents(sessionId) {
    attachReadySignal(root, signalReady);

    // Votar em monstro
    root.querySelectorAll('[data-vote-monster]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!canVoteOnMonster()) return;
        const monsterId = btn.dataset.voteMonster;

        // Proteção client-side imediata
        if (hasVotedOnMonster(sessionId, monsterId)) return;
        const state = getState();
        if (myVoteCount(state.monsterVotes) >= MAX_VOTES) return;

        btn.disabled = true;

        // Otimismo local: feedback visual imediato
        const countEl = btn.closest('.monster-vote-card')?.querySelector('.monster-vote-count-number');
        if (countEl) countEl.textContent = Number(countEl.textContent) + 1;
        btn.textContent = '✅ Votou';
        btn.className = 'btn btn-success btn-sm monster-vote-btn';

        const accepted = await voteOnMonster(monsterId);

        if (!accepted) {
          // Reverte otimismo
          if (countEl) countEl.textContent = Number(countEl.textContent) - 1;
          btn.textContent = '🗳️ Votar';
          btn.className = 'btn btn-ghost btn-sm monster-vote-btn';
          btn.disabled = false;
          showErrorToast('Não foi possível registrar seu voto.');
        } else {
          addXP(xpForMonsterVote());
          showXPToast(xpForMonsterVote(), 'Voto registrado!');
          // Atualiza o orçamento de votos sem re-render completo
          const usedNow = myVoteCount(getState().monsterVotes);
          const remaining = MAX_VOTES - usedNow;
          const dots = root.querySelectorAll('.voting-budget-dot');
          dots.forEach((d, i) => d.classList.toggle('voting-budget-dot--used', i < usedNow));
          const label = root.querySelector('.voting-budget-remaining');
          if (label) {
            label.textContent = remaining > 0
              ? `${remaining} restante${remaining !== 1 ? 's' : ''}`
              : 'Todos os votos usados';
            label.className = `voting-budget-remaining ${remaining === 0 ? 'text-muted' : 'text-accent'}`;
          }
          // Desabilita outros botões se atingiu o limite
          if (usedNow >= MAX_VOTES) {
            root.querySelectorAll('[data-vote-monster]').forEach((b) => {
              if (!b.classList.contains('btn-success')) {
                b.disabled = true;
                b.textContent = '— Votos esgotados';
              }
            });
          }
        }
      });
    });

    // Ordenar por votos (SM only)
    root.querySelector('#btn-sort-votes')?.addEventListener('click', () => {
      prioritizeMonsters();
      render();
    });

    root.querySelector('#btn-back').addEventListener('click', () => {
      if (isSM()) setPhase('discussion');
      else setLocalPhase('roleSelect');
    });

    root.querySelector('#btn-next')?.addEventListener('click', () => {
      completePhase('voting');
      setPhase('missions');
    });
  }

  // ── Fingerprint ──────────────────────────────────────────────────────────────
  function _fingerprint(state) {
    const votes = state.monsters.map((m) => `${m.id}:${m.voteCount || 0}`).join('|');
    const myVotes = state.monsterVotes.filter((v) => v.deviceId === getDeviceId()).length;
    const count = parseInt(state.team?.participantCount, 10) || 0;
    return `${votes}|${myVotes}|${count}`;
  }

  let _lastFp = _fingerprint(getState());

  const unsub = subscribe((state) => {
    if (state.currentPhase !== 'voting') {
      unsub();
      return;
    }
    const fp = _fingerprint(state);
    if (fp !== _lastFp) {
      _lastFp = fp;
      render();
    }
  });

  render();
}
