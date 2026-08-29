/**
 * Main Entry Point — Router
 */

import { getState, subscribe, setLocalPhase, isSM } from './state/store.js';
import { initNavbar } from './components/navbar.js';
import { initParkingLot } from './components/parkingLot.js';
import { renderHome } from './screens/home.js';
import { renderAuth } from './screens/auth.js';
import { renderSmDashboard } from './screens/smDashboard.js';
import { renderRoleSelect } from './screens/roleSelect.js';
import { renderSetup } from './screens/setup.js';
import { renderLobby } from './screens/lobby.js';
import { renderCheckin } from './screens/checkin.js';
import { renderTreasures } from './screens/treasures.js';
import { renderMonsters } from './screens/monsters.js';
import { renderCombat } from './screens/combat.js';
import { renderDiscussion } from './screens/discussion.js';
import { renderVoting } from './screens/voting.js';
import { renderMissions } from './screens/missions.js';
import { renderComplete } from './screens/complete.js';
import { renderReport } from './screens/report.js';

const SCREENS = {
  home:         renderHome,
  auth:         renderAuth,
  smDashboard:  renderSmDashboard,
  roleSelect:   renderRoleSelect,
  setup:        renderSetup,
  lobby:        renderLobby,
  checkin:      renderCheckin,
  treasures:    renderTreasures,
  monsters:     renderMonsters,
  // combat mantido para compatibilidade com sessões existentes
  combat:       renderCombat,
  discussion:   renderDiscussion,
  voting:       renderVoting,
  missions:     renderMissions,
  complete:     renderComplete,
  report:       renderReport,
};

// Fases que fazem parte da retrospectiva ativa — entram no histórico do browser.
// Fases pré-retro (home, auth, smDashboard, roleSelect, setup, lobby) são
// locais/transitórias e não devem criar entradas de histórico.
const HISTORY_PHASES = new Set([
  'checkin', 'treasures', 'monsters', 'combat', 'discussion', 'voting', 'missions', 'complete', 'report',
]);

function getScreenRoot() {
  return document.getElementById('screen-root');
}

let _currentPhase = null;
let _fromPopstate = false;

function navigate(phase) {
  if (phase === _currentPhase) return;
  _currentPhase = phase;

  const root = getScreenRoot();
  if (!root) return;

  const renderer = SCREENS[phase];
  if (!renderer) {
    console.warn(`No renderer found for phase: ${phase}`);
    return;
  }

  if (!_fromPopstate && isSM() && HISTORY_PHASES.has(phase)) {
    history.pushState({ phase }, '', window.location.href.split('?')[0] + window.location.search);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderer(root);
}

// ── Exibição de erro de configuração ─────────────────────────────────────────
// Declarada antes do try/catch para garantir que esteja disponível mesmo que
// um erro de parse ou import ocorra durante o bootstrap do módulo.

function renderConfigError(err) {
  const root = document.getElementById('screen-root') ?? document.body;

  const isEnvError = err?.message?.includes('VITE_FIREBASE_');
  const title   = isEnvError ? '⚙️ Configuração incompleta' : '💥 Erro ao iniciar';
  const detail  = isEnvError
    ? 'As variáveis de ambiente do Firebase não foram encontradas.'
    : 'Ocorreu um erro inesperado ao inicializar o aplicativo.';
  const hint    = isEnvError
    ? 'Copie <code>.env.example</code> para <code>.env</code> na raiz do projeto e preencha com os valores do seu projeto Firebase. Depois reinicie o servidor com <code>npm run dev</code>.'
    : `<pre style="font-size:0.75rem;overflow:auto;white-space:pre-wrap;word-break:break-all">${err?.message ?? err}</pre>`;

  root.innerHTML = `
    <div style="
      max-width:560px;margin:80px auto;padding:40px 32px;
      background:#161b22;border:1px solid rgba(248,81,73,0.4);
      border-radius:12px;font-family:system-ui,sans-serif;color:#e6edf3;
    ">
      <h1 style="font-size:1.5rem;font-weight:700;margin-bottom:12px;color:#f85149">${title}</h1>
      <p style="color:#8b949e;margin-bottom:16px">${detail}</p>
      <div style="font-size:0.9375rem;line-height:1.7;color:#e6edf3">${hint}</div>
    </div>
  `;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

try {
  initNavbar();
  initParkingLot();

  const initialState = getState();
  const initialPhase = initialState.currentPhase || 'home';
  history.replaceState({ phase: initialPhase }, '', window.location.href);

  navigate(initialPhase);

  subscribe((state) => {
    navigate(state.currentPhase);
  });

  // Botão "voltar/avançar" do browser — navega apenas localmente,
  // sem alterar a fase global da retro (que mudaria para todos os participantes)
  window.addEventListener('popstate', (e) => {
    const phase = e.state?.phase;
    if (!phase || !SCREENS[phase]) return;
    _fromPopstate = true;
    setLocalPhase(phase);
    _fromPopstate = false;
  });
} catch (err) {
  renderConfigError(err);
}

