import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// Flat config for ESLint 10 (Vite + React 19 + TypeScript). Restores `pnpm lint`,
// which broke when ESLint was bumped to a flat-config-only major without a config.
//
// Posture: the codebase predates linting under these rules, so rules it currently
// violates are set to `warn` (a visible cleanup backlog) rather than `error` — this
// keeps `pnpm lint` green while still catching *new* problems via everything that
// remains at recommended `error` severity. Ratchet these up as the backlog is burned
// down.
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'public', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Honour the repo's `_`-prefix convention for intentionally-unused symbols
      // (mirrors tsconfig's noUnusedLocals/noUnusedParameters behaviour).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // --- Advisory by design -------------------------------------------------
      // rules-of-hooks fires false positives here because components are written as
      // `observer(function _Name() {…})` — the leading underscore defeats the rule's
      // component-name heuristic. Kept as a warning rather than renaming the whole
      // codebase's convention.
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // The d3 / d3gl and worker-interop layers use `any` and ts-directive escapes
      // deliberately; surface them, don't block on them.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',

      // --- Pre-existing violations: cleanup backlog (warn for now) ------------
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn',
      'no-case-declarations': 'warn',
      'no-prototype-builtins': 'warn',
      'no-useless-assignment': 'warn',
      'no-useless-escape': 'warn',
      'prefer-const': 'warn',
    },
  },
);
