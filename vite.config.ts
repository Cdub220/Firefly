/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    // GitHub's 2-vCPU runners are 3-5x slower than a laptop and run test files in parallel;
    // a 0.5 s simulation test there can take 6 s. Timing assertions belong in the test, not the timeout.
    testTimeout: 30_000,
  },
});
