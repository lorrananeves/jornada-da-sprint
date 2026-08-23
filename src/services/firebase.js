/**
 * Firebase Firestore — real-time sync service
 *
 * Each retrospective session is identified by a `sessionId` that lives in
 * the URL query string (?s=<id>).  Everyone who opens the same URL shares
 * the same Firestore document and sees updates instantly.
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ── Session ID ────────────────────────────────────────────────────────────────

/** Generate a short random ID (8 hex chars) */
function generateId() {
  return Math.random().toString(16).slice(2, 10);
}

/**
 * Return the current session ID from the URL, or create a new one and push it
 * to the URL so the user can share the link with the team.
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

// ── Firestore helpers ─────────────────────────────────────────────────────────

function sessionRef(sessionId) {
  return doc(db, 'sessions', sessionId);
}

/**
 * Load the session document from Firestore.
 * Returns `null` if the document does not exist yet.
 */
export async function loadSession(sessionId) {
  const snap = await getDoc(sessionRef(sessionId));
  return snap.exists() ? snap.data() : null;
}

/**
 * Persist the full state object to Firestore.
 * Uses `setDoc` with merge so concurrent writes on different fields are safe.
 */
export async function saveSession(sessionId, state) {
  await setDoc(sessionRef(sessionId), state, { merge: true });
}

/**
 * Subscribe to real-time updates for the session document.
 * `callback` is called every time the document changes (including the first
 * load), receiving the full state object.
 * Returns the unsubscribe function.
 */
export function subscribeSession(sessionId, callback) {
  return onSnapshot(sessionRef(sessionId), (snap) => {
    if (snap.exists()) {
      callback(snap.data());
    }
  });
}
