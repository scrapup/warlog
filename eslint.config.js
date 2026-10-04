// ESLint flat config — quality gates of plan §7.1 (JSDoc) and §7.2 (SRP / DI guard rails).
import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import tseslint from 'typescript-eslint';

/** Source files subject to the documentation and design gates (fixtures mirror them). */
const SOURCE = ['src/**/*.ts', 'scripts/**/*.ts', 'test/fixtures/lint/src/**/*.ts', 'test/fixtures/lint/scripts/**/*.ts'];

/** Files that must depend on ports only (no Node side-effect modules, no adapters). */
const PORT_ONLY = [
  'src/domain/**/*.ts',
  'src/core/mediator/**/*.ts',
  'test/fixtures/lint/src/domain/**/*.ts',
  'test/fixtures/lint/src/core/mediator/**/*.ts',
];

/** Contexts that require a JSDoc block (plan §7.1). */
const JSDOC_CONTEXTS = [
  'ClassDeclaration',
  'MethodDefinition',
  'PropertyDefinition',
  'TSPropertySignature',
  'TSMethodSignature',
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'TSEnumMember',
  'FunctionDeclaration',
  'VariableDeclaration > VariableDeclarator > ArrowFunctionExpression',
];

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'reports/**', 'node_modules/**', 'test/fixtures/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: SOURCE,
    linterOptions: { noInlineConfig: true },
    plugins: { jsdoc },
    settings: { jsdoc: { mode: 'typescript' } },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: false,
          checkConstructors: true,
          require: { ClassDeclaration: true, MethodDefinition: true, FunctionDeclaration: true },
          contexts: JSDOC_CONTEXTS,
        },
      ],
      'jsdoc/require-description': ['error', { contexts: JSDOC_CONTEXTS }],
      'jsdoc/require-param': ['error', { checkConstructors: true }],
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-returns': 'error',
      'jsdoc/require-returns-description': 'error',
      'jsdoc/check-param-names': 'error',
      'jsdoc/no-undefined-types': 'error',
      'max-classes-per-file': ['error', 1],
      complexity: ['error', 10],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'no-console': 'error',
    },
  },
  {
    files: PORT_ONLY,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^(node:)?fs(/.*)?$', message: 'Use the FileSystem port.' },
            { regex: '^(node:)?child_process$', message: 'Use the GitClient port.' },
            { regex: '(^|/)adapters(/|\\.ts$|\\.js$|$)', message: 'Depend on ports, not adapters.' },
          ],
        },
      ],
    },
  },
);
