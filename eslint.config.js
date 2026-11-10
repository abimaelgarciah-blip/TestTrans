import js from '@eslint/js';

const navegador = Object.fromEntries([
  'window', 'document', 'location', 'navigator', 'performance', 'fetch', 'URL', 'URLSearchParams',
  'Blob', 'Audio', 'AbortController', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'console', 'structuredClone', 'requestAnimationFrame',
].map((n) => [n, 'readonly']));

export default [
  { ignores: ['node_modules/', '_site/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: navegador,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      'no-restricted-properties': ['error',
        { property: 'innerHTML', message: 'Prohibido: usa textContent o los helpers de ui.js.' },
        { property: 'outerHTML', message: 'Prohibido: usa textContent o los helpers de ui.js.' },
      ],
      'no-restricted-syntax': ['error',
        { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: 'Prohibido: usa los helpers de ui.js.' },
        { selector: "CallExpression[callee.object.name='document'][callee.property.name='write']", message: 'Prohibido.' },
      ],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
];
