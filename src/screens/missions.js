/**
 * @security Toda interpolação em innerHTML DEVE usar escapeHTML(). Nunca
 *   interpole valores vindos do usuário ou do Firestore sem escapar.
 *
 * Missions Screen
 */

import {
  getState, subscribe, addMission, removeMission, addXP, setPhase, setLocalPhase, completePhase, setState, isSM, signalReady,
} from '../state/store.js';
import { xpForMission } from '../services/xp.js';
import { showXPToast, showErrorToast } from '../components/xpToast.js';
import { showModal } from '../components/modal.js';
import { uid, escapeHTML, preserveInputs, buildReadySignalHTML, attachReadySignal } from '../utils/dom.js';
import { getDeviceId } from '../services/presence.js';
import { getPriorityLabel, getStrategyLabel, formatDate } from '../utils/format.js';
import { createPhaseTimer } from '../components/phaseTimer.js';
import { createTypingIndicator } from '../components/typingIndicator.js';
import { loadSmSessions, loadCollection, patchItem } from '../services/firebase.js';
import { getCurrentUser } from '../services/auth.js';

const PRIORITIES = [
  { id: 'high',   label: 'Alta',  class: 'priority-badge-high' },
  { id: 'medium', label: 'Média', class: 'priority-badge-medium' },
  { id: 'low',    label: 'Baixa', class: 'priority-badge-low' },
];

const PREV_MISSION_STATUS_KEY = '_jornada_prev_mission_status';

/** Carrega as missões da sessão anterior concluída do mesmo SM.
 *  Cada item retornado inclui `_fromSession` (nome da sprint) e
 *  `_prevSessionId` (ID do documento no Firestore, para persistir status). */
async function loadPreviousMissions(currentSessionId, currentTeamName) {
  const user = getCurrentUser();
  if (!user) return [];
  try {
    const sessions = await loadSmSessions(user.uid);
    // Pega a sessão concluída mais recente que não seja a atual
    const prev = sessions.find(
      (s) => (s.sessionId || s.id) !== currentSessionId && s.status === 'completed'
        && (!currentTeamName || !s.teamName || s.teamName === currentTeamName)
    );
    if (!prev) return [];
    const prevId = prev.sessionId || prev.id;
    const missions = await loadCollection(prevId, 'missions');
    return missions.map((m) => ({
      ...m,
      _fromSession:   prev.sprintName || prevId,
      _prevSessionId: prevId,
    }));
  } catch (e) {
    console.warn('[Missions] Erro ao carregar missões anteriores:', e);
    return [];
  }
}

