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
| ⚙️ **Setup** | `setup` | Scrum Master configura o nome da sprint, datas e time |
| 🚪 **Lobby** | `lobby` | Sala de espera com presença em tempo real enquanto todos entram |
| ✅ **Check-in** | `checkin` | Cada pessoa registra como chegou na retro (humor de 1 a 5) |
| 💎 **Tesouros** | `treasures` | O que foi bem — pontos positivos, reconhecimentos e aprendizados |
| 👹 **Monstros** | `monsters` | O que atrapalhou ou pode melhorar — com reações e votação |
| ⚔️ **Combate** | `combat` | Discussão e proposição de soluções para os monstros priorizados |
| 🎯 **Missões** | `missions` | Definição dos action items para a próxima sprint |
| 🏆 **Conclusão** | `complete` | Encerramento, celebração e resumo da jornada |
| 📊 **Relatório** | `report` | Exportação do resumo completo da retrospectiva em PDF ou PNG |

## ✨ Funcionalidades

- **Multiplayer em tempo real** — todos os participantes veem as atualizações instantaneamente via Firestore
- **Controle de papéis** — apenas o Scrum Master avança as fases; o time participa sem controle sobre o fluxo
- **Sistema de XP** — pontos de experiência são ganhos a cada contribuição (check-in, tesouros, soluções, missões)
- **Reações** — participantes podem reagir com emojis (🔥👀💡) em tesouros e monstros
- **Votação de soluções** — cada solução proposta pode ser votada pelo time
- **Priorização automática de monstros** — ordenação por votos com `priorityRank` persistido no Firestore
- **Presença no lobby** — contador de participantes ativos com heartbeat e TTL (sem Realtime Database)
- **Histórico do browser** — navegação com botão Voltar/Avançar do browser funciona para o Scrum Master
- **Persistência local** — estado salvo no `localStorage`; o botão "Continuar Jornada" retoma de onde parou
- **Exportação de relatório** — PDF com texto nativo (jsPDF) ou PNG via captura de tela (html2canvas)
- **Sessão compartilhável** — URL com `?s=<id>` para o time entrar diretamente na sessão

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

> **Atenção:** sem este passo, o app receberá erros `permission-denied` ao tentar ler ou escrever no Firestore.

## 🏗️ Arquitetura

### Modelo de Dados (Firestore)

```
sessions/{sessionId}                 ← documento raiz (fases, sprint, time, XP)
  └── checkins/{itemId}              ← check-ins dos participantes
  └── treasures/{itemId}             ← tesouros com reações
  └── monsters/{itemId}              ← monstros com reações e prioridade
  └── solutions/{itemId}             ← soluções propostas com votos
  └── missions/{itemId}              ← action items da próxima sprint
  └── presence/{deviceId}            ← presença no lobby (heartbeat + TTL)
```

### Controle de Acesso (Firestore Rules)

- Somente o **Scrum Master** (identificado por `smDeviceId`) pode avançar/alterar `currentPhase` e `completedPhases`
- **Check-ins** são imutáveis após criação
- **Tesouros** e **Monstros** permitem apenas atualização de reações
- **Soluções** permitem apenas incremento de votos (nunca decremento)
- **Missões** permitem criação e deleção (o SM pode remover)
- **Presença** usa TTL: documentos com `expiresAt` expirado são ignorados client-side

### Sincronização em Tempo Real

O [`store.js`](src/state/store.js) gerencia dois fluxos paralelos:

1. **Doc raiz** — subscription ao documento da sessão (fases, sprint, time, XP)
2. **Subcoleções** — subscription individual a cada coleção (checkins, treasures, monsters, solutions, missions)

Writes seguem o padrão de **optimistic update**: o estado local é atualizado imediatamente e o Firestore confirma em segundo plano.

### Presença no Lobby

O serviço [`presence.js`](src/services/presence.js) usa uma estratégia de **heartbeat com TTL**:

- `joinSession()` registra o dispositivo com `expiresAt = agora + 60s`
- Um intervalo de 25s renova `lastSeen` e `expiresAt`
- A contagem de participantes filtra client-side: só conta documentos com `expiresAt > Date.now()`
- Se o usuário fechar a aba sem logout, a presença expira automaticamente em até 60s

## 🛠️ Tecnologias

| Tecnologia | Versão | Uso |
|---|---|---|
| **Vanilla JavaScript** (ES Modules) | — | Sem frameworks — DOM puro |
| **Vite** | 5.x | Bundler e servidor de desenvolvimento |
| **Firebase / Firestore** | 12.x | Persistência e sincronização em tempo real |
| **jsPDF** | 2.x | Exportação do relatório em PDF com texto nativo |
| **html2canvas** | 1.x | Exportação do relatório como imagem PNG |
| **Vitest** | 4.x | Testes unitários |
| **ESLint** | 9.x | Linting do código-fonte |

## 📁 Estrutura do Projeto

```
src/
├── components/       # Componentes reutilizáveis
│   ├── modal.js      # Modal de confirmação
│   ├── navbar.js     # Barra de navegação com XP e fase atual
│   └── xpToast.js    # Toast de notificação de XP e erros
├── screens/          # Telas de cada fase da jornada
│   ├── home.js       # Tela inicial
│   ├── roleSelect.js # Seleção de papel (SM ou time)
│   ├── setup.js      # Configuração da sprint
│   ├── lobby.js      # Sala de espera com presença em tempo real
│   ├── checkin.js    # Check-in emocional
│   ├── treasures.js  # Tesouros da sprint
│   ├── monsters.js   # Monstros da sprint
│   ├── combat.js     # Combate — soluções e votação
│   ├── missions.js   # Missões (action items)
│   ├── complete.js   # Conclusão e celebração
│   └── report.js     # Relatório exportável
├── services/         # Serviços e integrações
│   ├── firebase.js   # Inicialização e operações do Firestore
│   ├── presence.js   # Presença no lobby (heartbeat + TTL)
│   ├── stats.js      # Cálculo de estatísticas da sessão
│   ├── xp.js         # Regras de XP por ação
│   └── export.js     # Exportação em PDF e PNG
├── state/
│   └── store.js      # Store centralizado com sincronização Firestore
├── styles/           # CSS global e por componente
│   ├── main.css      # Estilos base e variáveis
│   ├── components.css
│   ├── screens.css
│   └── animations.css
├── tests/            # Testes unitários (Vitest)
│   ├── xp.test.js
│   ├── stats.test.js
│   ├── store.test.js
│   ├── dom.test.js
│   └── format.test.js
├── utils/
│   ├── dom.js        # Utilitários de manipulação de DOM
│   └── format.js     # Formatação de datas, XP, labels
└── main.js           # Entry point — router entre as telas
```

## 💾 Persistência

O estado da sessão é salvo automaticamente no `localStorage` como cache local. Ao reabrir a aplicação:

- Se houver uma sessão salva, o botão **"Continuar Jornada"** fica disponível
- Se a URL contiver `?s=<id>`, a sessão é carregada diretamente do Firestore
- O estado remoto sempre prevalece sobre o cache local quando há conflito de timestamp

## 📄 Licença

MIT
