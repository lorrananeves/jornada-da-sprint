/**
 * Presence Service — rastreia quem está na sessão em tempo real
 *
 * Estratégia: heartbeat com TTL (Time-to-Live)
 *
 *   Problema original:
 *     leaveSession() era chamado em beforeunload com deleteDoc assíncrono.
 *     O navegador pode fechar a aba antes do request completar, deixando
 *     documentos de presença "fantasma" no Firestore indefinidamente.
 *
 *   Solução (sem Realtime Database):
 *     1. joinSession() grava { lastSeen, expiresAt } no documento.
 *     2. Um intervalo de HEARTBEAT_MS renova lastSeen e expiresAt a cada ciclo.
 *     3. subscribeParticipants() filtra client-side: conta só documentos cujo
 *        expiresAt > Date.now() — presença "fantasma" some automaticamente.
 *     4. leaveSession() ainda tenta o deleteDoc (melhor esforço), mas agora
 *        não é crítico: se falhar, o TTL expira a presença em ≤ EXPIRE_MS.
 *     5. stopHeartbeat() para o intervalo quando o usuário sai do lobby.
 *
 *   Custo de writes:
 *     1 write por participante a cada HEARTBEAT_MS (25s) = ~144 writes/hora
 *     por pessoa — confortavelmente dentro do free tier do Firestore.
 */

import { getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { getOrCreateSessionId } from './firebase.js';

// Intervalo de heartbeat em ms — cada ciclo renova o TTL
const HEARTBEAT_MS = 25_000;

// Quanto tempo (ms) um documento é considerado "vivo" após o último heartbeat.
// Deve ser > HEARTBEAT_MS para tolerar uma batida atrasada pela rede.
const EXPIRE_MS = 60_000;

// Reuse the already-initialized Firebase app
function getDb() {
  const app = getApps()[0];
  return getFirestore(app);
}

/** ID estável por dispositivo, armazenado em sessionStorage */
export function getDeviceId() {
  let id = sessionStorage.getItem('_jornada_device');
  if (!id) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem('_jornada_device', id);
  }
  return id;
}

function presenceRef(sessionId) {
  return doc(getDb(), 'sessions', sessionId, 'presence', getDeviceId());
}

function presenceColRef(sessionId) {
  return collection(getDb(), 'sessions', sessionId, 'presence');
}

/** Handle do intervalo de heartbeat — null quando inativo */
let _heartbeatTimer = null;

/**
 * Registra este dispositivo como presente e inicia o heartbeat.
 * Retorna uma função de cleanup (para ao sair do lobby).
 */
export async function joinSession() {
  const sessionId = getOrCreateSessionId();
  const expiresAt = Date.now() + EXPIRE_MS;

  try {
    await setDoc(presenceRef(sessionId), {
      deviceId:  getDeviceId(),
      lastSeen:  serverTimestamp(),
      expiresAt, // epoch ms — usado para filtragem client-side
    });
  } catch (e) {
    console.warn('Could not register presence:', e);
    return;
  }

  // Inicia o heartbeat: renova lastSeen e expiresAt a cada ciclo
  _heartbeatTimer = setInterval(async () => {
    try {
      await updateDoc(presenceRef(sessionId), {
        lastSeen:  serverTimestamp(),
        expiresAt: Date.now() + EXPIRE_MS,
      });
    } catch (e) {
      // Falha pontual de rede — o próximo ciclo tentará de novo;
      // o TTL atual ainda cobre EXPIRE_MS - tempo_decorrido ms
      console.warn('Heartbeat failed:', e);
    }
  }, HEARTBEAT_MS);

  // Melhor esforço ao fechar a aba: ainda tentamos o delete,
  // mas agora não é crítico — o TTL cobre a falha
  window.addEventListener('beforeunload', () => {
    stopHeartbeat();
    leaveSession();
  }, { once: true });
}

/**
 * Para o heartbeat e remove a presença deste dispositivo.
 * Chamado explicitamente ao sair do lobby (navegação voluntária).
 */
export function stopHeartbeat() {
  if (_heartbeatTimer !== null) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
}

/** Remove este dispositivo da presença. Melhor esforço — não await. */
export async function leaveSession() {
  const sessionId = getOrCreateSessionId();
  try {
    await deleteDoc(presenceRef(sessionId));
  } catch (e) {
    console.warn('Could not remove presence:', e);
  }
}

/**
 * Escuta em tempo real a contagem de participantes ativos no lobby.
 * Filtra client-side: conta apenas documentos com expiresAt > Date.now(),
 * o que elimina automaticamente presenças "fantasma" sem heartbeat ativo.
 *
 * `callback` recebe o número de participantes vivos.
 * Retorna a função de unsubscribe.
 */
export function subscribeParticipants(callback) {
  const sessionId = getOrCreateSessionId();
  return onSnapshot(presenceColRef(sessionId), (snap) => {
    const now = Date.now();
    const alive = snap.docs.filter((d) => {
      const expires = d.data().expiresAt;
      // Aceita tanto número epoch quanto Timestamp do Firestore
      if (typeof expires === 'number') return expires > now;
      if (expires instanceof Timestamp) return expires.toMillis() > now;
      // Documento sem expiresAt (schema antigo ou malformado) — não considera vivo;
      // evita que documentos "fantasma" sejam contados para sempre
      return false;
    });
    callback(alive.length);
  });
}

/** Retorna a URL compartilhável da sessão atual (inclui ?s=id) */
export function getSessionUrl() {
  return window.location.href.split('#')[0];
}
