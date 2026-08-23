import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { escapeHTML, preserveInputs, uid } from '../utils/dom.js';

describe('escapeHTML', () => {
  it('escapa &', () => {
    expect(escapeHTML('a & b')).toBe('a &amp; b');
  });

  it('escapa <', () => {
    expect(escapeHTML('<script>')).toBe('&lt;script&gt;');
  });

  it('escapa >', () => {
    expect(escapeHTML('a > b')).toBe('a &gt; b');
  });

  it('escapa " e \'', () => {
    expect(escapeHTML('"oi"')).toBe('&quot;oi&quot;');
    expect(escapeHTML("'oi'")).toBe('&#39;oi&#39;');
  });

  it('trata null como string vazia', () => {
    expect(escapeHTML(null)).toBe('');
  });

  it('trata undefined como string vazia', () => {
    expect(escapeHTML(undefined)).toBe('');
  });

  it('converte número para string e escapa', () => {
    expect(escapeHTML(42)).toBe('42');
  });

  it('não modifica string sem caracteres perigosos', () => {
    expect(escapeHTML('texto normal 123')).toBe('texto normal 123');
  });

  it('payload XSS clássico é neutralizado', () => {
    const xss = '<img src=x onerror="alert(1)">';
    const result = escapeHTML(xss);
    expect(result).not.toContain('<img');
    expect(result).not.toContain('>');
    expect(result).toContain('&lt;img');
  });
});

describe('preserveInputs', () => {
  let root;

  beforeEach(() => {
    const dom = new JSDOM('<!DOCTYPE html><body><div id="root"></div></body>');
    root = dom.window.document.getElementById('root');
    // Aponta document.activeElement para o jsdom do teste
    Object.defineProperty(dom.window.document, 'activeElement', {
      get: () => null,
      configurable: true,
    });
    // Substitui o global document pelo do jsdom para este teste
    global.document = dom.window.document;
    global.CSS = { escape: (s) => s.replace(/[!"#$%&'()*+,./;<=>?@[\\\]^`{|}~]/g, '\\$&') };
  });

  it('restaura o valor de um input após re-render', () => {
    root.innerHTML = '<input id="nome" value="" />';
    root.querySelector('#nome').value = 'digitando';

    preserveInputs(root, () => {
      root.innerHTML = '<input id="nome" value="" />';
    });

    expect(root.querySelector('#nome').value).toBe('digitando');
  });

  it('restaura o valor de um textarea após re-render', () => {
    root.innerHTML = '<textarea id="comentario"></textarea>';
    root.querySelector('#comentario').value = 'texto em andamento';

    preserveInputs(root, () => {
      root.innerHTML = '<textarea id="comentario"></textarea>';
    });

    expect(root.querySelector('#comentario').value).toBe('texto em andamento');
  });

  it('não falha se o campo não existir após re-render', () => {
    root.innerHTML = '<input id="removido" />';
    root.querySelector('#removido').value = 'algo';

    expect(() => {
      preserveInputs(root, () => {
        root.innerHTML = '<p>sem inputs</p>';
      });
    }).not.toThrow();
  });

  it('preserva múltiplos campos simultaneamente', () => {
    root.innerHTML = `
      <input id="a" />
      <input id="b" />
      <textarea id="c"></textarea>
    `;
    root.querySelector('#a').value = 'valor-a';
    root.querySelector('#b').value = 'valor-b';
    root.querySelector('#c').value = 'valor-c';

    preserveInputs(root, () => {
      root.innerHTML = `
        <input id="a" />
        <input id="b" />
        <textarea id="c"></textarea>
      `;
    });

    expect(root.querySelector('#a').value).toBe('valor-a');
    expect(root.querySelector('#b').value).toBe('valor-b');
    expect(root.querySelector('#c').value).toBe('valor-c');
  });
});

describe('uid', () => {
  it('retorna uma string', () => {
    expect(typeof uid()).toBe('string');
  });

  it('gera IDs únicos', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uid()));
    expect(ids.size).toBe(1000);
  });

  it('retorna string não vazia', () => {
    expect(uid().length).toBeGreaterThan(0);
  });
});
