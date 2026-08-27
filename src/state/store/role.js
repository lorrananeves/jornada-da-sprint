/**
 * Role — identidade por dispositivo (sessionStorage)
 *
 * Determina se o utilizador atual é Scrum Master ou membro do time
 * nesta aba/sessão de browser, sem depender de auth nem de Firestore.
 */

import { getDeviceId } from '../../services/presence.js';
import { getCurrentUser } from '../../services/auth.js';

const ROLE_KEY = '_jornada_role';

export function getRole() {
  return sessionStorage.getItem(ROLE_KEY);
}

export function setRole(role, setScalarState) {
  sessionStorage.setItem(ROLE_KEY, role);
  if (role === 'scrum_master') {
    const user = getCurrentUser();
    setScalarState({
      smDeviceId: getDeviceId(),
      smUid: user ? user.uid : null,
    });
  }
}

/**
 * Verifica se o dispositivo atual é o Scrum Master.
 *
 * O role explícito (definido nesta aba) tem prioridade sobre o smDeviceId
 * guardado no estado — evita que quem tem o smDeviceId salvo localmente
 * seja tratado como SM ao entrar como membro pelo link compartilhado.
 */
export function isSM(smDeviceId) {
  const role = getRole();
  if (role === 'team_member') return false;
  if (role === 'scrum_master') return true;
  return smDeviceId === getDeviceId();
}
