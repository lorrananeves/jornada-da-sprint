/**
 * Report Screen
 */

import { getState, setPhase } from '../state/store.js';
import { calcSummaryStats, getMoodLabel } from '../services/stats.js';
import { exportAsPDF, exportAsPNG } from '../services/export.js';
import { formatDate, formatISO, formatXP, getScoreEmoji, getPriorityLabel, getStrategyLabel } from '../utils/format.js';
import { escapeHTML } from '../utils/dom.js';

export function renderReport(root) {
  const state = getState();
  const stats = calcSummaryStats(state);
  const mood = getMoodLabel(stats.checkinStats.average);

  const { sprint, team, treasures, monsters, solutions, missions, checkins } = state;

  const treasureItems = treasures.filter((t) => t.category === 'treasure');
  const recognitionItems = treasures.filter((t) => t.category === 'recognition');
  const learningItems = treasures.filter((t) => t.category === 'learning');
  const _selectedMonsters = monsters.filter((m) => m.selected);

  function renderItemList(items, emoji) {
    if (!items.length) return '<p style="color:var(--text-muted);font-size:0.875rem">Nenhum item registrado.</p>';
    return items.map((item) => `<div class="report-item">${emoji} ${escapeHTML(item.text || item.title)}</div>`).join('');
  }

  function renderSolutionsForMonster(monsterId) {
    const sols = solutions.filter((s) => s.monsterId === monsterId);
    if (!sols.length) return '<p style="color:var(--text-muted);font-size:0.875rem;margin-left:16px">Sem soluções registradas.</p>';
    return sols.map((s) => `
      <div class="report-item" style="margin-left:16px;display:flex;gap:10px;align-items:center">
        <span>${getStrategyLabel(s.strategy)}</span>
        <span style="flex:1">${escapeHTML(s.text)}</span>
        <span style="color:var(--success);font-size:0.8125rem;white-space:nowrap">👍 ${s.votes}</span>
      </div>
    `).join('');
  }

  root.innerHTML = `
    <div class="screen-report screen-enter">
      <div class="phase-header">
        <div class="phase-header-top">
          <span class="phase-icon">📋</span>
          <h2 class="phase-title">Relatório da Jornada</h2>
        </div>
        <p class="phase-description">Visão completa da retrospectiva para compartilhar com o time.</p>
      </div>

      <div class="report-actions">
        <button class="btn btn-back" id="btn-back">← Voltar</button>
        <button class="btn btn-info" id="btn-pdf">📄 BAIXAR PDF</button>
        <button class="btn btn-success" id="btn-png">🖼️ BAIXAR IMAGEM</button>
      </div>

      <!-- Report Content (captured for export) -->
      <div id="report-content">
        <div class="report-header">
          <div style="font-size:3rem;margin-bottom:8px">⚔️</div>
          <h1 class="report-title">JORNADA DA SPRINT</h1>
          <h2 style="color:var(--text);margin-bottom:8px">${escapeHTML(sprint.name || 'Retrospectiva')}</h2>
          <p class="text-muted">
            ${team.name ? `Time: ${escapeHTML(team.name)}` : ''}
            ${team.participantCount ? ` · ${team.participantCount} participantes` : ''}
          </p>
          ${sprint.startDate || sprint.endDate ? `
            <p class="text-muted" style="margin-top:4px;font-size:0.875rem">
              📅 ${formatDate(sprint.startDate)} → ${formatDate(sprint.endDate)}
            </p>
          ` : ''}
          <p class="text-muted" style="margin-top:4px;font-size:0.8125rem">
            Gerado em ${formatISO(new Date().toISOString())}
          </p>
        </div>

        <!-- XP Summary -->
        <div class="report-section">
          <div class="report-section-title">⭐ Resultado Geral</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:120px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;text-align:center">
              <div style="font-size:2rem;font-weight:800;color:var(--accent)">${formatXP(stats.totalXP)}</div>
              <div style="font-size:0.8125rem;color:var(--text-muted)">XP Total</div>
            </div>
            <div style="flex:1;min-width:120px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;text-align:center">
              <div style="font-size:2rem;font-weight:800;color:${mood.color}">${stats.checkinStats.average.toFixed(1)}</div>
              <div style="font-size:0.8125rem;color:var(--text-muted)">${mood.label}</div>
            </div>
            <div style="flex:1;min-width:120px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;text-align:center">
              <div style="font-size:2rem;font-weight:800;color:var(--info)">${stats.checkinStats.total}</div>
              <div style="font-size:0.8125rem;color:var(--text-muted)">Check-ins</div>
            </div>
          </div>
        </div>

        <!-- Check-in Results -->
        ${checkins.length > 0 ? `
          <div class="report-section">
            <div class="report-section-title">🌡️ Check-in da Equipe</div>
            ${[5,4,3,2,1].map((s) => {
              const count = stats.checkinStats.distribution[s] || 0;
              const pct = stats.checkinStats.total > 0 ? Math.round((count / stats.checkinStats.total) * 100) : 0;
              return `
                <div class="stat-bar-row">
                  <span class="stat-bar-label">${getScoreEmoji(s)}</span>
                  <div class="stat-bar-track" style="height:10px;flex:1">
                    <div class="stat-bar-fill" style="width:${pct}%;height:10px"></div>
                  </div>
                  <span class="stat-bar-count" style="width:30px">${count}</span>
                </div>
              `;
            }).join('')}
            ${checkins.filter((c) => c.comment).length > 0 ? `
              <div style="margin-top:12px">
                <p style="font-size:0.875rem;font-weight:600;color:var(--text-muted);margin-bottom:8px">💬 Comentários anônimos:</p>
                ${checkins.filter((c) => c.comment).map((c) => `<div class="report-item">"${escapeHTML(c.comment)}"</div>`).join('')}
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- Treasures -->
        <div class="report-section">
          <div class="report-section-title">💎 Tesouros da Sprint</div>
          ${treasureItems.length > 0 ? `
            <p style="font-size:0.8125rem;font-weight:600;color:var(--text-muted);margin-bottom:6px">💎 O que funcionou bem:</p>
            ${renderItemList(treasureItems, '💎')}
          ` : ''}
          ${recognitionItems.length > 0 ? `
            <p style="font-size:0.8125rem;font-weight:600;color:var(--text-muted);margin:12px 0 6px">❤️ Reconhecimentos:</p>
            ${renderItemList(recognitionItems, '❤️')}
          ` : ''}
          ${learningItems.length > 0 ? `
            <p style="font-size:0.8125rem;font-weight:600;color:var(--text-muted);margin:12px 0 6px">🧠 Descobertas:</p>
            ${renderItemList(learningItems, '🧠')}
          ` : ''}
          ${treasures.length === 0 ? '<p style="color:var(--text-muted);font-size:0.875rem">Nenhum tesouro registrado.</p>' : ''}
        </div>

        <!-- Monsters & Solutions -->
        <div class="report-section">
          <div class="report-section-title">👹 Monstros & Soluções</div>
          ${monsters.length === 0
            ? '<p style="color:var(--text-muted);font-size:0.875rem">Nenhum monstro identificado.</p>'
            : monsters.map((m) => `
              <div style="margin-bottom:14px">
                <div class="report-item" style="background:var(--danger-dim);border:1px solid rgba(248,81,73,0.2)">
                  👹 <strong>${escapeHTML(m.text)}</strong>
                  ${m.selected ? ' <span style="color:var(--accent)">🎯</span>' : ''}
                  <span style="float:right;font-size:0.8125rem;color:var(--text-muted)">
                    🔥${m.reactions.fire||0} 👀${m.reactions.eyes||0} 💡${m.reactions.bulb||0}
                  </span>
                </div>
                ${renderSolutionsForMonster(m.id)}
              </div>
            `).join('')
          }
        </div>

        <!-- Missions -->
        <div class="report-section">
          <div class="report-section-title">🚀 Missões para a Próxima Sprint</div>
          ${missions.length === 0
            ? '<p style="color:var(--text-muted);font-size:0.875rem">Nenhuma missão definida.</p>'
            : missions.map((m) => `
              <div class="report-item" style="margin-bottom:8px">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
                  <div>
                    <strong>🚀 ${escapeHTML(m.title)}</strong>
                    ${m.description ? `<div style="font-size:0.875rem;color:var(--text-muted);margin-top:2px">${escapeHTML(m.description)}</div>` : ''}
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;flex-shrink:0">
                    <span style="font-size:0.75rem;font-weight:600">${getPriorityLabel(m.priority)}</span>
                    ${m.owner ? `<span style="font-size:0.75rem;color:var(--purple)">👤 ${escapeHTML(m.owner)}</span>` : ''}
                    ${m.deadline ? `<span style="font-size:0.75rem;color:var(--accent)">📅 ${formatDate(m.deadline)}</span>` : ''}
                  </div>
                </div>
              </div>
            `).join('')
          }
        </div>
      </div>
    </div>
  `;

  const reportEl = root.querySelector('#report-content');

  root.querySelector('#btn-back').addEventListener('click', () => setPhase('complete'));

  root.querySelector('#btn-pdf').addEventListener('click', async () => {
    const btn = root.querySelector('#btn-pdf');
    btn.disabled = true;
    btn.textContent = '⏳ Gerando PDF...';
    try {
      await exportAsPDF(state, `jornada-sprint-${sprint.name || 'relatorio'}.pdf`);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '📄 BAIXAR PDF';
    }
  });

  root.querySelector('#btn-png').addEventListener('click', async () => {
    const btn = root.querySelector('#btn-png');
    btn.disabled = true;
    btn.textContent = '⏳ Gerando imagem...';
    try {
      await exportAsPNG(reportEl, `jornada-sprint-${sprint.name || 'relatorio'}.png`);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '🖼️ BAIXAR IMAGEM';
    }
  });
}
