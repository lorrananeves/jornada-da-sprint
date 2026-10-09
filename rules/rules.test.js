/**
 * Testes de segurança das Firestore Rules — cenários adversariais
 *
 * Cada teste verifica que a Rule REJEITA uma operação que um participante
 * malicioso poderia tentar diretamente via API do Firestore, sem passar
 * pelo front-end da aplicação.
 *
 * Pré-requisito: emulador Firestore rodando em localhost:8080.
 *   npm run emulator    (em outro terminal — requer Java)
 *   npm run test:rules  (roda este arquivo via vitest.rules.config.js)
 *
 * Estrutura dos grupos:
 *   Doc raiz (sessions/{id})
 *     ✅ writes legítimos permitidos
 *     ❌ participante altera campos SM-only (sprint, team, currentPhase…)
 *     ❌ participante tenta gravar campo xp (removido do schema)
 *     ❌ participante altera identidade (smDeviceId, smUid)
 *     ❌ readySignals: sinalizações indevidas
 *
 *   Checkins
 *     ✅ create válido
 *     ❌ segundo check-in com ID fabricado
 *     ❌ update/delete de check-in existente
 *
 *   Tesouros
 *     ✅ create + reação válida
 *     ❌ reação que decrementa contador
 *     ❌ alterar texto após criar
 *
 *   Monstros
 *     ✅ create + reação (+1) + ops SM (rename, merge, priorityRank) válidas
 *     ❌ participante tenta rename, drop mark ou priorityRank (ops SM-only)
 *     ❌ reação decrescendo ou pulando mais de +1
 *
 *   Soluções
 *     ✅ create + voto válido
 *     ❌ voto que decrementa
 *     ❌ alterar texto da solução
 *
 *   Missões
 *     ✅ SM cria missão / atualiza status (qualquer participante)
 *     ❌ participante anônimo cria ou deleta missão
 *     ❌ alterar título ou priority de missão existente
 *
 *   Sessões não previstas
 *     ❌ coleção fora do schema bloqueada
 */

import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { setDoc, updateDoc, deleteDoc, doc, getDoc } from 'firebase/firestore';

// ── Paths ─────────────────────────────────────────────────────────────────────

const __dir   = dirname(fileURLToPath(import.meta.url));
const RULES   = readFileSync(resolve(__dir, '../firestore.rules'), 'utf8');

// ── IDs fixos para os testes ──────────────────────────────────────────────────

/** sessionId válido: 32 hex chars */
const SESSION   = 'a'.repeat(32);

/** deviceId do SM (16 hex chars) */
const SM_DEV    = '1'.repeat(16);

/** deviceId de um participante malicioso (16 hex chars) */
const EVIL_DEV  = '2'.repeat(16);

/** smUid fictício — usado quando Auth não está presente nos testes */
const SM_UID    = 'sm-uid-abc123';

// ── Estado inicial do documento raiz ─────────────────────────────────────────

/** Documento raiz criado pelo SM — base para todos os testes de update */
const BASE_SESSION = {
  currentPhase:    'checkin',
  retroStarted:    true,
  smDeviceId:      SM_DEV,
  smUid:           SM_UID,
  updatedAt:       '2025-01-01T12:00:00.000Z',
  createdAt:       '2025-01-01T10:00:00.000Z',
  sprint:          { name: 'Sprint 1', startDate: '2025-01-01', endDate: '2025-01-14' },
  team:            { name: 'Time A', participantCount: 3 },
  completedPhases: [],
  combatMonsterIdx: 0,
  combatStrategy:  'prevent',
  readySignals:    {},
  parkingLot:      [],
  phaseDurations:  {},
  phaseStartedAt:  {},
  // votesPerParticipant e votingStarted são opcionais — sessões legadas sem esses
  // campos continuam funcionando (isValidSessionRoot usa get() com default).
};

// ── Ambiente de testes ────────────────────────────────────────────────────────

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-jornada-rules',
    firestore: {
      rules: RULES,
      host:  'localhost',
      port:  8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Firestore autenticado como SM (Firebase Auth uid = SM_UID) */
function smDb() {
  return testEnv.authenticatedContext(SM_UID).firestore();
}

/** Firestore sem autenticação — representa participante anônimo */
function anonDb() {
  return testEnv.unauthenticatedContext().firestore();
}

/** Cria o documento raiz da sessão diretamente (sem passar pelas Rules) */
async function seedSession(data = BASE_SESSION) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'sessions', SESSION), data);
  });
}

/** Referência ao documento raiz usando a conexão fornecida */
const sessionDoc = (db) => doc(db, 'sessions', SESSION);

/** Referência a um item de subcoleção */
const subDoc = (db, col, id) => doc(db, 'sessions', SESSION, col, id);

// ── Documento raiz ─────────────────────────────────────────────────────────────

