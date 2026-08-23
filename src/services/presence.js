/**
 * Presence Service — tracks who is in the session lobby in real time
 *
 * Uses a sub-collection "presence" inside the session document.
 * Each participant writes a document with their device ID.
 * The Scrum Master subscribes to the count of those documents.
 */

import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { getOrCreateSessionId } from './firebase.js';

// Reuse the already-initialized Firebase app
function getDb() {
  const app = getApps()[0];
  return getFirestore(app);
}

/** A stable per-device random ID stored in sessionStorage */
function getDeviceId() {
  let id = sessionStorage.getItem('_jornada_device');
  if (!id) {
    id = Math.random().toString(16).slice(2, 14);
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

/**
 * Register this device as present in the session.
 * Returns a cleanup function that removes the entry.
 */
export async function joinSession() {
  const sessionId = getOrCreateSessionId();
  try {
    await setDoc(presenceRef(sessionId), {
      joinedAt: serverTimestamp(),
      deviceId: getDeviceId(),
    });

    // Remove presence when tab closes
    window.addEventListener('beforeunload', () => leaveSession(), { once: true });
  } catch (e) {
    console.warn('Could not register presence:', e);
  }
}

/** Remove this device from the session presence. */
export async function leaveSession() {
  const sessionId = getOrCreateSessionId();
  try {
    await deleteDoc(presenceRef(sessionId));
  } catch (e) {
    console.warn('Could not remove presence:', e);
  }
}

/**
 * Subscribe to the real-time count of participants in the lobby.
 * `callback` receives the number of connected participants.
 * Returns an unsubscribe function.
 */
export function subscribeParticipants(callback) {
  const sessionId = getOrCreateSessionId();
  return onSnapshot(presenceColRef(sessionId), (snap) => {
    callback(snap.size);
  });
}

/** Returns the shareable URL for this session (includes ?s=id) */
export function getSessionUrl() {
  return window.location.href.split('#')[0];
}
