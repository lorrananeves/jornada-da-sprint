/**
 * store.js — shim de compatibilidade
 *
 * O store foi dividido em módulos menores em store/:
 *   store/role.js        — identidade e papel do dispositivo
 *   store/session.js     — estado central, fases, XP, bootstrap
 *   store/collections.js — operações de escrita nas subcoleções Firestore
 *   store/index.js       — re-exporta tudo com a API pública original
 *
 * Este arquivo re-exporta o índice para que todos os imports existentes
 * (../state/store.js) continuem funcionando sem alteração.
 */

export * from './store/index.js';
