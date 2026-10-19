import gym from './eslint.gym.config.mjs';

export default [{
  ...gym[0],
  files: [
    'src/components/cinematic/**/*.{ts,tsx}',
    'src/hooks/useScrollProgress.ts', 'src/hooks/useDevicePerformance.ts',
    'src/pages/Home.tsx', 'src/components/home/LandingSections.tsx',
    'src/components/EditorialReveal.tsx', 'src/components/PublicPage.tsx',
    'src/pages/Achievements.tsx', 'src/pages/Coaches.tsx',
  ],
}];
