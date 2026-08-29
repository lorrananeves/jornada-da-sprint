/**
 * Typing Indicator Service
 *
 * Registra/remove o status de digitação de um dispositivo no Firestore.
 *
 * Estrutura:
 *   sessions/{sessionId}/typing/{deviceId}
 *     { phase, expiresAt }
 *
 * Estratégia:
 *   - Na primeira tecla, grava imediatamente para que o indicador apareça
 *     em tempo real para os outros participantes.
 *   - A cada RENEW_MS (enquanto a pessoa continua digitando), renova o
 *     documento para manter o TTL vivo — evita flood de writes.
 *   - Um debounce de DEBOUNCE_MS é aplicado apenas ao clearTyping():
 *     o documento é removido somente após o usuário parar por esse tempo.
 *   - subscribeTyping() filtra client-side: conta apenas docs com expiresAt > now.
 *     Isso garante que "fantasmas" de conexões perdidas desapareçam automaticamente.
 *
 * Custo de writes:
 *   Máximo 1 write por RENEW_MS (3 s) por usuário enquanto digita,
 *   mais 1 write ao parar — negligível.
 */

import { getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
} from 'firebase/firestore';
import { getOrCreateSessionId } from './firebase.js';
import { getDeviceId } from './presence.js';

// Intervalo mínimo entre renovações de TTL enquanto a pessoa digita.
// Evita flood de writes sem atrasar a aparição do indicador.
const RENEW_MS = 3_000;

// Quanto tempo após parar de digitar o indicador permanece visível.
const DEBOUNCE_MS = 1_000;

// Quanto tempo (ms) um registro de "digitando" é considerado vivo.
// Deve ser > RENEW_MS + DEBOUNCE_MS para cobrir o pior caso de renovação.
const EXPIRE_MS = 8_000;

function getDb() {
  const app = getApps()[0];
  return getFirestore(app);
}

function typingRef(sessionId, deviceId) {
  return doc(getDb(), 'sessions', sessionId, 'typing', deviceId);
}

function typingColRef(sessionId) {
  return collection(getDb(), 'sessions', sessionId, 'typing');
}

let _debounceTimer = null; // timer para remover o indicador após parar de digitar
let _renewTimer    = null; // timer de renovação de TTL enquanto digita
let _isTyping      = false; // true enquanto há um documento ativo no Firestore
let _currentPhase  = null; // fase gravada no último _writeTyping

async function _writeTyping(phase) {
  _currentPhase = phase;
  const sessionId = getOrCreateSessionId();
  try {
    await setDoc(typingRef(sessionId, getDeviceId()), {
      phase,
      expiresAt: Date.now() + EXPIRE_MS,
    });
  } catch {
    // Silencioso — indicador de digitação é melhor-esforço
  }
}

/**
 * Registra que este dispositivo está digitando na fase `phase`.
 * Grava imediatamente na primeira tecla; renova o TTL a cada RENEW_MS;
 * usa debounce apenas para remover o indicador ao parar de digitar.
 */
export function signalTyping(phase) {
  // Cancela o timer de remoção — a pessoa ainda está digitando
  clearTimeout(_debounceTimer);
  _debounceTimer = null;

  if (!_isTyping) {
    // Primeira tecla: grava imediatamente para aparecer em tempo real
    _isTyping = true;
    _writeTyping(phase);

    // Agenda renovações periódicas de TTL enquanto a pessoa digita
    _renewTimer = setInterval(() => _writeTyping(phase), RENEW_MS);
  }

  // Agenda a remoção após DEBOUNCE_MS de inatividade
  _debounceTimer = setTimeout(() => {
    clearTyping(phase);
  }, DEBOUNCE_MS);
}

/**
 * Remove imediatamente o status de digitação deste dispositivo.
 * Aceita `phase` opcional: se fornecida, só apaga o documento quando a fase
 * gravada corresponde à fase informada — evita que o blur num campo de uma
 * fase limpe o indicador que foi gravado por outra fase/aba.
 * Chamar ao dar blur no campo ou ao submeter o formulário.
 */
export function clearTyping(phase) {
  // Se a fase não corresponde ao documento ativo, não apaga o Firestore
  // mas ainda para os timers locais para não vazar setInterval/setTimeout.
  if (phase !== undefined && _currentPhase !== null && phase !== _currentPhase) {
    clearTimeout(_debounceTimer);
    clearInterval(_renewTimer);
    _debounceTimer = null;
    _renewTimer    = null;
    return;
  }
  clearTimeout(_debounceTimer);
  clearInterval(_renewTimer);
  _debounceTimer = null;
  _renewTimer    = null;
  _isTyping      = false;
  _currentPhase  = null;
  const sessionId = getOrCreateSessionId();
  deleteDoc(typingRef(sessionId, getDeviceId())).catch(() => {});
}

/**
 * Assina o indicador de digitação para uma fase específica.
 * `callback` recebe o número de pessoas digitando (excluindo este dispositivo).
 * Retorna a função de unsubscribe.
 */
export function subscribeTyping(phase, callback) {
  const sessionId = getOrCreateSessionId();
  const myDevice  = getDeviceId();

  return onSnapshot(typingColRef(sessionId), (snap) => {
    const now = Date.now();
    const count = snap.docs.filter((d) => {
      const data = d.data();
      return (
        d.id !== myDevice &&           // exclui o próprio dispositivo
        data.phase === phase &&        // somente da fase atual
        data.expiresAt > now           // ainda dentro do TTL
      );
    }).length;
    callback(count);
  }, () => {});
}
