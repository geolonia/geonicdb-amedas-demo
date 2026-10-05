import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'dist/', 'data/', 'compose/'] },
  js.configs.recommended,
  {
    files: ['scripts/**/*.mjs', 'test/**/*.mjs', 'eslint.config.js', 'web/vite.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
  },
  {
    files: ['web/src/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } },
  },
  {
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-irregular-whitespace': ['error', { skipComments: true, skipRegExps: true, skipStrings: true, skipTemplates: true }],
    },
  },
];
