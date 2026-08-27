/**
 * @security Toda interpolação em innerHTML DEVE usar escapeHTML(). Nunca
 *   interpole valores vindos do usuário ou do Firestore sem escapar.
 *
 * Auth Screen — Login / Cadastro do Scrum Master
 *
 * Membros do time nunca chegam aqui — eles entram pelo link (?s=...) direto no lobby.
 * Esta tela é exclusiva para Scrum Masters que querem ter um perfil com histórico.
 */

import { signInWithGoogle, signInWithEmail, signUpWithEmail, getCurrentUser } from '../services/auth.js';
import { setLocalPhase } from '../state/store.js';

export function renderAuth(root) {
  // Se já está logado, redireciona ao dashboard
  if (getCurrentUser()) {
    setLocalPhase('smDashboard');
    return;
  }

  let _mode = 'login'; // 'login' | 'signup'

  function render() {
    const isSignup = _mode === 'signup';
    root.innerHTML = `
      <div class="screen-auth screen-enter">
        <div class="auth-card">
          <div class="home-logo">🧙</div>
          <h1 class="home-title">Scrum Master</h1>
          <p class="home-subtitle">
            ${isSignup ? 'Crie sua conta para salvar suas retrospectivas.' : 'Entre para acessar suas retrospectivas.'}
          </p>

          <div id="auth-error" class="auth-error hidden"></div>

          ${isSignup ? `
            <div class="form-group" style="margin-top:24px">
              <label class="form-label" for="auth-name">Seu nome</label>
              <input class="form-input" type="text" id="auth-name" placeholder="Ex: Ana Lima" autocomplete="name" />
            </div>
          ` : ''}

          <div class="form-group" ${isSignup ? '' : 'style="margin-top:24px"'}>
            <label class="form-label" for="auth-email">E-mail</label>
            <input class="form-input" type="email" id="auth-email" placeholder="seu@email.com" autocomplete="email" />
          </div>

          <div class="form-group">
            <label class="form-label" for="auth-password">Senha</label>
            <input class="form-input" type="password" id="auth-password"
              placeholder="${isSignup ? 'Mínimo 6 caracteres' : 'Sua senha'}"
              autocomplete="${isSignup ? 'new-password' : 'current-password'}" />
          </div>

          <button class="btn btn-primary btn-full" id="btn-email-auth" style="margin-top:20px">
            ${isSignup ? '✅ Criar conta' : '🔑 Entrar'}
          </button>

          <div class="auth-divider"><span>ou</span></div>

          <button class="btn btn-ghost btn-full" id="btn-google">
            <span style="font-size:1.1em">G</span>&nbsp; Continuar com Google
          </button>

          <p class="auth-switch-mode text-muted" style="margin-top:20px;text-align:center;font-size:0.875rem">
            ${isSignup
              ? 'Já tem conta? <button class="btn-link" id="btn-toggle-mode">Entrar</button>'
              : 'Não tem conta? <button class="btn-link" id="btn-toggle-mode">Criar agora</button>'
            }
          </p>

          <p class="text-muted" style="margin-top:12px;text-align:center;font-size:0.8125rem">
            <button class="btn-link" id="btn-back-role">← Voltar</button>
          </p>
        </div>
      </div>
    `;

    function showError(msg) {
      const el = root.querySelector('#auth-error');
      if (el) {
        el.textContent = msg;
        el.classList.remove('hidden');
      }
    }

    function setLoading(loading) {
      const btns = root.querySelectorAll('button');
      btns.forEach((b) => { b.disabled = loading; });
    }

    root.querySelector('#btn-toggle-mode').addEventListener('click', () => {
      _mode = isSignup ? 'login' : 'signup';
      render();
    });

    root.querySelector('#btn-back-role').addEventListener('click', () => {
      setLocalPhase('roleSelect');
    });

    root.querySelector('#btn-email-auth').addEventListener('click', async () => {
      const email    = root.querySelector('#auth-email')?.value.trim();
      const password = root.querySelector('#auth-password')?.value;
      const name     = root.querySelector('#auth-name')?.value.trim();

      if (!email || !password) {
        showError('Preencha e-mail e senha.');
        return;
      }
      if (isSignup && password.length < 6) {
        showError('A senha deve ter pelo menos 6 caracteres.');
        return;
      }

      setLoading(true);
      try {
        if (isSignup) {
          await signUpWithEmail(email, password, name);
        } else {
          await signInWithEmail(email, password);
        }
        // onAuthStateChanged no store.js vai detectar o login e redirecionar
      } catch (err) {
        setLoading(false);
        showError(_friendlyAuthError(err.code));
      }
    });

    root.querySelector('#btn-google').addEventListener('click', async () => {
      setLoading(true);
      try {
        await signInWithGoogle();
        // onAuthStateChanged no store.js vai detectar o login e redirecionar
      } catch (err) {
        setLoading(false);
        if (err.code !== 'auth/popup-closed-by-user') {
          showError(_friendlyAuthError(err.code));
        }
      }
    });
  }

  render();
}

function _friendlyAuthError(code) {
  const map = {
    'auth/user-not-found':      'E-mail não encontrado. Verifique ou crie uma conta.',
    'auth/wrong-password':      'Senha incorreta.',
    'auth/email-already-in-use': 'Este e-mail já está em uso.',
    'auth/invalid-email':       'E-mail inválido.',
    'auth/weak-password':       'Senha muito fraca. Use pelo menos 6 caracteres.',
    'auth/too-many-requests':   'Muitas tentativas. Aguarde um momento.',
    'auth/network-request-failed': 'Erro de rede. Verifique sua conexão.',
    'auth/invalid-credential':  'E-mail ou senha incorretos.',
  };
  return map[code] ?? 'Ocorreu um erro. Tente novamente.';
}
