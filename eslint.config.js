import js from '@eslint/js';
import vitestPlugin from 'eslint-plugin-vitest';
import globals from 'globals';

export default [
  js.configs.recommended,

  // Código fonte da aplicação — ambiente browser
  {
    files: ['src/**/*.js'],
    ignores: ['src/tests/**'],
    languageOptions: {
      globals: {
        ...globals.browser,  // document, window, localStorage, CSS, crypto…
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
      'no-console':     ['warn', { allow: ['warn', 'error'] }],
      'eqeqeq':         ['error', 'always', { null: 'ignore' }],
      'no-var':          'error',
      'prefer-const':    'error',
    },
  },

  // Arquivos de teste
  {
    files: ['src/tests/**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node, // global, process
      },
    },
    plugins: { vitest: vitestPlugin },
    rules: {
      ...vitestPlugin.configs.recommended.rules,
      'no-console':    'off',
      'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  },

  // Testes E2E — ambiente Node com globals do Playwright
  {
    files: ['e2e/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console':     'off',
      'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  },

  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
