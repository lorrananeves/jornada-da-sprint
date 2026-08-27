# ⚔️ Jornada da Sprint

🔗 **[lorrananeves.github.io/jornada-da-sprint](https://lorrananeves.github.io/jornada-da-sprint/)**

Uma ferramenta de retrospectiva Scrum **gamificada e colaborativa em tempo real**, onde o time embarca em uma jornada épica para refletir sobre a sprint de forma dinâmica e envolvente.

## 🎮 Sobre o Projeto

O **Jornada da Sprint** transforma a retrospectiva tradicional em uma aventura em fases. Com sistema de XP, tesouros, monstros, votação e missões, cada etapa representa uma dimensão diferente da retrospectiva — tornando o processo mais engajante, estruturado e divertido para todo o time.

A aplicação é **multiplayer em tempo real**: o Scrum Master controla o fluxo das fases enquanto todos os participantes interagem simultaneamente via Cloud Firestore.

## 🗺️ Fases da Jornada

| Fase | Tela | Descrição |
|---|---|---|
| 🏠 **Home** | `home` | Tela inicial — iniciar nova jornada ou continuar sessão salva |
| 🎭 **Seleção de Papel** | `roleSelect` | Cada participante escolhe se é Scrum Master ou membro do time |
| ⚙️ **Setup** | `setup` | Scrum Master configura nome da sprint e datas |
| 🚪 **Lobby** | `lobby` | Sala de espera com presença em tempo real enquanto todos entram |
| ✅ **Check-in** | `checkin` | Cada pessoa registra como chegou na retro (humor de 1 a 5) |
| 💎 **Tesouros** | `treasures` | O que foi bem — pontos positivos, reconhecimentos e aprendizados |
| 👹 **Monstros** | `monsters` | O que atrapalhou ou pode melhorar — com reações e votação |
| ⚔️ **Combate** | `combat` | Discussão e proposição de soluções para os monstros priorizados |
| 🎯 **Missões** | `missions` | Definição dos action items para a próxima sprint |
| 🏆 **Conclusão** | `complete` | Encerramento, celebração e resumo da jornada |
| 📊 **Relatório** | `report` | Exportação do resumo completo em PDF ou PNG |

## ✨ Funcionalidades

### Colaboração em tempo real
- **Multiplayer** — todos os participantes veem as atualizações instantaneamente via Firestore
- **Controle de papéis** — apenas o Scrum Master avança as fases; o time participa sem controle sobre o fluxo
- **Sincronização de foco no Combate** — o SM navega entre monstros e estratégias, e todos os membros seguem automaticamente com indicador "📡 foco do SM"
- **Indicador de conectividade** — badge 🟢/🔴 na navbar mostra o estado da conexão com o Firestore em tempo real

### Participação
- **Check-in protegido** — resultado do humor só é revelado depois que todos responderem; reenvio bloqueado por sessão de browser
- **"✅ Terminei essa parte"** — cada participante sinaliza que concluiu a fase atual; o SM vê um contador `X/Y prontos` em tempo real
- **📌 Parking lot** — FAB flutuante disponível em todas as fases da retro para anotar itens que não se encaixam no momento atual; sincronizado via Firestore para todos
- **Presença contínua** — o heartbeat de presença persiste durante toda a retro (não apenas no lobby), capturando entradas tardias nos contadores

### Scrum Master
- **Dashboard do SM** — histórico de todas as retrospectivas, com status (Setup / Em andamento / Concluída) e link de convite
- **Retomada de missões** — a tela de Missões carrega as missões da última retro concluída do mesmo time, com dropdown de status (✅ Feito / 🔄 Em andamento / ⏳ Não feito) persistido no Firestore
- **📊 Tendências** — painel no dashboard com gráfico SVG de humor médio por sprint e taxa de conclusão de missões, além de lista de monstros recorrentes (2+ retros)
- **Timer de fase** — cronômetro controlável por fase, visível para todos os participantes

### Qualidade dos dados
- **`participantCount` dinâmico** — o denominador dos contadores (check-in, "Terminei") acompanha a contagem real de presença em tempo real, mas nunca diminui — evita que quedas momentâneas de rede (celular bloqueado, Wi-Fi instável) revelem prematuramente o resultado do check-in

### UX
- **Fallback mobile para mesclagem de monstros** — botão "🔗 MESCLAR SELECIONADOS" ao selecionar 2 monstros, como alternativa ao drag-and-drop (que não funciona bem em touch)
- **Responsividade mobile** — breakpoints para grids de cards, navbar compacta, phase-nav com wrap e combat-banner em stack vertical em telas < 480px
- **Indicador de progresso** — barra de fases na navbar com dot colorido (cinza / verde / dourado) mostrando em que etapa o time está

### Técnico
- **Sistema de XP** — pontos ganhos a cada contribuição, incrementados atomicamente no Firestore
- **Reações com emoji** — 🔥👀💡 em tesouros e monstros
- **Votação de soluções** — cada solução pode ser votada; votos nunca diminuem (garantido pelas regras do Firestore)
- **Priorização automática de monstros** — ordenação por votos com `priorityRank` persistido
- **Exportação de relatório** — PDF com texto nativo (jsPDF) ou PNG via captura de tela (html2canvas)
- **Sessão compartilhável** — URL com `?s=<id>` para o time entrar diretamente
- **Persistência local** — estado em `localStorage`; "Continuar Jornada" retoma de onde parou
- **Indicador de digitação** — mostra quando alguém está escrevendo em campos colaborativos

## 🏆 Sistema de XP

| Ação | XP |
|---|---|
| Check-in realizado | +10 XP |
| Tesouro adicionado | +10 XP |
| Reconhecimento adicionado | +10 XP |
| Aprendizado adicionado | +10 XP |
| Monstro identificado | +10 XP |
| Solução proposta | +20 XP |
| Missão criada | +30 XP |

## 🚀 Como Rodar

### Pré-requisitos

- [Node.js](https://nodejs.org/) 18+
- npm

### Instalação

```bash
npm install
```

### Desenvolvimento

```bash
npm run dev
```

Acesse em `http://localhost:5173`

### Build para Produção

```bash
npm run build
```

Os arquivos gerados ficarão na pasta `dist/`.

### Preview do Build

```bash
npm run preview
```

### Testes

```bash
# Executa todos os testes uma vez
npm test

# Modo watch (re-executa ao salvar)
npm run test:watch

# Com relatório de cobertura
npm run test:coverage

# Testes E2E (requer emuladores Firebase rodando)
npm run test:e2e
```

### Lint

```bash
npm run lint
```

## 🔥 Configuração do Firebase

O app sincroniza estado em tempo real via **Cloud Firestore**. Configure as variáveis de ambiente antes de rodar:

```bash
cp .env.example .env
# Edite .env com os valores do seu projeto Firebase
```

### Variáveis de Ambiente

| Variável | Descrição |
|---|---|
| `VITE_FIREBASE_API_KEY` | Chave de API do Firebase |
| `VITE_FIREBASE_AUTH_DOMAIN` | Domínio de autenticação |
| `VITE_FIREBASE_PROJECT_ID` | ID do projeto Firebase |
| `VITE_FIREBASE_STORAGE_BUCKET` | Bucket do Storage |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ID do sender de mensagens |
| `VITE_FIREBASE_APP_ID` | ID do app Web |

> **Como obter esses valores:** acesse o [Firebase Console](https://console.firebase.google.com) → Configurações do projeto → Seus apps → App Web → `firebaseConfig`.

### Publicar as Regras de Segurança do Firestore

As regras de segurança estão em [`firestore.rules`](firestore.rules) e **precisam ser deployadas** para o seu projeto — caso contrário o Firestore usará as regras padrão (que bloqueiam tudo após 30 dias em modo teste).

> **Atenção:** sem este passo, o app receberá erros `permission-denied` ao tentar ler ou escrever no Firestore.

#### Deploy automático via CI (recomendado)

O workflow [`deploy.yml`](.github/workflows/deploy.yml) publica as regras automaticamente sempre que `firestore.rules` é alterado no `main`. Para isso funcionar, adicione o secret `FIREBASE_SERVICE_ACCOUNT` no repositório do GitHub:

1. Acesse o [Firebase Console](https://console.firebase.google.com) → **Configurações do projeto** → **Contas de serviço**
2. Clique em **Gerar nova chave privada** → baixe o arquivo JSON
3. No GitHub: **Settings → Secrets and variables → Actions → New repository secret**
   - Nome: `FIREBASE_SERVICE_ACCOUNT`
   - Valor: cole o conteúdo completo do JSON baixado

A partir do próximo push que alterar `firestore.rules`, o CI fará o deploy automaticamente.

#### Deploy manual (primeira vez ou emergência)

```bash
# Instale a Firebase CLI (se ainda não tiver)
npm install -g firebase-tools

# Faça login
firebase login

# Associe ao seu projeto (só na primeira vez)
firebase use --add

# Publique as regras
firebase deploy --only firestore:rules
```

## 🏗️ Arquitetura

### Modelo de Dados (Firestore)

```
sessions/{sessionId}                 ← documento raiz (fases, sprint, time, XP,
│                                       combatMonsterIdx, combatStrategy,
│                                       readySignals, parkingLot)
├── checkins/{itemId}                ← check-ins dos participantes
├── treasures/{itemId}               ← tesouros com reações
├── monsters/{itemId}                ← monstros com reações, prioridade e merges
├── solutions/{itemId}               ← soluções propostas com votos
├── missions/{itemId}                ← action items (inclui campo status para retomada)
├── presence/{deviceId}              ← presença com heartbeat + TTL
└── typing/{deviceId}                ← indicador de digitação em tempo real

smProfiles/{uid}                     ← perfil do Scrum Master autenticado
└── sessions/{sessionId}             ← resumo de cada retrospectiva do SM
```

### Controle de Acesso (Firestore Rules)

- Somente o **Scrum Master** (identificado por `smDeviceId`) pode avançar/alterar `currentPhase` e `completedPhases`
- **Check-ins** são imutáveis após criação
- **Tesouros** e **Monstros** permitem apenas atualização de reações/flags específicos
- **Soluções** permitem apenas incremento de votos (nunca decremento)
- **Missões** permitem criação, deleção e atualização restrita ao campo `status`
- **Presença** usa TTL: documentos com `expiresAt` expirado são ignorados client-side

### Estrutura do Store (`src/state/store/`)

O store centralizado é dividido em módulos por responsabilidade:

| Módulo | Responsabilidade |
|---|---|
| `session.js` | Estado central, subscribers, fases, XP, bootstrap Firebase |
| `collections.js` | Funções de escrita para subcoleções Firestore |
| `role.js` | Identidade do dispositivo, `isSM`, `getRole`, `setRole` |
| `index.js` | Re-exportação barrel com injeção de contexto |

`src/state/store.js` é um shim de uma linha que re-exporta de `store/index.js` — todos os imports externos continuam funcionando sem mudança.

### Sincronização em Tempo Real

O store gerencia dois fluxos paralelos:

1. **Doc raiz** — subscription ao documento da sessão (fases, sprint, time, XP, estado de combate, sinais de ready, parking lot)
2. **Subcoleções** — subscription individual a cada coleção (checkins, treasures, monsters, solutions, missions)

Writes seguem o padrão de **optimistic update**: o estado local é atualizado imediatamente e o Firestore confirma em segundo plano.

O guard de deduplicação do `subscribeSession` ignora snapshots com `updatedAt` igual ou anterior ao já processado — exceto quando `currentPhase` muda, que sempre é aceito para evitar que dois writes síncronos com o mesmo timestamp (ex: `completePhase` + `setPhase`) bloqueiem a transição de fase nos membros.

### Presença e `participantCount`

O serviço [`presence.js`](src/services/presence.js) usa **heartbeat com TTL**:

- `joinSession()` registra o dispositivo com `expiresAt = agora + 60s`
- Um intervalo de 25s renova `lastSeen` e `expiresAt`
- O heartbeat **não para** ao iniciar a retro — persiste durante todas as fases para capturar entradas tardias
- A contagem filtra client-side: só conta documentos com `expiresAt > Date.now()`
- O SM sincroniza `team.participantCount` sempre que a contagem **sobe** (nunca quando cai), garantindo que quedas momentâneas de rede não reduzam o denominador dos contadores de check-in e "Terminei"

## 🛠️ Tecnologias

| Tecnologia | Versão | Uso |
|---|---|---|
| **Vanilla JavaScript** (ES Modules) | — | Sem frameworks — DOM puro |
| **Vite** | 5.x | Bundler e servidor de desenvolvimento |
| **Firebase / Firestore** | 12.x | Persistência e sincronização em tempo real |
| **Firebase Auth** | 12.x | Autenticação do Scrum Master (Google + e-mail) |
| **jsPDF** | 2.x | Exportação do relatório em PDF com texto nativo |
| **html2canvas** | 1.x | Exportação do relatório como imagem PNG |
| **Vitest** | 4.x | Testes unitários |
| **Playwright** | — | Testes E2E (fluxo completo SM + membro) |
| **ESLint** | 9.x | Linting do código-fonte |

## 📁 Estrutura do Projeto

```
src/
├── components/           # Componentes reutilizáveis
│   ├── modal.js          # Modal de confirmação
│   ├── navbar.js         # Navbar com stepper de fases, XP, presença e conectividade
│   ├── parkingLot.js     # FAB de parking lot (📌 Para depois)
│   ├── phaseTimer.js     # Timer de fase controlável pelo SM
│   ├── typingIndicator.js# Indicador de digitação em tempo real
│   └── xpToast.js        # Toast de notificação de XP e erros
├── screens/              # Telas de cada fase da jornada
│   ├── auth.js           # Login/cadastro do Scrum Master
│   ├── home.js           # Tela inicial
│   ├── roleSelect.js     # Seleção de papel (SM ou time)
│   ├── setup.js          # Configuração da sprint
│   ├── lobby.js          # Sala de espera com presença em tempo real
│   ├── checkin.js        # Check-in emocional (com trava de reenvio e proteção de resultado)
│   ├── treasures.js      # Tesouros da sprint
│   ├── monsters.js       # Monstros da sprint (drag-and-drop + fallback mobile)
│   ├── combat.js         # Combate — soluções, votação e foco sincronizado
│   ├── missions.js       # Missões (action items + retomada da retro anterior)
│   ├── complete.js       # Conclusão e celebração
│   ├── report.js         # Relatório exportável
│   └── smDashboard.js    # Dashboard do SM com histórico e tendências
├── services/             # Serviços e integrações
│   ├── auth.js           # Firebase Authentication
│   ├── firebase.js       # Inicialização e operações do Firestore
│   ├── presence.js       # Presença com heartbeat + TTL
│   ├── stats.js          # Cálculo de estatísticas da sessão
│   ├── xp.js             # Regras de XP por ação
│   └── export.js         # Exportação em PDF e PNG
├── state/
│   ├── store.js          # Shim de re-exportação (mantém compatibilidade de imports)
│   └── store/
│       ├── session.js    # Estado central, fases, XP, bootstrap
│       ├── collections.js# Writes de subcoleções Firestore
│       ├── role.js       # Identidade do dispositivo e papel
│       └── index.js      # Barrel com injeção de contexto
├── styles/               # CSS global e por componente
│   ├── main.css          # Estilos base, variáveis e classes utilitárias
│   ├── components.css    # Componentes reutilizáveis
│   ├── screens.css       # Estilos por tela
│   └── animations.css    # Animações
├── tests/                # Testes unitários (Vitest)
│   ├── xp.test.js
│   ├── stats.test.js
│   ├── store.test.js
│   ├── dom.test.js
│   └── format.test.js
├── utils/
│   ├── dom.js            # Utilitários de DOM (escapeHTML, buildReadySignalHTML…)
│   └── format.js         # Formatação de datas, XP, labels
└── main.js               # Entry point — router entre as telas

e2e/                      # Testes E2E (Playwright)
├── fixtures.js           # Fixture twoParticipants (SM + membro)
└── session.spec.js       # Cenários: lobby, check-in, avanço de fase, permissões
```

## 💾 Persistência

O estado da sessão é salvo automaticamente no `localStorage` como cache local. Ao reabrir a aplicação:

- Se houver uma sessão salva, o botão **"Continuar Jornada"** fica disponível
- Se a URL contiver `?s=<id>`, a sessão é carregada diretamente do Firestore
- O estado remoto prevalece sobre o cache local quando há snapshots mais recentes

## 📄 Licença

MIT
