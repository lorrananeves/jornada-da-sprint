/**
 * Main Entry Point — Router
 */

import { getState, subscribe } from './state/store.js';
import { initNavbar } from './components/navbar.js';
import { renderHome } from './screens/home.js';
import { renderSetup } from './screens/setup.js';
import { renderCheckin } from './screens/checkin.js';
import { renderTreasures } from './screens/treasures.js';
import { renderMonsters } from './screens/monsters.js';
import { renderCombat } from './screens/combat.js';
import { renderMissions } from './screens/missions.js';
import { renderComplete } from './screens/complete.js';
import { renderReport } from './screens/report.js';

const SCREENS = {
  home:      renderHome,
  setup:     renderSetup,
  checkin:   renderCheckin,
  treasures: renderTreasures,
  monsters:  renderMonsters,
  combat:    renderCombat,
  missions:  renderMissions,
  complete:  renderComplete,
  report:    renderReport,
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

// Bootstrap
initNavbar();

// Initial render
const initialState = getState();
navigate(initialState.currentPhase || 'home');

// Subscribe to phase changes
subscribe((state) => {
  navigate(state.currentPhase);
});
