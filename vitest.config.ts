import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '.ccpm/', '**/*.spec.ts', '**/*.test.ts', '**/types/**'],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 90,
        statements: 95,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@agents': path.resolve(__dirname, './src/agents'),
      '@protocols': path.resolve(__dirname, './src/protocols'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@types': path.resolve(__dirname, './src/types'),
      '@integrations': path.resolve(__dirname, './src/integrations'),
      '@quality': path.resolve(__dirname, './src/quality'),
    },
  },
});
