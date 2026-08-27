/**
 * @security Toda interpolação em innerHTML DEVE usar escapeHTML(). Nunca
 *   interpole valores vindos do usuário ou do Firestore sem escapar.
 *
 * Complete Screen
 */

import { getState, setPhase, setLocalPhase, completePhase, isSM } from '../state/store.js';
import { calcSummaryStats, getMoodLabel } from '../services/stats.js';
import { formatXP } from '../utils/format.js';
import { escapeHTML } from '../utils/dom.js';
import { getCurrentUser } from '../services/auth.js';

export function renderComplete(root) {
  const state = getState();
  const stats = calcSummaryStats(state);
  const mood = getMoodLabel(stats.checkinStats.average);

  root.innerHTML = `
    <main class="screen-complete screen-enter" role="main" aria-label="Conclusão da retrospectiva">
      <div class="complete-hero">
        <div style="font-size:4rem;margin-bottom:12px" aria-hidden="true">🏆</div>
        <h2 style="color:var(--accent);margin-bottom:6px">Jornada Concluída!</h2>
        <p class="text-muted mb-5">
          ${state.sprint.name ? `Sprint: <strong style="color:var(--text)">${escapeHTML(state.sprint.name)}</strong>` : 'Retrospectiva finalizada'}
          ${state.team.name ? ` · Time: <strong style="color:var(--text)">${escapeHTML(state.team.name)}</strong>` : ''}
        </p>
        <div class="complete-xp-total">${formatXP(stats.totalXP)}</div>
        <p class="text-muted" style="margin-top:4px">XP total conquistado pela equipe</p>
      </div>

      <div class="stats-grid" role="region" aria-label="Estatísticas da retrospectiva">
        <div class="stat-card" aria-label="Check-ins: ${stats.checkinStats.total}">
          <div class="stat-card-value" style="color:var(--info)">${stats.checkinStats.total}</div>
          <div class="stat-card-label">Check-ins</div>
        </div>
        <div class="stat-card" aria-label="Média do humor: ${stats.checkinStats.average.toFixed(1)}">
          <div class="stat-card-value" style="color:${mood.color}">${stats.checkinStats.average.toFixed(1)}</div>
          <div class="stat-card-label">Média do humor</div>
        </div>
        <div class="stat-card" aria-label="Tesouros: ${stats.treasureCount}">
          <div class="stat-card-value" style="color:var(--accent)">${stats.treasureCount}</div>
          <div class="stat-card-label">💎 Tesouros</div>
        </div>
        <div class="stat-card" aria-label="Reconhecimentos: ${stats.recognitionCount}">
          <div class="stat-card-value" style="color:var(--purple)">${stats.recognitionCount}</div>
          <div class="stat-card-label">❤️ Reconhecimentos</div>
        </div>
        <div class="stat-card" aria-label="Descobertas: ${stats.learningCount}">
          <div class="stat-card-value" style="color:var(--info)">${stats.learningCount}</div>
          <div class="stat-card-label">🧠 Descobertas</div>
        </div>
        <div class="stat-card" aria-label="Monstros: ${stats.monsterCount}">
          <div class="stat-card-value" style="color:var(--danger)">${stats.monsterCount}</div>
          <div class="stat-card-label">👹 Monstros</div>
        </div>
        <div class="stat-card" aria-label="Soluções: ${stats.solutionCount}">
          <div class="stat-card-value" style="color:var(--info)">${stats.solutionCount}</div>
          <div class="stat-card-label">💡 Soluções</div>
        </div>
        <div class="stat-card" aria-label="Missões: ${stats.missionCount}">
          <div class="stat-card-value" style="color:var(--success)">${stats.missionCount}</div>
          <div class="stat-card-label">🚀 Missões</div>
        </div>
      </div>

      ${stats.missionCount > 0 ? `
        <div class="card" style="margin-top:24px;text-align:left">
          <h4 style="margin-bottom:12px">🚀 Missões desta Sprint</h4>
          ${state.missions.map((m) => `
            <div style="padding:10px 14px;background:var(--surface-2);border-radius:var(--radius);margin-bottom:8px;display:flex;align-items:center;gap:10px">
              <span style="font-size:1.25rem">🚀</span>
              <div>
                <div style="font-weight:600">${escapeHTML(m.title)}</div>
                ${m.owner ? `<div class="text-xs text-muted">👤 ${escapeHTML(m.owner)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="phase-nav" style="justify-content:center;margin-top:32px">
        <button class="btn btn-ghost" id="btn-back" aria-label="Voltar à fase de missões">← Voltar</button>
        <button class="btn btn-primary btn-lg" id="btn-report" aria-label="Ver relatório completo da retrospectiva">📋 VER RELATÓRIO COMPLETO</button>
        ${isSM() && getCurrentUser() ? `<button class="btn btn-ghost" id="btn-dashboard" aria-label="Ir para minhas retrospectivas">🏠 Minhas Retrospectivas</button>` : ''}
      </div>
    </main>
  `;

  root.querySelector('#btn-back').addEventListener('click', () => {
    if (isSM()) setPhase('missions');
    else setLocalPhase('roleSelect');
  });
  root.querySelector('#btn-report').addEventListener('click', () => {
    if (!isSM()) { setLocalPhase('roleSelect'); return; }
    completePhase('complete');
    setPhase('report');
  });
  root.querySelector('#btn-dashboard')?.addEventListener('click', () => {
    setLocalPhase('smDashboard');
  });
}