export function renderMissions(root) {
  let _timer  = null;
  let _typing = null;
  /** Missões da retro anterior (carregadas uma vez, apenas para SM). */
  let _prevMissions = null;

  function render() {
    const state = getState();
    const missions = state.missions;
    const prefill = state._prefillMission || null;
    const showWarning = missions.length > 3;

    preserveInputs(root, () => { root.innerHTML = `
      <div class="screen-missions screen-enter">
        <div class="phase-header">
          <div class="phase-header-top">
            <span class="phase-icon">🚀</span>
            <h2 class="phase-title">Missões da Próxima Sprint</h2>
          </div>
          <p class="phase-description">
            Transforme soluções em compromissos concretos para a próxima Sprint.
          </p>
        </div>

        <div class="warning-banner" style="margin-bottom:16px">
          <span>💡</span>
          <span>Recomendação: Foque nas missões mais impactantes e realistas. Menos missões, melhor execução.</span>
        </div>

        ${showWarning ? `
          <div class="warning-banner" style="margin-bottom:16px;border-color:rgba(248,81,73,0.4);background:var(--danger-dim);color:var(--danger)">
            <span>⚠️</span>
            <span><strong>Temos muitas missões!</strong> Quais realmente merecem entrar na próxima Sprint? Considere remover algumas.</span>
          </div>
        ` : ''}

        ${_prevMissions && _prevMissions.length > 0 ? `
          <div class="prev-missions-section">
            <h4 class="prev-missions-title">📋 Missões da retro anterior — <span class="text-muted">${escapeHTML(_prevMissions[0]._fromSession || '')}</span></h4>
            <div class="prev-missions-list">
              ${_prevMissions.map((m) => {
                // Prioridade: status persistido no Firestore > cache sessionStorage > 'pending'
                const cached = (JSON.parse(sessionStorage.getItem(PREV_MISSION_STATUS_KEY) || '{}'))[m.id];
                const statusRaw = m.status || cached || 'pending';
                const statusOpts = [
                  { val: 'done',    label: '✅ Feito',       cls: 'prev-mission-status--done' },
                  { val: 'partial', label: '🔄 Em andamento', cls: 'prev-mission-status--partial' },
                  { val: 'pending', label: '⏳ Não feito',   cls: 'prev-mission-status--pending' },
                ];
                const cur = statusOpts.find((o) => o.val === statusRaw) || statusOpts[2];
                return `
                  <div class="prev-mission-card">
                    <div class="prev-mission-info">
                      <span class="prev-mission-title">🚀 ${escapeHTML(m.title)}</span>
                      ${m.owner ? `<span class="text-xs text-muted">👤 ${escapeHTML(m.owner)}</span>` : ''}
                    </div>
                    <select class="prev-mission-status-select ${cur.cls}"
                      data-prev-mission-id="${escapeHTML(m.id)}"
                      data-prev-session-id="${escapeHTML(m._prevSessionId || '')}">
                      ${statusOpts.map((o) => `<option value="${o.val}" ${o.val === statusRaw ? 'selected' : ''}>${o.label}</option>`).join('')}
                    </select>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : (_prevMissions === null && isSM() ? '<div id="prev-missions-loading" style="display:none"></div>' : '')}

        <!-- Add Mission Form -->
        <div class="card mb-5">
          <h4 style="margin-bottom:16px">+ Nova Missão</h4>
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="form-group">
              <label class="form-label">Título *</label>
              <input class="form-input" type="text" id="mission-title"
                placeholder="Ex: Estabelecer cerimônia de alinhamento semanal"
                value="${escapeHTML(prefill ? prefill.text : '')}" />
            </div>
            <div class="form-group">
              <label class="form-label">Descrição</label>
              <textarea class="form-textarea" id="mission-desc" placeholder="Detalhe a missão..." style="min-height:64px"></textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Estratégia</label>
                <select class="form-select" id="mission-strategy">
                  <option value="">— Nenhuma —</option>
                  <option value="prevent" ${prefill && prefill.strategy === 'prevent' ? 'selected' : ''}>🛡️ Prevenir</option>
                  <option value="reduce" ${prefill && prefill.strategy === 'reduce' ? 'selected' : ''}>🧪 Reduzir Impacto</option>
                  <option value="handle" ${prefill && prefill.strategy === 'handle' ? 'selected' : ''}>🤝 Lidar Melhor</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Prioridade</label>
                <select class="form-select" id="mission-priority">
                  <option value="high">🔴 Alta</option>
                  <option value="medium" selected>🟡 Média</option>
                  <option value="low">🟢 Baixa</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Responsável (opcional)</label>
                <input class="form-input" type="text" id="mission-owner" placeholder="Nome ou função" />
              </div>
              <div class="form-group">
                <label class="form-label">Prazo (opcional)</label>
                <input class="form-input" type="date" id="mission-deadline" />
              </div>
            </div>
            <button class="btn btn-primary" id="btn-add-mission">🚀 ADICIONAR MISSÃO</button>
          </div>
        </div>

        <!-- Missions List -->
        ${missions.length > 0 ? `
          <div>
            <h4 style="margin-bottom:12px">
              Missões definidas
              <span class="badge badge-info" style="margin-left:8px">${missions.length}</span>
            </h4>
            <div class="missions-list">
              ${missions.map((m) => `
                <div class="card mission-card">
                  <div class="mission-header">
                    <div>
                      <div class="mission-title">🚀 ${escapeHTML(m.title)}</div>
                      ${m.description ? `<p style="font-size:0.875rem;color:var(--text-muted);margin-top:4px">${escapeHTML(m.description)}</p>` : ''}
                    </div>
                    <button class="btn btn-danger btn-sm btn-icon" data-remove="${escapeHTML(m.id)}" title="Remover missão">🗑️</button>
                  </div>
                  <div class="mission-meta">
                    <span class="badge ${PRIORITIES.find((p) => p.id === m.priority)?.class || 'badge-info'}">
                      ${getPriorityLabel(m.priority)}
                    </span>
                    ${m.strategy ? `<span class="badge badge-info">${getStrategyLabel(m.strategy)}</span>` : ''}
                    ${m.owner ? `<span class="badge" style="background:var(--purple-dim);color:var(--purple)">👤 ${escapeHTML(m.owner)}</span>` : ''}
                    ${m.deadline ? `<span class="badge badge-accent">📅 ${formatDate(m.deadline)}</span>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : `
          <div class="empty-state">
            <div class="empty-state-icon">🚀</div>
            <p class="empty-state-text">Nenhuma missão adicionada ainda.</p>
          </div>
        `}

        <div class="phase-nav">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
          ${buildReadySignalHTML('missions', state, isSM(), getDeviceId())}
          ${isSM() ? `<button class="btn btn-primary" id="btn-next">🏆 CONCLUIR JORNADA →</button>` : `<span class="text-muted text-sm">Aguardando o Scrum Master avançar…</span>`}
        </div>
      </div>
    `; }); // end preserveInputs

    if (_timer)  _timer.destroy();
    _timer = createPhaseTimer(root.querySelector('.screen-missions'), 'missions');

    if (_typing) _typing.destroy();
    _typing = createTypingIndicator(root.querySelector('.screen-missions'), 'missions');
    root.querySelectorAll('#mission-title, #mission-desc').forEach((el) => _typing.watchField(el));

    attachEvents(prefill);

    // Carrega missões anteriores na primeira vez (somente SM)
    if (_prevMissions === null && isSM()) {
      loadPreviousMissions(
        new URLSearchParams(window.location.search).get('s') || '',
        getState().team?.name || ''
      ).then((prev) => {
        _prevMissions = prev;
        if (prev.length > 0) render(); // re-renderiza para exibir o painel
      });
    }
  }

  function attachEvents(prefill) {
    attachReadySignal(root, signalReady);
    root.querySelector('#btn-add-mission').addEventListener('click', async () => {
      const title = root.querySelector('#mission-title').value.trim();
      if (!title) {
        root.querySelector('#mission-title').style.borderColor = 'var(--danger)';
        root.querySelector('#mission-title').focus();
        return;
      }
      root.querySelector('#mission-title').style.borderColor = '';
      if (_typing) _typing.destroy();

      const mission = {
        id: uid(),
        title,
        description: root.querySelector('#mission-desc').value.trim(),
        strategy: root.querySelector('#mission-strategy').value,
        priority: root.querySelector('#mission-priority').value,
        owner: root.querySelector('#mission-owner').value.trim(),
        deadline: root.querySelector('#mission-deadline').value,
      };

      // Clear prefill
      if (prefill) setState({ _prefillMission: null });

      const addBtn = root.querySelector('#btn-add-mission');
      addBtn.disabled = true;
      try {
        await addMission(mission);
        addXP(xpForMission());
        showXPToast(xpForMission(), 'Missão adicionada');
        render();
      } catch (e) {
        console.warn('Firestore addMission failed:', e);
        showErrorToast('Missão não foi salva — verifique sua conexão.');
        addBtn.disabled = false;
      }
    });

    // Status das missões anteriores: persiste no Firestore + cache em sessionStorage
    root.querySelectorAll('.prev-mission-status-select').forEach((sel) => {
      sel.addEventListener('change', () => {
        const missionId    = sel.dataset.prevMissionId;
        const prevSessId   = sel.dataset.prevSessionId;
        const newStatus    = sel.value;

        // Cache local imediato (resiliente a falhas de rede)
        const stored = JSON.parse(sessionStorage.getItem(PREV_MISSION_STATUS_KEY) || '{}');
        stored[missionId] = newStatus;
        sessionStorage.setItem(PREV_MISSION_STATUS_KEY, JSON.stringify(stored));

        // Persiste no Firestore na sessão de origem da missão
        if (prevSessId) {
          patchItem(prevSessId, 'missions', missionId, { status: newStatus })
            .catch((e) => console.warn('[Missions] Erro ao persistir status:', e));
        }

        // Atualiza a classe de cor no próprio select sem re-render completo
        sel.className = `prev-mission-status-select prev-mission-status--${newStatus}`;

        // Atualiza o status em memória para que re-renders não revertam o valor
        const mission = _prevMissions?.find((m) => m.id === missionId);
        if (mission) mission.status = newStatus;
      });
    });

    // Remove missions
    root.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const confirmed = await showModal({
          title: 'Remover Missão',
          body: 'Deseja remover esta missão?',
          confirmLabel: 'Remover',
          confirmClass: 'btn btn-danger',
        });
        if (confirmed) {
          try {
            await removeMission(btn.dataset.remove);
            render();
          } catch (e) {
            console.warn('Firestore removeMission failed:', e);
            showErrorToast('Falha ao remover missão — verifique sua conexão.');
          }
        }
      });
    });

    root.querySelector('#btn-back').addEventListener('click', () => {
      if (isSM()) setPhase('combat');
      else setLocalPhase('roleSelect');
    });
    root.querySelector('#btn-next')?.addEventListener('click', () => {
      completePhase('missions');
      setPhase('complete');
    });
  }

  // Subscription em tempo real: re-renderiza quando missões mudam remotamente
  // ou quando participantCount sobe (entrada tardia — atualiza contador de "Terminei").
  // Usa fingerprint de conteúdo (id + título + status) para detectar também
  // edições remotas a missões existentes, não apenas adições/remoções (bug #11).
  const _missionFingerprint = (missions) =>
    missions.map((m) => `${m.id}:${m.title}:${m.status || ''}`).join('|');

  let _lastFingerprint      = _missionFingerprint(getState().missions);
  let _lastParticipantCount = parseInt(getState().team?.participantCount, 10) || 0;
  const unsub = subscribe((state) => {
    if (state.currentPhase !== 'missions') {
      unsub();
      if (_typing) { _typing.destroy(); _typing = null; }
      return;
    }
    const fp       = _missionFingerprint(state.missions);
    const newCount = parseInt(state.team?.participantCount, 10) || 0;
    if (fp !== _lastFingerprint || newCount !== _lastParticipantCount) {
      _lastFingerprint      = fp;
      _lastParticipantCount = newCount;
      render();
    }
  });

  render();
}
