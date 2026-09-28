export default [
  {
    ignores: [
      'dist/**',
      'chrome-extension/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
    ],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        chrome: 'readonly',
        crypto: 'readonly',
        location: 'readonly',
        confirm: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        TextDecoder: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        URL: 'readonly',
        DOMParser: 'readonly',
        MutationObserver: 'readonly',
        HTMLElement: 'readonly',
        Blob: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-eval': 'error',
    },
  },
  {
    files: ['__tests__/**/*.test.js'],
    languageOptions: { globals: { test: 'readonly', expect: 'readonly', jest: 'readonly' } },
  },
];
