/**
 * Auth Service — autenticação de Scrum Masters via Firebase Auth
 *
 * Membros do time NUNCA precisam de autenticação — entram pelo link da sessão.
 * Apenas Scrum Masters fazem login para ter seu perfil e histórico de retrospectivas.
 *
 * Provedores suportados:
 *   - Google (OAuth)
 *   - E-mail + senha
 */

import { getApps } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  updateProfile,
} from 'firebase/auth';

const USE_EMULATOR = import.meta.env.VITE_FIREBASE_USE_EMULATOR === 'true';

let _auth = null;
let _authInitialized = false;

function getAuthInstance() {
  if (_auth) return _auth;
  const app = getApps()[0];
  _auth = getAuth(app);
  if (USE_EMULATOR && !_authInitialized) {
    _authInitialized = true;
    connectAuthEmulator(_auth, 'http://localhost:9099', { disableWarnings: true });
  }
  return _auth;
}

// ── Estado do usuário atual ───────────────────────────────────────────────────

let _currentUser = null;
const _authListeners = new Set();

/**
 * Retorna o usuário Firebase atualmente autenticado (ou null).
 */
export function getCurrentUser() {
  return _currentUser;
}

/**
 * Registra um callback chamado sempre que o estado de autenticação muda.
 * Retorna função de unsubscribe.
 */
export function onAuthChange(callback) {
  _authListeners.add(callback);
  // Dispara imediatamente com o estado atual
  callback(_currentUser);
  return () => _authListeners.delete(callback);
}

function _notifyAuthListeners(user) {
  _currentUser = user;
  for (const cb of _authListeners) cb(user);
}

// ── Bootstrap: escuta mudanças do Firebase Auth ───────────────────────────────

/**
 * Inicializa o listener de auth. Deve ser chamado uma vez no startup da app.
 * Retorna uma Promise que resolve assim que o estado inicial for conhecido.
 */
export function initAuth() {
  return new Promise((resolve) => {
    const auth = getAuthInstance();
    onAuthStateChanged(auth, (user) => {
      _notifyAuthListeners(user);
      resolve(user);
    });
  });
}

// ── Login / Cadastro ──────────────────────────────────────────────────────────

/**
 * Login com Google via popup.
 */
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(getAuthInstance(), provider);
  return result.user;
}

/**
 * Login com e-mail e senha.
 */
export async function signInWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(getAuthInstance(), email, password);
  return result.user;
}

/**
 * Cadastro com e-mail, senha e nome de exibição.
 */
export async function signUpWithEmail(email, password, displayName) {
  const result = await createUserWithEmailAndPassword(getAuthInstance(), email, password);
  if (displayName) {
    await updateProfile(result.user, { displayName });
  }
  return result.user;
}

/**
 * Faz logout do Scrum Master.
 */
export async function signOut() {
  await firebaseSignOut(getAuthInstance());
}
