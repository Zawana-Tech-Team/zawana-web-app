import { createRequire } from 'node:module';
const require = createRequire(new URL('./tooling/gym/package.json', import.meta.url));
const tseslint = require('typescript-eslint');
const hooks = require('eslint-plugin-react-hooks');

// Focused rollout: unrelated legacy pages retain their existing conventions.
export default [{
  files: [
    'src/types/gym.ts', 'src/components/GymReceipt.tsx',
    'src/pages/Gym{PackageManager,Enrollments,PrivateTraining}.tsx',
    'src/pages/CoachTraining.tsx',
    'backend/src/services/gym*.ts', 'backend/src/routes/gym*.ts',
    'backend/scripts/seed-gym-catalog.ts', 'backend/tests/gym*.ts',
  ],
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } } },
  plugins: { '@typescript-eslint': tseslint.plugin, 'react-hooks': hooks },
  rules: {
    'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error',
    'no-unreachable': 'error', 'no-duplicate-case': 'error', 'no-constant-condition': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
  },
}];
