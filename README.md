# ⚔️ Jornada da Sprint

Uma ferramenta de retrospectiva Scrum gamificada, onde o time embarca em uma jornada épica para refletir sobre a sprint de forma dinâmica e envolvente.

## 🎮 Sobre o Projeto

O **Jornada da Sprint** transforma a retrospectiva tradicional em uma aventura em fases, com sistema de XP, tesouros, monstros e missões. Cada etapa representa uma dimensão diferente da retrospectiva, tornando o processo mais engajante para o time.

## 🗺️ Fases da Jornada

| Fase | Descrição |
|---|---|
| ⚙️ **Setup** | Configuração da sprint e do time |
| ✅ **Check-in** | Como cada pessoa chegou na retrospectiva |
| 💎 **Tesouros** | O que foi bem na sprint (pontos positivos) |
| 👹 **Monstros** | O que atrapalhou ou poderia melhorar |
| ⚔️ **Combate** | Discussão e votação das soluções para os monstros |
| 🎯 **Missões** | Definição dos action items para a próxima sprint |
| 🏆 **Conclusão** | Encerramento e celebração da jornada |
| 📊 **Relatório** | Exportação do resumo da retrospectiva em PDF |

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

## 🔥 Firebase / Firestore

O app sincroniza estado em tempo real via **Cloud Firestore**. Configure as variáveis de ambiente antes de rodar:

```bash
cp .env.example .env
# edite .env com os valores do seu projeto Firebase
```

### Publicar as regras de segurança do Firestore

As regras de segurança estão em [`firestore.rules`](firestore.rules). Elas **precisam ser deployadas** para o seu projeto Firebase — caso contrário o Firestore usará as regras padrão (que bloqueiam tudo após 30 dias em modo teste).

```bash
# instale a Firebase CLI se ainda não tiver
npm install -g firebase-tools

# faça login
firebase login

# associe ao seu projeto (só na primeira vez)
firebase use --add

# publique as regras
firebase deploy --only firestore:rules
```

> **Atenção:** sem este passo, o app receberá erros `permission-denied` ao tentar ler ou escrever no Firestore.

## 🛠️ Tecnologias

- **Vanilla JavaScript** (ES Modules) — sem frameworks
- **Vite** — bundler e servidor de desenvolvimento
- **Firebase / Firestore** — persistência e sincronização em tempo real
- **jsPDF** — exportação do relatório em PDF com texto nativo
- **LocalStorage** — cache local da sessão

## 📁 Estrutura do Projeto

```
src/
├── components/       # Componentes reutilizáveis (navbar, modal, toast)
├── screens/          # Telas de cada fase da jornada
├── services/         # Serviços (XP, stats, exportação)
├── state/            # Store centralizado com persistência
├── styles/           # CSS global, componentes e animações
└── utils/            # Utilitários de DOM e formatação
```

## 💾 Persistência

O estado da sessão é salvo automaticamente no `localStorage` do navegador. Ao reabrir a aplicação, é possível continuar de onde parou através do botão **"Continuar Jornada"**.

## 📄 Licença

MIT
