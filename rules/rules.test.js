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
 *     ❌ participante manipula xp
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
 *     ✅ create + reação + merge (drop mark) válidos
 *     ❌ drop mark alterando reações
 *     ❌ reações decrescendo
 *
 *   Soluções
 *     ✅ create + voto válido
 *     ❌ voto que decrementa
 *     ❌ alterar texto da solução
 *
 *   Missões
 *     ✅ create + atualização de status válida
 *     ❌ alterar título de missão de outra sessão
 *     ❌ delete sem sessionId válido
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
  xp:              0,
  completedPhases: [],
  combatMonsterIdx: 0,
  combatStrategy:  'prevent',
  readySignals:    {},
  parkingLot:      [],
  phaseDurations:  {},
  phaseStartedAt:  {},
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
});

describe('doc raiz — manipulação de XP', () => {
  beforeEach(async () => { await seedSession({ ...BASE_SESSION, xp: 50 }); });

  it('❌ participante não pode zerar o xp', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        xp: 0,
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante não pode gravar xp absurdo diretamente', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        xp: 999999,
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('❌ participante não pode subir xp mais de 30 pts por write', async () => {
    await assertFails(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        xp: 131,  // 50 + 81 — acima do máximo de +30 por write
        updatedAt: '2025-01-01T13:00:00.000Z',
      }, { merge: true })
    );
  });

  it('✅ xp pode subir até +30 por write (missão = maior recompensa)', async () => {
    await assertSucceeds(
      setDoc(sessionDoc(anonDb()), {
        ...BASE_SESSION,
        xp: 80,   // 50 + 30 — exatamente o máximo
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

  it('❌ participante não pode criar segundo check-in com ID fabricado', async () => {
    // Cria o check-in legítimo primeiro
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'checkins', CHECKIN_ID), validCheckin);
    });
    // Tenta criar outro com ID diferente mas mesmo deviceId
    const fakeId = '3'.repeat(16);
    await assertFails(
      setDoc(subDoc(anonDb(), 'checkins', fakeId), { score: 5, deviceId: fakeId })
    );
    // Verificação extra: o vínculo itemId==deviceId também bloqueia IDs fabricados
    // onde itemId != deviceId (qualquer combinação)
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
  const validMonster = {
    text: 'Falta de alinhamento',
    reactions: { fire: 0, eyes: 0, bulb: 0 },
    selected: false,
  };

  it('✅ participante pode criar um monstro válido', async () => {
    await assertSucceeds(
      setDoc(subDoc(anonDb(), 'monsters', MONSTER_ID), validMonster)
    );
  });

  it('✅ drop mark legítimo: merged=true + mergedInto, demais campos inalterados', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_ID), validMonster);
    });
    await assertSucceeds(
      setDoc(subDoc(anonDb(), 'monsters', MONSTER_ID), {
        ...validMonster,
        merged: true,
        mergedInto: 'd'.repeat(32),
      })
    );
  });

  it('❌ drop mark não pode alterar reações ao mesmo tempo', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_ID), validMonster);
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'monsters', MONSTER_ID), {
        ...validMonster,
        reactions: { fire: 5, eyes: 0, bulb: 0 },  // inflando reações via drop mark
        merged: true,
        mergedInto: 'd'.repeat(32),
      })
    );
  });

  it('❌ participante não pode decrementar reações de monstro', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_ID), {
        ...validMonster, reactions: { fire: 4, eyes: 2, bulb: 1 },
      });
    });
    await assertFails(
      setDoc(subDoc(anonDb(), 'monsters', MONSTER_ID), {
        ...validMonster,
        reactions: { fire: 3, eyes: 2, bulb: 1 },  // fire caiu
      })
    );
  });

  it('❌ monstro não pode ser deletado (apenas merged=true)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'monsters', MONSTER_ID), validMonster);
    });
    await assertFails(
      deleteDoc(subDoc(anonDb(), 'monsters', MONSTER_ID))
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

  it('✅ participante pode criar uma missão válida', async () => {
    await assertSucceeds(
      setDoc(subDoc(anonDb(), 'missions', MISSION_ID), validMission)
    );
  });

  it('✅ atualização de status é permitida (retomada de missões anteriores)', async () => {
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
      setDoc(subDoc(anonDb(), 'missions', MISSION_ID), {
        ...validMission,
        title: 'x'.repeat(201),
      })
    );
  });

  it('✅ missão pode ser deletada (SM remove action items)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', SESSION, 'missions', MISSION_ID), validMission);
    });
    await assertSucceeds(
      deleteDoc(subDoc(anonDb(), 'missions', MISSION_ID))
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
