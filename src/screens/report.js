/**
 * @security Toda interpolação em innerHTML DEVE usar escapeHTML(). Nunca
 *   interpole valores vindos do usuário ou do Firestore sem escapar.
 *
 * Report Screen
 */

import { getState, setPhase, setLocalPhase, isSM } from '../state/store.js';
import { calcSummaryStats, getMoodLabel } from '../services/stats.js';
import { exportAsPDF, exportAsPNG } from '../services/export.js';
import { formatDate, formatISO, formatXP, getScoreEmoji, getPriorityLabel, getStrategyLabel, DISCUSSION_TYPES, getDiscussionTypeEmoji, getDiscussionTypeLabel, DISCUSSION_RESULTS, getDiscussionResultEmoji, getDiscussionResultLabel } from '../utils/format.js';
import { escapeHTML } from '../utils/dom.js';

export function renderReport(root) {
  const state = getState();
  const stats = calcSummaryStats(state);
  const mood = getMoodLabel(stats.checkinStats.average);

  const { sprint, team, treasures, monsters, solutions, missions, checkins, discussions } = state;

  const treasureItems = treasures.filter((t) => t.category === 'treasure');
  const recognitionItems = treasures.filter((t) => t.category === 'recognition');
  const learningItems = treasures.filter((t) => t.category === 'learning');

  function renderItemList(items, emoji) {
    if (!items.length) return '<p class="text-muted text-sm">Nenhum item registrado.</p>';
    return items.map((item) => `<div class="report-item">${emoji} ${escapeHTML(item.text || item.title)}</div>`).join('');
  }

  /** Notas de discussão vinculadas a um monstro */
  function renderDiscussionNotesForMonster(monsterId) {
    const notes = discussions.filter((n) => n.monsterId === monsterId);
    if (!notes.length) return '';
    return `<div class="report-discussion-notes">` +
      notes.map((n) => `
        <div class="report-discussion-note">
          <span class="report-discussion-note-type">${getDiscussionTypeEmoji(n.type)} ${getDiscussionTypeLabel(n.type)}</span>
          <span class="report-discussion-note-text">${escapeHTML(n.text)}</span>
        </div>
      `).join('') +
    `</div>`;
  }

  /** Soluções legadas (sessões antigas sem discussions) */
  function renderSolutionsForMonster(monsterId) {
    const sols = solutions.filter((s) => s.monsterId === monsterId);
    if (!sols.length) return '';
    return sols.map((s) => `
      <div class="report-item report-solution-row">
        <span>${getStrategyLabel(s.strategy)}</span>
        <span class="report-solution-text">${escapeHTML(s.text)}</span>
        <span class="report-solution-votes">👍 ${s.votes}</span>
      </div>
    `).join('');
  }

  /** Missões vinculadas a um monstro (via monsterId) */
  function renderMissionsForMonster(monsterId) {
    const linked = missions.filter((m) => m.monsterId === monsterId);
    if (!linked.length) return '';
    return linked.map((m) => `
      <div class="report-mission-linked">
        <span>🚀 ${escapeHTML(m.title)}</span>
        ${m.owner ? `<span class="text-xs text-muted">👤 ${escapeHTML(m.owner)}</span>` : ''}
      </div>
    `).join('');
  }

  /** Sumário global de notas por tipo */
  function renderDiscussionSummary() {
    if (!discussions.length) return '';
    const byType = {};
    DISCUSSION_TYPES.forEach((t) => { byType[t.id] = discussions.filter((n) => n.type === t.id); });

    const hasAny = DISCUSSION_TYPES.some((t) => byType[t.id].length > 0);
    if (!hasAny) return '';

    return `
      <div class="report-section">
        <div class="report-section-title">📝 Notas da Discussão</div>
        <div class="report-discussion-summary">
          ${DISCUSSION_TYPES.map((t) => {
            const items = byType[t.id];
            if (!items.length) return '';
            return `
              <div class="report-discussion-type-block">
                <div class="report-discussion-type-header">
                  <span>${t.emoji} ${t.label}</span>
                  <span class="badge badge-info">${items.length}</span>
                </div>
                ${items.map((n) => `<div class="report-discussion-note-text" style="margin:4px 0 4px 16px">• ${escapeHTML(n.text)}</div>`).join('')}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  /** Distribuição dos resultados por tipo (somente monstros com resultado) */
  function renderResultsSummary() {
    const withResult = monsters.filter((m) => m.discussionResult);
    if (!withResult.length) return '';

    return `
      <div class="report-section">
        <div class="report-section-title">🎯 Resultados da Retrospectiva</div>
        <div class="report-discussion-summary">
          ${DISCUSSION_RESULTS.map((r) => {
            const count = withResult.filter((m) => m.discussionResult === r.id).length;
            if (!count) return '';
            return `
              <div class="report-discussion-type-block">
                <div class="report-discussion-type-header">
                  <span>${r.emoji} ${r.label}</span>
                  <span class="badge badge-info">${count}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  root.innerHTML = `
    <main class="screen-report screen-enter" role="main" aria-label="Relatório da jornada">
      <div class="phase-header">
        <div class="phase-header-top">
          <span class="phase-icon" aria-hidden="true">📋</span>
          <h2 class="phase-title">Relatório da Jornada</h2>
        </div>
        <p class="phase-description">Visão completa da retrospectiva para compartilhar com o time.</p>
      </div>

      <div class="report-actions">
        <button class="btn btn-back" id="btn-back" aria-label="Voltar à tela de conclusão">← Voltar</button>
        <button class="btn btn-info" id="btn-pdf" aria-label="Baixar relatório em PDF">📄 BAIXAR PDF</button>
        <button class="btn btn-success" id="btn-png" aria-label="Baixar relatório como imagem">🖼️ BAIXAR IMAGEM</button>
      </div>

      <!-- Report Content (captured for export) -->
      <div id="report-content" role="article" aria-label="Conteúdo do relatório">
        <div class="report-header">
          <div class="report-header-icon" aria-hidden="true">⚔️</div>
          <h1 class="report-title">JORNADA DA SPRINT</h1>
          <h2 class="report-header-subtitle">${escapeHTML(sprint.name || 'Retrospectiva')}</h2>
          <p class="text-muted">
            ${team.name ? `Time: ${escapeHTML(team.name)}` : ''}
            ${team.participantCount ? ` · ${team.participantCount} participante${team.participantCount !== 1 ? 's' : ''}` : ''}
          </p>
          ${sprint.startDate || sprint.endDate ? `
            <p class="text-muted text-sm mt-1">
              📅 ${formatDate(sprint.startDate)} → ${formatDate(sprint.endDate)}
            </p>
          ` : ''}
          <p class="text-muted text-xs mt-1">
            Gerado em ${formatISO(new Date().toISOString())}
          </p>
        </div>

        <!-- XP Summary -->
        <div class="report-section">
          <div class="report-section-title">⭐ Resultado Geral</div>
          <div class="report-kpis">
            <div class="report-kpi">
              <div class="report-kpi-value text-accent">${formatXP(stats.totalXP)}</div>
              <div class="text-xs text-muted">XP Total</div>
            </div>
            <div class="report-kpi">
              <div class="report-kpi-value" style="color:${mood.color}">${stats.checkinStats.average.toFixed(1)}</div>
              <div class="text-xs text-muted">${mood.label}</div>
            </div>
            <div class="report-kpi">
              <div class="report-kpi-value text-info">${stats.checkinStats.total}</div>
              <div class="text-xs text-muted">Check-ins</div>
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
                  <div class="stat-bar-track">
                    <div class="stat-bar-fill" style="width:${pct}%"></div>
                  </div>
                  <span class="stat-bar-count">${count}</span>
                </div>
              `;
            }).join('')}
            ${checkins.filter((c) => c.comment).length > 0 ? `
              <div class="report-comments">
                <p class="report-comments-label">💬 Comentários anônimos:</p>
                ${checkins.filter((c) => c.comment).map((c) => `<div class="report-item">"${escapeHTML(c.comment)}"</div>`).join('')}
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- Treasures -->
        <div class="report-section">
          <div class="report-section-title">💎 Tesouros da Sprint</div>
          ${treasureItems.length > 0 ? `
            <p class="report-category-label">💎 O que funcionou bem:</p>
            ${renderItemList(treasureItems, '💎')}
          ` : ''}
          ${recognitionItems.length > 0 ? `
            <p class="report-category-label">❤️ Reconhecimentos:</p>
            ${renderItemList(recognitionItems, '❤️')}
          ` : ''}
          ${learningItems.length > 0 ? `
            <p class="report-category-label">🧠 Descobertas:</p>
            ${renderItemList(learningItems, '🧠')}
          ` : ''}
          ${treasures.length === 0 ? '<p class="text-muted text-sm">Nenhum tesouro registrado.</p>' : ''}
        </div>

        <!-- Monsters & Discussions (novas sessões) + soluções legadas -->
        <div class="report-section">
          <div class="report-section-title">👹 Monstros & Discussões</div>
          ${monsters.length === 0
            ? '<p class="text-muted text-sm">Nenhum monstro identificado.</p>'
            : monsters.map((m) => `
              <div class="report-monster-block">
                <div class="report-item report-item--monster">
                  ${m.mergedFrom?.length ? '🔗' : '👹'} <strong>${escapeHTML(m.text)}</strong>
                  <span class="report-monster-reactions text-xs text-muted">
                    🔥${m.reactions?.fire||0} 👀${m.reactions?.eyes||0} 💡${m.reactions?.bulb||0}
                    ${m.voteCount ? ` · 🗳️${m.voteCount}` : ''}
                  </span>
                </div>
                ${m.discussionResult ? `
                  <div class="report-discussion-result">
                    🎯 <strong>Resultado:</strong>
                    ${getDiscussionResultEmoji(m.discussionResult)} ${escapeHTML(getDiscussionResultLabel(m.discussionResult))}
                  </div>
                ` : ''}
                ${renderDiscussionNotesForMonster(m.id)}
                ${renderSolutionsForMonster(m.id)}
                ${renderMissionsForMonster(m.id)}
              </div>
            `).join('')
          }
        </div>

        ${renderResultsSummary()}
        ${renderDiscussionSummary()}

        <!-- Missions -->
        <div class="report-section">
          <div class="report-section-title">🚀 Missões para a Próxima Sprint</div>
          ${missions.length === 0
            ? '<p class="text-muted text-sm">Nenhuma missão definida.</p>'
            : missions.map((m) => `
              <div class="report-item mb-2">
                <div class="report-mission-row">
                  <div>
                    <strong>🚀 ${escapeHTML(m.title)}</strong>
                    ${m.description ? `<div class="report-mission-desc">${escapeHTML(m.description)}</div>` : ''}
                    ${m.successCriteria ? `<div class="report-mission-desc" style="color:var(--text-muted)">🎯 ${escapeHTML(m.successCriteria)}</div>` : ''}
                  </div>
                  <div class="report-mission-meta">
                    <span class="meta-priority">${getPriorityLabel(m.priority)}</span>
                    ${m.strategy ? `<span class="badge badge-info text-xs">${getStrategyLabel(m.strategy)}</span>` : ''}
                    ${m.owner ? `<span class="meta-owner">👤 ${escapeHTML(m.owner)}</span>` : ''}
                    ${m.deadline ? `<span class="meta-deadline">📅 ${formatDate(m.deadline)}</span>` : ''}
                  </div>
                </div>
              </div>
            `).join('')
          }
        </div>
      </div>
    </main>
  `;

  const reportEl = root.querySelector('#report-content');

  root.querySelector('#btn-back').addEventListener('click', () => {
    if (isSM()) setPhase('complete');
    else setLocalPhase('roleSelect');
  });

  root.querySelector('#btn-pdf').addEventListener('click', async () => {
    const btn = root.querySelector('#btn-pdf');
    btn.disabled = true;
    btn.textContent = '⏳ Gerando PDF...';
    try {
      await exportAsPDF(state, `jornada-sprint-${sprint.name || 'relatorio'}.pdf`);
    } catch (e) {
      console.error('exportAsPDF failed:', e);
      alert('Não foi possível gerar o PDF. Verifique o console para mais detalhes.');
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
    } catch (e) {
      console.error('exportAsPNG failed:', e);
      alert('Não foi possível gerar a imagem. Verifique o console para mais detalhes.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '🖼️ BAIXAR IMAGEM';
    }
  });
}