describe('doc raiz — writes legítimos', () => {
  it('SM autenticado pode criar uma nova sessão', async () => {
    await assertSucceeds(
      setDoc(sessionDoc(smDb()), BASE_SESSION)
    );
  });

  it('participante anônimo pode criar uma nova sessão (criação de sessão não exige auth)', async () => {
    // A criação da sessão é feita pelo SM antes de fazer login no app;
    // apenas a autenticação Firebase garante quem é o SM via smUid.
    await assertSucceeds(
      setDoc(sessionDoc(anonDb()), BASE_SESSION)
    );
  });

  it('participante pode adicionar readySignal com seu deviceId', async () => {
    await seedSession();
    await assertSucceeds(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        readySignals: { [EVIL_DEV]: 'checkin' },
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('participante pode adicionar item ao parkingLot', async () => {
    await seedSession();
    const item = { id: 'a'.repeat(16), text: 'lembrete', createdAt: '2025-01-01T13:00:00.000Z' };
    await assertSucceeds(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        parkingLot: [item],
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('SM pode atualizar currentPhase', async () => {
    await seedSession();
    await assertSucceeds(
      setDoc(sessionDoc(smDb()), {
        ...BASE_SESSION,
        currentPhase: 'treasures',
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });
});

describe('doc raiz — participante NÃO pode alterar campos SM-only', () => {
  beforeEach(async () => { await seedSession(); });

  it('❌ participante não pode alterar currentPhase', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        currentPhase: 'treasures',
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante não pode alterar sprint', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        sprint: { name: 'Sprint Hackeada', startDate: '', endDate: '' },
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante não pode alterar team.name', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        team: { name: 'Time Hackeado', participantCount: 3 },
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante não pode alterar team.participantCount para inflar denominador', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        team: { name: 'Time A', participantCount: 999 },
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante não pode forçar retroStarted=true antecipadamente', async () => {
    await testEnv.clearFirestore();
    await seedSession({ ...BASE_SESSION, retroStarted: false, currentPhase: 'setup' });
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        retroStarted: true,
        currentPhase: 'checkin',
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante não pode adicionar fase a completedPhases', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        completedPhases: ['checkin'],
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante não pode alterar phaseDurations', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        phaseDurations: { checkin: 999999 },
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante não pode alterar phaseStartedAt', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        phaseStartedAt: { checkin: '1970-01-01T00:00:00.000Z' },
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante não pode alterar combatMonsterIdx', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        combatMonsterIdx: 5,
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante não pode alterar combatStrategy', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        combatStrategy: 'reduce',
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante não pode alterar discussionResults', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        discussionResults: { 'abc': 'agreement' },
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('✅ SM autenticado pode definir discussionResults', async () => {
    await assertSucceeds(
      setDoc(sessionDoc(smDb()), {
        ...BASE_SESSION,
        discussionResults: { 'abc': 'agreement' },
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });
});

describe('doc raiz — campo xp removido do schema', () => {
  beforeEach(async () => { await seedSession(); });

  it('❌ qualquer write com campo xp é rejeitado (campo fora do hasOnly)', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        xp: 0,
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ SM também não pode gravar xp (campo removido do schema)', async () => {
    await assertFails(
      setDoc(sessionDoc(smDb()), {
        ...BASE_SESSION,
        xp: 999999,
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });
});

describe('doc raiz — identidade imutável (smDeviceId / smUid)', () => {
  beforeEach(async () => { await seedSession(); });

  it('❌ participante não pode sobrescrever smDeviceId', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        smDeviceId: EVIL_DEV,
        updatedAt:  '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ SM autenticado também não pode alterar smDeviceId após criação', async () => {
    await assertFails(
      setDoc(sessionDoc(smDb()), {
        ...BASE_SESSION,
        smDeviceId: '9'.repeat(16),
        updatedAt:  '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante não pode sobrescrever smUid', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        smUid:     'uid-falso',
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });
});

describe('doc raiz — readySignals', () => {
  beforeEach(async () => { await seedSession(); });

  it('❌ participante não pode remover readySignal de outro', async () => {
    // Semeie um sinal do SM
    await seedSession({
      ...BASE_SESSION,
      readySignals: { [SM_DEV]: 'checkin' },
    });
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        readySignals: {},          // remove o sinal do SM
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante não pode adicionar múltiplas chaves em um único write', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        readySignals: {
          [EVIL_DEV]:   'checkin',
          [SM_DEV]:     'checkin',  // adiciona chave de outro deviceId simultaneamente
        },
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante não pode alterar valor de readySignal existente', async () => {
    await seedSession({
      ...BASE_SESSION,
      readySignals: { [EVIL_DEV]: 'checkin' },
    });
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        readySignals: { [EVIL_DEV]: 'missions' },  // troca a fase sinalizada
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('✅ participante pode adicionar exatamente 1 readySignal novo', async () => {
    await assertSucceeds(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        readySignals: { [EVIL_DEV]: 'checkin' },
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });
});

// ── Checkins ──────────────────────────────────────────────────────────────────

describe('checkins', () => {
  const CHECKIN_ID  = EVIL_DEV;  // ID = deviceId (regra da app)
  const validCheckin = { score: 4, deviceId: EVIL_DEV };

  it('✅ participante pode criar um check-in válido', async () => {
    await assertSucceeds(
      setDoc(subDoc(anonDb(), 'checkins', CHECKIN_ID), validCheckin)
    );
  });

  it('❌ participante não pode criar check-in com itemId diferente do deviceId', async () => {
    await assertFails(
      setDoc(subDoc(anonDb(), 'checkins', 'a'.repeat(16)), validCheckin)
      // 'a'.repeat(16) != EVIL_DEV — vínculo quebrado
    );
  });

  it('❌ participante não pode criar segundo check-in com o mesmo deviceId', async () => {
    // Cria o check-in legítimo primeiro (sem regras, simula check-in já existente)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'checkins', CHECKIN_ID), validCheckin);
    });
    // Tenta criar novamente o mesmo documento — deve falhar porque o doc já existe
    // (Firestore rejeita 'create' quando o documento já existe)
    await assertFails(
      setDoc(subDoc(anonDb(), 'checkins', CHECKIN_ID), { score: 5, deviceId: EVIL_DEV })
    );
  });

  it('❌ check-in com score fora do intervalo [1-5] é rejeitado', async () => {
    await assertFails(
      setDoc(subDoc(anonDb(), 'checkins', CHECKIN_ID), { score: 6, deviceId: CHECKIN_ID })
    );
  });

  it('❌ check-in com comentário acima de 1000 chars é rejeitado', async () => {
    await assertFails(
      setDoc(subDoc(anonDb(), 'checkins', CHECKIN_ID), {
        score: 3,
        deviceId: CHECKIN_ID,
        comment: 'x'.repeat(1001),
      })
    );
  });

  it('❌ check-in não pode ser atualizado após criação', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'checkins', CHECKIN_ID), validCheckin);
    });
    await assertFails(
      updateDoc(subDoc(anonDb(), 'checkins', CHECKIN_ID), { score: 1 })
    );
  });

  it('❌ check-in não pode ser deletado', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'checkins', CHECKIN_ID), validCheckin);
    });
    await assertFails(
      deleteDoc(subDoc(anonDb(), 'checkins', CHECKIN_ID))
    );
  });
});

// ── Tesouros ──────────────────────────────────────────────────────────────────

describe('tesouros', () => {
  const TREASURE_ID = 'b'.repeat(32);
  const validTreasure = {
    text: 'Boa comunicação',
    category: 'treasure',
    reactions: { heart: 0, thumbs: 0, bulb: 0 },
  };

  it('✅ participante pode criar um tesouro válido', async () => {
    await assertSucceeds(
      setDoc(subDoc(anonDb(), 'treasures', TREASURE_ID), validTreasure)
    );
  });

  it('✅ participante pode incrementar reação em +1', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'treasures', TREASURE_ID), validTreasure);
    });
    await assertSucceeds(
      setDoc(subDoc(anonDb(), 'treasures', TREASURE_ID), {
        ...validTreasure,
        reactions: { heart: 1, thumbs: 0, bulb: 0 },
      })
    );
  });

  it('❌ participante não pode decrementar reação', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'treasures', TREASURE_ID), {
        ...validTreasure, reactions: { heart: 3, thumbs: 2, bulb: 1 },
      });
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'treasures', TREASURE_ID), {
        ...validTreasure,
        reactions: { heart: 2, thumbs: 2, bulb: 1 },  // heart caiu de 3 para 2
      })
    );
  });

  it('❌ participante não pode alterar texto de um tesouro existente', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'treasures', TREASURE_ID), validTreasure);
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'treasures', TREASURE_ID), {
        ...validTreasure,
        text: 'Texto adulterado',
      })
    );
  });

  it('❌ participante não pode subir reação em mais de +1 por write', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'treasures', TREASURE_ID), validTreasure);
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'treasures', TREASURE_ID), {
        ...validTreasure,
        reactions: { heart: 10, thumbs: 0, bulb: 0 },  // +10 de uma vez
      })
    );
  });

  it('❌ tesouro com categoria inválida é rejeitado na criação', async () => {
    await assertFails(
      setDoc(subDoc(anonDb(), 'treasures', TREASURE_ID), {
        ...validTreasure,
        category: 'invalid-category',
      })
    );
  });

  it('❌ tesouro não pode ser deletado', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'treasures', TREASURE_ID), validTreasure);
    });
    await assertFails(
      deleteDoc(subDoc(anonDb(), 'treasures', TREASURE_ID))
    );
  });
});

