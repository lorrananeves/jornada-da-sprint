(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))a(s);new MutationObserver(s=>{for(const i of s)if(i.type==="childList")for(const r of i.addedNodes)r.tagName==="LINK"&&r.rel==="modulepreload"&&a(r)}).observe(document,{childList:!0,subtree:!0});function n(s){const i={};return s.integrity&&(i.integrity=s.integrity),s.referrerPolicy&&(i.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?i.credentials="include":s.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function a(s){if(s.ep)return;s.ep=!0;const i=n(s);fetch(s.href,i)}})();const w="jornada_sprint_session",D=()=>({sprint:{name:"",startDate:"",endDate:""},team:{name:"",participantCount:""},currentPhase:"home",xp:0,checkins:[],treasures:[],monsters:[],solutions:[],missions:[],completedPhases:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});let y=D();const P=new Set;function re(){try{const e=localStorage.getItem(w);if(e){const t=JSON.parse(e);y={...D(),...t}}}catch(e){console.warn("Could not load saved session:",e)}}function oe(){try{y.updatedAt=new Date().toISOString(),localStorage.setItem(w,JSON.stringify(y))}catch(e){console.warn("Could not save session:",e)}}function Q(){for(const e of P)e({...y})}function Z(e){return P.add(e),()=>P.delete(e)}function f(){return{...y}}function le(){return!!localStorage.getItem(w)}function b(e){typeof e=="function"?y={...y,...e(y)}:y={...y,...e},oe(),Q()}function m(e){b({currentPhase:e})}function E(e){b(t=>({completedPhases:t.completedPhases.includes(e)?t.completedPhases:[...t.completedPhases,e]}))}function L(e){return b(t=>({xp:t.xp+e})),e}function ce(e){b(t=>({checkins:[...t.checkins,e]}))}function de(e){b(t=>({treasures:[...t.treasures,e]}))}function pe(e,t){b(n=>({treasures:n.treasures.map(a=>a.id===e?{...a,reactions:{...a.reactions,[t]:(a.reactions[t]||0)+1}}:a)}))}function ue(e){b(t=>({monsters:[...t.monsters,e]}))}function me(e,t){b(n=>({monsters:n.monsters.map(a=>a.id===e?{...a,reactions:{...a.reactions,[t]:(a.reactions[t]||0)+1}}:a)}))}function ve(e){b(t=>({monsters:t.monsters.map(n=>n.id===e?{...n,selected:!n.selected}:n)}))}function be(){b(e=>({monsters:[...e.monsters].sort((t,n)=>(n.reactions.fire||0)-(t.reactions.fire||0))}))}function fe(e){b(t=>({solutions:[...t.solutions,e]}))}function ge(e){b(t=>({solutions:t.solutions.map(n=>n.id===e?{...n,votes:(n.votes||0)+1}:n)}))}function he(e){b(t=>({missions:[...t.missions,e]}))}function ye(e){b(t=>({missions:t.missions.filter(n=>n.id!==e)}))}function F(){y=D(),localStorage.removeItem(w),Q()}re();const j=(e,t=document)=>t.querySelector(e);function T(){return Math.random().toString(36).slice(2,10)+Date.now().toString(36)}const xe=[{id:"home",label:"Início",emoji:"🏠"},{id:"setup",label:"Setup",emoji:"⚙️"},{id:"checkin",label:"Check-in",emoji:"🌡️"},{id:"treasures",label:"Tesouros",emoji:"💎"},{id:"monsters",label:"Monstros",emoji:"👹"},{id:"combat",label:"Combate",emoji:"🛡️"},{id:"missions",label:"Missões",emoji:"🚀"},{id:"complete",label:"Conclusão",emoji:"🏆"},{id:"report",label:"Relatório",emoji:"📋"}];function B(){const e=j("#navbar-root");if(!e)return;const t=f(),{currentPhase:n,xp:a,completedPhases:s}=t;if(n==="home"){e.innerHTML="";return}e.innerHTML=`
    <nav class="navbar">
      <div class="navbar-inner">
        <div class="navbar-top">
          <span class="navbar-brand">⚔️ Jornada da Sprint</span>
          <span class="xp-badge">⭐ ${a.toLocaleString("pt-BR")} XP</span>
        </div>
        <div class="progress-bar-track" role="progressbar">
          ${xe.map((i,r)=>{const o=i.id===n,d=s.includes(i.id);let p="phase-step";return o?p+=" active":d&&(p+=" completed"),`
              <div class="${p}" data-phase="${i.id}" title="${i.emoji} ${i.label}">
                <div class="phase-step-dot"></div>
                <span class="phase-step-label">${i.label}</span>
              </div>
            `}).join("")}
        </div>
      </div>
    </nav>
  `,e.querySelectorAll(".phase-step").forEach(i=>{i.addEventListener("click",()=>{const r=i.dataset.phase,o=f();(o.completedPhases.includes(r)||r===o.currentPhase)&&m(r)})})}function Se(){B(),Z(B)}let A=null;function O({title:e,body:t,confirmLabel:n="Confirmar",cancelLabel:a="Cancelar",confirmClass:s="btn btn-danger"}){return new Promise(i=>{q();const r=document.createElement("div");r.className="modal-backdrop",r.innerHTML=`
      <div class="modal" role="dialog" aria-modal="true">
        <h3 class="modal-title">${e}</h3>
        <p class="modal-body">${t}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="modal-cancel">${a}</button>
          <button class="${s}" id="modal-confirm">${n}</button>
        </div>
      </div>
    `,r.querySelector("#modal-cancel").addEventListener("click",()=>{q(),i(!1)}),r.querySelector("#modal-confirm").addEventListener("click",()=>{q(),i(!0)}),r.addEventListener("click",d=>{d.target===r&&(q(),i(!1))}),j("#modal-root").appendChild(r),A=r})}function q(){A&&(A.remove(),A=null)}function $e(e){const t=le();e.innerHTML=`
    <div class="screen-home">
      <div class="home-card screen-enter">
        <div class="home-logo">⚔️</div>
        <h1 class="home-title">JORNADA DA SPRINT</h1>
        <p class="home-subtitle">Uma retrospectiva diferente começa aqui.</p>
        <div class="home-actions">
          <button class="btn btn-primary btn-lg" id="btn-start">🚀 COMEÇAR JORNADA</button>
          <button class="btn btn-ghost btn-lg" id="btn-continue" ${t?"":"disabled"}>
            ⏩ CONTINUAR JORNADA
          </button>
          ${t?'<button class="btn btn-danger btn-sm" id="btn-reset">🗑️ APAGAR TODOS OS DADOS</button>':""}
        </div>
      </div>
    </div>
  `,e.querySelector("#btn-start").addEventListener("click",async()=>{if(t){if(!await O({title:"⚠️ Nova Jornada",body:"Isso irá apagar todos os dados da sessão atual. Tem certeza?",confirmLabel:"Sim, nova jornada",confirmClass:"btn btn-danger"}))return;F()}b({currentPhase:"setup",createdAt:new Date().toISOString()})});const n=e.querySelector("#btn-continue");n&&!n.disabled&&n.addEventListener("click",()=>{const s=f();m(s.currentPhase&&s.currentPhase!=="home"?s.currentPhase:"setup")});const a=e.querySelector("#btn-reset");a&&a.addEventListener("click",async()=>{await O({title:"🗑️ Apagar Todos os Dados",body:"Esta ação irá remover permanentemente todos os dados da sessão. Deseja continuar?",confirmLabel:"Apagar tudo",confirmClass:"btn btn-danger"})&&F()})}function Ee(e){const t=f(),n=t.sprint,a=t.team;e.innerHTML=`
    <div class="screen-setup screen-enter">
      <div class="phase-header">
        <div class="phase-header-top">
          <span class="phase-icon">⚙️</span>
          <h2 class="phase-title">Configurar a Jornada</h2>
        </div>
        <p class="phase-description">Defina as informações básicas antes de começar a retrospectiva.</p>
      </div>

      <div class="card">
        <h3 style="margin-bottom:20px">📋 Dados da Sprint</h3>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="form-group">
            <label class="form-label" for="sprint-name">Nome da Sprint *</label>
            <input class="form-input" type="text" id="sprint-name" placeholder="Ex: Sprint 42"
              value="${n.name||""}" required />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="start-date">Data de Início</label>
              <input class="form-input" type="date" id="start-date" value="${n.startDate||""}" />
            </div>
            <div class="form-group">
              <label class="form-label" for="end-date">Data de Fim</label>
              <input class="form-input" type="date" id="end-date" value="${n.endDate||""}" />
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <h3 style="margin-bottom:20px">👥 Dados do Time</h3>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="form-group">
            <label class="form-label" for="team-name">Nome do Time</label>
            <input class="form-input" type="text" id="team-name" placeholder="Ex: Time Fênix"
              value="${a.name||""}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="participant-count">Número de Participantes</label>
            <input class="form-input" type="number" id="participant-count" placeholder="Ex: 8" min="1"
              value="${a.participantCount||""}" />
          </div>
        </div>
      </div>

      <div class="phase-nav">
        <button class="btn btn-ghost" id="btn-back">← Voltar</button>
        <button class="btn btn-primary" id="btn-start-journey">⚔️ INICIAR JORNADA</button>
      </div>

      <p class="text-muted" style="margin-top:10px;font-size:0.8125rem;text-align:right">* Campo obrigatório</p>
    </div>
  `,e.querySelector("#btn-back").addEventListener("click",()=>m("home")),e.querySelector("#btn-start-journey").addEventListener("click",()=>{const s=e.querySelector("#sprint-name").value.trim();if(!s){e.querySelector("#sprint-name").focus(),e.querySelector("#sprint-name").style.borderColor="var(--danger)";return}b({sprint:{name:s,startDate:e.querySelector("#start-date").value,endDate:e.querySelector("#end-date").value},team:{name:e.querySelector("#team-name").value.trim(),participantCount:e.querySelector("#participant-count").value}}),E("setup"),m("checkin")})}const $={CHECKIN:10,TREASURE:10,RECOGNITION:10,LEARNING:10,MONSTER:10,SOLUTION:20,MISSION:30};function _(){return $.CHECKIN}function ke(e){return{treasure:$.TREASURE,recognition:$.RECOGNITION,learning:$.LEARNING}[e]??$.TREASURE}function U(){return $.MONSTER}function X(){return $.SOLUTION}function G(){return $.MISSION}function Y(e){const t=e.length;if(!t)return{distribution:{},average:0,total:0};const n={1:0,2:0,3:0,4:0,5:0};let a=0;for(const s of e)n[s.score]=(n[s.score]||0)+1,a+=s.score;return{distribution:n,average:a/t,total:t}}function z(e){return e>=4.5?{label:"Excelente 🤩",color:"var(--success)"}:e>=3.5?{label:"Bom 🙂",color:"var(--success)"}:e>=2.5?{label:"Neutro 😐",color:"var(--accent)"}:e>=1.5?{label:"Ruim 😕",color:"var(--danger)"}:{label:"Muito Ruim 😫",color:"var(--danger)"}}function ee(e){const t=e.treasures.filter(u=>u.category==="treasure").length,n=e.treasures.filter(u=>u.category==="recognition").length,a=e.treasures.filter(u=>u.category==="learning").length,s=e.monsters.length,i=e.monsters.filter(u=>u.selected).length,r=e.solutions.length,o=e.missions.length,d=Y(e.checkins),p=e.missions.filter(u=>u.priority==="high").length,l=e.missions.filter(u=>u.priority==="medium").length,h=e.missions.filter(u=>u.priority==="low").length;return{treasureCount:t,recognitionCount:n,learningCount:a,monsterCount:s,selectedMonsterCount:i,solutionCount:r,missionCount:o,checkinStats:d,highPriority:p,medPriority:l,lowPriority:h,totalXP:e.xp}}let I=null;function C(e,t=""){const n=j("#toast-root");if(!n)return;n.innerHTML="",I&&clearTimeout(I);const a=document.createElement("div");a.className="xp-toast xp-toast-enter",a.innerHTML=`
    <span class="xp-toast-icon">⭐</span>
    <span>+${e} XP${t?` — ${t}`:""}</span>
  `,n.appendChild(a),I=setTimeout(()=>{a.classList.remove("xp-toast-enter"),a.classList.add("xp-toast-exit"),setTimeout(()=>{n.contains(a)&&n.removeChild(a)},350)},2500)}function M(e){if(!e)return"—";const[t,n,a]=e.split("-");return`${a}/${n}/${t}`}function Le(e){return e?new Date(e).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"}):"—"}function Ce(e){return e==null?"0":Number(e).toLocaleString("pt-BR")}function te(e){return`${Ce(e)} XP`}const Re={1:"😫",2:"😕",3:"😐",4:"🙂",5:"🤩"};function N(e){return Re[e]||"❓"}function qe(e){return{1:"Muito ruim",2:"Ruim",3:"Neutro",4:"Bom",5:"Excelente"}[e]||""}function se(e){return{high:"Alta",medium:"Média",low:"Baixa"}[e]||e}function H(e){return{prevent:"🛡️ Prevenir",reduce:"🧪 Reduzir Impacto",handle:"🤝 Lidar Melhor"}[e]||e}const V=[1,2,3,4,5];function Ae(e){f();let t=null;function n(){return`
      <div class="checkin-form">
        <h3 style="margin-bottom:18px">🌡️ Como foi essa Sprint para você?</h3>
        <div class="checkin-score-section">
          <p class="text-muted mb-2" style="font-size:0.875rem">Selecione uma nota:</p>
          <div class="score-buttons">
            ${V.map(r=>`
              <button class="score-btn ${t===r?"selected":""}" data-score="${r}" title="${qe(r)}">
                <span style="font-size:1.5rem">${N(r)}</span>
                <span style="font-size:0.75rem;font-weight:600;color:var(--text-muted)">${r}</span>
              </button>
            `).join("")}
          </div>
        </div>
        <div class="form-group" style="margin-top:16px">
          <label class="form-label" for="checkin-comment">Comentário (opcional)</label>
          <textarea class="form-textarea" id="checkin-comment" placeholder="Compartilhe algo de forma anônima..."></textarea>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button class="btn btn-primary" id="btn-register" ${t?"":"disabled"}>
            ✅ REGISTRAR RESPOSTA
          </button>
        </div>
      </div>
    `}function a(){const r=f().checkins,{distribution:o,average:d,total:p}=Y(r),l=z(d),h=r.filter(v=>v.comment).map(v=>v.comment),u=V.map(v=>{const S=o[v]||0,R=p>0?Math.round(S/p*100):0;return`
        <div class="stat-bar-row">
          <span class="stat-bar-label">${N(v)}</span>
          <div class="stat-bar-track">
            <div class="stat-bar-fill" style="width:${R}%"></div>
          </div>
          <span class="stat-bar-count">${S}</span>
        </div>
      `}).join(""),g=h.length?`<div class="checkin-comments">
          <h4 style="margin-bottom:12px">💬 Comentários anônimos</h4>
          ${h.map(v=>`<div class="checkin-comment-item">"${v}"</div>`).join("")}
        </div>`:"";return`
      <div class="checkin-results card">
        <div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <h3 style="margin-bottom:16px">📊 Resultado do Check-in</h3>
            ${u}
          </div>
          <div style="display:flex;flex-direction:column;gap:12px;min-width:140px">
            <div style="text-align:center;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px">
              <div style="font-size:2rem;font-weight:800;color:${l.color}">${d.toFixed(1)}</div>
              <div style="font-size:0.8125rem;color:var(--text-muted)">Média</div>
            </div>
            <div style="text-align:center;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px">
              <div style="font-size:2rem;font-weight:800;color:var(--info)">${p}</div>
              <div style="font-size:0.8125rem;color:var(--text-muted)">Respostas</div>
            </div>
            <div style="text-align:center;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px">
              <div style="font-size:1rem;font-weight:700;color:${l.color}">${l.label}</div>
            </div>
          </div>
        </div>
        ${g}
      </div>
    `}function s(){const r=f().checkins;e.innerHTML=`
      <div class="screen-checkin screen-enter">
        <div class="phase-header">
          <div class="phase-header-top">
            <span class="phase-icon">🌡️</span>
            <h2 class="phase-title">Check-in da Equipe</h2>
          </div>
          <p class="phase-description">
            Como cada pessoa está se sentindo sobre essa Sprint? Respostas anônimas.
          </p>
        </div>

        <div id="checkin-form-area">
          ${n()}
        </div>

        ${r.length>0?`
          <div style="margin-top:8px;display:flex;justify-content:flex-end">
            <button class="btn btn-ghost btn-sm" id="btn-show-results">
              📊 VER RESULTADO (${r.length} resposta${r.length!==1?"s":""})
            </button>
          </div>
          <div id="results-area"></div>
        `:""}

        <div class="phase-nav">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
          <button class="btn btn-primary" id="btn-next">💎 PRÓXIMA FASE →</button>
        </div>
      </div>
    `,i()}function i(){e.querySelectorAll(".score-btn").forEach(d=>{d.addEventListener("click",()=>{t=parseInt(d.dataset.score),e.querySelectorAll(".score-btn").forEach(l=>l.classList.remove("selected")),d.classList.add("selected");const p=e.querySelector("#btn-register");p&&(p.disabled=!1)})});const r=e.querySelector("#btn-register");r&&r.addEventListener("click",()=>{if(!t)return;const d=e.querySelector("#checkin-comment").value.trim()||null;ce({score:t,comment:d}),L(_()),C(_(),"Check-in registrado"),t=null,s()});const o=e.querySelector("#btn-show-results");o&&o.addEventListener("click",()=>{const d=e.querySelector("#results-area");d.innerHTML?(d.innerHTML="",o.textContent=`📊 VER RESULTADO (${f().checkins.length} respostas)`):(d.innerHTML=a(),o.textContent="🔼 OCULTAR RESULTADO")}),e.querySelector("#btn-back").addEventListener("click",()=>m("setup")),e.querySelector("#btn-next").addEventListener("click",()=>{E("checkin"),m("treasures")})}s()}const Me=[{id:"treasure",emoji:"💎",label:"Tesouro",question:"O que funcionou bem nessa Sprint?"},{id:"recognition",emoji:"❤️",label:"Reconhecimento",question:"Quem ou o que merece um agradecimento?"},{id:"learning",emoji:"🧠",label:"Descoberta",question:"O que aprendemos nessa Sprint?"}],we=[{key:"heart",label:"❤️"},{key:"thumbs",label:"👍"},{key:"bulb",label:"💡"}];function Te(e,t){const n=t.filter(s=>s.category===e.id),a=document.createElement("div");return a.dataset.category=e.id,a.innerHTML=`
    <div class="treasure-column-header">
      <span>${e.emoji}</span>
      <span>${e.label}</span>
      <span class="badge badge-info" style="margin-left:auto">${n.length}</span>
    </div>
    <div class="treasure-add-form">
      <p class="text-muted" style="font-size:0.8125rem;margin-bottom:8px">${e.question}</p>
      <textarea class="form-textarea treasure-input" placeholder="Escreva aqui..." style="width:100%;min-height:64px" data-cat="${e.id}"></textarea>
      <button class="btn btn-success btn-sm btn-full" style="margin-top:8px" data-add="${e.id}">
        + Adicionar
      </button>
    </div>
    <div class="treasure-cards-list" id="list-${e.id}">
      ${n.length===0?`<div class="empty-state"><div class="empty-state-icon">${e.emoji}</div><p class="empty-state-text">Nenhum item ainda</p></div>`:""}
    </div>
  `,n.forEach(s=>{const i=document.createElement("div");i.className="card card-sm card-appear",i.innerHTML=`
      <div class="card-header">
        <span class="card-emoji">${e.emoji}</span>
        <span class="card-text">${s.text}</span>
      </div>
      <div class="card-reactions">
        ${we.map(r=>`
          <button class="reaction-btn" data-id="${s.id}" data-reaction="${r.key}">
            ${r.label} <span>${s.reactions[r.key]||0}</span>
          </button>
        `).join("")}
      </div>
    `,a.querySelector(`#list-${e.id}`).appendChild(i)}),a}function Ie(e){function t(){const n=f();e.innerHTML=`
      <div class="screen-treasures screen-enter">
        <div class="phase-header">
          <div class="phase-header-top">
            <span class="phase-icon">💎</span>
            <h2 class="phase-title">Tesouros da Sprint</h2>
          </div>
          <p class="phase-description">
            Capture o que funcionou bem, reconhecimentos e aprendizados desta Sprint.
          </p>
        </div>
        <div class="treasure-columns" id="treasure-cols"></div>
        <div class="phase-nav">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
          <button class="btn btn-primary" id="btn-next">👹 PRÓXIMA FASE →</button>
        </div>
      </div>
    `;const a=e.querySelector("#treasure-cols");Me.forEach(s=>{const i=Te(s,n.treasures);a.appendChild(i),i.querySelector(`[data-add="${s.id}"]`).addEventListener("click",()=>{const r=i.querySelector(`.treasure-input[data-cat="${s.id}"]`),o=r.value.trim();if(!o){r.style.borderColor="var(--danger)",r.focus();return}r.style.borderColor="",de({id:T(),text:o,category:s.id,reactions:{heart:0,thumbs:0,bulb:0}});const d=ke(s.id);L(d),C(d,`${s.emoji} ${s.label} adicionado`),r.value="",t()}),i.querySelectorAll(".reaction-btn[data-reaction]").forEach(r=>{r.addEventListener("click",()=>{pe(r.dataset.id,r.dataset.reaction),t()})})}),e.querySelector("#btn-back").addEventListener("click",()=>m("checkin")),e.querySelector("#btn-next").addEventListener("click",()=>{E("treasures"),m("monsters")})}t()}const Pe=["Dependências externas","Problemas técnicos","Comunicação","Falta de clareza","Interrupções","Mudanças de prioridade","Bloqueios","Processos"],Oe=[{key:"fire",label:"🔥",title:"Alto impacto"},{key:"eyes",label:"👀",title:"Precisamos discutir"},{key:"bulb",label:"💡",title:"Tenho uma ideia"}];function Ne(e){const t=document.createElement("div");return t.className=`card card-sm monster-card card-appear${e.selected?" selected-monster":""}`,t.dataset.id=e.id,t.innerHTML=`
    <div class="card-header" style="align-items:flex-start">
      <span class="card-emoji">👹</span>
      <div style="flex:1">
        <span class="card-text">${e.text}</span>
        ${e.selected?'<span class="badge badge-accent" style="margin-top:4px;display:inline-flex">🎯 Selecionado</span>':""}
      </div>
    </div>
    <div class="monster-card-actions">
      ${Oe.map(n=>`
        <button class="reaction-btn" data-id="${e.id}" data-reaction="${n.key}" title="${n.title}">
          ${n.label} <span>${e.reactions[n.key]||0}</span>
        </button>
      `).join("")}
      <button class="btn btn-sm ${e.selected?"btn-danger":"btn-ghost"}" data-select="${e.id}" style="margin-left:auto">
        ${e.selected?"✕ Remover":"🎯 Selecionar"}
      </button>
    </div>
  `,t}function De(e){function t(){const s=f().monsters,i=s.filter(o=>o.selected).length;e.innerHTML=`
      <div class="screen-monsters screen-enter">
        <div class="phase-header">
          <div class="phase-header-top">
            <span class="phase-icon">👹</span>
            <h2 class="phase-title">Monstros da Sprint</h2>
          </div>
          <p class="phase-description">
            O que atrapalhou a equipe? Identifique os problemas e priorize os mais críticos.
          </p>
        </div>

        <div class="card" style="margin-bottom:20px">
          <h4 style="margin-bottom:12px">Adicionar um Monstro</h4>
          <div style="display:flex;gap:8px">
            <textarea class="form-textarea" id="monster-input" placeholder="Descreva um problema que a equipe enfrentou..." style="flex:1;min-height:64px"></textarea>
          </div>
          <div class="chip-group" id="suggestion-chips" style="margin-top:10px">
            ${Pe.map(o=>`<button class="chip" data-suggestion="${o}">${o}</button>`).join("")}
          </div>
          <button class="btn btn-danger btn-sm" id="btn-add-monster" style="margin-top:12px">
            👹 ADICIONAR MONSTRO
          </button>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h4>Monstros identificados <span class="badge badge-info">${s.length}</span></h4>
          <div style="display:flex;gap:8px;align-items:center">
            ${i>0?`<span class="badge badge-accent">🎯 ${i} selecionado${i!==1?"s":""}</span>`:""}
            <button class="btn btn-ghost btn-sm" id="btn-prioritize">🔥 PRIORIZAR AUTOMATICAMENTE</button>
          </div>
        </div>

        <div class="monsters-grid" id="monsters-grid">
          ${s.length===0?'<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">👹</div><p class="empty-state-text">Nenhum monstro ainda. Adicione os problemas da Sprint.</p></div>':""}
        </div>

        <div class="phase-nav">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
          <button class="btn btn-primary" id="btn-next" ${i>0?"":"disabled"}>
            🛡️ IR PARA COMBATE →
          </button>
        </div>
      </div>
    `;const r=e.querySelector("#monsters-grid");s.length>0&&s.forEach(o=>r.appendChild(Ne(o))),n()}function n(){e.querySelectorAll("[data-suggestion]").forEach(a=>{a.addEventListener("click",()=>{const s=e.querySelector("#monster-input");s.value=s.value?`${s.value} ${a.dataset.suggestion}`:a.dataset.suggestion,s.focus()})}),e.querySelector("#btn-add-monster").addEventListener("click",()=>{const a=e.querySelector("#monster-input"),s=a.value.trim();if(!s){a.style.borderColor="var(--danger)",a.focus();return}a.style.borderColor="",ue({id:T(),text:s,reactions:{fire:0,eyes:0,bulb:0},selected:!1}),L(U()),C(U(),"Monstro adicionado"),a.value="",t()}),e.querySelector("#btn-prioritize").addEventListener("click",()=>{be(),t()}),e.querySelectorAll(".reaction-btn[data-reaction]").forEach(a=>{a.addEventListener("click",s=>{s.stopPropagation(),me(a.dataset.id,a.dataset.reaction),t()})}),e.querySelectorAll("[data-select]").forEach(a=>{a.addEventListener("click",s=>{s.stopPropagation(),ve(a.dataset.select),t()})}),e.querySelector("#btn-back").addEventListener("click",()=>m("treasures")),e.querySelector("#btn-next").addEventListener("click",()=>{E("monsters"),m("combat")})}t()}const J=[{id:"prevent",label:"🛡️ PREVENIR",question:"Como podemos evitar que isso aconteça?"},{id:"reduce",label:"🧪 REDUZIR IMPACTO",question:"Se isso acontecer novamente, como podemos diminuir o impacto?"},{id:"handle",label:"🤝 LIDAR MELHOR",question:"O que podemos fazer diferente quando isso acontecer?"}];function je(e){const n=f().monsters.filter(o=>o.selected);let a=0,s="prevent";if(!n.length){e.innerHTML=`
      <div class="screen-combat screen-enter">
        <div class="phase-header">
          <div class="phase-header-top">
            <span class="phase-icon">🛡️</span>
            <h2 class="phase-title">Combate aos Monstros</h2>
          </div>
          <p class="phase-description text-danger">Nenhum monstro foi selecionado. Volte e selecione ao menos um.</p>
        </div>
        <div class="phase-nav">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
        </div>
      </div>
    `,e.querySelector("#btn-back").addEventListener("click",()=>m("monsters"));return}function i(){const o=n[a],d=f().solutions.filter(l=>l.monsterId===o.id&&l.strategy===s),p=J.find(l=>l.id===s);e.innerHTML=`
      <div class="screen-combat screen-enter">
        <div class="phase-header">
          <div class="phase-header-top">
            <span class="phase-icon">🛡️</span>
            <h2 class="phase-title">Combate aos Monstros</h2>
          </div>
          <p class="phase-description">
            Desenvolva estratégias para enfrentar cada monstro identificado.
            (${a+1}/${n.length})
          </p>
        </div>

        <!-- Monster Banner -->
        <div class="combat-monster-banner">
          <span class="combat-monster-icon">👹</span>
          <div>
            <h3 style="color:var(--danger);margin-bottom:4px">${o.text}</h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <span class="badge badge-danger">🔥 ${o.reactions.fire||0} impacto</span>
              <span class="badge badge-info">👀 ${o.reactions.eyes||0} discussões</span>
              <span class="badge badge-accent">💡 ${o.reactions.bulb||0} ideias</span>
            </div>
          </div>
          ${n.length>1?`
            <div style="margin-left:auto;display:flex;gap:8px">
              <button class="btn btn-ghost btn-sm" id="btn-prev-monster" ${a===0?"disabled":""}>← Anterior</button>
              <button class="btn btn-ghost btn-sm" id="btn-next-monster" ${a===n.length-1?"disabled":""}>Próximo →</button>
            </div>
          `:""}
        </div>

        <!-- Strategy Tabs -->
        <div class="tabs" style="margin-bottom:20px">
          ${J.map(l=>`
            <button class="tab-btn ${s===l.id?"active":""}" data-strategy="${l.id}">
              ${l.label}
            </button>
          `).join("")}
        </div>

        <!-- Strategy Content -->
        <div class="card">
          <p class="text-muted" style="margin-bottom:14px;font-size:0.9375rem">${p.question}</p>
          <div style="display:flex;gap:8px">
            <textarea class="form-textarea" id="solution-input" placeholder="Escreva uma ideia de solução..." style="flex:1;min-height:64px"></textarea>
          </div>
          <button class="btn btn-info btn-sm" id="btn-add-solution" style="margin-top:10px">
            + ADICIONAR SOLUÇÃO
          </button>
        </div>

        <!-- Solutions List -->
        ${d.length>0?`
          <div style="margin-top:20px">
            <h4 style="margin-bottom:12px">💡 Soluções propostas — ${H(s)}</h4>
            <div class="solutions-list">
              ${d.map(l=>`
                <div class="solution-card">
                  <span class="solution-text">${l.text}</span>
                  <button class="vote-btn" data-vote="${l.id}">
                    👍 ${l.votes||0}
                  </button>
                  <button class="btn btn-ghost btn-sm" data-to-mission="${l.id}" title="Transformar em Missão">
                    🚀
                  </button>
                </div>
              `).join("")}
            </div>
          </div>
        `:""}

        <div class="phase-nav">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
          <button class="btn btn-primary" id="btn-next">🚀 PRÓXIMA FASE →</button>
        </div>
      </div>
    `,r(o)}function r(o){e.querySelectorAll("[data-strategy]").forEach(l=>{l.addEventListener("click",()=>{s=l.dataset.strategy,i()})}),e.querySelector("#btn-add-solution").addEventListener("click",()=>{const l=e.querySelector("#solution-input"),h=l.value.trim();if(!h){l.style.borderColor="var(--danger)",l.focus();return}l.style.borderColor="",fe({id:T(),monsterId:o.id,text:h,strategy:s,votes:0}),L(X()),C(X(),"Solução adicionada"),l.value="",i()}),e.querySelectorAll("[data-vote]").forEach(l=>{l.addEventListener("click",()=>{ge(l.dataset.vote),i()})}),e.querySelectorAll("[data-to-mission]").forEach(l=>{l.addEventListener("click",()=>{const h=l.dataset.toMission,u=f().solutions.find(g=>g.id===h);u&&(b({_prefillMission:{text:u.text,strategy:u.strategy}}),E("combat"),m("missions"))})});const d=e.querySelector("#btn-prev-monster"),p=e.querySelector("#btn-next-monster");d&&d.addEventListener("click",()=>{a--,i()}),p&&p.addEventListener("click",()=>{a++,i()}),e.querySelector("#btn-back").addEventListener("click",()=>m("monsters")),e.querySelector("#btn-next").addEventListener("click",()=>{E("combat"),m("missions")})}i()}const ze=[{id:"high",label:"Alta",class:"priority-badge-high"},{id:"medium",label:"Média",class:"priority-badge-medium"},{id:"low",label:"Baixa",class:"priority-badge-low"}];function He(e){function t(){const a=f(),s=a.missions,i=a._prefillMission||null,r=s.length>3;e.innerHTML=`
      <div class="screen-missions screen-enter">
        <div class="phase-header">
          <div class="phase-header-top">
            <span class="phase-icon">🚀</span>
            <h2 class="phase-title">Missões da Próxima Sprint</h2>
          </div>
          <p class="phase-description">
            Transforme soluções em compromissos concretos para a próxima Sprint.
          </p>
        </div>

        <div class="warning-banner" style="margin-bottom:16px">
          <span>💡</span>
          <span>Recomendação: Foque nas missões mais impactantes e realistas. Menos missões, melhor execução.</span>
        </div>

        ${r?`
          <div class="warning-banner" style="margin-bottom:16px;border-color:rgba(248,81,73,0.4);background:var(--danger-dim);color:var(--danger)">
            <span>⚠️</span>
            <span><strong>Temos muitas missões!</strong> Quais realmente merecem entrar na próxima Sprint? Considere remover algumas.</span>
          </div>
        `:""}

        <!-- Add Mission Form -->
        <div class="card" style="margin-bottom:20px">
          <h4 style="margin-bottom:16px">+ Nova Missão</h4>
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="form-group">
              <label class="form-label">Título *</label>
              <input class="form-input" type="text" id="mission-title"
                placeholder="Ex: Estabelecer cerimônia de alinhamento semanal"
                value="${i?i.text:""}" />
            </div>
            <div class="form-group">
              <label class="form-label">Descrição</label>
              <textarea class="form-textarea" id="mission-desc" placeholder="Detalhe a missão..." style="min-height:64px"></textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Estratégia</label>
                <select class="form-select" id="mission-strategy">
                  <option value="">— Nenhuma —</option>
                  <option value="prevent" ${i&&i.strategy==="prevent"?"selected":""}>🛡️ Prevenir</option>
                  <option value="reduce" ${i&&i.strategy==="reduce"?"selected":""}>🧪 Reduzir Impacto</option>
                  <option value="handle" ${i&&i.strategy==="handle"?"selected":""}>🤝 Lidar Melhor</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Prioridade</label>
                <select class="form-select" id="mission-priority">
                  <option value="high">🔴 Alta</option>
                  <option value="medium" selected>🟡 Média</option>
                  <option value="low">🟢 Baixa</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Responsável (opcional)</label>
                <input class="form-input" type="text" id="mission-owner" placeholder="Nome ou função" />
              </div>
              <div class="form-group">
                <label class="form-label">Prazo (opcional)</label>
                <input class="form-input" type="date" id="mission-deadline" />
              </div>
            </div>
            <button class="btn btn-primary" id="btn-add-mission">🚀 ADICIONAR MISSÃO</button>
          </div>
        </div>

        <!-- Missions List -->
        ${s.length>0?`
          <div>
            <h4 style="margin-bottom:12px">
              Missões definidas
              <span class="badge badge-info" style="margin-left:8px">${s.length}</span>
            </h4>
            <div class="missions-list">
              ${s.map(o=>{var d;return`
                <div class="card mission-card">
                  <div class="mission-header">
                    <div>
                      <div class="mission-title">🚀 ${o.title}</div>
                      ${o.description?`<p style="font-size:0.875rem;color:var(--text-muted);margin-top:4px">${o.description}</p>`:""}
                    </div>
                    <button class="btn btn-danger btn-sm btn-icon" data-remove="${o.id}" title="Remover missão">🗑️</button>
                  </div>
                  <div class="mission-meta">
                    <span class="badge ${((d=ze.find(p=>p.id===o.priority))==null?void 0:d.class)||"badge-info"}">
                      ${se(o.priority)}
                    </span>
                    ${o.strategy?`<span class="badge badge-info">${H(o.strategy)}</span>`:""}
                    ${o.owner?`<span class="badge" style="background:var(--purple-dim);color:var(--purple)">👤 ${o.owner}</span>`:""}
                    ${o.deadline?`<span class="badge badge-accent">📅 ${M(o.deadline)}</span>`:""}
                  </div>
                </div>
              `}).join("")}
            </div>
          </div>
        `:`
          <div class="empty-state">
            <div class="empty-state-icon">🚀</div>
            <p class="empty-state-text">Nenhuma missão adicionada ainda.</p>
          </div>
        `}

        <div class="phase-nav">
          <button class="btn btn-ghost" id="btn-back">← Voltar</button>
          <button class="btn btn-primary" id="btn-next">🏆 CONCLUIR JORNADA →</button>
        </div>
      </div>
    `,n(i)}function n(a){e.querySelector("#btn-add-mission").addEventListener("click",()=>{const s=e.querySelector("#mission-title").value.trim();if(!s){e.querySelector("#mission-title").style.borderColor="var(--danger)",e.querySelector("#mission-title").focus();return}e.querySelector("#mission-title").style.borderColor="";const i={id:T(),title:s,description:e.querySelector("#mission-desc").value.trim(),strategy:e.querySelector("#mission-strategy").value,priority:e.querySelector("#mission-priority").value,owner:e.querySelector("#mission-owner").value.trim(),deadline:e.querySelector("#mission-deadline").value};a&&b({_prefillMission:null}),he(i),L(G()),C(G(),"Missão adicionada"),t()}),e.querySelectorAll("[data-remove]").forEach(s=>{s.addEventListener("click",async()=>{await O({title:"Remover Missão",body:"Deseja remover esta missão?",confirmLabel:"Remover",confirmClass:"btn btn-danger"})&&(ye(s.dataset.remove),t())})}),e.querySelector("#btn-back").addEventListener("click",()=>m("combat")),e.querySelector("#btn-next").addEventListener("click",()=>{E("missions"),m("complete")})}t()}function Fe(e){const t=f(),n=ee(t),a=z(n.checkinStats.average);e.innerHTML=`
    <div class="screen-complete screen-enter">
      <div class="complete-hero">
        <div style="font-size:4rem;margin-bottom:12px">🏆</div>
        <h2 style="color:var(--accent);margin-bottom:6px">Jornada Concluída!</h2>
        <p class="text-muted" style="margin-bottom:20px">
          ${t.sprint.name?`Sprint: <strong style="color:var(--text)">${t.sprint.name}</strong>`:"Retrospectiva finalizada"}
          ${t.team.name?` · Time: <strong style="color:var(--text)">${t.team.name}</strong>`:""}
        </p>
        <div class="complete-xp-total">${te(n.totalXP)}</div>
        <p class="text-muted" style="margin-top:4px">XP total conquistado pela equipe</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-card-value" style="color:var(--info)">${n.checkinStats.total}</div>
          <div class="stat-card-label">Check-ins</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value" style="color:${a.color}">${n.checkinStats.average.toFixed(1)}</div>
          <div class="stat-card-label">Média do humor</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value" style="color:var(--accent)">${n.treasureCount}</div>
          <div class="stat-card-label">💎 Tesouros</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value" style="color:var(--purple)">${n.recognitionCount}</div>
          <div class="stat-card-label">❤️ Reconhecimentos</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value" style="color:var(--info)">${n.learningCount}</div>
          <div class="stat-card-label">🧠 Descobertas</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value" style="color:var(--danger)">${n.monsterCount}</div>
          <div class="stat-card-label">👹 Monstros</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value" style="color:var(--info)">${n.solutionCount}</div>
          <div class="stat-card-label">💡 Soluções</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value" style="color:var(--success)">${n.missionCount}</div>
          <div class="stat-card-label">🚀 Missões</div>
        </div>
      </div>

      ${n.missionCount>0?`
        <div class="card" style="margin-top:24px;text-align:left">
          <h4 style="margin-bottom:12px">🚀 Missões desta Sprint</h4>
          ${t.missions.map(s=>`
            <div style="padding:10px 14px;background:var(--surface-2);border-radius:var(--radius);margin-bottom:8px;display:flex;align-items:center;gap:10px">
              <span style="font-size:1.25rem">🚀</span>
              <div>
                <div style="font-weight:600">${s.title}</div>
                ${s.owner?`<div style="font-size:0.8125rem;color:var(--text-muted)">👤 ${s.owner}</div>`:""}
              </div>
            </div>
          `).join("")}
        </div>
      `:""}

      <div class="phase-nav" style="justify-content:center;margin-top:32px">
        <button class="btn btn-ghost" id="btn-back">← Voltar</button>
        <button class="btn btn-primary btn-lg" id="btn-report">📋 VER RELATÓRIO COMPLETO</button>
      </div>
    </div>
  `,e.querySelector("#btn-back").addEventListener("click",()=>m("missions")),e.querySelector("#btn-report").addEventListener("click",()=>{E("complete"),m("report")})}const Be="modulepreload",_e=function(e,t){return new URL(e,t).href},K={},ne=function(t,n,a){let s=Promise.resolve();if(n&&n.length>0){const r=document.getElementsByTagName("link"),o=document.querySelector("meta[property=csp-nonce]"),d=(o==null?void 0:o.nonce)||(o==null?void 0:o.getAttribute("nonce"));s=Promise.allSettled(n.map(p=>{if(p=_e(p,a),p in K)return;K[p]=!0;const l=p.endsWith(".css"),h=l?'[rel="stylesheet"]':"";if(!!a)for(let v=r.length-1;v>=0;v--){const S=r[v];if(S.href===p&&(!l||S.rel==="stylesheet"))return}else if(document.querySelector(`link[href="${p}"]${h}`))return;const g=document.createElement("link");if(g.rel=l?"stylesheet":Be,l||(g.as="script"),g.crossOrigin="",g.href=p,d&&g.setAttribute("nonce",d),document.head.appendChild(g),l)return new Promise((v,S)=>{g.addEventListener("load",v),g.addEventListener("error",()=>S(new Error(`Unable to preload CSS for ${p}`)))})}))}function i(r){const o=new Event("vite:preloadError",{cancelable:!0});if(o.payload=r,window.dispatchEvent(o),!o.defaultPrevented)throw r}return s.then(r=>{for(const o of r||[])o.status==="rejected"&&i(o.reason);return t().catch(i)})};async function ae(e){const{default:t}=await ne(async()=>{const{default:a}=await import("./html2canvas.esm-CBrSDip1.js");return{default:a}},[],import.meta.url);return await t(e,{backgroundColor:"#161b22",scale:2,useCORS:!0,logging:!1})}async function Ue(e,t="jornada-sprint-relatorio.png"){const n=await ae(e),a=document.createElement("a");a.download=t,a.href=n.toDataURL("image/png"),a.click()}async function Xe(e,t="jornada-sprint-relatorio.pdf"){const{jsPDF:n}=await ne(async()=>{const{jsPDF:p}=await import("./jspdf.es.min-DA1XF4b3.js").then(l=>l.j);return{jsPDF:p}},[],import.meta.url),a=await ae(e),s=a.toDataURL("image/png"),i=210,r=i/a.width,o=a.height*r,d=new n({orientation:o>i?"portrait":"landscape",unit:"mm",format:[i,o]});d.addImage(s,"PNG",0,0,i,o),d.save(t)}function Ge(e){const t=f(),n=ee(t),a=z(n.checkinStats.average),{sprint:s,team:i,treasures:r,monsters:o,solutions:d,missions:p,checkins:l}=t,h=r.filter(c=>c.category==="treasure"),u=r.filter(c=>c.category==="recognition"),g=r.filter(c=>c.category==="learning");o.filter(c=>c.selected);function v(c,k){return c.length?c.map(x=>`<div class="report-item">${k} ${x.text||x.title}</div>`).join(""):'<p style="color:var(--text-muted);font-size:0.875rem">Nenhum item registrado.</p>'}function S(c){const k=d.filter(x=>x.monsterId===c);return k.length?k.map(x=>`
      <div class="report-item" style="margin-left:16px;display:flex;gap:10px;align-items:center">
        <span>${H(x.strategy)}</span>
        <span style="flex:1">${x.text}</span>
        <span style="color:var(--success);font-size:0.8125rem;white-space:nowrap">👍 ${x.votes}</span>
      </div>
    `).join(""):'<p style="color:var(--text-muted);font-size:0.875rem;margin-left:16px">Sem soluções registradas.</p>'}e.innerHTML=`
    <div class="screen-report screen-enter">
      <div class="phase-header">
        <div class="phase-header-top">
          <span class="phase-icon">📋</span>
          <h2 class="phase-title">Relatório da Jornada</h2>
        </div>
        <p class="phase-description">Visão completa da retrospectiva para compartilhar com o time.</p>
      </div>

      <div class="report-actions">
        <button class="btn btn-back" id="btn-back">← Voltar</button>
        <button class="btn btn-info" id="btn-pdf">📄 BAIXAR PDF</button>
        <button class="btn btn-success" id="btn-png">🖼️ BAIXAR IMAGEM</button>
      </div>

      <!-- Report Content (captured for export) -->
      <div id="report-content">
        <div class="report-header">
          <div style="font-size:3rem;margin-bottom:8px">⚔️</div>
          <h1 class="report-title">JORNADA DA SPRINT</h1>
          <h2 style="color:var(--text);margin-bottom:8px">${s.name||"Retrospectiva"}</h2>
          <p class="text-muted">
            ${i.name?`Time: ${i.name}`:""}
            ${i.participantCount?` · ${i.participantCount} participantes`:""}
          </p>
          ${s.startDate||s.endDate?`
            <p class="text-muted" style="margin-top:4px;font-size:0.875rem">
              📅 ${M(s.startDate)} → ${M(s.endDate)}
            </p>
          `:""}
          <p class="text-muted" style="margin-top:4px;font-size:0.8125rem">
            Gerado em ${Le(new Date().toISOString())}
          </p>
        </div>

        <!-- XP Summary -->
        <div class="report-section">
          <div class="report-section-title">⭐ Resultado Geral</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:120px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;text-align:center">
              <div style="font-size:2rem;font-weight:800;color:var(--accent)">${te(n.totalXP)}</div>
              <div style="font-size:0.8125rem;color:var(--text-muted)">XP Total</div>
            </div>
            <div style="flex:1;min-width:120px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;text-align:center">
              <div style="font-size:2rem;font-weight:800;color:${a.color}">${n.checkinStats.average.toFixed(1)}</div>
              <div style="font-size:0.8125rem;color:var(--text-muted)">${a.label}</div>
            </div>
            <div style="flex:1;min-width:120px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;text-align:center">
              <div style="font-size:2rem;font-weight:800;color:var(--info)">${n.checkinStats.total}</div>
              <div style="font-size:0.8125rem;color:var(--text-muted)">Check-ins</div>
            </div>
          </div>
        </div>

        <!-- Check-in Results -->
        ${l.length>0?`
          <div class="report-section">
            <div class="report-section-title">🌡️ Check-in da Equipe</div>
            ${[5,4,3,2,1].map(c=>{const k=n.checkinStats.distribution[c]||0,x=n.checkinStats.total>0?Math.round(k/n.checkinStats.total*100):0;return`
                <div class="stat-bar-row">
                  <span class="stat-bar-label">${N(c)}</span>
                  <div class="stat-bar-track" style="height:10px;flex:1">
                    <div class="stat-bar-fill" style="width:${x}%;height:10px"></div>
                  </div>
                  <span class="stat-bar-count" style="width:30px">${k}</span>
                </div>
              `}).join("")}
            ${l.filter(c=>c.comment).length>0?`
              <div style="margin-top:12px">
                <p style="font-size:0.875rem;font-weight:600;color:var(--text-muted);margin-bottom:8px">💬 Comentários anônimos:</p>
                ${l.filter(c=>c.comment).map(c=>`<div class="report-item">"${c.comment}"</div>`).join("")}
              </div>
            `:""}
          </div>
        `:""}

        <!-- Treasures -->
        <div class="report-section">
          <div class="report-section-title">💎 Tesouros da Sprint</div>
          ${h.length>0?`
            <p style="font-size:0.8125rem;font-weight:600;color:var(--text-muted);margin-bottom:6px">💎 O que funcionou bem:</p>
            ${v(h,"💎")}
          `:""}
          ${u.length>0?`
            <p style="font-size:0.8125rem;font-weight:600;color:var(--text-muted);margin:12px 0 6px">❤️ Reconhecimentos:</p>
            ${v(u,"❤️")}
          `:""}
          ${g.length>0?`
            <p style="font-size:0.8125rem;font-weight:600;color:var(--text-muted);margin:12px 0 6px">🧠 Descobertas:</p>
            ${v(g,"🧠")}
          `:""}
          ${r.length===0?'<p style="color:var(--text-muted);font-size:0.875rem">Nenhum tesouro registrado.</p>':""}
        </div>

        <!-- Monsters & Solutions -->
        <div class="report-section">
          <div class="report-section-title">👹 Monstros & Soluções</div>
          ${o.length===0?'<p style="color:var(--text-muted);font-size:0.875rem">Nenhum monstro identificado.</p>':o.map(c=>`
              <div style="margin-bottom:14px">
                <div class="report-item" style="background:var(--danger-dim);border:1px solid rgba(248,81,73,0.2)">
                  👹 <strong>${c.text}</strong>
                  ${c.selected?' <span style="color:var(--accent)">🎯</span>':""}
                  <span style="float:right;font-size:0.8125rem;color:var(--text-muted)">
                    🔥${c.reactions.fire||0} 👀${c.reactions.eyes||0} 💡${c.reactions.bulb||0}
                  </span>
                </div>
                ${S(c.id)}
              </div>
            `).join("")}
        </div>

        <!-- Missions -->
        <div class="report-section">
          <div class="report-section-title">🚀 Missões para a Próxima Sprint</div>
          ${p.length===0?'<p style="color:var(--text-muted);font-size:0.875rem">Nenhuma missão definida.</p>':p.map(c=>`
              <div class="report-item" style="margin-bottom:8px">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
                  <div>
                    <strong>🚀 ${c.title}</strong>
                    ${c.description?`<div style="font-size:0.875rem;color:var(--text-muted);margin-top:2px">${c.description}</div>`:""}
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;flex-shrink:0">
                    <span style="font-size:0.75rem;font-weight:600">${se(c.priority)}</span>
                    ${c.owner?`<span style="font-size:0.75rem;color:var(--purple)">👤 ${c.owner}</span>`:""}
                    ${c.deadline?`<span style="font-size:0.75rem;color:var(--accent)">📅 ${M(c.deadline)}</span>`:""}
                  </div>
                </div>
              </div>
            `).join("")}
        </div>
      </div>
    </div>
  `;const R=e.querySelector("#report-content");e.querySelector("#btn-back").addEventListener("click",()=>m("complete")),e.querySelector("#btn-pdf").addEventListener("click",async()=>{const c=e.querySelector("#btn-pdf");c.disabled=!0,c.textContent="⏳ Gerando PDF...";try{await Xe(R,`jornada-sprint-${s.name||"relatorio"}.pdf`)}finally{c.disabled=!1,c.innerHTML="📄 BAIXAR PDF"}}),e.querySelector("#btn-png").addEventListener("click",async()=>{const c=e.querySelector("#btn-png");c.disabled=!0,c.textContent="⏳ Gerando imagem...";try{await Ue(R,`jornada-sprint-${s.name||"relatorio"}.png`)}finally{c.disabled=!1,c.innerHTML="🖼️ BAIXAR IMAGEM"}})}const Ve={home:$e,setup:Ee,checkin:Ae,treasures:Ie,monsters:De,combat:je,missions:He,complete:Fe,report:Ge};function Je(){return document.getElementById("screen-root")}let W=null;function ie(e){if(e===W)return;W=e;const t=Je();if(!t)return;const n=Ve[e];if(!n){console.warn(`No renderer found for phase: ${e}`);return}window.scrollTo({top:0,behavior:"smooth"}),n(t)}Se();const Ke=f();ie(Ke.currentPhase||"home");Z(e=>{ie(e.currentPhase)});export{ne as _};
