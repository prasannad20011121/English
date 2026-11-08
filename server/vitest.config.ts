import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
      BCRYPT_ROUNDS: '4',
      APP_URL: 'http://localhost:4200',
    },
    // One in-memory MongoDB per test file; run files one at a time to keep memory low.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
