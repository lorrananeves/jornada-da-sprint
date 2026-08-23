/**
 * Main Entry Point — Router
 */

import { getState, subscribe } from './state/store.js';
import { initNavbar } from './components/navbar.js';
import { renderHome } from './screens/home.js';
import { renderRoleSelect } from './screens/roleSelect.js';
import { renderSetup } from './screens/setup.js';
import { renderLobby } from './screens/lobby.js';
import { renderCheckin } from './screens/checkin.js';
import { renderTreasures } from './screens/treasures.js';
import { renderMonsters } from './screens/monsters.js';
import { renderCombat } from './screens/combat.js';
import { renderMissions } from './screens/missions.js';
import { renderComplete } from './screens/complete.js';
import { renderReport } from './screens/report.js';

const SCREENS = {
  home:       renderHome,
  roleSelect: renderRoleSelect,
  setup:      renderSetup,
  lobby:      renderLobby,
  checkin:    renderCheckin,
  treasures:  renderTreasures,
  monsters:   renderMonsters,
  combat:     renderCombat,
  missions:   renderMissions,
  complete:   renderComplete,
  report:     renderReport,
};

function getScreenRoot() {
  return document.getElementById('screen-root');
}

let _currentPhase = null;

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

  // Scroll to top on phase change
  window.scrollTo({ top: 0, behavior: 'smooth' });

  renderer(root);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

try {
  initNavbar();

  const initialState = getState();
  navigate(initialState.currentPhase || 'home');

  subscribe((state) => {
    navigate(state.currentPhase);
  });
} catch (err) {
  renderConfigError(err);
}

function renderConfigError(err) {
  // Tenta mostrar a mensagem no #screen-root; se o DOM ainda não existir,
  // usa document.body como fallback.
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