// ── Monstros ──────────────────────────────────────────────────────────────────

describe('monstros', () => {
  const MONSTER_ID = 'c'.repeat(32);
  const OTHER_ID   = 'd'.repeat(32);
  const validMonster = {
    text: 'Falta de alinhamento',
    reactions: { fire: 0, eyes: 0, bulb: 0 },
    selected: false,
  };

  beforeEach(async () => {
    await seedSession();
  });

  // ── create ────────────────────────────────────────────────────────────────

  it('✅ participante pode criar um monstro válido', async () => {
    await assertSucceeds(
      setDoc(subDoc(anonDb(), 'monsters', MONSTER_ID), validMonster)
    );
  });

  // ── reações (participante anônimo) ────────────────────────────────────────

  it('✅ participante pode incrementar reação em +1', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_ID), validMonster);
    });
    await assertSucceeds(
      setDoc(subDoc(anonDb(), 'monsters', MONSTER_ID), {
        ...validMonster,
        reactions: { fire: 1, eyes: 0, bulb: 0 },
      })
    );
  });

  it('❌ participante não pode decrementar reação de monstro', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_ID), {
        ...validMonster, reactions: { fire: 4, eyes: 2, bulb: 1 },
      });
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'monsters', MONSTER_ID), {
        ...validMonster,
        reactions: { fire: 3, eyes: 2, bulb: 1 },
      })
    );
  });

  it('❌ participante não pode pular reação em mais de +1', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_ID), validMonster);
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'monsters', MONSTER_ID), {
        ...validMonster,
        reactions: { fire: 5, eyes: 0, bulb: 0 },
      })
    );
  });

  // ── operações exclusivas do SM ────────────────────────────────────────────

  it('✅ SM pode renomear um monstro', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_ID), validMonster);
    });
    await assertSucceeds(
      setDoc(subDoc(smDb(), 'monsters', MONSTER_ID), {
        ...validMonster,
        text: 'Novo nome do monstro',
      })
    );
  });

  it('❌ participante NÃO pode renomear um monstro', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_ID), validMonster);
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'monsters', MONSTER_ID), {
        ...validMonster,
        text: 'Tentativa de rename',
      })
    );
  });

  it('✅ SM pode fazer drop mark (merge): merged=true + mergedInto', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_ID), validMonster);
    });
    await assertSucceeds(
      setDoc(subDoc(smDb(), 'monsters', MONSTER_ID), {
        ...validMonster,
        merged: true,
        mergedInto: OTHER_ID,
      })
    );
  });

  it('❌ participante NÃO pode fazer drop mark (merged=true)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_ID), validMonster);
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'monsters', MONSTER_ID), {
        ...validMonster,
        merged: true,
        mergedInto: OTHER_ID,
      })
    );
  });

  it('✅ SM pode alterar priorityRank', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_ID), validMonster);
    });
    await assertSucceeds(
      setDoc(subDoc(smDb(), 'monsters', MONSTER_ID), {
        ...validMonster,
        priorityRank: 2,
      })
    );
  });

  it('❌ participante NÃO pode alterar priorityRank', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_ID), validMonster);
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'monsters', MONSTER_ID), {
        ...validMonster,
        priorityRank: 0,
      })
    );
  });

  it('✅ SM pode somar reações no merge (reactions sobe mais que +1)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_ID), {
        ...validMonster, reactions: { fire: 3, eyes: 1, bulb: 0 },
      });
    });
    await assertSucceeds(
      setDoc(subDoc(smDb(), 'monsters', MONSTER_ID), {
        ...validMonster,
        reactions: { fire: 7, eyes: 4, bulb: 0 },
        mergedFrom: [MONSTER_ID, OTHER_ID],
      })
    );
  });

  it('❌ participante NÃO pode inflar reações com merge', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_ID), validMonster);
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'monsters', MONSTER_ID), {
        ...validMonster,
        reactions: { fire: 99, eyes: 0, bulb: 0 },
        merged: true,
        mergedInto: OTHER_ID,
      })
    );
  });

  // ── delete ────────────────────────────────────────────────────────────────

  it('❌ monstro não pode ser deletado via deleteDoc (nem SM, nem participante)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_ID), validMonster);
    });
    await assertFails(deleteDoc(subDoc(anonDb(), 'monsters', MONSTER_ID)));
    await assertFails(deleteDoc(subDoc(smDb(),   'monsters', MONSTER_ID)));
  });

  // ── schema ────────────────────────────────────────────────────────────────

  // O resultado de discussão vive em discussionResults no doc raiz — não na subcoleção.
  it('❌ discussionResult não é um campo válido na subcoleção monsters', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_ID), validMonster);
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'monsters', MONSTER_ID), {
        ...validMonster,
        discussionResult: 'agreement',
      })
    );
  });
});

