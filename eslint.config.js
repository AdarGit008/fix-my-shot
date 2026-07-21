import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'coverage/**', '**/*.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // ADR-0006 seam, enforced as a lint boundary: the sport-agnostic core must not
    // import any sport plugin. The vocabulary half of the seam lives in
    // test/core-seam.test.ts (TEST-03).
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@fix-my-shot/basketball', '@fix-my-shot/basketball/*'],
              message:
                'packages/core is sport-agnostic (ADR-0006) — it must not import a sport plugin.',
            },
          ],
        },
      ],
    },
  },
);
