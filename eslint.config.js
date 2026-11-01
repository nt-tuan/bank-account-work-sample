import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettier from 'eslint-config-prettier/flat';

const partnerNetwork = {
  group: ['**/partner-network/**', '**/partner-network'],
  message: 'Core code must use the PartnerBankGateway (spec §8).',
};

const browserNoServer = {
  group: ['**/server/**'],
  message: 'The browser app must not import server code.',
};

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'data/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'jsx-a11y': jsxA11y, 'react-hooks': reactHooks },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-restricted-imports': ['error', { patterns: [browserNoServer] }],
    },
  },
  {
    // Dependency direction: app → features → shared. A feature uses another feature only through its index.ts
    // and imports its own modules relatively (docs/technical-design/architecture.md §3.2).
    files: ['src/features/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            browserNoServer,
            { group: ['@/app/**'], message: 'Features must not depend on the app layer.' },
            {
              group: ['@/features/*/**', '!@/features/*/index.ts'],
              message:
                "Import another feature through its index.ts; import your own feature's modules relatively.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            browserNoServer,
            {
              group: ['@/app/**', '@/features/**'],
              message: 'src/shared must not depend on app or features.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['server/**/*.ts', 'scripts/**/*.ts', 'tests/**/*.ts', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['server/**/*.ts'],
    ignores: [
      'server/partner-network/**',
      'server/partner-gateway/network-gateway.ts',
      'server/main.ts',
      'server/app.ts',
      'server/**/*.test.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            partnerNetwork,
            { group: ['**/src/**', '@/**'], message: 'Server must not import browser code.' },
          ],
        },
      ],
    },
  },
  {
    files: ['server/banking/**/*.ts'],
    ignores: ['server/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            partnerNetwork,
            {
              group: ['**/http/**', '**/demo/**'],
              message: 'Core banking rules stay free of transport and demo policy (spec §11).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/src/**', '@/**', '**/server/**', 'react', 'node:*'],
              message: 'shared/ is pure TypeScript.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