// ── Soluções ──────────────────────────────────────────────────────────────────

describe('soluções', () => {
  const SOL_ID = 'e'.repeat(32);
  const validSolution = {
    text: 'Cerimônia de alinhamento semanal',
    monsterId: 'f'.repeat(32),
    strategy: 'prevent',
    votes: 0,
  };

  it('✅ participante pode criar uma solução válida', async () => {
    await assertSucceeds(
      setDoc(subDoc(anonDb(), 'solutions', SOL_ID), validSolution)
    );
  });

  it('✅ voto legítimo incrementa votes em exatamente +1', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'solutions', SOL_ID), validSolution);
    });
    await assertSucceeds(
      setDoc(subDoc(anonDb(), 'solutions', SOL_ID), { ...validSolution, votes: 1 })
    );
  });

  it('❌ votos não podem ser decrementados', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'solutions', SOL_ID), {
        ...validSolution, votes: 5,
      });
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'solutions', SOL_ID), { ...validSolution, votes: 4 })
    );
  });

  it('❌ participante não pode pular votes (ex: 0→10 de uma vez)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'solutions', SOL_ID), validSolution);
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'solutions', SOL_ID), { ...validSolution, votes: 10 })
    );
  });

  it('❌ texto da solução não pode ser alterado após criação', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'solutions', SOL_ID), validSolution);
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'solutions', SOL_ID), {
        ...validSolution,
        text: 'Texto adulterado',
        votes: 1,
      })
    );
  });

  it('❌ strategy inválida é rejeitada na criação', async () => {
    await assertFails(
      setDoc(subDoc(anonDb(), 'solutions', SOL_ID), {
        ...validSolution,
        strategy: 'hack',
      })
    );
  });

  it('❌ solução não pode ser deletada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'solutions', SOL_ID), validSolution);
    });
    await assertFails(
      deleteDoc(subDoc(anonDb(), 'solutions', SOL_ID))
    );
  });
});

// ── Missões ───────────────────────────────────────────────────────────────────

