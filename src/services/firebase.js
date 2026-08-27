/**
 * Firebase Firestore — real-time sync service
 *
 * Cada sessão de retrospectiva vive em:
 *   sessions/{sessionId}                  ← campos escalares (fase, sprint, time…)
 *   sessions/{sessionId}/checkins/{id}    ← checkins individuais
 *   sessions/{sessionId}/treasures/{id}   ← tesouros
 *   sessions/{sessionId}/monsters/{id}    ← monstros
 *   sessions/{sessionId}/solutions/{id}   ← soluções
 *   sessions/{sessionId}/missions/{id}    ← missões
 *
 * Usar subcoleções elimina o problema de last-write-wins em arrays: cada item
 * é um documento independente, escrito atomicamente, sem interferir nos demais.
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  increment,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';

// ── Validação das variáveis de ambiente ───────────────────────────────────────

const USE_EMULATOR = import.meta.env.VITE_FIREBASE_USE_EMULATOR === 'true';

const REQUIRED_ENV_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

// Em modo emulador as variáveis podem ser valores fictícios — só valida em produção.
if (!USE_EMULATOR) {
  const missing = REQUIRED_ENV_VARS.filter((key) => !import.meta.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[Firebase] Variáveis de ambiente ausentes: ${missing.join(', ')}.\n` +
      'Copie .env.example para .env e preencha com os valores do seu projeto Firebase.'
    );
  }
}

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            ?? 'emulator-key',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN         ?? 'demo-project.firebaseapp.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID          ?? 'demo-project',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET      ?? 'demo-project.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '000000000000',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID              ?? '1:000000000000:web:000000000000',
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// Conecta ao emulador local quando a variável está ativa.
// connectFirestoreEmulator deve ser chamado antes de qualquer operação.
if (USE_EMULATOR) {
  connectFirestoreEmulator(db, 'localhost', 8080);
}

// ── ID helpers ────────────────────────────────────────────────────────────────

/**
 * Gera um ID aleatório com 128 bits de entropia usando a Web Crypto API.
 * Resulta em 32 caracteres hex — impossível de enumerar por força bruta.
 */
export function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Retorna o sessionId da URL ou cria um novo e atualiza a URL.
 */
export function getOrCreateSessionId() {
  const params = new URLSearchParams(window.location.search);
  let id = params.get('s');

  if (!id) {
    id = generateId();
    params.set('s', id);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }

  return id;
}

// ── Refs ──────────────────────────────────────────────────────────────────────

function sessionRef(sessionId) {
  return doc(db, 'sessions', sessionId);
}

function subcolRef(sessionId, colName) {
  return collection(db, 'sessions', sessionId, colName);
}

function itemRef(sessionId, colName, itemId) {
  return doc(db, 'sessions', sessionId, colName, itemId);
}

// ── Documento raiz (campos escalares) ─────────────────────────────────────────

/**
 * Carrega o documento raiz da sessão.
 * Retorna null se ainda não existir.
 */
export async function loadSession(sessionId) {
  const snap = await getDoc(sessionRef(sessionId));
  return snap.exists() ? snap.data() : null;
}

/**
 * Persiste apenas os campos escalares no documento raiz.
 * Não envia arrays — esses vivem em subcoleções.
 */
export async function saveSession(sessionId, scalarFields) {
  await setDoc(sessionRef(sessionId), scalarFields, { merge: true });
}

/**
 * Incrementa xp atomicamente — sem risco de race condition.
 * Usa FieldValue.increment para que dois writes simultâneos se somem
 * em vez de um sobrescrever o outro.
 */
export async function incrementXP(sessionId, amount) {
  await updateDoc(sessionRef(sessionId), { xp: increment(amount) });
}

/**
 * Subscribe a mudanças nos campos escalares do documento raiz.
 */
export function subscribeSession(sessionId, callback) {
  return onSnapshot(
    sessionRef(sessionId),
    (snap) => { if (snap.exists()) callback(snap.data()); },
    (err) => console.warn('[subscribeSession] snapshot error:', err.code)
  );
}

// ── Subcoleções (checkins / treasures / monsters / solutions / missions) ───────

