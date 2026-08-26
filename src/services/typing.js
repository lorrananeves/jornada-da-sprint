/**
 * Typing Indicator Service
 *
 * Registra/remove o status de digitação de um dispositivo no Firestore.
 *
 * Estrutura:
 *   sessions/{sessionId}/typing/{deviceId}
 *     { phase, expiresAt }
 *
 * Estratégia TTL:
 *   - Ao digitar, grava/renova o documento com expiresAt = now + EXPIRE_MS.
 *   - Um debounce de DEBOUNCE_MS é aplicado: a gravação real acontece somente
 *     após o usuário parar de digitar por esse tempo.
 *   - Ao parar (blur ou submit), remove o documento imediatamente.
 *   - subscribeTyping() filtra client-side: conta apenas docs com expiresAt > now.
 *     Isso garante que "fantasmas" de conexões perdidas desapareçam automaticamente.
 *
 * Custo de writes:
 *   Máximo 1 write por DEBOUNCE_MS (1 s) por usuário — negligível.
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

// Após parar de digitar, aguarda este tempo antes de registrar no Firestore.
const DEBOUNCE_MS = 1_000;

// Quanto tempo (ms) um registro de "digitando" é considerado vivo.
// Deve ser bem maior que DEBOUNCE_MS para cobrir redigitações rápidas.
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

let _debounceTimer = null;

/**
 * Registra que este dispositivo está digitando na fase `phase`.
 * Usa debounce para evitar flood de writes.
 */
export function signalTyping(phase) {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(async () => {
    const sessionId = getOrCreateSessionId();
    try {
      await setDoc(typingRef(sessionId, getDeviceId()), {
        phase,
        expiresAt: Date.now() + EXPIRE_MS,
      });
    } catch {
      // Silencioso — indicador de digitação é melhor-esforço
    }
  }, DEBOUNCE_MS);
}

/**
 * Remove imediatamente o status de digitação deste dispositivo.
 * Chamar ao dar blur no campo ou ao submeter o formulário.
 */
export function clearTyping() {
  clearTimeout(_debounceTimer);
  _debounceTimer = null;
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