describe('missões', () => {
  const MISSION_ID = '1'.repeat(32);
  const validMission = {
    title:       'Alinhar expectativas semanalmente',
    description: '',
    strategy:    'prevent',
    priority:    'high',
    owner:       '',
    deadline:    '',
  };

  it('✅ SM autenticado pode criar uma missão válida', async () => {
    await assertSucceeds(
      setDoc(subDoc(smDb(), 'missions', MISSION_ID), validMission)
    );
  });

  it('❌ participante anônimo NÃO pode criar missão', async () => {
    await assertFails(
      setDoc(subDoc(anonDb(), 'missions', MISSION_ID), validMission)
    );
  });

  it('✅ atualização de status é permitida a qualquer participante (retomada de missões anteriores)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'missions', MISSION_ID), validMission);
    });
    await assertSucceeds(
      setDoc(subDoc(anonDb(), 'missions', MISSION_ID), { ...validMission, status: 'done' })
    );
  });

  it('❌ participante não pode alterar título de missão existente', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'missions', MISSION_ID), validMission);
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'missions', MISSION_ID), {
        ...validMission,
        title: 'Título adulterado',
      })
    );
  });

  it('❌ participante não pode alterar priority de missão existente', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'missions', MISSION_ID), validMission);
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'missions', MISSION_ID), {
        ...validMission,
        priority: 'low',  // só status pode mudar
      })
    );
  });

  it('❌ status inválido é rejeitado', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'missions', MISSION_ID), validMission);
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'missions', MISSION_ID), {
        ...validMission,
        status: 'hacked',
      })
    );
  });

  it('❌ missão com title acima de 200 chars é rejeitada', async () => {
    await assertFails(
      setDoc(subDoc(smDb(), 'missions', MISSION_ID), {
        ...validMission,
        title: 'x'.repeat(201),
      })
    );
  });

  it('✅ SM pode deletar uma missão', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'missions', MISSION_ID), validMission);
    });
    await assertSucceeds(
      deleteDoc(subDoc(smDb(), 'missions', MISSION_ID))
    );
  });

  it('❌ participante anônimo NÃO pode deletar missão', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'missions', MISSION_ID), validMission);
    });
    await assertFails(
      deleteDoc(subDoc(anonDb(), 'missions', MISSION_ID))
    );
  });
});

// ── Notas de discussão ────────────────────────────────────────────────────────

describe('discussões', () => {
  const NOTE_ID = 'note' + '1'.repeat(28);
  const validNote = {
    monsterId: 'monster-abc',
    type:      'insight',
    text:      'Precisamos melhorar a comunicação',
    createdAt: '2025-01-01T12:00:00.000Z',
  };

  beforeEach(async () => {
    await seedSession();
  });

  it('✅ SM autenticado pode criar uma nota de discussão', async () => {
    await assertSucceeds(
      setDoc(subDoc(smDb(), 'discussions', NOTE_ID), validNote)
    );
  });

  it('❌ participante anônimo NÃO pode criar uma nota de discussão', async () => {
    await assertFails(
      setDoc(subDoc(anonDb(), 'discussions', NOTE_ID), validNote)
    );
  });

  it('✅ SM autenticado pode editar uma nota de discussão existente', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'discussions', NOTE_ID), validNote);
    });
    await assertSucceeds(
      setDoc(subDoc(smDb(), 'discussions', NOTE_ID), {
        ...validNote,
        text:      'Texto atualizado pelo SM',
        updatedAt: '2025-01-01T13:00:00.000Z',
      })
    );
  });

  it('❌ participante anônimo NÃO pode editar uma nota de discussão existente', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'discussions', NOTE_ID), validNote);
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'discussions', NOTE_ID), {
        ...validNote,
        text:      'Texto adulterado por participante',
        updatedAt: '2025-01-01T13:00:00.000Z',
      })
    );
  });

  it('✅ SM autenticado pode excluir uma nota de discussão', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'discussions', NOTE_ID), validNote);
    });
    await assertSucceeds(
      deleteDoc(subDoc(smDb(), 'discussions', NOTE_ID))
    );
  });

  it('❌ participante anônimo NÃO pode excluir uma nota de discussão', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'discussions', NOTE_ID), validNote);
    });
    await assertFails(
      deleteDoc(subDoc(anonDb(), 'discussions', NOTE_ID))
    );
  });

  it('✅ participante anônimo PODE ler notas de discussão', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'discussions', NOTE_ID), validNote);
    });
    await assertSucceeds(
      getDoc(subDoc(anonDb(), 'discussions', NOTE_ID))
    );
  });

  it('❌ nota com type inválido é rejeitada (SM)', async () => {
    await assertFails(
      setDoc(subDoc(smDb(), 'discussions', NOTE_ID), {
        ...validNote,
        type: 'invalid-type',
      })
    );
  });
});

// ── sessionId inválido bloqueia acesso ────────────────────────────────────────

describe('sessionId inválido', () => {
  it('❌ leitura com sessionId que não é 32 hex chars é bloqueada', async () => {
    await assertFails(
      getDoc(doc(anonDb(), 'sessions', 'nao-e-hex'))
    );
  });

  it('❌ escrita com sessionId curto demais é bloqueada', async () => {
    await assertFails(
      setDoc(doc(anonDb(), 'sessions', 'abc123'), BASE_SESSION)
    );
  });
});

// ── Coleções fora do schema são bloqueadas ────────────────────────────────────

describe('coleções não previstas', () => {
  it('❌ escrita em coleção arbitrária fora do schema é bloqueada', async () => {
    await assertFails(
      setDoc(doc(anonDb(), 'adminOverride', 'payload'), { hack: true })
    );
  });

  it('❌ leitura em coleção arbitrária fora do schema é bloqueada', async () => {
    await assertFails(
      getDoc(doc(anonDb(), 'secretData', 'anything'))
    );
  });
});