/**
 * Lê todos os documentos de uma subcoleção de uma vez (carregamento inicial).
 * Retorna um array de objetos com o campo `id` incluído.
 */
export async function loadCollection(sessionId, colName) {
  const snap = await getDocs(subcolRef(sessionId, colName));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Grava (cria ou substitui) um item na subcoleção.
 * O `item` deve ter um campo `id` que será usado como ID do documento.
 */
export async function saveItem(sessionId, colName, item) {
  const { id, ...data } = item;
  await setDoc(itemRef(sessionId, colName, id), data);
}

/**
 * Atualiza campos específicos de um item (merge parcial, sem reescrever tudo).
 * Ideal para incrementar contadores de reação sem tocar no restante do documento.
 */
export async function patchItem(sessionId, colName, itemId, partial) {
  await updateDoc(itemRef(sessionId, colName, itemId), partial);
}

/**
 * Remove um item da subcoleção.
 */
export async function removeItem(sessionId, colName, itemId) {
  await deleteDoc(itemRef(sessionId, colName, itemId));
}

/**
 * Escuta em tempo real todos os itens de uma subcoleção.
 * `callback` recebe o array atualizado completo a cada mudança.
 * Retorna a função de unsubscribe.
 */
export function subscribeCollection(sessionId, colName, callback) {
  return onSnapshot(
    subcolRef(sessionId, colName),
    (snap) => { callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); },
    (err) => console.warn(`[subscribeCollection:${colName}] snapshot error:`, err.code)
  );
}

// Reexporta increment para uso nos patchItem calls do store
export { increment };

// ── Indicador de conectividade ────────────────────────────────────────────────

/**
 * Assina o estado de conectividade de rede do browser.
 * Chama `callback(true)` quando online e `callback(false)` quando offline.
 * Retorna função de cancelamento.
 *
 * Usa os eventos nativos `online`/`offline` do window — suficientes para
 * indicar se o Firestore consegue alcançar os servidores do Google.
 */
export function subscribeConnectivity(callback) {
  const onOnline  = () => callback(true);
  const onOffline = () => callback(false);
  window.addEventListener('online',  onOnline);
  window.addEventListener('offline', onOffline);
  // Dispara imediatamente com o estado atual
  callback(navigator.onLine);
  return () => {
    window.removeEventListener('online',  onOnline);
    window.removeEventListener('offline', onOffline);
  };
}

// ── SM Profiles ───────────────────────────────────────────────────────────────

/**
 * Referência ao documento de perfil de um Scrum Master.
 * O `uid` vem do Firebase Auth.
 */
function smProfileRef(uid) {
  return doc(db, 'smProfiles', uid);
}

function smSessionsColRef(uid) {
  return collection(db, 'smProfiles', uid, 'sessions');
}

function smSessionRef(uid, sessionId) {
  return doc(db, 'smProfiles', uid, 'sessions', sessionId);
}

/**
 * Carrega o perfil do SM. Retorna null se não existir.
 */
export async function loadSmProfile(uid) {
  const snap = await getDoc(smProfileRef(uid));
  return snap.exists() ? snap.data() : null;
}

/**
 * Cria ou atualiza o perfil do SM (displayName, email, fotoURL…).
 */
export async function saveSmProfile(uid, data) {
  await setDoc(smProfileRef(uid), { ...data, updatedAt: new Date().toISOString() }, { merge: true });
}

/**
 * Retorna as últimas 50 sessões do SM, ordenadas por data de criação (mais recentes primeiro).
 */
export async function loadSmSessions(uid) {
  const q = query(smSessionsColRef(uid), orderBy('createdAt', 'desc'), limit(50));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Registra/atualiza o resumo de uma sessão no perfil do SM.
 * Chamado sempre que o SM cria ou finaliza uma retrospectiva.
 */
export async function upsertSmSession(uid, sessionId, summary) {
  await setDoc(smSessionRef(uid, sessionId), { ...summary, updatedAt: new Date().toISOString() }, { merge: true });
}

/**
 * Remove o registro de uma sessão do perfil do SM.
 */
export async function deleteSmSession(uid, sessionId) {
  await deleteDoc(smSessionRef(uid, sessionId));
}