// ── votingClosed — encerramento da votação ────────────────────────────────────

describe('votingClosed — encerramento da votação', () => {
  const MONSTER_ID   = 'e'.repeat(32);
  const DEVICE_VOTER = '3'.repeat(16);
  const TOKEN_ID     = `${DEVICE_VOTER}_${MONSTER_ID}`;
  const validVote    = { deviceId: DEVICE_VOTER, monsterId: MONSTER_ID, votedAt: '2025-01-01T12:00:00.000Z' };
  const validMonster = { text: 'Problema X', reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false, voteCount: 0 };

  beforeEach(async () => {
    // Cria monstro e sessão sem regras
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_ID), validMonster);
    });
  });

  it('✅ participante pode votar quando votingClosed está ausente (sessões antigas)', async () => {
    await seedSession(); // BASE_SESSION não tem votingClosed
    await assertSucceeds(
      setDoc(subDoc(anonDb(), 'monsterVotes', TOKEN_ID), validVote)
    );
  });

  it('✅ participante pode votar quando votingClosed=false', async () => {
    await seedSession({ ...BASE_SESSION, votingClosed: false });
    await assertSucceeds(
      setDoc(subDoc(anonDb(), 'monsterVotes', TOKEN_ID), validVote)
    );
  });

  it('❌ participante NÃO pode votar quando votingClosed=true', async () => {
    await seedSession({ ...BASE_SESSION, votingClosed: true });
    await assertFails(
      setDoc(subDoc(anonDb(), 'monsterVotes', TOKEN_ID), validVote)
    );
  });

  it('❌ SM NÃO pode votar quando votingClosed=true (regra cobre todos)', async () => {
    await seedSession({ ...BASE_SESSION, votingClosed: true });
    await assertFails(
      setDoc(subDoc(smDb(), 'monsterVotes', TOKEN_ID), validVote)
    );
  });

  it('✅ SM pode encerrar a votação (setar votingClosed=true)', async () => {
    await seedSession();
    await assertSucceeds(
      setDoc(sessionDoc(smDb()), {
        ...BASE_SESSION,
        votingClosed: true,
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante NÃO pode encerrar a votação (setar votingClosed=true)', async () => {
    await seedSession();
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        votingClosed: true,
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('✅ SM pode reabrir a votação (setar votingClosed=false)', async () => {
    await seedSession({ ...BASE_SESSION, votingClosed: true });
    await assertSucceeds(
      setDoc(sessionDoc(smDb()), {
        ...BASE_SESSION,
        votingClosed: false,
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante NÃO pode reabrir a votação', async () => {
    await seedSession({ ...BASE_SESSION, votingClosed: true });
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        votingClosed: false,
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });
});


// ── votesPerParticipant — controle de acesso ─────────────────────────────────

describe('votesPerParticipant — somente SM pode configurar', () => {
  beforeEach(async () => { await seedSession(); });

  it('✅ SM pode definir votesPerParticipant ao iniciar a votação', async () => {
    await assertSucceeds(
      setDoc(sessionDoc(smDb()), {
        ...BASE_SESSION,
        votesPerParticipant: 2,
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('✅ SM pode definir votesPerParticipant=1 (limite mínimo)', async () => {
    await assertSucceeds(
      setDoc(sessionDoc(smDb()), {
        ...BASE_SESSION,
        votesPerParticipant: 1,
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante NÃO pode alterar votesPerParticipant', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        votesPerParticipant: 5,
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ SM NÃO pode definir votesPerParticipant=0 (inválido)', async () => {
    await assertFails(
      setDoc(sessionDoc(smDb()), {
        ...BASE_SESSION,
        votesPerParticipant: 0,
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ SM NÃO pode definir votesPerParticipant acima de 100 (limite arbitrário)', async () => {
    await assertFails(
      setDoc(sessionDoc(smDb()), {
        ...BASE_SESSION,
        votesPerParticipant: 101,
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('✅ sessão sem votesPerParticipant continua compatível (leitura funciona)', async () => {
    // BASE_SESSION não tem votesPerParticipant — verifica que leitura não quebra
    await assertSucceeds(
      // Leitura sempre é permitida para sessionIds válidos
      import('firebase/firestore').then(({ getDoc, doc }) =>
        getDoc(doc(anonDb(), 'sessions', SESSION))
      )
    );
  });

  it('✅ SM pode atualizar votesPerParticipant junto com votingClosed em uma escrita', async () => {
    await assertSucceeds(
      setDoc(sessionDoc(smDb()), {
        ...BASE_SESSION,
        votesPerParticipant: 3,
        votingClosed: false,
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('✅ SM pode setar votingStarted=true ao iniciar votação', async () => {
    await assertSucceeds(
      setDoc(sessionDoc(smDb()), {
        ...BASE_SESSION,
        votesPerParticipant: 2,
        votingStarted: true,
        votingClosed: false,
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante NÃO pode setar votingStarted=true', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        votingStarted: true,
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });
});

// ── voteTokens — enforcement do limite total de votos por dispositivo ─────────
//
// Estes são os testes adversariais centrais da segurança de votação.
// Verificam que um atacante que grave diretamente no Firestore (sem usar a app)
// não consegue ultrapassar o limite configurado, remover votos anteriores
// para recuperar cota, votar duas vezes no mesmo monstro, ou votar quando
// a votação está encerrada.
//
// Pré-requisito: emulador Firestore em localhost:8080.

describe('voteTokens — enforcement do limite total no servidor', () => {
  const DEVICE_VOTER = '3'.repeat(16);
  const MONSTER_A    = 'a'.repeat(32);
  const MONSTER_B    = 'b'.repeat(32);
  const MONSTER_C    = 'c'.repeat(32);

  const validMonster = { text: 'X', reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false, voteCount: 0 };

  /** Cria monstros e seta a sessão com votesPerParticipant=N */
  async function seedVotingSession(votesPerParticipant = 2) {
    await seedSession({ ...BASE_SESSION, votesPerParticipant, votingClosed: false });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'sessions', SESSION, 'monsters', MONSTER_A), validMonster);
      await setDoc(doc(db, 'sessions', SESSION, 'monsters', MONSTER_B), { ...validMonster, text: 'Y' });
      await setDoc(doc(db, 'sessions', SESSION, 'monsters', MONSTER_C), { ...validMonster, text: 'Z' });
    });
  }

  /** Helper: cria um voteToken diretamente (bypass das Rules) para setup de testes */
  async function seedVoteTracker(deviceId, count, monsters) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'sessions', SESSION, 'voteTokens', deviceId),
        { deviceId, count, monsters }
      );
    });
  }

  // ── Criação (primeiro voto) ──────────────────────────────────────────────────

  it('✅ participante pode criar voteToken com count=1 dentro do limite', async () => {
    await seedVotingSession(2);
    await assertSucceeds(
      setDoc(
        doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER),
        { deviceId: DEVICE_VOTER, count: 1, monsters: [MONSTER_A] }
      )
    );
  });

  it('✅ participante pode criar voteToken com count=1 e limite=1', async () => {
    await seedVotingSession(1);
    await assertSucceeds(
      setDoc(
        doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER),
        { deviceId: DEVICE_VOTER, count: 1, monsters: [MONSTER_A] }
      )
    );
  });

  it('❌ participante NÃO pode criar voteToken com count>1 (burla o limite acumulando votos)', async () => {
    // Atacante tenta registrar 2 votos em uma única operação de criação
    await seedVotingSession(2);
    await assertFails(
      setDoc(
        doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER),
        { deviceId: DEVICE_VOTER, count: 2, monsters: [MONSTER_A, MONSTER_B] }
      )
    );
  });

  it('❌ participante NÃO pode criar voteToken quando limite=1 e count=1 já seria o único voto — testando create quando já existe', async () => {
    // Atacante cria um token para si mesmo, depois tenta criar outro — deve falhar pois o update é exigido
    await seedVotingSession(2);
    // Cria o primeiro via Rules legítimas
    await assertSucceeds(
      setDoc(
        doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER),
        { deviceId: DEVICE_VOTER, count: 1, monsters: [MONSTER_A] }
      )
    );
    // Tenta fazer SET novamente (não update): deve falhar — setDoc com merge=false é create se não existe
    // mas como já existe, no Firestore o setDoc sem merge = overwrite (não cria).
    // A Rule de update deve ser aplicada neste caso. Testamos via updateDoc diretamente.
    await assertFails(
      updateDoc(
        doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER),
        { deviceId: DEVICE_VOTER, count: 3, monsters: [MONSTER_A, MONSTER_B, MONSTER_C] }
      )
    );
  });

  it('❌ participante NÃO pode criar voteToken com deviceId diferente do path', async () => {
    // Atacante tenta criar um tracker para outro dispositivo
    await seedVotingSession(2);
    await assertFails(
      setDoc(
        doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER),
        { deviceId: EVIL_DEV, count: 1, monsters: [MONSTER_A] } // deviceId errado
      )
    );
  });

  it('❌ participante NÃO pode criar voteToken quando votingClosed=true', async () => {
    await seedVotingSession(2);
    await seedSession({ ...BASE_SESSION, votesPerParticipant: 2, votingClosed: true });
    await assertFails(
      setDoc(
        doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER),
        { deviceId: DEVICE_VOTER, count: 1, monsters: [MONSTER_A] }
      )
    );
  });

  it('❌ participante NÃO pode criar voteToken com campos extras', async () => {
    await seedVotingSession(2);
    await assertFails(
      setDoc(
        doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER),
        { deviceId: DEVICE_VOTER, count: 1, monsters: [MONSTER_A], extraField: 'hack' }
      )
    );
  });

  // ── Atualização (votos subsequentes) ─────────────────────────────────────────

  it('✅ participante pode atualizar voteToken de count=1 para count=2 (dentro do limite 2)', async () => {
    await seedVotingSession(2);
    await seedVoteTracker(DEVICE_VOTER, 1, [MONSTER_A]);
    await assertSucceeds(
      updateDoc(
        doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER),
        { count: 2, monsters: [MONSTER_A, MONSTER_B] }
      )
    );
  });

  it('❌ ADVERSARIAL: participante NÃO pode atualizar voteToken ultrapassando votesPerParticipant=1', async () => {
    // Atacante já tem count=1 (único voto permitido) e tenta registrar mais um
    await seedVotingSession(1); // limite = 1
    await seedVoteTracker(DEVICE_VOTER, 1, [MONSTER_A]);
    await assertFails(
      updateDoc(
        doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER),
        { count: 2, monsters: [MONSTER_A, MONSTER_B] }
      )
    );
  });

  it('❌ ADVERSARIAL: participante NÃO pode pular incremento (count += 2 em vez de +1)', async () => {
    // Atacante tenta inflar o count para parecer que atingiu o limite e depois usar
    // votos extras. Ou qualquer outro esquema de manipulação de count.
    await seedVotingSession(3);
    await seedVoteTracker(DEVICE_VOTER, 1, [MONSTER_A]);
    await assertFails(
      updateDoc(
        doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER),
        { count: 3, monsters: [MONSTER_A, MONSTER_B] } // pula de 1 para 3
      )
    );
  });

  it('❌ ADVERSARIAL: participante NÃO pode remover monstros anteriores (zerando a lista para recuperar cota)', async () => {
    // Atacante tem 2 votos (count=2), tenta remover os monstros e recriar com lista menor
    await seedVotingSession(3);
    await seedVoteTracker(DEVICE_VOTER, 2, [MONSTER_A, MONSTER_B]);
    await assertFails(
      updateDoc(
        doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER),
        { count: 3, monsters: [MONSTER_C] } // removeu A e B, adicionou apenas C
      )
    );
  });

  it('❌ ADVERSARIAL: participante NÃO pode substituir lista de monstros mantendo o count', async () => {
    // Atacante tenta trocar quais monstros votou sem alterar o count
    await seedVotingSession(3);
    await seedVoteTracker(DEVICE_VOTER, 1, [MONSTER_A]);
    await assertFails(
      updateDoc(
        doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER),
        { count: 2, monsters: [MONSTER_B, MONSTER_C] } // removeu A, adicionou B e C
      )
    );
  });

  it('❌ ADVERSARIAL: participante NÃO pode trocar elemento anterior mantendo tamanho correto ([A,B]→[A,C])', async () => {
    // Este ataque passou na verificação de tamanho antes da correção:
    //   oldData.monsters = [A, B], newData.monsters = [A, C]
    //   size check: 2 == 1+1 ✓  (antes era suficiente)
    //   hasAll check: [A,C].hasAll([A,B]) = false ✗  (proteção adicionada)
    //
    // O atacante tentaria "revogar" o voto em B e redirecionar para C,
    // burlando o token de unicidade do monsterVotes (já escrito para B).
    await seedVotingSession(3);
    await seedVoteTracker(DEVICE_VOTER, 2, [MONSTER_A, MONSTER_B]);
    await assertFails(
      updateDoc(
        doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER),
        { count: 3, monsters: [MONSTER_A, MONSTER_C] } // substituiu B por C — tamanho +1 correto, mas B foi removido
      )
    );
  });

  it('❌ ADVERSARIAL: participante NÃO pode alterar deviceId do tracker (imutável)', async () => {
    await seedVotingSession(2);
    await seedVoteTracker(DEVICE_VOTER, 1, [MONSTER_A]);
    await assertFails(
      updateDoc(
        doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER),
        { deviceId: EVIL_DEV, count: 2, monsters: [MONSTER_A, MONSTER_B] }
      )
    );
  });

  it('❌ ADVERSARIAL: participante NÃO pode deletar o tracker (recuperaria cota artificialmente)', async () => {
    await seedVotingSession(2);
    await seedVoteTracker(DEVICE_VOTER, 2, [MONSTER_A, MONSTER_B]);
    await assertFails(
      deleteDoc(doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER))
    );
  });

  it('❌ ADVERSARIAL: participante NÃO pode escrever no tracker de outro dispositivo', async () => {
    // Atacante EVIL_DEV tenta modificar o tracker de DEVICE_VOTER
    await seedVotingSession(3);
    await seedVoteTracker(DEVICE_VOTER, 1, [MONSTER_A]);
    // O path é DEVICE_VOTER mas EVIL_DEV está tentando escrever
    // A Rule verifica deviceId no documento == deviceId no path
    await assertFails(
      updateDoc(
        doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER),
        { deviceId: EVIL_DEV, count: 2, monsters: [MONSTER_A, MONSTER_B] }
      )
    );
  });

  it('❌ ADVERSARIAL: participante NÃO pode atualizar voteToken quando votingClosed=true', async () => {
    // Atacante tenta votar após o SM encerrar a votação
    await seedVotingSession(3);
    await seedVoteTracker(DEVICE_VOTER, 1, [MONSTER_A]);
    // SM encerra a votação
    await seedSession({ ...BASE_SESSION, votesPerParticipant: 3, votingClosed: true });
    await assertFails(
      updateDoc(
        doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER),
        { count: 2, monsters: [MONSTER_A, MONSTER_B] }
      )
    );
  });

  it('✅ sessão legada sem votesPerParticipant usa default 3 nas Rules', async () => {
    // Sessão antiga sem o campo — limit default de 3 deve permitir count=1
    await seedSession({ ...BASE_SESSION, votingClosed: false }); // sem votesPerParticipant
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_A), validMonster);
    });
    await assertSucceeds(
      setDoc(
        doc(anonDb(), 'sessions', SESSION, 'voteTokens', DEVICE_VOTER),
        { deviceId: DEVICE_VOTER, count: 1, monsters: [MONSTER_A] }
      )
    );
  });
});
